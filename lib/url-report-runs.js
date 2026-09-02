// A full SEO/AEO/GEO run crawls the site, waits on Google PageSpeed (up to
// 45s on its own) and then waits on Gemini. That routinely runs past the
// 100-second ceiling Cloudflare puts on a proxied request — and when it does,
// the browser gets an HTML 524 page, `await r.json()` throws a parse error,
// and the operator sees "it didn't work" with no report and no explanation.
//
// So the run is started, not awaited. The POST returns a runId immediately
// and the work continues in this process; the client polls for the result.
// The durable record of a finished run is the document itself, which is why
// this registry can stay in memory and simply forget completed runs.
import { runUrlReport } from './url-report-engine'

const runs = new Map()
const KEEP_MS = 30 * 60 * 1000

function sweep() {
  const cutoff = Date.now() - KEEP_MS
  for (const [id, run] of runs) {
    if (run.finishedAt && new Date(run.finishedAt).getTime() < cutoff) runs.delete(id)
  }
}

export function startUrlReportRun({ url, types, accountId, accountName, createdBy }) {
  sweep()
  const id = `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const run = {
    id, accountId, url, types,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
  }
  runs.set(id, run)

  // Deliberately not awaited. Any throw is captured onto the run record so
  // the operator gets the real reason instead of a dead spinner.
  runUrlReport({ url, types, accountId, accountName, createdBy })
    .then(result => {
      run.status = 'done'
      run.result = result
      run.finishedAt = new Date().toISOString()
    })
    .catch(error => {
      run.status = 'failed'
      run.error = error?.message || 'Report generation failed'
      run.stage = error?.stage || null
      run.finishedAt = new Date().toISOString()
      console.error('[url-report-run]', id, run.error)
    })

  return run
}

export function getUrlReportRun(id) {
  return runs.get(String(id || '')) || null
}

export function publicRun(run) {
  if (!run) return null
  return {
    runId: run.id,
    status: run.status,
    url: run.url,
    types: run.types,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    elapsedSeconds: Math.round(((run.finishedAt ? new Date(run.finishedAt) : new Date()) - new Date(run.startedAt)) / 1000),
    error: run.error,
    documentId: run.result?.documentId || null,
    title: run.result?.title || null,
    summary: run.result?.summary || null,
    scores: run.result?.scores || null,
  }
}

// Score history needs no store of its own: every finished run already files a
// document carrying `meta.scores`, so the history is the document trail. That
// also means runs Carl did before this existed show up retroactively.
function diffScores(current, previous) {
  if (!current || !previous) return null
  const delta = {}
  for (const key of Object.keys(current)) {
    const now = Number(current[key])
    const before = Number(previous[key])
    if (Number.isFinite(now) && Number.isFinite(before)) delta[key] = Math.round((now - before) * 10) / 10
  }
  return Object.keys(delta).length ? delta : null
}

export function urlReportHistory(readData, accountId, limit = 12) {
  const store = readData('documents.json') || {}
  const documents = Array.isArray(store.documents) ? store.documents : []
  const rows = documents
    .filter(doc => doc?.meta?.generator === 'url-report-engine' && doc.clientId === accountId && doc.meta?.scores)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map(doc => ({
      documentId: doc.id,
      title: doc.title,
      url: doc.meta.url || '',
      ranAt: doc.createdAt,
      types: doc.meta.types || [],
      scores: doc.meta.scores,
    }))
  return rows.map((row, index) => ({
    ...row,
    delta: index + 1 < rows.length ? diffScores(row.scores, rows[index + 1].scores) : null,
    comparedTo: index + 1 < rows.length ? rows[index + 1].ranAt : null,
  }))
}
