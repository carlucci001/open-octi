import fs from 'node:fs'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8642'
const DEFAULT_ENV_FILE = '/root/hermes-lab-data/.env'
const DEFAULT_TIMEOUT_MS = 60000
const DEFAULT_KANBAN_BASE_URL = 'http://127.0.0.1:9119/api/plugins/kanban'
const DEFAULT_KANBAN_TIMEOUT_MS = 15000
const HERMES_MODEL = 'hermes-agent'
const HERMES_PROFILES = new Set(['foreman', 'nightwatch', 'checker', 'scribe', 'ledger'])

class HermesClientError extends Error {}

function readBearerKeyFromFile(file) {
  try {
    const source = fs.readFileSync(file, 'utf8')
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator < 1 || line.slice(0, separator).trim() !== 'API_SERVER_KEY') continue
      return line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch {}
  return ''
}

function resolveBearerKey() {
  return String(
    process.env.HERMES_API_SERVER_KEY
      || readBearerKeyFromFile(process.env.HERMES_ENV_FILE || DEFAULT_ENV_FILE)
      || ''
  ).trim()
}

function resolveDashboardSessionToken() {
  return String(process.env.HERMES_DASHBOARD_SESSION_TOKEN || '').trim()
}

const DEFAULT_DASHBOARD_AUTH_PROVIDER = 'basic'

function resolveDashboardCredentials() {
  const username = String(process.env.HERMES_DASHBOARD_USERNAME || '').trim()
  const password = String(process.env.HERMES_DASHBOARD_PASSWORD || '').trim()
  if (!username || !password) return null
  const provider = String(process.env.HERMES_DASHBOARD_AUTH_PROVIDER || DEFAULT_DASHBOARD_AUTH_PROVIDER).trim()
    || DEFAULT_DASHBOARD_AUTH_PROVIDER
  return { username, password, provider }
}

// Session-cookie cache for the gated dashboard (the basic-auth provider mints
// hermes_session_at/rt JWT cookies via POST /auth/password-login). Held in
// module scope: one login serves every kanban call until the cookie expires,
// at which point a 401 triggers exactly one re-login + retry.
let dashboardSessionCookie = ''

export function clearHermesDashboardSession() {
  dashboardSessionCookie = ''
}

function dashboardOriginFromKanbanBase(baseUrl) {
  try {
    return new URL(String(baseUrl)).origin
  } catch {
    return 'http://127.0.0.1:9119'
  }
}

function joinSetCookies(response) {
  const list = typeof response.headers?.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers?.get?.('set-cookie') ? [response.headers.get('set-cookie')] : [])
  const pairs = []
  for (const raw of list) {
    const first = String(raw || '').split(';')[0].trim()
    if (first && first.includes('=')) pairs.push(first)
  }
  return pairs.join('; ')
}

async function hermesDashboardLogin({ origin, credentials, timeoutMs = DEFAULT_KANBAN_TIMEOUT_MS }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${origin}/auth/password-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: credentials.provider,
        username: credentials.username,
        password: credentials.password,
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const raw = await response.text()
    let payload = null
    try { payload = raw ? JSON.parse(raw) : null } catch {}
    if (!response.ok) {
      throw new HermesClientError(`Hermes dashboard login returned HTTP ${response.status}: ${apiErrorMessage(payload, raw)}`)
    }
    const cookie = joinSetCookies(response)
    if (!cookie) throw new HermesClientError('Hermes dashboard login returned no session cookie')
    dashboardSessionCookie = cookie
    return cookie
  } catch (error) {
    if (error instanceof HermesClientError) throw error
    if (error?.name === 'AbortError') throw new HermesClientError(`Hermes dashboard login timed out after ${timeoutMs}ms`)
    throw new HermesClientError(`Hermes dashboard login failed: ${String(error?.message || error || 'unknown error').slice(0, 240)}`)
  } finally {
    clearTimeout(timer)
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HermesClientError('Hermes requires at least one chat message')
  }
  return messages.map((message) => {
    const role = String(message?.role || '').trim()
    const content = typeof message?.content === 'string' ? message.content : ''
    if (!['system', 'user', 'assistant'].includes(role) || !content) {
      throw new HermesClientError('Hermes received an invalid chat message')
    }
    return { role, content }
  })
}

function responseText(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : (part?.text || '')).join('').trim()
  }
  return ''
}

function apiErrorMessage(payload, fallback) {
  const candidate = payload?.error?.message || payload?.message || fallback
  return String(candidate || 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 240)
}

export async function hermesChat({
  profile,
  messages,
  baseUrl = process.env.HERMES_API_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normalizedProfile = String(profile || '').trim().toLowerCase()
  if (!HERMES_PROFILES.has(normalizedProfile)) {
    throw new HermesClientError(`Unsupported Hermes profile: ${normalizedProfile || '(empty)'}`)
  }

  const bearerKey = resolveBearerKey()
  if (!bearerKey) throw new HermesClientError('Hermes API Bearer key is not configured')

  const normalizedMessages = normalizeMessages(messages)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${String(baseUrl).replace(/\/+$/, '')}/p/${normalizedProfile}/v1/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HERMES_MODEL,
        messages: normalizedMessages,
        stream: false,
      }),
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload = null
    try { payload = raw ? JSON.parse(raw) : null } catch {}

    if (!response.ok) {
      throw new HermesClientError(
        `Hermes ${normalizedProfile} returned HTTP ${response.status}: ${apiErrorMessage(payload, raw)}`
      )
    }

    const text = responseText(payload?.choices?.[0]?.message?.content)
    if (!text) throw new HermesClientError(`Hermes ${normalizedProfile} returned an empty response`)

    return {
      text,
      model: String(payload?.model || HERMES_MODEL),
      profile: normalizedProfile,
      usage: payload?.usage || null,
    }
  } catch (error) {
    if (error instanceof HermesClientError) throw error
    if (error?.name === 'AbortError') {
      throw new HermesClientError(`Hermes ${normalizedProfile} timed out after ${timeoutMs}ms`)
    }
    throw new HermesClientError(
      `Hermes ${normalizedProfile} request failed: ${String(error?.message || error || 'unknown error').slice(0, 240)}`
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function hermesKanbanRequest({
  path = '',
  method = 'GET',
  query,
  body,
  baseUrl = process.env.HERMES_KANBAN_BASE_URL || DEFAULT_KANBAN_BASE_URL,
  timeoutMs = DEFAULT_KANBAN_TIMEOUT_MS,
}) {
  const sessionToken = resolveDashboardSessionToken()
  const credentials = resolveDashboardCredentials()
  if (!sessionToken && !credentials) throw new HermesClientError('Hermes dashboard session token is not configured')

  const cleanPath = `/${String(path || '').replace(/^\/+/, '')}`
  if (cleanPath.includes('..')) throw new HermesClientError('Hermes kanban path is invalid')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const suffix = params.size ? `?${params.toString()}` : ''
  const url = `${String(baseUrl).replace(/\/+$/, '')}${cleanPath}${suffix}`
  const origin = dashboardOriginFromKanbanBase(baseUrl)

  // With dashboard credentials configured (the gated dashboard's cookie mode),
  // ensure a session cookie before the first request.
  if (credentials && !dashboardSessionCookie) {
    await hermesDashboardLogin({ origin, credentials, timeoutMs })
  }

  const attempt = async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, {
        method: String(method || 'GET').toUpperCase(),
        headers: {
          ...(sessionToken ? { 'X-Hermes-Session-Token': sessionToken } : {}),
          ...(dashboardSessionCookie ? { Cookie: dashboardSessionCookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        cache: 'no-store',
      })
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    let response = await attempt()
    // An expired/rotated cookie session yields 401 exactly once: re-login and
    // retry a single time. Never loops — a second 401 is surfaced honestly.
    if (response.status === 401 && credentials) {
      clearHermesDashboardSession()
      await hermesDashboardLogin({ origin, credentials, timeoutMs })
      response = await attempt()
    }
    const raw = await response.text()
    let payload = null
    try { payload = raw ? JSON.parse(raw) : null } catch {}
    if (!response.ok) {
      throw new HermesClientError(`Hermes kanban returned HTTP ${response.status}: ${apiErrorMessage(payload, raw)}`)
    }
    if (payload === null) throw new HermesClientError('Hermes kanban returned an empty response')
    return payload
  } catch (error) {
    if (error instanceof HermesClientError) throw error
    if (error?.name === 'AbortError') throw new HermesClientError(`Hermes kanban timed out after ${timeoutMs}ms`)
    throw new HermesClientError(`Hermes kanban request failed: ${String(error?.message || error || 'unknown error').slice(0, 240)}`)
  }
}
