import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryUsage: vi.fn(),
  getUsageSettings: vi.fn(),
  saveUsageSettings: vi.fn(),
  requireCrmRead: vi.fn(async () => ({ user: { id: 'owner' } })),
  requireCrmWrite: vi.fn(async () => ({ user: { id: 'owner' } })),
}))

vi.mock('@/lib/usage-events', () => ({
  queryUsage: mocks.queryUsage,
  getUsageSettings: mocks.getUsageSettings,
  saveUsageSettings: mocks.saveUsageSettings,
}))
vi.mock('@/lib/permissions', () => ({ requireCrmRead: mocks.requireCrmRead, requireCrmWrite: mocks.requireCrmWrite }))

import { GET, POST } from '../app/api/usage/route'

describe('usage attribution API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryUsage.mockReturnValue({ groupBy: 'agent', groups: [{ key: 'nadia', estCostUsd: 1.25 }], totals: { estCostUsd: 1.25 } })
    mocks.getUsageSettings.mockReturnValue({ agentMonthlyUsd: { nadia: 20 }, clientMonthlyUsd: {}, alertState: {} })
    mocks.saveUsageSettings.mockReturnValue({ agentMonthlyUsd: { nadia: 25 }, clientMonthlyUsd: {}, alertState: {} })
  })

  it('returns authenticated grouped usage with budget settings', async () => {
    const response = await GET(new Request('http://localhost/api/usage?from=2026-08-01&to=2026-08-22&groupBy=agent'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, groupBy: 'agent', groups: [{ key: 'nadia', estCostUsd: 1.25 }], settings: { agentMonthlyUsd: { nadia: 20 } } })
    expect(mocks.queryUsage).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-08-22', groupBy: 'agent' })
  })

  it('rejects an unsupported grouping', async () => {
    mocks.queryUsage.mockImplementation(() => { throw new Error('groupBy must be agent, client, product, or provider') })
    const response = await GET(new Request('http://localhost/api/usage?groupBy=model'))
    expect(response.status).toBe(400)
  })

  it('stores per-agent and per-client monthly thresholds behind write auth', async () => {
    const response = await POST(new Request('http://localhost/api/usage', {
      method: 'POST',
      body: JSON.stringify({ agentMonthlyUsd: { nadia: 25 }, clientMonthlyUsd: { c1: 50 } }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.saveUsageSettings).toHaveBeenCalledWith({ agentMonthlyUsd: { nadia: 25 }, clientMonthlyUsd: { c1: 50 } })
  })
})
