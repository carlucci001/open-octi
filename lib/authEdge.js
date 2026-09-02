// Edge-runtime-safe slice of the auth lib.
// Contains ONLY cookie HMAC + verify, with zero Node-only imports (no fs, no path,
// no bcryptjs). middleware.js imports from this file. API routes (Node runtime)
// import from lib/auth.js, which delegates here for HMAC.
//
// Requires CRM_SESSION_SECRET to be set in process.env. The Node-side auth lib
// is responsible for ensuring the env var is populated before this module
// attempts to use it.

export const SESSION_COOKIE = 'fcc_session'
export const SESSION_DAYS = 30
export const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000

function getSecret() {
  const s = process.env.CRM_SESSION_SECRET
  if (!s) throw new Error('CRM_SESSION_SECRET is not set in env')
  return s
}

function b64urlEncodeBytes(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlEncodeString(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecodeString(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)))
}

async function hmacSign(payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlEncodeBytes(new Uint8Array(sig))
}

export async function signSession({ uid, exp, ver }) {
  const payload = b64urlEncodeString(JSON.stringify({ uid, exp, ver }))
  const sig = await hmacSign(payload)
  return `${payload}.${sig}`
}

export async function verifySession(token) {
  if (!token || typeof token !== 'string') return null
  const i = token.lastIndexOf('.')
  if (i <= 0) return null
  const payload = token.slice(0, i)
  const sig = token.slice(i + 1)
  let expected
  try { expected = await hmacSign(payload) } catch { return null }
  if (sig !== expected) return null
  let body
  try { body = JSON.parse(b64urlDecodeString(payload)) } catch { return null }
  if (!body || !body.uid || !body.exp) return null
  if (Date.now() > body.exp) return null
  return body
}

export function buildSessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
}
