// lib/platforms/ssrf.js
// Network guards for platform outbound calls (handoff doc §11).
// Registering a platform URL creates server-side outbound requests, so every
// URL is validated before any fetch: HTTPS only, allowlisted ports, no
// credentials in the URL, and DNS may not resolve to loopback, link-local,
// private, CGNAT, multicast, or metadata-service addresses.
//
// Known limit (documented, acceptable for M1 read-only scaffolding): the DNS
// check and the fetch are separate resolutions, so a hostile DNS server could
// in theory rebind between them. Mitigated by HTTPS cert validation and the
// fact that M1 makes read-only manifest requests with no credentials attached.

import { lookup } from 'node:dns/promises'
import net from 'node:net'

const ALLOWED_PORTS = new Set(['', '443', '8443'])
const BLOCKED_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i

export function isPrivateIPv4(address) {
  const parts = String(address).split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true              // this-host, private, loopback
  if (a === 169 && b === 254) return true                        // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true               // private
  if (a === 192 && b === 168) return true                        // private
  if (a === 192 && parts[1] === 0 && parts[2] === 0) return true // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true              // CGNAT
  if (a >= 224) return true                                      // multicast + reserved + broadcast
  return false
}

export function isPrivateAddress(address) {
  const value = String(address || '').trim().toLowerCase()
  if (!value) return true
  if (net.isIPv4(value)) return isPrivateIPv4(value)
  if (net.isIPv6(value.replace(/^\[|\]$/g, ''))) {
    const v6 = value.replace(/^\[|\]$/g, '')
    if (v6 === '::' || v6 === '::1') return true                  // unspecified, loopback
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true   // unique-local fc00::/7
    if (/^fe[89ab]/.test(v6)) return true                         // link-local fe80::/10
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)      // IPv4-mapped
    if (mapped) return isPrivateIPv4(mapped[1])
    return false
  }
  return true // not an IP literal — caller should DNS-resolve instead
}

// Parse + static validation. Throws with an operator-readable message.
export function parsePlatformUrl(value) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('Platform URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Platform URLs must use HTTPS.')
  if (url.username || url.password) throw new Error('Platform URLs may not embed credentials.')
  if (!ALLOWED_PORTS.has(url.port)) throw new Error(`Port ${url.port} is not allowed for platform connections (443/8443 only).`)
  if (BLOCKED_HOST_RE.test(url.hostname)) throw new Error(`Host "${url.hostname}" is not reachable from the control plane.`)
  return url
}

// Full validation including DNS resolution of every address for the host.
export async function assertSafePlatformUrl(value) {
  const url = parsePlatformUrl(value)
  const bareHost = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(bareHost)) {
    if (isPrivateAddress(bareHost)) throw new Error(`Address ${bareHost} is in a blocked network range.`)
    return url
  }
  let results
  try {
    results = await lookup(bareHost, { all: true, verbatim: true })
  } catch {
    throw new Error(`DNS resolution failed for ${bareHost}.`)
  }
  if (!results?.length) throw new Error(`DNS returned no addresses for ${bareHost}.`)
  for (const { address } of results) {
    if (isPrivateAddress(address)) throw new Error(`${bareHost} resolves to a blocked network range.`)
  }
  return url
}

// Guarded outbound request: manual redirects (never follow — cross-host
// redirects are a classic SSRF bypass), hard timeout, response size cap.
// `headers` merges in caller-supplied headers (e.g. Authorization) on top of
// the defaults. Method defaults to GET with no body (unchanged semantics for
// every existing caller); the platform action proxy passes `method: 'POST'`
// plus a JSON `body` — the redirect/timeout/size guards apply identically.
export async function guardedFetch(target, { method = 'GET', body, timeoutMs = 8000, maxBytes = 262144, accept = 'application/json', headers = {} } = {}) {
  const response = await fetch(target, {
    method,
    redirect: 'manual',
    cache: 'no-store',
    headers: { accept, 'user-agent': 'FarringtonCommandCenter-PlatformControl/1.0', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    ...(body === undefined ? {} : { body }),
  })
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Refused to follow a redirect (HTTP ${response.status}). Register the platform's final URL instead.`)
  }
  let text = ''
  const reader = response.body?.getReader ? response.body.getReader() : null
  if (reader) {
    const decoder = new TextDecoder()
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        try { await reader.cancel() } catch {}
        throw new Error(`Response exceeded the ${Math.round(maxBytes / 1024)} KB size cap.`)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } else {
    text = await response.text()
    if (text.length > maxBytes) throw new Error(`Response exceeded the ${Math.round(maxBytes / 1024)} KB size cap.`)
  }
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    retryAfter: response.headers.get('retry-after') || '',
    text,
  }
}
