// Resolves the ip/user-agent to attribute a public-intake submission to.
// Prefers body.clientMeta when a trusted relay (e.g. the marketing site's
// Vercel functions) forwards the real visitor's info; otherwise falls back
// to request-derived values using the same trust logic as
// lib/public-endpoint-rate-limit.js (never trusts spoofable headers unless
// PUBLIC_RATE_LIMIT_TRUST_PROXY is explicitly enabled).
import { resolveClientIp } from '@/lib/public-endpoint-rate-limit'

function cleanMetaValue(value, limit) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, limit) : null
}

export function resolveClientMeta(request, body) {
  const relayed = body && typeof body.clientMeta === 'object' ? body.clientMeta : null
  if (relayed && (relayed.ip || relayed.userAgent)) {
    return {
      ip: cleanMetaValue(relayed.ip, 100),
      userAgent: cleanMetaValue(relayed.userAgent, 300),
    }
  }
  return {
    ip: cleanMetaValue(resolveClientIp(request), 100),
    userAgent: cleanMetaValue(request.headers.get('user-agent'), 300),
  }
}
