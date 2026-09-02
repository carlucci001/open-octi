import { execFileSync } from 'node:child_process'

const RELEASE_STATUSES = new Set(['live', 'previous', 'failed'])

export function parseReleaseList(value) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []
  return rows
    .filter(row => row && row.id && row.version && row.commit && row.deployer && RELEASE_STATUSES.has(row.status) && Number.isFinite(Date.parse(row.deployedAt)))
    .map(row => ({
      id: String(row.id),
      version: String(row.version),
      commit: String(row.commit),
      deployer: String(row.deployer),
      deployedAt: new Date(row.deployedAt).toISOString(),
      status: row.status,
      ...(row.notes ? { notes: String(row.notes) } : {}),
    }))
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))
    .slice(0, 20)
}

export function selectReleaseState(releases = []) {
  const nonFailed = releases.filter(row => row.status !== 'failed')
  const live = releases.find(row => row.status === 'live') || nonFailed[0] || null
  const previous = releases.find(row => row.status === 'previous' && row.id !== live?.id)
    || nonFailed.find(row => row.id !== live?.id)
    || null
  return { live, previous }
}

function shellQuote(value) {
  return `'${String(value || '').replaceAll("'", "'\\''")}'`
}

export function buildRollbackCommand({ previousRelease, cicd } = {}) {
  if (!previousRelease?.commit || !cicd?.localPath || !cicd?.deployCommand) return ''
  return `git -C ${shellQuote(cicd.localPath)} checkout --detach ${shellQuote(previousRelease.commit)} && ${String(cicd.deployCommand).trim()}`
}

export function collectCommitMessages({ repoPath, fromCommit, toCommit, runGit } = {}) {
  if (!repoPath || !/^[0-9a-f]{7,64}$/i.test(String(fromCommit || '')) || !/^[0-9a-f]{7,64}$/i.test(String(toCommit || ''))) return []
  const runner = runGit || ((cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }))
  try {
    return String(runner(repoPath, ['log', '--format=%s', '--max-count=50', `${fromCommit}..${toCommit}`]) || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 50)
  } catch {
    return []
  }
}

export function matchCicdItem(platform, items = []) {
  const platformId = String(platform?.platformId || '')
  const normalized = platformId.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return items.find(item => item.platformId === platformId)
    || items.find(item => String(item.repo || item.name || '').replace(/[^a-z0-9]/gi, '').toLowerCase().includes(normalized))
    || null
}
