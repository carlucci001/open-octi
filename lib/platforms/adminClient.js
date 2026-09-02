// lib/platforms/adminClient.js
// Server-only: read-only proxy to a registered platform's live Platform Admin
// API (handoff doc §9 / §15, M1 read-only slice). Resolves the platform's
// Command Vault credential (registry.credentialRef -> lib/agent-creds.getCred
// -> the field whose label matches /key|token|api/i, e.g. "API Key") and
// calls the platform with `Authorization: Bearer <key>` through the SSRF
// guards in ./ssrf. The resolved key is NEVER returned to a caller, logged,
// or embedded in any error payload — only status codes and the platform's own
// (already-safe) JSON body are relayed.
//
// Reads are GET only, allowlisted resources and query params only — no
// arbitrary path passthrough. This is the same guarantee `guardedFetch`
// already gives at the network layer; this module adds the resource/param
// allowlist on top of it. Phase 1 mutations (work order 2026-08-02) add ONE
// allowlisted POST spec (`PLATFORM_ADMIN_ACTIONS`) with its own action
// allowlist — `callPlatformAdminResource` and its GET semantics are untouched.

import { randomUUID } from 'node:crypto'
import { assertSafePlatformUrl, guardedFetch } from './ssrf'
import { getPlatform } from './registry'
import { getCred } from '../agent-creds'
import { PLATFORM_ADMIN_VALIDATORS } from './adminContract'

const HEALTH_CACHE_MS = 60_000
const RESOURCE_CACHE_MS = 5 * 60_000
const resourceCache = new Map()

export function clearPlatformAdminResourceCache() {
  resourceCache.clear()
}

// Resource id -> { pathTemplate(params), params: [allowed query/path params],
// requiredParams: [params that must be present] }.
// pathTemplate never interpolates anything Command Center didn't validate —
// `id` is percent-encoded and only ever placed in the one path segment below.
export const PLATFORM_ADMIN_RESOURCES = {
  info: {
    pathTemplate: () => '/info',
    params: [],
    requiredParams: [],
  },
  customers: {
    pathTemplate: () => '/customers',
    params: ['limit', 'offset'],
    requiredParams: [],
  },
  customer: {
    pathTemplate: ({ id }) => `/customers/${encodeURIComponent(id)}`,
    params: ['id'],
    requiredParams: ['id'],
  },
  subscriptions: {
    pathTemplate: () => '/subscriptions',
    params: [],
    requiredParams: [],
  },
  health: {
    pathTemplate: () => '/health',
    params: [],
    requiredParams: [],
    capability: 'health',
    cacheTtlMs: HEALTH_CACHE_MS,
  },
  releases: {
    pathTemplate: () => '/releases',
    params: ['limit'],
    requiredParams: [],
    capability: 'releases',
    cacheTtlMs: RESOURCE_CACHE_MS,
  },
  errors: {
    pathTemplate: () => '/errors',
    params: ['since', 'limit'],
    requiredParams: [],
    capability: 'errors',
    cacheTtlMs: RESOURCE_CACHE_MS,
  },
  usage: {
    pathTemplate: () => '/usage',
    params: ['from', 'to'],
    requiredParams: [],
    capability: 'usage',
    cacheTtlMs: RESOURCE_CACHE_MS,
  },
  revenue: {
    pathTemplate: () => '/revenue',
    params: ['from', 'to'],
    requiredParams: [],
    capability: 'revenue',
    cacheTtlMs: RESOURCE_CACHE_MS,
  },
}

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function safeError(code, message, extra = {}) {
  return { error: { code, message, ...extra } }
}

function declaredCapabilities(platform) {
  if (Array.isArray(platform?.capabilities)) return platform.capabilities
  if (platform?.capabilities && typeof platform.capabilities === 'object') {
    return Object.entries(platform.capabilities)
      .filter(([, value]) => value === true || (value && typeof value === 'object' && (value.read === true || value.update === true)))
      .map(([name]) => name)
  }
  const legacy = ['customers', 'subscriptions']
  if (platform?.supportsActions) legacy.push('actions')
  return legacy
}

function setOptionalParam(url, name, value) {
  const text = String(value ?? '').trim()
  if (text) url.searchParams.set(name, text.slice(0, 100))
}

// Returns { status, body }. `body` is either the platform's relayed JSON
// (`{ data: ... }`) or a safe local error shape (`{ error: { code, message } }`).
// Never throws — every failure path (registration, credential, network,
// upstream) resolves to a status + safe body so the route handler can relay
// it directly.
export async function callPlatformAdminResource(platformIdOrId, resource, rawParams = {}, { bypassCache = false } = {}) {
  const spec = PLATFORM_ADMIN_RESOURCES[resource]
  if (!spec) {
    return { status: 400, body: safeError('UNKNOWN_RESOURCE', `Unknown platform resource "${resource}".`) }
  }

  const platform = getPlatform(platformIdOrId)
  if (!platform) {
    return { status: 404, body: safeError('PLATFORM_NOT_FOUND', 'Platform is not registered.') }
  }

  if (spec.capability && !declaredCapabilities(platform).includes(spec.capability)) {
    return { status: 400, body: safeError('CAPABILITY_NOT_DECLARED', `Platform did not declare the "${spec.capability}" capability.`), cached: false }
  }

  for (const required of spec.requiredParams) {
    if (!String(rawParams[required] ?? '').trim()) {
      return { status: 400, body: safeError('MISSING_PARAM', `Missing required parameter "${required}".`) }
    }
  }

  if (!platform.credentialRef) {
    return { status: 503, body: safeError('NOT_CONFIGURED', 'This platform has no admin credential configured. Set a credential reference on the registration.') }
  }

  let cred = null
  try {
    cred = getCred(platform.credentialRef)
  } catch {
    cred = null
  }
  if (!cred?.key) {
    return { status: 503, body: safeError('NOT_CONFIGURED', 'The referenced Command Vault credential has no usable API key value.') }
  }

  let origin
  try {
    origin = (await assertSafePlatformUrl(platform.url)).origin
  } catch {
    // Deliberately generic — never relay a raw exception's message here.
    // assertSafePlatformUrl never has the key in scope, but any code path
    // that surfaces exception text verbatim is one bad error message away
    // from a leak, so this stays a fixed, safe string on principle.
    return { status: 502, body: safeError('BAD_PLATFORM_URL', 'The platform URL failed connection safety checks.') }
  }

  const basePath = String(platform.adminApiBasePath || '').replace(/\/+$/, '')
  const resourcePath = spec.pathTemplate(rawParams)
  const url = new URL(basePath + resourcePath, origin)

  if (spec.params.includes('limit')) {
    const fallback = resource === 'releases' ? 20 : resource === 'errors' ? 50 : 25
    url.searchParams.set('limit', String(clampInt(rawParams.limit, { min: 1, max: 100, fallback })))
  }
  if (spec.params.includes('since')) setOptionalParam(url, 'since', rawParams.since)
  if (spec.params.includes('from')) setOptionalParam(url, 'from', rawParams.from)
  if (spec.params.includes('to')) setOptionalParam(url, 'to', rawParams.to)

  const cacheKey = `${platform.platformId || platform.id}:${url.pathname}${url.search}`
  if (spec.cacheTtlMs && !bypassCache) {
    const cached = resourceCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return { ...cached.result, cached: true }
    if (cached) resourceCache.delete(cacheKey)
  }
  if (spec.params.includes('offset')) {
    url.searchParams.set('offset', String(clampInt(rawParams.offset, { min: 0, max: 1_000_000_000, fallback: 0 })))
  }

  let response
  try {
    response = await guardedFetch(url.toString(), {
      headers: { Authorization: `Bearer ${cred.key}` },
    })
  } catch {
    // Deliberately generic — never surface the underlying error string, which
    // could in rare fetch-layer failures echo request details.
    return { status: 502, body: safeError('UPSTREAM_UNREACHABLE', 'The platform could not be reached.'), cached: false }
  }

  let parsed = null
  if (response.text) {
    try {
      parsed = JSON.parse(response.text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    if (parsed?.error?.code) return { status: response.status, body: parsed }
    const fallbackCode = response.status === 401 ? 'UNAUTHORIZED' : response.status === 503 ? 'NOT_CONFIGURED' : response.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR'
    return { status: response.status, body: safeError(fallbackCode, `Platform responded with HTTP ${response.status}.`) }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 502, body: safeError('BAD_UPSTREAM_RESPONSE', 'The platform returned a response that was not valid JSON.') }
  }


  const validator = PLATFORM_ADMIN_VALIDATORS[resource]
  if (validator && !validator(parsed)) {
    return { status: 502, body: safeError('BAD_UPSTREAM_RESPONSE', `The platform returned an invalid ${resource} response.`), cached: false }
  }

  const result = { status: response.status, body: parsed }
  if (spec.cacheTtlMs && !bypassCache) resourceCache.set(cacheKey, { expiresAt: Date.now() + spec.cacheTtlMs, result })
  return { ...result, cached: false }
}

// Action spec id -> POST spec (Phase 1 mutations, work order 2026-08-02).
// `allowedActions` is the complete allowlist — any other action string is
// rejected before the vault or the network is touched. `pathTemplate` follows
// the same rule as the resource table: `id` is percent-encoded and only ever
// placed in the one path segment below.
export const PLATFORM_ADMIN_ACTIONS = {
  customer_action: {
    method: 'POST',
    pathTemplate: ({ id }) => `/customers/${encodeURIComponent(id)}/actions`,
    bodyFields: ['action', 'reason'],
    requiredParams: ['id'],
    allowedActions: ['suspend', 'reactivate', 'cancel_subscription', 'pause_subscription', 'resume_subscription'],
  },
}

// POST an allowlisted action to the platform. Same contract as
// `callPlatformAdminResource`: returns { status, body }, never throws, and
// the resolved key never appears in any returned body. Registration,
// credential, and SSRF-origin resolution are the same steps, verbatim.
// The upstream call carries `Idempotency-Key` (caller-supplied — one UUID per
// user-confirmed action — or generated here as a last resort) so the platform
// can dedupe retries.
export async function callPlatformAdminAction(platformIdOrId, actionSpecId, { id, action, reason, idempotencyKey } = {}) {
  const spec = PLATFORM_ADMIN_ACTIONS[actionSpecId]
  if (!spec) {
    return { status: 400, body: safeError('UNKNOWN_RESOURCE', `Unknown platform action resource "${actionSpecId}".`) }
  }

  const requestedAction = String(action ?? '').trim()
  if (!spec.allowedActions.includes(requestedAction)) {
    return { status: 400, body: safeError('UNKNOWN_ACTION', `Action "${requestedAction}" is not on the allowlist. Allowed: ${spec.allowedActions.join(', ')}.`) }
  }

  const reasonText = String(reason ?? '').trim()
  if (reasonText.length < 3) {
    return { status: 400, body: safeError('MISSING_REASON', 'A reason of at least 3 characters is required for every platform action.') }
  }

  const platform = getPlatform(platformIdOrId)
  if (!platform) {
    return { status: 404, body: safeError('PLATFORM_NOT_FOUND', 'Platform is not registered.') }
  }

  // Truthful-interface rule, enforced server-side too: a registration that
  // has not declared the actions capability cannot be mutated through us.
  if (!platform.supportsActions && !declaredCapabilities(platform).includes('actions')) {
    return { status: 400, body: safeError('ACTIONS_NOT_ENABLED', 'This platform registration does not have actions enabled. An admin can enable them on the registration once the platform supports the actions endpoint.') }
  }

  const rawParams = { id }
  for (const required of spec.requiredParams) {
    if (!String(rawParams[required] ?? '').trim()) {
      return { status: 400, body: safeError('MISSING_PARAM', `Missing required parameter "${required}".`) }
    }
  }

  if (!platform.credentialRef) {
    return { status: 503, body: safeError('NOT_CONFIGURED', 'This platform has no admin credential configured. Set a credential reference on the registration.') }
  }

  let cred = null
  try {
    cred = getCred(platform.credentialRef)
  } catch {
    cred = null
  }
  if (!cred?.key) {
    return { status: 503, body: safeError('NOT_CONFIGURED', 'The referenced Command Vault credential has no usable API key value.') }
  }

  let origin
  try {
    origin = (await assertSafePlatformUrl(platform.url)).origin
  } catch {
    // Deliberately generic — never relay a raw exception's message here (same
    // leak-on-principle guard as the read proxy).
    return { status: 502, body: safeError('BAD_PLATFORM_URL', 'The platform URL failed connection safety checks.') }
  }

  const basePath = String(platform.adminApiBasePath || '').replace(/\/+$/, '')
  const url = new URL(basePath + spec.pathTemplate(rawParams), origin)

  let response
  try {
    response = await guardedFetch(url.toString(), {
      method: spec.method,
      body: JSON.stringify({ action: requestedAction, reason: reasonText }),
      headers: {
        Authorization: `Bearer ${cred.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': String(idempotencyKey || '').trim() || randomUUID(),
      },
    })
  } catch {
    // Deliberately generic — never surface the underlying error string.
    return { status: 502, body: safeError('UPSTREAM_UNREACHABLE', 'The platform could not be reached.') }
  }

  let parsed = null
  if (response.text) {
    try {
      parsed = JSON.parse(response.text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    if (parsed?.error?.code) return { status: response.status, body: parsed }
    const fallbackCode = response.status === 401 ? 'UNAUTHORIZED' : response.status === 503 ? 'NOT_CONFIGURED' : response.status === 404 ? 'NOT_FOUND' : response.status === 409 ? 'CONFLICT' : 'UPSTREAM_ERROR'
    return { status: response.status, body: safeError(fallbackCode, `Platform responded with HTTP ${response.status}.`) }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 502, body: safeError('BAD_UPSTREAM_RESPONSE', 'The platform returned a response that was not valid JSON.') }
  }

  return { status: response.status, body: parsed }
}
