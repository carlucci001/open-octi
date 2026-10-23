import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const DEFAULT_REPOSITORY = 'carlucci001/open-octi'
const DEFAULT_SOCKET = '/run/openocti-updater/control.sock'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

let releaseCache = null

export function normalizeVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left)
  const b = normalizeVersion(right)
  if (!a || !b) throw new Error('Versions must use semantic versioning (for example 1.4.2).')
  const av = a.split('.').map(Number)
  const bv = b.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (av[index] !== bv[index]) return av[index] > bv[index] ? 1 : -1
  }
  return 0
}

export function readInstalledVersion(root = process.cwd(), env = process.env) {
  const configured = normalizeVersion(env.OPENOCTI_VERSION || env.NEXT_PUBLIC_APP_VERSION)
  if (configured) return configured
  for (const name of ['VERSION.json', 'package.json']) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
      const version = normalizeVersion(parsed.version)
      if (version) return version
    } catch {}
  }
  return '0.0.0'
}

export function updateConfiguration(env = process.env) {
  return {
    product: String(env.OPENOCTI_UPDATE_PRODUCT || 'OpenOcti').trim() || 'OpenOcti',
    repository: String(env.OPENOCTI_UPDATE_REPOSITORY || DEFAULT_REPOSITORY).trim(),
    socketPath: String(env.OPENOCTI_UPDATER_SOCKET || DEFAULT_SOCKET).trim(),
    token: String(env.OPENOCTI_UPDATER_TOKEN || '').trim(),
  }
}

export async function fetchLatestRelease({ repository = DEFAULT_REPOSITORY, fetchImpl = fetch, force = false, now = Date.now() } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('The update repository is invalid.')
  if (!force && releaseCache?.repository === repository && now - releaseCache.checkedAt < CACHE_TTL_MS) return releaseCache.value

  const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OpenOcti-Update-Checker',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`GitHub release check failed with status ${response.status}.`)
  const payload = await response.json()
  const version = normalizeVersion(payload.tag_name)
  if (!version) throw new Error('The latest official release does not have a semantic version tag.')
  const value = {
    version,
    tag: String(payload.tag_name || ''),
    name: String(payload.name || payload.tag_name || version),
    publishedAt: payload.published_at || null,
    url: String(payload.html_url || `https://github.com/${repository}/releases/latest`),
  }
  releaseCache = { repository, checkedAt: now, value }
  return value
}

function updaterRequest({ socketPath, token, method = 'GET', pathname = '/status', body = null, timeoutMs = 3000 }) {
  return new Promise((resolve, reject) => {
    if (!token || !socketPath || !fs.existsSync(socketPath)) {
      resolve({ ready: false, state: 'not_configured' })
      return
    }
    const request = http.request({
      socketPath,
      path: pathname,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
      timeout: timeoutMs,
    }, response => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { raw += chunk })
      response.on('end', () => {
        let parsed = {}
        try { parsed = raw ? JSON.parse(raw) : {} } catch {}
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(parsed.error || `Updater returned status ${response.statusCode}.`))
          return
        }
        resolve({ ready: true, ...parsed })
      })
    })
    request.on('timeout', () => request.destroy(new Error('Updater did not respond in time.')))
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

export async function getUpdaterStatus(env = process.env) {
  const config = updateConfiguration(env)
  try {
    return await updaterRequest({ socketPath: config.socketPath, token: config.token })
  } catch (error) {
    return { ready: false, state: 'unavailable', error: error.message }
  }
}

export async function requestUpdaterInstall(version, env = process.env) {
  const target = normalizeVersion(version)
  if (!target) throw new Error('A valid target version is required.')
  const config = updateConfiguration(env)
  const result = await updaterRequest({
    socketPath: config.socketPath,
    token: config.token,
    method: 'POST',
    pathname: '/install',
    body: JSON.stringify({ version: target }),
    timeoutMs: 5000,
  })
  if (!result.ready) throw new Error('The guarded host updater is not installed on this system.')
  return result
}

export function clearReleaseCacheForTests() {
  releaseCache = null
}
