import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resources = vi.hoisted(() => ({
  health: { status: 'ok', version: '2.0.0+test', checks: [], ts: '2026-08-22T00:00:00.000Z' },
  releases: [{ id: 'rel-1', version: '2.0.0', commit: 'abc123', deployedAt: '2026-08-22T00:00:00.000Z', deployer: 'codex', status: 'live' }],
  errors: [],
  usage: {},
  revenue: { currency: 'USD', mrr: 0, newMrr: 0, churnedMrr: 0, failedPayments: 0, trials: { started: 0, converted: 0 } },
}))

vi.mock('../lib/platform-admin/fccResources', () => ({
  buildFccHealth: vi.fn(async () => resources.health),
  listFccReleases: vi.fn(() => resources.releases),
  listFccErrors: vi.fn(() => resources.errors),
  readFccUsage: vi.fn(() => resources.usage),
  buildFccRevenue: vi.fn(() => resources.revenue),
}))

import { GET as getHealth } from '../app/api/platform-admin/v1/health/route'
import { GET as getReleases } from '../app/api/platform-admin/v1/releases/route'
import { GET as getErrors } from '../app/api/platform-admin/v1/errors/route'
import { GET as getUsage } from '../app/api/platform-admin/v1/usage/route'
import { GET as getRevenue } from '../app/api/platform-admin/v1/revenue/route'

function request(path) {
  return new Request(`https://crm.example.com${path}`, { headers: { Authorization: 'Bearer route-test-key' } })
}

beforeEach(() => {
  process.env.FCC_PLATFORM_ADMIN_API_KEY = 'route-test-key'
})

afterEach(() => {
  delete process.env.FCC_PLATFORM_ADMIN_API_KEY
})

describe('FCC /api/platform-admin/v1 contract routes', () => {
  it.each([
    ['/api/platform-admin/v1/health', getHealth, resources.health],
    ['/api/platform-admin/v1/releases?limit=20', getReleases, resources.releases],
    ['/api/platform-admin/v1/errors?limit=50', getErrors, resources.errors],
    ['/api/platform-admin/v1/usage?from=2026-08-01&to=2026-08-22', getUsage, resources.usage],
    ['/api/platform-admin/v1/revenue?from=2026-08-01&to=2026-08-22', getRevenue, resources.revenue],
  ])('serves the direct DTO for %s', async (path, handler, expected) => {
    const response = await handler(request(path))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expected)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('requires bearer authentication on every resource', async () => {
    const response = await getHealth(new Request('https://crm.example.com/api/platform-admin/v1/health'))
    expect(response.status).toBe(401)
  })
})
