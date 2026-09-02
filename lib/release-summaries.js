import { genId, loadAll, saveAll } from './entityStore'

function text(value, field, max) {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${field} is required.`)
  return result.slice(0, max)
}

export function getReleaseSummary(platformId, releaseId) {
  const platform = String(platformId || '').trim()
  const release = String(releaseId || '').trim()
  if (!platform || !release) return null
  return loadAll('releaseSummaries').find(row => row.platformId === platform && row.releaseId === release) || null
}

export function saveReleaseSummary(input = {}) {
  const platformId = text(input.platformId, 'platformId', 100)
  const releaseId = text(input.releaseId, 'releaseId', 160)
  const previousReleaseId = String(input.previousReleaseId || '').trim().slice(0, 160)
  const summary = text(input.summary, 'summary', 8_000)
  const runId = text(input.runId, 'runId', 160)
  const rows = loadAll('releaseSummaries')
  const now = new Date().toISOString()
  const index = rows.findIndex(row => row.platformId === platformId && row.releaseId === releaseId)
  let record
  if (index >= 0) {
    record = { ...rows[index], previousReleaseId, summary, runId, updatedAt: now }
    rows[index] = record
  } else {
    record = { id: genId('rs'), platformId, releaseId, previousReleaseId, summary, runId, createdAt: now, updatedAt: now }
    rows.unshift(record)
  }
  saveAll('releaseSummaries', rows.slice(0, 500))
  return record
}
