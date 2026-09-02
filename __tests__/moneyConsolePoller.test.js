import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saved: vi.fn(),
  callPlatform: vi.fn(),
  queryUsage: vi.fn(),
  buildFccRevenue: vi.fn(),
  files: {},
}))

vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(type => type === 'accounts' ? [{ id: 'client-1', name: 'Client One', email: 'one@example.com' }] : type === 'revenueSnapshots' ? [{ id: 'revenue-2026-07', periodKey: '2026-07' }] : []),
  saveAll: mocks.saved,
}))
vi.mock('../lib/dataStore', () => ({ readData: vi.fn(file => mocks.files[file] || null), writeData: vi.fn((file, value) => { mocks.files[file] = value }) }))
vi.mock('../lib/platform-admin/fccResources', () => ({ buildFccRevenue: mocks.buildFccRevenue }))
vi.mock('../lib/platforms/adminClient', () => ({ callPlatformAdminResource: mocks.callPlatform }))
vi.mock('../lib/platforms/registry', () => ({
  listPlatforms: vi.fn(() => [
    { platformId: 'farrington-command-center', name: 'Command Center', capabilities: ['revenue'] },
    { platformId: 'getfound3', name: 'GetFound3', capabilities: ['revenue'] },
    { platformId: 'dark-product', name: 'Dark Product', capabilities: [] },
  ]),
  platformSupportsCapability: vi.fn((platform, capability) => platform.capabilities.includes(capability)),
}))
vi.mock('../lib/usage-events', () => ({ queryUsage: mocks.queryUsage }))

import { pollMoneyConsole } from '../lib/money-console'

describe('Money Console revenue polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.files = { 'leases.json': { leases: [] } }
    mocks.buildFccRevenue.mockReturnValue({ currency: 'USD', mrr: 100, newMrr: 5, churnedMrr: 0, failedPayments: 1, trials: { started: 1, converted: 1 } })
    mocks.callPlatform.mockResolvedValue({ status: 200, body: { currency: 'USD', mrr: 50, newMrr: 5, churnedMrr: 2, failedPayments: 0, trials: { started: 2, converted: 1 } } })
    mocks.queryUsage.mockImplementation(({ groupBy }) => ({ groups: groupBy === 'product' ? [{ key: 'getfound3', estCostUsd: 3, unknown: false }] : [] }))
  })

  it('polls each revenue-capable platform, adds FCC lifecycle revenue, and persists a monthly snapshot', async () => {
    const snapshot = await pollMoneyConsole({ periodKey: '2026-08', bypassCache: true })

    expect(mocks.callPlatform).toHaveBeenCalledTimes(1)
    expect(mocks.callPlatform).toHaveBeenCalledWith('getfound3', 'revenue', { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }, { bypassCache: true })
    expect(snapshot.portfolio.mrr).toBe(150)
    expect(snapshot.products.find(row => row.productId === 'dark-product')).toMatchObject({ available: false, mrr: 0 })
    expect(mocks.saved).toHaveBeenCalledWith('revenueSnapshots', expect.arrayContaining([expect.objectContaining({ periodKey: '2026-08' }), expect.objectContaining({ periodKey: '2026-07' })]))
  })
})
