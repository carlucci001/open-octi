import { genId, loadAll, saveAll } from './entityStore'

const RELEASE_STATUSES = new Set(['live', 'previous', 'failed'])

function requiredText(value, field, max) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${field} is required.`)
  if (text.length > max) throw new Error(`${field} is too long.`)
  return text
}

export function normalizeReleaseReport(input = {}) {
  const version = requiredText(input.version, 'version', 120)
  const commit = requiredText(input.commit, 'commit', 120)
  const deployer = requiredText(input.deployer, 'deployer', 160)
  const status = requiredText(input.status, 'status', 20).toLowerCase()
  if (!RELEASE_STATUSES.has(status)) throw new Error('status must be live, previous, or failed.')
  if (!/^[0-9a-f]{7,64}$/i.test(commit)) throw new Error('commit must be a hexadecimal commit SHA of at least 7 characters.')

  const deployedAtDate = new Date(requiredText(input.deployedAt, 'deployedAt', 80))
  if (!Number.isFinite(deployedAtDate.getTime())) throw new Error('deployedAt must be a valid timestamp.')

  return { version, commit, deployer, deployedAt: deployedAtDate.toISOString(), status }
}

export function recordRelease(input = {}) {
  const release = normalizeReleaseReport(input)
  const current = loadAll('releases')
  const existing = current.find(row => (
    row?.version === release.version
    && row?.commit === release.commit
    && row?.deployedAt === release.deployedAt
    && row?.status === release.status
  ))
  if (existing) return { created: false, release: existing }

  const now = new Date().toISOString()
  const next = current.map(row => (
    release.status === 'live' && row?.status === 'live'
      ? { ...row, status: 'previous', updatedAt: now }
      : row
  ))
  const record = { id: genId('rel'), createdAt: now, updatedAt: now, ...release }
  saveAll('releases', [record, ...next].slice(0, 500))
  return { created: true, release: record }
}
