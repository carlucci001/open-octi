// Platforms M1 read-only admin proxy — lib/platforms/adminClient unit tests.
// Covers: resource path building (URL join + query param allowlist/clamping),
// and that a resolved API key is never present anywhere in a relayed or
// error response body, even when the upstream fetch itself throws.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  platform: null,
  cred: null,
  credThrows: false,
  originResult: null,
  originThrows: null,
  fetchResult: null,
  fetchThrows: null,
}))

vi.mock('../lib/platforms/registry', () => ({
  getPlatform: vi.fn(() => state.platform),
}))

vi.mock('../lib/agent-creds', () => ({
  getCred: vi.fn(() => {
    if (state.credThrows) throw new Error('vault read failed')
    return state.cred
  }),
}))

vi.mock('../lib/platforms/ssrf', () => ({
  assertSafePlatformUrl: vi.fn(async () => {
    if (state.originThrows) throw new Error(state.originThrows)
    return state.originResult
  }),
  guardedFetch: vi.fn(async () => {
    if (state.fetchThrows) throw new Error(state.fetchThrows)
    return state.fetchResult
  }),
}))

import { assertSafePlatformUrl, guardedFetch } from '../lib/platforms/ssrf'
import { getCred } from '../lib/agent-creds'
import { callPlatformAdminAction, callPlatformAdminResource, clearPlatformAdminResourceCache, PLATFORM_ADMIN_ACTIONS, PLATFORM_ADMIN_RESOURCES } from '../lib/platforms/adminClient'

const SECRET_KEY = 'grsk_live_super_secret_value_123'

function registeredPlatform(overrides = {}) {
  return {
    id: 'pf_1',
    platformId: 'getremedy3',
    name: 'GetRemedy3',
    url: 'https://www.getremedy3.com',
    adminApiBasePath: '/api/platform-admin/v1',
    credentialRef: 'GetRemedy3 Admin',
    ...overrides,
  }
}

function okFetchResult(body, status = 200) {
  return { ok: true, status, contentType: 'application/json', text: JSON.stringify(body) }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearPlatformAdminResourceCache()
  state.platform = registeredPlatform()
  state.cred = { key: SECRET_KEY, fields: [{ label: 'API Key', value: SECRET_KEY }] }
  state.credThrows = false
  state.originResult = { origin: 'https://www.getremedy3.com' }
  state.originThrows = null
  state.fetchResult = okFetchResult({ data: { customers: [], page: { limit: 25, nextOffset: null, total: 0 } } })
  state.fetchThrows = null
})

describe('resource allowlist', () => {
  it('rejects an unknown resource before touching the vault or the network', async () => {
    const result = await callPlatformAdminResource('getremedy3', 'not-a-real-resource', {})
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('UNKNOWN_RESOURCE')
    expect(getCred).not.toHaveBeenCalled()
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('exposes the v1 resources plus the five v2 cockpit resources', () => {
    expect(Object.keys(PLATFORM_ADMIN_RESOURCES).sort()).toEqual([
      'customer', 'customers', 'errors', 'health', 'info', 'releases', 'revenue', 'subscriptions', 'usage',
    ])
  })

  it('404s when the platform is not registered', async () => {
    state.platform = null
    const result = await callPlatformAdminResource('does-not-exist', 'info', {})
    expect(result.status).toBe(404)
    expect(result.body.error.code).toBe('PLATFORM_NOT_FOUND')
  })

  it('requires the id param for the customer resource', async () => {
    const result = await callPlatformAdminResource('getremedy3', 'customer', {})
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('MISSING_PARAM')
    expect(guardedFetch).not.toHaveBeenCalled()
  })
})

describe('resource path building', () => {
  it('joins the registered URL, admin base path, and resource path for /info', async () => {
    await callPlatformAdminResource('getremedy3', 'info', {})
    expect(assertSafePlatformUrl).toHaveBeenCalledWith('https://www.getremedy3.com')
    const [calledUrl] = guardedFetch.mock.calls[0]
    expect(calledUrl).toBe('https://www.getremedy3.com/api/platform-admin/v1/info')
  })

  it('clamps limit/offset into range and drops out-of-range input rather than passing it through', async () => {
    await callPlatformAdminResource('getremedy3', 'customers', { limit: '999', offset: '-5' })
    const [calledUrl] = guardedFetch.mock.calls[0]
    const parsed = new URL(calledUrl)
    expect(parsed.pathname).toBe('/api/platform-admin/v1/customers')
    expect(parsed.searchParams.get('limit')).toBe('100') // clamped to the max
    expect(parsed.searchParams.get('offset')).toBe('0') // clamped to the min
  })

  it('defaults limit/offset when absent', async () => {
    await callPlatformAdminResource('getremedy3', 'customers', {})
    const [calledUrl] = guardedFetch.mock.calls[0]
    const parsed = new URL(calledUrl)
    expect(parsed.searchParams.get('limit')).toBe('25')
    expect(parsed.searchParams.get('offset')).toBe('0')
  })

  it('percent-encodes the customer id and never lets it escape its single path segment', async () => {
    state.fetchResult = okFetchResult({ data: { id: 'a/b', name: 'x' } })
    await callPlatformAdminResource('getremedy3', 'customer', { id: 'a/b?evil=1' })
    const [calledUrl] = guardedFetch.mock.calls[0]
    expect(calledUrl).toBe('https://www.getremedy3.com/api/platform-admin/v1/customers/a%2Fb%3Fevil%3D1')
  })

  it('never sends query params that are not on the resource allowlist', async () => {
    await callPlatformAdminResource('getremedy3', 'info', { limit: '10', offset: '5' })
    const [calledUrl] = guardedFetch.mock.calls[0]
    const parsed = new URL(calledUrl)
    expect(parsed.search).toBe('') // /info takes no params — limit/offset must not leak in
  })

  it('sends the resolved key as a Bearer Authorization header, GET only', async () => {
    await callPlatformAdminResource('getremedy3', 'subscriptions', {})
    const [, options] = guardedFetch.mock.calls[0]
    expect(options.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`)
  })
})

describe('the resolved key never appears in a returned body', () => {
  function bodyContainsKey(result) {
    return JSON.stringify(result.body).includes(SECRET_KEY)
  }

  it('does not leak the key when the platform is not configured with a credential', async () => {
    state.platform = registeredPlatform({ credentialRef: '' })
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(503)
    expect(result.body.error.code).toBe('NOT_CONFIGURED')
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('does not leak the key when the vault credential has no usable field', async () => {
    state.cred = { key: '', fields: [] }
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(503)
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('does not leak the key when the vault read itself throws', async () => {
    state.credThrows = true
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(503)
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('does not leak the key when the SSRF guard rejects the registered URL', async () => {
    state.originThrows = `blocked by SSRF guard for ${SECRET_KEY}` // pathological guard message
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(502)
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('does not leak the key when guardedFetch throws (e.g. a network error echoing the request)', async () => {
    state.fetchThrows = `connect failed for Authorization: Bearer ${SECRET_KEY}` // worst-case error text
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(502)
    expect(result.body.error.code).toBe('UPSTREAM_UNREACHABLE')
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('relays a clean 401 UNAUTHORIZED from the platform without echoing the key anywhere', async () => {
    state.fetchResult = { ok: false, status: 401, contentType: 'application/json', text: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }) }
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(401)
    expect(result.body.error.code).toBe('UNAUTHORIZED')
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('relays a 503 NOT_CONFIGURED from the platform itself distinctly from our own not-configured case', async () => {
    state.fetchResult = { ok: false, status: 503, contentType: 'application/json', text: JSON.stringify({ error: { code: 'NOT_CONFIGURED' } }) }
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(503)
    expect(result.body.error.code).toBe('NOT_CONFIGURED')
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('relays a successful body untouched and it still never contains the key', async () => {
    state.fetchResult = okFetchResult({ data: { platform: { id: 'getremedy3', name: 'GetRemedy3', version: '1.0.0' }, counts: { tenants: 3 } } })
    const result = await callPlatformAdminResource('getremedy3', 'info', {})
    expect(result.status).toBe(200)
    expect(result.body.data.platform.id).toBe('getremedy3')
    expect(bodyContainsKey(result)).toBe(false)
  })
})

// Platforms Phase 1 mutations (work order 2026-08-02) — callPlatformAdminAction.
// Covers the action allowlist, the truthful-interface `supportsActions` gate,
// POST request construction (path, body, Bearer header, Idempotency-Key), the
// same SSRF guard as reads, and that the resolved key never leaks.
describe('action allowlist', () => {
  beforeEach(() => {
    state.platform = registeredPlatform({ supportsActions: true })
  })

  it('exposes exactly the customer_action spec with the five allowed actions', () => {
    expect(Object.keys(PLATFORM_ADMIN_ACTIONS)).toEqual(['customer_action'])
    expect(PLATFORM_ADMIN_ACTIONS.customer_action.allowedActions.slice().sort()).toEqual([
      'cancel_subscription', 'pause_subscription', 'reactivate', 'resume_subscription', 'suspend',
    ])
  })

  it('rejects an unknown action resource before touching the vault or the network', async () => {
    const result = await callPlatformAdminAction('getremedy3', 'not-a-real-action', { id: 'cust_1', action: 'suspend', reason: 'valid reason' })
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('UNKNOWN_RESOURCE')
    expect(getCred).not.toHaveBeenCalled()
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('rejects an unknown action string before touching the vault or the network', async () => {
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'delete_everything', reason: 'valid reason' })
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('UNKNOWN_ACTION')
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('rejects a missing reason before touching the network', async () => {
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend' })
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('MISSING_REASON')
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('rejects a too-short reason before touching the network', async () => {
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'ok' })
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('MISSING_REASON')
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('404s when the platform is not registered', async () => {
    state.platform = null
    const result = await callPlatformAdminAction('does-not-exist', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'valid reason' })
    expect(result.status).toBe(404)
    expect(result.body.error.code).toBe('PLATFORM_NOT_FOUND')
  })

  it('refuses to act when the registration has not enabled actions (truthful-interface rule)', async () => {
    state.platform = registeredPlatform({ supportsActions: false })
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'valid reason' })
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('ACTIONS_NOT_ENABLED')
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('requires the id param', async () => {
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { action: 'suspend', reason: 'valid reason' })
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('MISSING_PARAM')
    expect(guardedFetch).not.toHaveBeenCalled()
  })
})

describe('action request building', () => {
  beforeEach(() => {
    state.platform = registeredPlatform({ supportsActions: true })
    state.fetchResult = okFetchResult({ data: { id: 'cust_1', suspended: true } })
  })

  it('POSTs to the customer actions path with the percent-encoded id', async () => {
    await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust 1/x', action: 'suspend', reason: 'fraud review' })
    const [calledUrl, options] = guardedFetch.mock.calls[0]
    expect(calledUrl).toBe('https://www.getremedy3.com/api/platform-admin/v1/customers/cust%201%2Fx/actions')
    expect(options.method).toBe('POST')
  })

  it('sends action + reason as the JSON body', async () => {
    await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    const [, options] = guardedFetch.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ action: 'suspend', reason: 'fraud review' })
  })

  it('sends the resolved key as a Bearer Authorization header', async () => {
    await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    const [, options] = guardedFetch.mock.calls[0]
    expect(options.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`)
  })

  it('sends the caller-supplied Idempotency-Key header when provided', async () => {
    await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review', idempotencyKey: 'client-key-123' })
    const [, options] = guardedFetch.mock.calls[0]
    expect(options.headers['Idempotency-Key']).toBe('client-key-123')
  })

  it('generates an Idempotency-Key header when the caller does not supply one', async () => {
    await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    const [, options] = guardedFetch.mock.calls[0]
    expect(options.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('routes action URLs through the same SSRF guard as reads', async () => {
    await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(assertSafePlatformUrl).toHaveBeenCalledWith('https://www.getremedy3.com')
  })

  it('does not leak the key when the SSRF guard rejects the registered URL', async () => {
    state.originThrows = `blocked by SSRF guard for ${SECRET_KEY}`
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(result.status).toBe(502)
    expect(JSON.stringify(result.body)).not.toContain(SECRET_KEY)
  })
})

describe('action — the resolved key never appears in a returned body', () => {
  beforeEach(() => {
    state.platform = registeredPlatform({ supportsActions: true })
  })

  function bodyContainsKey(result) {
    return JSON.stringify(result.body).includes(SECRET_KEY)
  }

  it('does not leak the key when the platform is not configured with a credential', async () => {
    state.platform = registeredPlatform({ supportsActions: true, credentialRef: '' })
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(result.status).toBe(503)
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('does not leak the key when the vault read itself throws', async () => {
    state.credThrows = true
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(result.status).toBe(503)
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('does not leak the key when guardedFetch throws (e.g. a network error echoing the request)', async () => {
    state.fetchThrows = `connect failed for Authorization: Bearer ${SECRET_KEY}`
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(result.status).toBe(502)
    expect(result.body.error.code).toBe('UPSTREAM_UNREACHABLE')
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('relays a 409 conflict from the platform without leaking the key', async () => {
    state.fetchResult = { ok: false, status: 409, contentType: 'application/json', text: JSON.stringify({ error: { code: 'CONFLICT' } }) }
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(result.status).toBe(409)
    expect(result.body.error.code).toBe('CONFLICT')
    expect(bodyContainsKey(result)).toBe(false)
  })

  it('relays a successful action body untouched and it still never contains the key', async () => {
    state.fetchResult = okFetchResult({ data: { id: 'cust_1', suspended: true } })
    const result = await callPlatformAdminAction('getremedy3', 'customer_action', { id: 'cust_1', action: 'suspend', reason: 'fraud review' })
    expect(result.status).toBe(200)
    expect(result.body.data.suspended).toBe(true)
    expect(bodyContainsKey(result)).toBe(false)
  })
})

describe('v2 resources, capability gating, and cache policy', () => {
  beforeEach(() => {
    state.platform = registeredPlatform({
      capabilities: ['health', 'releases', 'errors', 'usage', 'revenue'],
    })
  })

  it('builds each v2 resource path and forwards only its allowlisted query parameters', async () => {
    const cases = [
      ['health', {}, '/api/platform-admin/v1/health', ''],
      ['releases', { limit: '999' }, '/api/platform-admin/v1/releases', '?limit=100'],
      ['errors', { since: '2026-08-01T00:00:00.000Z', limit: '10' }, '/api/platform-admin/v1/errors', '?limit=10&since=2026-08-01T00%3A00%3A00.000Z'],
      ['usage', { from: '2026-08-01', to: '2026-08-22' }, '/api/platform-admin/v1/usage', '?from=2026-08-01&to=2026-08-22'],
      ['revenue', { from: '2026-08-01', to: '2026-08-22' }, '/api/platform-admin/v1/revenue', '?from=2026-08-01&to=2026-08-22'],
    ]

    for (const [resource, params, pathname, search] of cases) {
      clearPlatformAdminResourceCache()
      state.fetchResult = okFetchResult(resource === 'health' ? { status: 'ok', version: '2.0.0', checks: [], ts: '2026-08-22T00:00:00.000Z' } : resource === 'releases' || resource === 'errors' ? [] : {})
      await callPlatformAdminResource('getremedy3', resource, params)
      const parsed = new URL(guardedFetch.mock.calls.at(-1)[0])
      expect(parsed.pathname).toBe(pathname)
      expect(parsed.search).toBe(search)
    }
  })

  it('rejects a v2 resource that the platform did not declare', async () => {
    state.platform = registeredPlatform({ capabilities: ['health'] })
    const result = await callPlatformAdminResource('getremedy3', 'revenue', {})
    expect(result.status).toBe(400)
    expect(result.body.error.code).toBe('CAPABILITY_NOT_DECLARED')
    expect(guardedFetch).not.toHaveBeenCalled()
  })

  it('keeps v1 customers and subscriptions working when a legacy manifest has no capabilities field', async () => {
    state.platform = registeredPlatform()
    await callPlatformAdminResource('getremedy3', 'customers', {})
    expect(guardedFetch).toHaveBeenCalledTimes(1)
  })

  it('caches health for 60 seconds and other v2 resources for 5 minutes per platform', async () => {
    state.fetchResult = okFetchResult({ status: 'ok', version: '2.0.0', checks: [], ts: '2026-08-22T00:00:00.000Z' })
    const firstHealth = await callPlatformAdminResource('getremedy3', 'health', {})
    const secondHealth = await callPlatformAdminResource('getremedy3', 'health', {})
    expect(firstHealth.cached).toBe(false)
    expect(secondHealth.cached).toBe(true)
    expect(guardedFetch).toHaveBeenCalledTimes(1)

    state.fetchResult = okFetchResult([])
    await callPlatformAdminResource('getremedy3', 'releases', { limit: '20' })
    const cachedRelease = await callPlatformAdminResource('getremedy3', 'releases', { limit: '20' })
    expect(cachedRelease.cached).toBe(true)
    expect(guardedFetch).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid upstream v2 DTOs instead of relaying untrusted data', async () => {
    state.fetchResult = okFetchResult({ status: 'excellent', checks: 'yes' })
    const result = await callPlatformAdminResource('getremedy3', 'health', {})
    expect(result.status).toBe(502)
    expect(result.body.error.code).toBe('BAD_UPSTREAM_RESPONSE')
  })
})
