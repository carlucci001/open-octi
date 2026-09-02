import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireCrmRead: vi.fn(async () => ({ user: { id: 'owner' } })),
  requireCrmWrite: vi.fn(async () => ({ user: { id: 'owner' } })),
  pollMoneyConsole: vi.fn(),
  getMoneySettings: vi.fn(),
  saveMoneySettings: vi.fn(),
}))

vi.mock('@/lib/permissions', () => ({ requireCrmRead: mocks.requireCrmRead, requireCrmWrite: mocks.requireCrmWrite }))
vi.mock('@/lib/money-console', () => ({ pollMoneyConsole: mocks.pollMoneyConsole, getMoneySettings: mocks.getMoneySettings, saveMoneySettings: mocks.saveMoneySettings }))

import { GET, POST } from '../app/api/ops/money/route'

describe('/api/ops/money', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pollMoneyConsole.mockResolvedValue({ periodKey: '2026-08', portfolio: { mrr: 125 } })
    mocks.getMoneySettings.mockReturnValue({ dunningProposalDays: 7 })
    mocks.saveMoneySettings.mockReturnValue({ dunningProposalDays: 10 })
  })

  it('returns the authenticated monthly portfolio snapshot', async () => {
    const response = await GET(new Request('https://openocti.local/api/ops/money?period=2026-08&refresh=1'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, snapshot: { periodKey: '2026-08', portfolio: { mrr: 125 } }, settings: { dunningProposalDays: 7 } })
    expect(mocks.pollMoneyConsole).toHaveBeenCalledWith({ periodKey: '2026-08', bypassCache: true })
  })

  it('updates only the guarded dunning proposal setting', async () => {
    const response = await POST(new Request('https://openocti.local/api/ops/money', { method: 'POST', body: JSON.stringify({ dunningProposalDays: 10 }) }))
    expect(response.status).toBe(200)
    expect(mocks.saveMoneySettings).toHaveBeenCalledWith({ dunningProposalDays: 10 })
  })
})
