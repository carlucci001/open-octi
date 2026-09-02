import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  platform: null,
  manifestCheck: null,
  resourceStatus: {},
  recorded: null,
}))

vi.mock('../lib/auth', () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: 'owner', role: 'owner' }, error: null })),
}))

vi.mock('../lib/auditLog', () => ({ logAuditEvent: vi.fn() }))

vi.mock('../lib/platforms/registry', () => ({
  getPlatform: vi.fn(() => state.platform),
  recordPlatformCheck: vi.fn((_id, patch) => {
    state.recorded = patch
    state.platform = { ...state.platform, ...patch }
    return state.platform
  }),
  sanitizePlatform: vi.fn(value => value),
}))

vi.mock('../lib/platforms/manifest', () => ({
  extractManifestCapabilities: vi.fn(manifest => manifest.capabilities || []),
  fetchPlatformManifest: vi.fn(async () => state.manifestCheck),
}))

vi.mock('../lib/platforms/adminClient', () => ({
  PLATFORM_ADMIN_RESOURCES: {
    customers: {}, subscriptions: {}, health: {}, releases: {}, errors: {}, usage: {}, revenue: {},
  },
  callPlatformAdminResource: vi.fn(async (_platformId, resource) => ({
    status: state.resourceStatus[resource] || 200,
    body: {},
  })),
}))

import { POST } from '../app/api/platforms/[platformId]/connect/route'

beforeEach(() => {
  vi.clearAllMocks()
  state.platform = {
    id: 'pf_1',
    platformId: 'example',
    name: 'Example',
    url: 'https://example.com',
    adminApiBasePath: '/api/platform-admin/v1',
  }
  state.manifestCheck = {
    ok: true,
    status: 200,
    note: 'Manifest fetched and validated.',
    manifest: {
      schemaVersion: '2.0',
      platform: { id: 'example', name: 'Example', version: '3.2.1', adminApiBasePath: '/api/platform-admin/v1' },
      capabilities: ['customers', 'health', 'releases', 'revenue', 'actions'],
    },
  }
  state.resourceStatus = { customers: 200, health: 200, releases: 503, revenue: 200 }
  state.recorded = null
})

describe('POST /api/platforms/[platformId]/connect v2 capability report', () => {
  it('persists declared capabilities and reports which read capabilities responded', async () => {
    const response = await POST(new Request('https://crm.example.com/api/platforms/example/connect', { method: 'POST' }), { params: { platformId: 'example' } })
    const body = await response.json()

    expect(state.recorded.capabilities).toEqual(['customers', 'health', 'releases', 'revenue', 'actions'])
    expect(body.check.declaredCapabilities).toEqual(['customers', 'health', 'releases', 'revenue', 'actions'])
    expect(body.check.respondedCapabilities).toEqual(['customers', 'health', 'revenue'])
    expect(body.check.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'health', declared: true, responded: true, status: 200 }),
      expect.objectContaining({ name: 'releases', declared: true, responded: false, status: 503 }),
      expect.objectContaining({ name: 'actions', declared: true, responded: null, status: null }),
    ]))
  })
})
