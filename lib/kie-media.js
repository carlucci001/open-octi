import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { readData, mutateData } from './dataStore'
import { createKieTask, getKieTask } from './kie'
import { safeFetchBuffer } from './safe-url-fetch'
import { saveGeneratedMedia, inspectUploadMedia, MAX_MEDIA_UPLOAD_BYTES } from './media-gen'

const DOCUMENT = 'kie-media-jobs.json'
const ACTIVE = new Set(['submitting', 'waiting', 'queuing', 'generating', 'saving'])
const STATE_KEY = Symbol.for('fcc.kie.media.worker')
const state = globalThis[STATE_KEY] ||= { locks: new Map(), timer: null, scanning: false }
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
}

function jobError(message, status = 400) { return Object.assign(new Error(message), { status }) }
function jobs() { return readData(DOCUMENT)?.jobs || [] }
function findJob(id) { return jobs().find(job => job.id === id) }
function publicJob(job) {
  if (!job) return null
  const { input, fingerprint, resultUrls, requestId, ...safe } = job
  return safe
}
function updateJob(id, patch) {
  return mutateData(DOCUMENT, current => {
    const data = current || { jobs: [] }
    const job = data.jobs?.find(item => item.id === id)
    if (!job) throw jobError('Kie job not found.', 404)
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    return { data, result: job }
  })
}

export function getKieMediaJob(id) { return publicJob(findJob(id)) }
export function listKieMediaJobs() { return jobs().slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,50).map(publicJob) }

export async function startKieMediaJob({ model, input, mediaType, title, prompt = '', folder = 'unsorted', tags = [], requestId, agentId = '', agentName = '' } = {}) {
  if (typeof requestId !== 'string' || !/^[\w:.-]{8,128}$/.test(requestId)) throw jobError('Use a stable requestId of 8–128 letters, numbers, dots, dashes or underscores.')
  if (!['image','video','audio'].includes(mediaType)) throw jobError('Choose image, video or audio content.')
  if (typeof model !== 'string' || !model.trim()) throw jobError('Choose a model from the current Kie catalog first.')
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw jobError('Model input must be an object matching its current schema.')
  if (Buffer.byteLength(JSON.stringify(input)) > 64 * 1024) throw jobError('Model input exceeds the 64 KB limit.')
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw jobError('Tags must be a list of strings.')
  const clean = {
    model: model.trim(), input: JSON.parse(JSON.stringify(input)), mediaType,
    title: String(title || prompt || 'Kie generated content').slice(0,160),
    prompt: String(prompt).slice(0,16000), folder: String(folder || 'unsorted').slice(0,200),
    tags: tags.map(tag=>tag.slice(0,80)).slice(0,20), agentId: String(agentId).slice(0,100), agentName: String(agentName).slice(0,100),
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(clean)).digest('hex')
  const reservation = mutateData(DOCUMENT, current => {
    const data = current || { jobs: [] }
    data.jobs ||= []
    const existing = data.jobs.find(job => job.requestId === requestId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw jobError('This requestId already belongs to a different generation request.', 409)
      if (existing.status === 'failed' && existing.canRetrySubmission === true && !existing.taskId) {
        Object.assign(existing, { status: 'submitting', canRetrySubmission: false, lastError: null, updatedAt: new Date().toISOString() })
        return { data, result: { created: true, job: existing } }
      }
      return { data, result: { created: false, job: existing } }
    }
    const now = new Date().toISOString()
    const job = { id: randomUUID(), requestId, fingerprint, ...clean, provider: 'kie', status: 'submitting', items: [], createdAt: now, updatedAt: now }
    data.jobs.unshift(job)
    return { data, result: { created: true, job } }
  })
  if (!reservation.created) return publicJob(reservation.job)
  const id = reservation.job.id
  try {
    const result = await createKieTask({ model: clean.model, input: clean.input, mediaType: clean.mediaType })
    const job = updateJob(id, { taskId: result.taskId, status: 'waiting', pricingDescription: result.pricingDescription || '', lastError: null })
    startKieMediaWorker()
    return publicJob(job)
  } catch (error) {
    // A timeout may occur after Kie accepted a paid request. Never submit it
    // again automatically, including after process restart or a tool retry.
    const mayHaveCreatedTask = error.mayHaveCreatedTask ?? ![400,401,402,403,404,422,429].includes(Number(error.status))
    const job = updateJob(id, {
      status: mayHaveCreatedTask ? 'submission_uncertain' : 'failed',
      canRetrySubmission: !mayHaveCreatedTask,
      lastError: mayHaveCreatedTask ? 'Submission could not be confirmed. Check Kie task history before starting another paid request.' : 'Kie did not accept a generation. Check the selected model, input, account credits and key; the same request can be retried safely.',
    })
    return publicJob(job)
  }
}

function assetInfo(result, mediaType) {
  const mimeType = result.contentType.split(';')[0].trim().toLowerCase()
  const ext = MIME_EXT[mimeType] || path.extname(new URL(result.finalUrl).pathname).slice(1).toLowerCase()
  const originalName = `kie-result.${ext}`
  if (ext === 'svg') throw jobError('Generated SVG assets are not supported.')
  const info = inspectUploadMedia({ originalName, mimeType, sizeBytes: result.buffer.length })
  if (info.mediaType !== mediaType) throw jobError('Kie returned a different media type from the requested content.')
  return { originalName, mimeType: info.mimeType }
}

async function refreshJob(id) {
  let job = findJob(id)
  if (!job) throw jobError('Kie job not found.', 404)
  if (['completed','failed','submission_uncertain'].includes(job.status) || !job.taskId) return publicJob(job)
  let result
  try {
    result = await getKieTask(job.taskId)
  } catch {
    return publicJob(updateJob(id, { lastCheckedAt: new Date().toISOString(), lastError: 'Kie status is temporarily unavailable. The existing task will be checked again; no new generation was submitted.' }))
  }
  if (result.state === 'fail' || result.state === 'failed') {
    return publicJob(updateJob(id, { status: 'failed', lastError: 'Kie reported that generation failed. No completed media was returned.', lastCheckedAt: new Date().toISOString() }))
  }
  if (result.state !== 'success') {
    const elapsed = Date.now() - Date.parse(job.createdAt)
    return publicJob(updateJob(id, {
      status: elapsed > 60 * 60 * 1000 ? 'needs_attention' : (['waiting','queuing','generating'].includes(result.state) ? result.state : 'generating'),
      lastCheckedAt: new Date().toISOString(),
      lastError: elapsed > 60 * 60 * 1000 ? 'Kie is still processing after an hour. Check this existing job again before requesting another generation.' : null,
    }))
  }
  const urls = result.resultUrls
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > 16) {
    return publicJob(updateJob(id, { status: 'save_failed', lastError: 'Kie reported completion without a supported set of output files. Check the existing task; do not regenerate it.' }))
  }
  job = updateJob(id, { status: 'saving', resultUrls: urls, lastError: null })
  try {
    const items = [...(job.items || [])]
    for (let index = 0; index < urls.length; index += 1) {
      if (items[index]) continue
      const result = await safeFetchBuffer(urls[index], { maxBytes: MAX_MEDIA_UPLOAD_BYTES })
      const info = assetInfo(result, job.mediaType)
      const item = saveGeneratedMedia({
        sourceId: `kie:${job.id}:${index}`, buffer: result.buffer, ...info,
        title: urls.length > 1 ? `${job.title} ${index + 1}` : job.title,
        prompt: job.prompt, folder: job.folder, tags: job.tags, provider: 'kie', model: job.model, providerTaskId: job.taskId,
      })
      items[index] = item
      updateJob(id, { items })
    }
    return publicJob(updateJob(id, { status: 'completed', items, creditsConsumed: result.creditsConsumed ?? null, completedAt: new Date().toISOString(), lastError: null }))
  } catch {
    return publicJob(updateJob(id, { status: 'save_failed', lastError: 'Kie generated the content, but saving it to Media failed. Check this job again to retry saving without paying for another generation.' }))
  }
}

export async function refreshKieMediaJob(id) {
  if (state.locks.has(id)) return state.locks.get(id)
  const promise = refreshJob(id).finally(() => state.locks.delete(id))
  state.locks.set(id, promise)
  return promise
}

export async function resumeKieMediaJobs() {
  if (state.scanning) return
  state.scanning = true
  try {
    for (const job of jobs().filter(item => ACTIVE.has(item.status))) {
      if (job.status === 'submitting' && !job.taskId) {
        if (Date.now() - Date.parse(job.updatedAt) > 2 * 60 * 1000) updateJob(job.id, { status: 'submission_uncertain', lastError: 'An interrupted submission needs a check in Kie task history before another paid request.' })
        continue
      }
      await refreshKieMediaJob(job.id)
    }
  } finally { state.scanning = false }
}

export function startKieMediaWorker() {
  if (state.timer || process.env.NODE_ENV === 'test' || process.env.VITEST) return
  state.timer = setInterval(() => { resumeKieMediaJobs().catch(() => {}) }, 5000)
  state.timer.unref?.()
  resumeKieMediaJobs().catch(() => {})
}
