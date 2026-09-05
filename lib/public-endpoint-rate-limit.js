import { createHash } from 'node:crypto'

const buckets = globalThis.__fccPublicEndpointRateLimits || new Map()
globalThis.__fccPublicEndpointRateLimits = buckets
let operations = 0
const MAX_BUCKETS = 4096

function clientIp(request) {
  if (request.ip) return String(request.ip)
  if (String(process.env.PUBLIC_RATE_LIMIT_TRUST_PROXY || '').toLowerCase() !== 'true') return 'untrusted-network'
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  return real?.trim() || 'unknown'
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24)
}

function activeHits(key, cutoff) {
  const hits = (buckets.get(key) || []).filter(timestamp => timestamp > cutoff)
  if (hits.length) buckets.set(key, hits)
  else buckets.delete(key)
  return hits
}

function retryAfter(hits, windowMs, now) {
  return Math.max(1, Math.ceil(((hits[0] || now) + windowMs - now) / 1000))
}

function pruneBuckets(cutoff) {
  for (const [key, hits] of buckets) {
    const active = hits.filter(timestamp => timestamp > cutoff)
    if (active.length) buckets.set(key, active)
    else buckets.delete(key)
  }
  while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value)
}

export function consumePublicEndpointQuota(request, {
  namespace,
  windowMs = 60_000,
  perClientLimit,
  globalLimit,
  now = Date.now(),
}) {
  const clientKey = `${namespace}:client:${digest(clientIp(request))}`
  const globalKey = `${namespace}:global`
  const cutoff = now - windowMs
  operations += 1
  if (operations % 128 === 0 || buckets.size > MAX_BUCKETS) pruneBuckets(cutoff)
  const clientHits = activeHits(clientKey, cutoff)
  const globalHits = activeHits(globalKey, cutoff)

  if (clientHits.length >= perClientLimit || globalHits.length >= globalLimit) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(retryAfter(clientHits, windowMs, now), retryAfter(globalHits, windowMs, now)),
    }
  }

  clientHits.push(now)
  globalHits.push(now)
  buckets.set(clientKey, clientHits)
  buckets.set(globalKey, globalHits)
  return { limited: false, retryAfterSeconds: 0 }
}

export function resetPublicEndpointQuotasForTests() {
  if (process.env.NODE_ENV === 'test') {
    buckets.clear()
    operations = 0
  }
}

export const PUBLIC_WIDGET_RATE_LIMITS = Object.freeze({
  chat: { namespace: 'agent-widget-chat', windowMs: 60_000, perClientLimit: 20, globalLimit: 300 },
  voiceToken: { namespace: 'agent-widget-voice-token', windowMs: 60_000, perClientLimit: 5, globalLimit: 60 },
})
