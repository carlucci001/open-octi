// Platforms M1 read-only admin proxy — GET /api/platforms/[platformId]/resource
// route tests. Covers: unknown resource rejection, unknown query param
// rejection (allowlist, no arbitrary path passthrough), auth gating, and that
// the resolved API key never appears anywhere in a route response even on
// upstream failure.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'u1', role: 'member' },
  denyAuth: false,
  platform: null,
  cred: null,
  fetchResult: null,
}))

vi.mock('../lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => (
    state.denyAuth
      ? { user: null, error: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
      : { user: state.user, error: null }
  )),
}))

vi.mock('../lib/platforms/registry', () => ({
  getPlatform: vi.fn(() => state.platform),
}))

vi.mock('../lib/agent-creds', () => ({
  getCred: vi.fn(() => state.cred),
}))

vi.mock('../lib/platforms/ssrf', () => ({
  assertSafePlatformUrl: vi.fn(async () => ({ origin: 'https://www.getremedy3.com' })),
  guardedFetch: vi.fn(async () => state.fetchResult),
}))

import { GET } from '../app/api/platforms/[platformId]/resource/route'

const SECRET_KEY = 'grsk_live_super_secret_value_123'

function request(query) {
  return new Request(`https://crm.example.com/api/platforms/getremedy3/resource?${query}`)
}

function ctx(platformId = 'getremedy3') {
  return { params: { platformId } }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = { id: 'u1', role: 'member' }
  state.denyAuth = false
  state.platform = {
    id: 'pf_1',
    platformId: 'getremedy3',
    name: 'GetRemedy3',
    url: 'https://www.getremedy3.com',
    adminApiBasePath: '/api/platform-admin/v1',
    credentialRef: 'GetRemedy3 Admin',
  }
  state.cred = { key: SECRET_KEY, fields: [{ label: 'API Key', value: SECRET_KEY }] }
  state.fetchResult = { ok: true, status: 200, contentType: 'application/json', text: JSON.stringify({ data: { customers: [], page: { limit: 25, nextOffset: null, total: 0 } } }) }
})

describe('GET /api/platforms/[platformId]/resource — resource + param allowlist', () => {
  it('rejects an unknown resource with 400', async () => {
    const response = await GET(request('resource=deleteEverything'), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('UNKNOWN_RESOURCE')
  })

  it('rejects a resource with no resource param at all', async () => {
    const response = await GET(request(''), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNKNOWN_RESOURCE')
  })

  it('rejects an unsupported query parameter instead of passing it through', async () => {
    const response = await GET(request('resource=customers&path=/../../etc/passwd'), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNKNOWN_PARAM')
  })

  it('rejects limit/offset on a resource that does not accept them', async () => {
    const response = await GET(request('resource=info&limit=25'), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNKNOWN_PARAM')
  })

  it('accepts limit/offset on customers', async () => {
    const response = await GET(request('resource=customers&limit=25&offset=0'), ctx())
    expect(response.status).toBe(200)
  })

  it('accepts id on the customer resource', async () => {
    state.fetchResult = { ok: true, status: 200, contentType: 'application/json', text: JSON.stringify({ data: { id: 'cust_1', name: 'Acme' } }) }
    const response = await GET(request('resource=customer&id=cust_1'), ctx())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.id).toBe('cust_1')
  })

  it('denies unauthenticated/unauthorized callers before ever touching the platform', async () => {
    state.denyAuth = true
    const { guardedFetch } = await import('../lib/platforms/ssrf')
    const response = await GET(request('resource=info'), ctx())
    expect(response.status).toBe(401)
    expect(guardedFetch).not.toHaveBeenCalled()
  })
})

describe('GET .../resource — the key never appears in a route response', () => {
  it('never echoes the key when the upstream 401s', async () => {
    state.fetchResult = { ok: false, status: 401, contentType: 'application/json', text: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }) }
    const response = await GET(request('resource=info'), ctx())
    const text = await response.text()
    expect(response.status).toBe(401)
    expect(text).not.toContain(SECRET_KEY)
  })

  it('never echoes the key when the platform has no credential configured', async () => {
    state.platform.credentialRef = ''
    const response = await GET(request('resource=info'), ctx())
    const text = await response.text()
    expect(response.status).toBe(503)
    expect(text).not.toContain(SECRET_KEY)
  })

  it('never echoes the key on a successful response either', async () => {
    state.fetchResult = { ok: true, status: 200, contentType: 'application/json', text: JSON.stringify({ data: { platform: { id: 'getremedy3' } } }) }
    const response = await GET(request('resource=info'), ctx())
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).not.toContain(SECRET_KEY)
  })
})
