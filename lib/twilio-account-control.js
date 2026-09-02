const TWILIO_API_ROOT = 'https://api.twilio.com/2010-04-01/Accounts'
const CALL_SID = /^CA[0-9a-f]{32}$/i
const PENDING_CALL_TTL_MS = 2 * 60 * 1000
const pendingConferenceCalls = globalThis.__fccTwilioPendingConferenceCalls instanceof Map
  ? globalThis.__fccTwilioPendingConferenceCalls
  : new Map()
globalThis.__fccTwilioPendingConferenceCalls = pendingConferenceCalls

export class TwilioUpstreamError extends Error {
  constructor(status, code = null) {
    super(`Twilio request failed (${status})`)
    this.name = 'TwilioUpstreamError'
    this.status = status
    this.code = code
  }
}

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET
  const accountToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid) return null

  let authSid
  let authToken
  if (keySid && keySecret) {
    authSid = keySid
    authToken = keySecret
  } else if (accountToken) {
    authSid = accountSid
    authToken = accountToken
  } else {
    return null
  }

  return {
    accountSid,
    authorization: `Basic ${Buffer.from(`${authSid}:${authToken}`).toString('base64')}`,
  }
}

export async function twilioRequest(config, path, { method = 'GET', body } = {}) {
  const options = {
    method,
    headers: { Authorization: config.authorization },
    cache: 'no-store',
  }
  if (body) {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    options.body = new URLSearchParams(body)
  }

  const response = await fetch(`${TWILIO_API_ROOT}/${config.accountSid}${path}`, options)
  const responseText = await response.text()
  let data = {}
  try {
    data = responseText ? JSON.parse(responseText) : {}
  } catch {
    data = {}
  }

  if (!response.ok) {
    throw new TwilioUpstreamError(response.status, data?.code ?? null)
  }
  return data
}

export function isTwilioNotFound(error) {
  return error instanceof TwilioUpstreamError && error.status === 404
}

export function normalizeConferenceName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}

export function trackPendingConferenceCall(conferenceName, callSid, now = Date.now()) {
  const name = normalizeConferenceName(conferenceName)
  const sid = typeof callSid === 'string' ? callSid.trim() : ''
  if (!name || !CALL_SID.test(sid)) return false
  pendingConferenceCalls.set(name, { callSid: sid, at: now })
  return true
}

export function getPendingConferenceCall(conferenceName, now = Date.now()) {
  const name = normalizeConferenceName(conferenceName)
  if (!name) return null
  const pending = pendingConferenceCalls.get(name)
  if (!pending) return null
  if (!Number.isFinite(pending.at) || now - pending.at > PENDING_CALL_TTL_MS) {
    pendingConferenceCalls.delete(name)
    return null
  }
  return pending.callSid
}

export function clearPendingConferenceCall(conferenceName) {
  const name = normalizeConferenceName(conferenceName)
  if (name) pendingConferenceCalls.delete(name)
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export async function resolveActiveConference(config, conferenceName, {
  attempts = 6,
  retryDelayMs = process.env.NODE_ENV === 'test' ? 0 : 250,
} = {}) {
  const query = new URLSearchParams({
    FriendlyName: conferenceName,
    Status: 'in-progress',
    PageSize: '20',
  })

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await twilioRequest(config, `/Conferences.json?${query}`)
    const conference = (data.conferences || []).find(item => (
      item?.friendly_name === conferenceName && item?.status === 'in-progress'
    ))
    if (conference) return conference
    if (attempt < attempts - 1 && retryDelayMs > 0) await wait(retryDelayMs)
  }

  return null
}
