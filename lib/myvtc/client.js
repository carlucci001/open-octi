import { getCred } from '@/lib/agent-creds'
import { assertSafePlatformUrl, guardedFetch } from '@/lib/platforms/ssrf'

const BASE_URL = 'https://myvtc.com/api/v1'
const REQUEST_BUDGET_MS = 8000

export class MyvtcApiError extends Error {
  constructor(code, { status = 502, retryAfter = 0 } = {}) {
    super(`MyVTC request failed (${code}).`)
    this.name = 'MyvtcApiError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

export function myvtcCredential() {
  return getCred('MyVTC Platform Admin') || null
}

function statusErrorCode(status) {
  if (status === 401) return 'UPSTREAM_UNAUTHORIZED'
  if (status === 403) return 'UPSTREAM_FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 429) return 'RATE_LIMITED'
  return 'UPSTREAM_ERROR'
}

function retryDelayMs(value) {
  const seconds = Number.parseFloat(String(value || ''))
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.min(5000, Math.ceil(seconds * 1000))
}

function sleep(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve()
}

function buildUrl(path, searchParams) {
  const cleanPath = String(path || '').trim()
  if (!cleanPath.startsWith('/') || cleanPath.startsWith('//') || cleanPath.includes('..') || /[?#]/.test(cleanPath)) {
    throw new MyvtcApiError('INVALID_PATH', { status: 400 })
  }
  const url = new URL(`${BASE_URL}${cleanPath}`)
  const entries = searchParams instanceof URLSearchParams
    ? searchParams.entries()
    : Object.entries(searchParams || {})
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

function parseBody(response) {
  if (!response.text) return {}
  try {
    const parsed = JSON.parse(response.text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    return parsed
  } catch {
    throw new MyvtcApiError('INVALID_RESPONSE')
  }
}

export async function myvtcFetch(path, { method = 'GET', body, searchParams } = {}) {
  const credential = myvtcCredential()
  if (!credential?.key) throw new MyvtcApiError('NOT_CONFIGURED', { status: 503 })

  const url = buildUrl(path, searchParams)
  const startedAt = Date.now()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let safeUrl
    try {
      safeUrl = await assertSafePlatformUrl(url.toString())
    } catch {
      throw new MyvtcApiError('UNSAFE_URL')
    }

    let response
    try {
      response = await guardedFetch(safeUrl.toString(), {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: Math.max(250, REQUEST_BUDGET_MS - (Date.now() - startedAt)),
        headers: {
          Authorization: `Bearer ${credential.key}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
      })
    } catch {
      throw new MyvtcApiError('UPSTREAM_UNREACHABLE')
    }

    const parsed = parseBody(response)
    if (response.status === 429 && attempt === 0) {
      const delay = retryDelayMs(response.retryAfter)
      await sleep(Math.min(delay, Math.max(0, REQUEST_BUDGET_MS - (Date.now() - startedAt))))
      continue
    }
    if (!response.ok) {
      throw new MyvtcApiError(statusErrorCode(response.status), {
        status: response.status,
        retryAfter: retryDelayMs(response.retryAfter) / 1000,
      })
    }
    return parsed
  }

  throw new MyvtcApiError('RATE_LIMITED', { status: 429 })
}

export async function listContactMessages({ cursor, topic, limit = 25 } = {}) {
  const result = await myvtcFetch('/contact-messages', {
    searchParams: { cursor, topic, limit: Math.min(25, Math.max(1, Number(limit) || 25)) },
  })
  return {
    data: Array.isArray(result.data) ? result.data : [],
    nextCursor: result.nextCursor || null,
  }
}

export async function fetchContactMessage(contactId) {
  const wanted = String(contactId || '').trim()
  if (!wanted) throw new MyvtcApiError('INVALID_CONTACT_ID', { status: 400 })
  let cursor
  for (let page = 0; page < 40; page += 1) {
    const result = await listContactMessages({ cursor, limit: 25 })
    const match = result.data.find(message => String(message?.id || '') === wanted)
    if (match) return match
    if (!result.nextCursor || result.nextCursor === cursor) return null
    cursor = result.nextCursor
  }
  return null
}

export async function registerWebhook({ url, events }) {
  const result = await myvtcFetch('/webhooks', { method: 'POST', body: { url, events } })
  return result.data || null
}

export async function listWebhooks() {
  const result = await myvtcFetch('/webhooks')
  return Array.isArray(result.data) ? result.data : []
}

export async function deleteWebhook(id) {
  const endpointId = encodeURIComponent(String(id || '').trim())
  if (!endpointId) throw new MyvtcApiError('INVALID_WEBHOOK_ID', { status: 400 })
  await myvtcFetch(`/webhooks/${endpointId}`, { method: 'DELETE' })
  return { deleted: true }
}
