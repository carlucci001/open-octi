// lib/lead-sweep-runs.js
// Async run records for long-running lead sweeps.
//
// Why this exists: the sweep pipeline (Apify Places 240s + contact scraper 150s
// + per-lead name extraction) routinely runs past Cloudflare's 100s origin
// timeout, so a synchronous POST returned a gateway 5xx to the browser while the
// server kept working and created the leads anyway. Carl hit this live at
// limit=10 on 2026-08-04.
//
// Contract deliberately mirrors lib/orchestration-engine.js: the route starts a
// run, returns it immediately, the client polls. Persistence goes through
// mutateData (an immediate sqlite transaction) so the background worker's
// progress writes and a concurrent poller cannot clobber each other —
// entityStore is load-all/save-all and would lose writes here.

import { mutateData, readData } from './dataStore'

const FILE = 'lead-sweep-runs.json'
const MAX_RUNS_KEPT = 50

// A systemd restart mid-run leaves a record stuck at 'running' forever. Any
// read older than this is surfaced as failed so the client stops polling.
const STALE_AFTER_MS = 30 * 60 * 1000

export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled']

export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status)
}

export function genSweepRunId() {
  return `lsr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function emptyDoc() {
  return { lastUpdated: null, runs: [] }
}

function normalizeDoc(current) {
  if (!current || !Array.isArray(current.runs)) return emptyDoc()
  return { ...current, runs: current.runs }
}

// Computed view only — never persisted, so a read stays a read.
function withStaleness(run, nowMs = Date.now()) {
  if (!run || isTerminal(run.status)) return run
  const stamp = new Date(run.updatedAt || run.createdAt || 0).getTime()
  if (!stamp || nowMs - stamp < STALE_AFTER_MS) return run
  return {
    ...run,
    status: 'failed',
    stale: true,
    error: run.error || 'Run stopped reporting — the server restarted or the worker died.',
  }
}

function newSweepRun({ kind, params = {}, startedBy = 'operator', stepsTotal = 4 } = {}) {
  const now = new Date().toISOString()
  return {
    id: genSweepRunId(),
    kind: kind || 'vertical',
    status: 'running',
    phase: 'starting',
    phaseLabel: 'Starting run...',
    step: 0,
    stepsTotal,
    params,
    result: null,
    error: null,
    startedBy,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  }
}

function prependRun(doc, run) {
  // Trim finished runs only. Evicting an in-flight record would strand its
  // poller on a 404 and lose the result of work that is still running.
  let kept = 0
  const runs = [run, ...doc.runs].filter(entry => {
    if (!isTerminal(entry.status)) return true
    kept += 1
    return kept <= MAX_RUNS_KEPT
  })
  return { ...doc, lastUpdated: run.createdAt, runs }
}

export function createSweepRun(options = {}) {
  const run = newSweepRun(options)
  mutateData(FILE, current => {
    const doc = normalizeDoc(current)
    return { data: prependRun(doc, run), result: run }
  })
  return run
}

// Atomic create-or-replay for an HTTP idempotency key. The lookup and insert
// happen inside one sqlite transaction, so even overlapping retries cannot
// launch two paid vendor jobs. Scope the key to the operator and run kind so a
// caller cannot replay another user's run by supplying their request ID.
export function createSweepRunOnce(options = {}) {
  const clientRequestId = String(options?.params?.clientRequestId || '').trim()
  if (!clientRequestId) return { run: createSweepRun(options), created: true }
  const candidate = newSweepRun(options)
  return mutateData(FILE, current => {
    const doc = normalizeDoc(current)
    const existing = doc.runs.find(entry => (
      String(entry?.params?.clientRequestId || '') === clientRequestId
      && entry.kind === candidate.kind
      && entry.startedBy === candidate.startedBy
    ))
    if (existing) return { data: doc, result: { run: withStaleness(existing), created: false } }
    return { data: prependRun(doc, candidate), result: { run: candidate, created: true } }
  })
}

export function patchSweepRun(id, patch = {}) {
  const now = new Date().toISOString()
  return mutateData(FILE, current => {
    const doc = normalizeDoc(current)
    const index = doc.runs.findIndex(entry => entry.id === id)
    if (index === -1) return { data: doc, result: null }
    const runs = [...doc.runs]
    runs[index] = { ...runs[index], ...patch, updatedAt: now }
    return { data: { ...doc, lastUpdated: now, runs }, result: runs[index] }
  })
}

// Progress is best-effort: a failed write must never kill the run reporting it.
export function reportSweepProgress(id, update = {}) {
  const patch = {}
  for (const key of ['phase', 'phaseLabel', 'step', 'stepsTotal', 'note']) {
    if (update[key] !== undefined) patch[key] = update[key]
  }
  if (!Object.keys(patch).length) return null
  try {
    return patchSweepRun(id, patch)
  } catch {
    return null
  }
}

export function finishSweepRun(id, { status, result = null, error = null } = {}) {
  const done = status === 'completed'
  try {
    return patchFinish(id, status, result, error, done)
  } catch {
    // Never throw from a terminal handler.
    return null
  }
}

function patchFinish(id, status, result, error, done) {
  return patchSweepRun(id, {
    status,
    result,
    error,
    phase: done ? 'done' : status,
    phaseLabel: done ? 'Finished' : status === 'cancelled' ? 'Cancelled' : 'Failed',
    finishedAt: new Date().toISOString(),
  })
}

export function getSweepRun(id) {
  if (!id) return null
  const doc = normalizeDoc(readData(FILE))
  const run = doc.runs.find(entry => entry.id === id)
  return run ? withStaleness(run) : null
}

export function getSweepRunByClientRequestId(clientRequestId, { kind, startedBy } = {}) {
  const target = String(clientRequestId || '').trim()
  if (!target) return null
  const doc = normalizeDoc(readData(FILE))
  const run = doc.runs.find(entry => (
    String(entry?.params?.clientRequestId || '') === target
    && (!kind || entry.kind === kind)
    && (!startedBy || entry.startedBy === startedBy)
  ))
  return run ? withStaleness(run) : null
}

export function listSweepRuns({ limit = 20, kind } = {}) {
  const doc = normalizeDoc(readData(FILE))
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20
  return doc.runs
    .filter(entry => !kind || entry.kind === kind)
    .slice(0, size)
    .map(entry => withStaleness(entry))
}
