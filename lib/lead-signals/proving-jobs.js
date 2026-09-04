import { mutateData, readData } from '@/lib/dataStore'
import { persistLeadSourceValidation, proveLeadSource } from './proving'

const FILE = 'source-proving-jobs.json'
const MAX_JOBS_KEPT = 100
const STALE_AFTER_MS = 95_000
const JOB_TIMEOUT_MS = 85_000
const STATE_KEY = Symbol.for('fcc.source-proving-jobs')

function queueState() {
  if (!globalThis[STATE_KEY]) globalThis[STATE_KEY] = { inFlight: new Map() }
  return globalThis[STATE_KEY]
}

function emptyDoc() {
  return { lastUpdated: null, jobs: [] }
}

function normalizeDoc(current) {
  return current && Array.isArray(current.jobs) ? current : emptyDoc()
}

function isTerminal(status) {
  return ['completed', 'failed', 'cancelled'].includes(status)
}

function failStaleJobs(doc, nowMs = Date.now()) {
  let changed = false
  const now = new Date(nowMs).toISOString()
  const jobs = doc.jobs.map(job => {
    if (isTerminal(job.status)) return job
    const updated = Date.parse(job.updatedAt || job.createdAt || '')
    if (Number.isFinite(updated) && nowMs - updated < STALE_AFTER_MS) return job
    changed = true
    return {
      ...job,
      status: 'failed',
      error: job.error || 'Proving stopped reporting; the server restarted or the worker was aborted.',
      progress: { ...job.progress, phase: 'failed', label: 'Proving failed' },
      updatedAt: now,
      finishedAt: now,
    }
  })
  return changed ? { ...doc, lastUpdated: now, jobs } : doc
}

function mutateJobs(mutator) {
  return mutateData(FILE, current => {
    const doc = failStaleJobs(normalizeDoc(current))
    return mutator(doc)
  })
}

function newJob({ sourceId, jurisdiction = {}, since = null, limit = 25, index = false } = {}) {
  const now = new Date().toISOString()
  return {
    id: `spj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    status: 'running',
    jurisdiction,
    since: since || null,
    limit: Math.min(Math.max(Number(limit) || 25, 1), 200),
    index: index === true,
    progress: { phase: 'queued', completed: 0, total: 1, label: 'Queued for proving' },
    validation: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  }
}

export function createSourceProvingJob(options = {}) {
  const candidate = newJob(options)
  return mutateJobs(doc => {
    const existing = doc.jobs.find(job => job.sourceId === candidate.sourceId && !isTerminal(job.status))
    if (existing) return { data: doc, result: { job: existing, created: false } }
    let finishedKept = 0
    const jobs = [candidate, ...doc.jobs].filter(job => {
      if (!isTerminal(job.status)) return true
      finishedKept += 1
      return finishedKept <= MAX_JOBS_KEPT
    })
    return { data: { ...doc, lastUpdated: candidate.createdAt, jobs }, result: { job: candidate, created: true } }
  })
}

function patchSourceProvingJob(id, patch = {}) {
  const now = new Date().toISOString()
  return mutateJobs(doc => {
    const index = doc.jobs.findIndex(job => job.id === id)
    if (index === -1) return { data: doc, result: null }
    const jobs = [...doc.jobs]
    jobs[index] = { ...jobs[index], ...patch, updatedAt: now }
    return { data: { ...doc, lastUpdated: now, jobs }, result: jobs[index] }
  })
}

export function reportSourceProvingProgress(id, update = {}) {
  try {
    const job = getSourceProvingJob(id)
    if (!job || isTerminal(job.status)) return job
    const progress = { ...job.progress }
    for (const key of ['phase', 'completed', 'total', 'label']) {
      if (update[key] !== undefined) progress[key] = update[key]
    }
    progress.completed = Math.max(0, Number(progress.completed) || 0)
    progress.total = Math.max(progress.completed, Number(progress.total) || 1)
    return patchSourceProvingJob(id, { progress })
  } catch {
    return null
  }
}

export function finishSourceProvingJob(id, { status, validation = null, error = null } = {}) {
  const completed = status === 'completed'
  try {
    const job = getSourceProvingJob(id)
    const total = Math.max(1, Number(job?.progress?.total) || 1)
    return patchSourceProvingJob(id, {
      status: completed ? 'completed' : 'failed',
      validation: completed ? validation : null,
      error: completed ? null : (error || 'Proving failed'),
      progress: {
        ...(job?.progress || {}),
        phase: completed ? 'done' : 'failed',
        completed: completed ? total : (job?.progress?.completed || 0),
        total,
        label: completed ? 'Proving complete' : 'Proving failed',
      },
      finishedAt: new Date().toISOString(),
    })
  } catch {
    return null
  }
}

export function getSourceProvingJob(id) {
  if (!id) return null
  return mutateJobs(doc => ({ data: doc, result: doc.jobs.find(job => job.id === id) || null }))
}

export function listSourceProvingJobs({ sourceId = '', limit = 100 } = {}) {
  const size = Math.min(Math.max(Number(limit) || 100, 1), 500)
  return mutateJobs(doc => ({
    data: doc,
    result: doc.jobs.filter(job => !sourceId || job.sourceId === sourceId).slice(0, size),
  }))
}

function timeoutAfter(ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Proving exceeded the ${Math.round(ms / 1000)} second safety limit`)
      error.code = 'proving-timeout'
      reject(error)
    }, ms)
    timer.unref?.()
  })
}

export function runSourceProvingJob(id, options = {}) {
  const state = queueState()
  if (state.inFlight.has(id)) return state.inFlight.get(id)
  const job = getSourceProvingJob(id)
  if (!job || isTerminal(job.status)) return Promise.resolve(job)
  const prove = options.prove || proveLeadSource
  const persist = options.persist || persistLeadSourceValidation
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || JOB_TIMEOUT_MS, 1_000), JOB_TIMEOUT_MS)
  const task = (async () => {
    try {
      reportSourceProvingProgress(id, { phase: 'starting', completed: 0, total: 1, label: 'Starting bounded sample' })
      const validation = await Promise.race([
        prove({
          sourceId: job.sourceId,
          jurisdiction: job.jurisdiction,
          since: job.since,
          limit: job.limit,
          persist: false,
          index: false,
          onProgress: update => reportSourceProvingProgress(id, update),
        }),
        timeoutAfter(timeoutMs),
      ])
      const persisted = await persist(validation, { index: options.index === true || job.index === true })
      return finishSourceProvingJob(id, { status: 'completed', validation: persisted })
    } catch (error) {
      return finishSourceProvingJob(id, { status: 'failed', error: error?.message || 'Proving failed' })
    } finally {
      state.inFlight.delete(id)
    }
  })()
  state.inFlight.set(id, task)
  task.catch(() => {})
  return task
}
