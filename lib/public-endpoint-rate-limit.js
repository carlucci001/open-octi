import { createHash } from 'node:crypto'

const buckets = globalThis.__fccPublicEndpointRateLimits || new Map()
globalThis.__fccPublicEndpointRateLimits = buckets
let operations = 0
const MAX_BUCKETS = 4096

export function resolveClientIp(request) {
  return clientIp(request)
}

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
  gptLiveSession: { namespace: 'agent-widget-gpt-live-session', windowMs: 60_000, perClientLimit: 5, globalLimit: 60 },
})

/**
 * Per-normalized-email quota, independent of IP. Used by the public
 * lead-intake routes because a relayed submission (e.g. through the
 * marketing site's Vercel functions) mostly shows the relay's egress IP
 * rather than the visitor's, so IP-based limiting alone under-blocks a
 * single bot mailbox hammering the endpoint.
 */
export function consumeEmailQuota(normalizedEmail, {
  namespace,
  windowMs = 10 * 60_000,
  limit = 3,
  now = Date.now(),
}) {
  const key = `${namespace}:email:${digest(String(normalizedEmail || '').toLowerCase())}`
  const cutoff = now - windowMs
  operations += 1
  if (operations % 128 === 0 || buckets.size > MAX_BUCKETS) pruneBuckets(cutoff)
  const hits = activeHits(key, cutoff)
  if (hits.length >= limit) {
    return { limited: true, retryAfterSeconds: retryAfter(hits, windowMs, now) }
  }
  hits.push(now)
  buckets.set(key, hits)
  return { limited: false, retryAfterSeconds: 0 }
}

// Public lead-intake forms (bot-facing, unauthenticated): a per-client quota
// per 10 minutes, 60 total per hour across all clients on that route.
// website/intake is a relay target — nearly all its traffic arrives from the
// marketing site's Vercel functions, so when PUBLIC_RATE_LIMIT_TRUST_PROXY
// is not enabled every real visitor collapses into one 'untrusted-network'
// client bucket alongside spam relayed the same way. Its per-client limit is
// deliberately looser (30/10min) than the other two routes (5/10min), which
// see real per-visitor IPs directly, so a bot burst through the relay can't
// exhaust the quota a legitimate lead right behind it needs.
//
// perClientLimit/globalLimit windows differ, so each preset is checked as
// two independent, separately-callable consumePublicEndpointQuota calls
// (consumeIntakeGlobalQuota / consumeIntakeClientQuota below) rather than
// one call with a single window. Callers must check global quota BEFORE
// running spam assessment and client/email quota AFTER — spam must never
// consume the per-client or per-email budget a legitimate submission needs.
export const INTAKE_FORM_RATE_LIMITS = Object.freeze({
  websiteIntake: {
    perClient: { namespace: 'intake-website:client', windowMs: 10 * 60_000, perClientLimit: 30, globalLimit: Number.MAX_SAFE_INTEGER },
    global: { namespace: 'intake-website:global', windowMs: 60 * 60_000, perClientLimit: Number.MAX_SAFE_INTEGER, globalLimit: 60 },
  },
  productsInquiry: {
    perClient: { namespace: 'intake-products-inquiry:client', windowMs: 10 * 60_000, perClientLimit: 5, globalLimit: Number.MAX_SAFE_INTEGER },
    global: { namespace: 'intake-products-inquiry:global', windowMs: 60 * 60_000, perClientLimit: Number.MAX_SAFE_INTEGER, globalLimit: 60 },
  },
  portalDemoRequest: {
    perClient: { namespace: 'intake-portal-demo-request:client', windowMs: 10 * 60_000, perClientLimit: 5, globalLimit: Number.MAX_SAFE_INTEGER },
    global: { namespace: 'intake-portal-demo-request:global', windowMs: 60 * 60_000, perClientLimit: Number.MAX_SAFE_INTEGER, globalLimit: 60 },
  },
})

/**
 * Checks/consumes only the route-wide global quota (1 hour window) from an
 * INTAKE_FORM_RATE_LIMITS preset. Callers run this before spam assessment,
 * since even a spam-flagged relay burst should not be allowed to run the
 * route unbounded.
 */
export function consumeIntakeGlobalQuota(request, preset, { now = Date.now() } = {}) {
  return consumePublicEndpointQuota(request, { ...preset.global, now })
}

/**
 * Checks/consumes only the per-client quota (10 min window) from an
 * INTAKE_FORM_RATE_LIMITS preset. Callers run this AFTER spam assessment has
 * cleared a submission as 'ok', so a spam burst never burns the per-client
 * budget a legitimate submission needs.
 */
export function consumeIntakeClientQuota(request, preset, { now = Date.now() } = {}) {
  return consumePublicEndpointQuota(request, { ...preset.perClient, now })
}
