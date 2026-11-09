import { createHash, randomUUID } from 'node:crypto'
import { readData, mutateData } from './dataStore'
import { resolveProviderKey } from './openocti-keys'
import { saveGeneratedMedia, MAX_MEDIA_UPLOAD_BYTES } from './media-gen'

const DOCUMENT = 'veo-media-jobs.json'
const ORIGIN = 'https://generativelanguage.googleapis.com'
const MODEL = 'veo-3.1-generate-preview'
const state = globalThis[Symbol.for('fcc.veo.worker')] ||= { locks: new Map(), timer: null, scanning: false }
const active = new Set(['submitting', 'generating', 'saving'])
const jobs = () => readData(DOCUMENT)?.jobs || []
const publicJob = job => {
  if (!job) throw new Error('Video job not found.')
  const { fingerprint, operation, ...visible } = job
  return visible
}
function update(id, patch) {
  return mutateData(DOCUMENT, current => {
    const job = current?.jobs?.find(item => item.id === id)
    if (!job) throw new Error('Video job not found.')
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    return { data: current, result: job }
  })
}
function key() {
  const value = resolveProviderKey('gemini').key
  if (!value) throw new Error('The Google Gemini API credential is missing from the vault.')
  return value
}
async function googleRequest(path, body) {
  const response = await fetch(`${ORIGIN}/v1beta/${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
    headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000),
  })
  if (!response.ok) {
    const reason = response.status === 429 ? 'Google Veo quota is unavailable. Check billing and Veo limits for the configured Google project.'
      : [401, 403].includes(response.status) ? 'Google rejected the configured credential or Veo access.'
      : `Google Veo rejected the request (HTTP ${response.status}).`
    throw Object.assign(new Error(reason), { status: response.status })
  }
  return response.json()
}

export function listVideoJobs() { return jobs().slice(0, 50).map(publicJob) }
export function getVideoJob(id) { return publicJob(jobs().find(item => item.id === id)) }

export async function startVideoJob({ prompt, title, folder = 'social-posts', aspectRatio = '16:9', durationSeconds = 8, requestId } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000) throw new Error('A video prompt of 1–16000 characters is required.')
  if (!['16:9', '9:16'].includes(aspectRatio)) throw new Error('Choose 16:9 or 9:16 video.')
  if (![4, 6, 8].includes(Number(durationSeconds))) throw new Error('Choose a 4, 6 or 8 second video.')
  if (typeof requestId !== 'string' || !/^[\w:.-]{8,120}$/.test(requestId)) throw new Error('A stable requestId of 8–120 characters is required; reuse it on retries.')
  key()
  const input = { prompt: prompt.trim(), title: String(title || prompt).slice(0, 160), folder: String(folder).slice(0, 200), aspectRatio, durationSeconds: Number(durationSeconds) }
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const reservation = mutateData(DOCUMENT, current => {
    const data = current || { jobs: [] }
    const existing = data.jobs.find(job => job.requestId === requestId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('This requestId belongs to a different video. Do not reuse it for changed creative instructions.')
      return { data, result: { created: false, job: existing } }
    }
    const now = new Date().toISOString()
    const job = { id: randomUUID(), requestId, fingerprint, ...input, provider: 'google', model: MODEL, mediaType: 'video', status: 'submitting', items: [], createdAt: now, updatedAt: now }
    data.jobs.unshift(job)
    return { data, result: { created: true, job } }
  })
  if (!reservation.created) return publicJob(reservation.job)
  const id = reservation.job.id
  try {
    const result = await googleRequest(`models/${MODEL}:predictLongRunning`, {
      instances: [{ prompt: input.prompt }],
      parameters: { aspectRatio, durationSeconds: input.durationSeconds, sampleCount: 1, resolution: '720p' },
    })
    if (typeof result.name !== 'string' || !/^models\/veo-3\.1-[\w.-]+\/operations\/[\w.-]+$/.test(result.name)) throw new Error('Google did not return a verifiable operation id.')
    const job = update(id, { operation: result.name, status: 'generating' })
    startVideoWorker()
    return publicJob(job)
  } catch (error) {
    const definite = [400, 401, 403, 404, 422, 429].includes(error.status)
    return publicJob(update(id, { status: definite ? 'failed' : 'submission_uncertain', lastError: definite ? error.message : 'Google submission could not be confirmed. Do not generate again until the existing request is checked.' }))
  }
}

async function downloadVideo(uri) {
  const url = new URL(uri)
  if (url.origin !== ORIGIN || !url.pathname.startsWith('/v1beta/files/')) throw new Error('Unexpected Google video download address.')
  let target = url
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(target, { headers: target.origin === ORIGIN ? { 'x-goog-api-key': key() } : {}, redirect: 'manual', signal: AbortSignal.timeout(120000) })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      target = new URL(response.headers.get('location'), target)
      if (target.protocol !== 'https:' || !/(^|\.)(googleapis\.com|googleusercontent\.com)$/.test(target.hostname) || target.username || target.password) throw new Error('Unexpected video download redirect.')
      continue
    }
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_MEDIA_UPLOAD_BYTES) throw new Error('Video download failed or exceeded the file size limit.')
    const parts = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > MAX_MEDIA_UPLOAD_BYTES) throw new Error('Video exceeded the file size limit.')
      parts.push(Buffer.from(chunk))
    }
    const buffer = Buffer.concat(parts)
    if (buffer.length < 32 || buffer.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Google did not return a readable MP4.')
    return buffer
  }
  throw new Error('Too many video download redirects.')
}

async function refresh(id) {
  const job = jobs().find(item => item.id === id)
  if (!job) throw new Error('Video job not found.')
  if (!job.operation || ['completed', 'failed', 'submission_uncertain'].includes(job.status)) return publicJob(job)
  let result
  try { result = await googleRequest(job.operation) }
  catch (error) { return publicJob(update(id, { lastError: error.message })) }
  if (!result.done) return publicJob(update(id, { status: 'generating', lastError: null }))
  if (result.error) return publicJob(update(id, { status: 'failed', lastError: 'Google could not complete this video. No finished video was saved.' }))
  const uri = result.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
  if (!uri) return publicJob(update(id, { status: 'failed', lastError: 'Google completed without a video, possibly due to its content filters. No blank media was saved.' }))
  update(id, { status: 'saving' })
  try {
    const buffer = await downloadVideo(uri)
    const item = saveGeneratedMedia({ sourceId: `google-veo:${id}`, buffer, originalName: 'veo-video.mp4', mimeType: 'video/mp4', title: job.title, prompt: job.prompt, folder: job.folder, tags: ['veo-3.1', 'sasha'], provider: 'google', model: MODEL, providerTaskId: job.operation })
    return publicJob(update(id, { status: 'completed', items: [item], lastError: null, completedAt: new Date().toISOString() }))
  } catch {
    return publicJob(update(id, { status: 'save_failed', lastError: 'Google created the video but saving failed. Check this same job to retry the download without generating again.' }))
  }
}
export async function refreshVideoJob(id) {
  if (state.locks.has(id)) return state.locks.get(id)
  const pending = refresh(id).finally(() => state.locks.delete(id))
  state.locks.set(id, pending)
  return pending
}
export function startVideoWorker() {
  if (state.timer) return
  state.timer = setInterval(async () => {
    if (state.scanning) return
    state.scanning = true
    try {
      for (const job of jobs().filter(job => active.has(job.status))) {
        if (!job.operation && Date.now() - Date.parse(job.createdAt) > 120000) update(job.id, { status: 'submission_uncertain', lastError: 'An interrupted submission needs checking before generating again.' })
        else if (job.operation) await refreshVideoJob(job.id)
      }
    } catch { /* Saved jobs remain available for the next check. */ }
    finally { state.scanning = false }
  }, 10000)
  state.timer.unref?.()
}
