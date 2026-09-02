import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchTwilioUsage: vi.fn(),
  readData: vi.fn(),
}))

vi.mock('@/lib/twilio-usage', () => ({ fetchTwilioUsage: mocks.fetchTwilioUsage }))
vi.mock('@/lib/dataStore', () => ({ readData: mocks.readData }))
vi.mock('@/lib/auth', () => ({ requireOwner: vi.fn(async () => ({ user: { id: 'owner' } })) }))
vi.mock('@/lib/auditLog', () => ({ logAuditEvent: vi.fn() }))

import { GET } from '../app/api/credentials/spend/route'

describe('API spend Twilio provider', () => {
  beforeEach(() => {
    mocks.readData.mockReturnValue({ credentials: [] })
    mocks.fetchTwilioUsage.mockResolvedValue({ configured: true, costToday: 1.25, costMonth: 11.75, currency: 'USD' })
    process.env.TWILIO_ACCOUNT_SID = 'AC123'
    process.env.TWILIO_API_KEY_SID = 'SK123'
    process.env.TWILIO_API_KEY_SECRET = 'secret'
  })

  it('adds the active environment-backed Twilio account even when it is absent from Credential Vault', async () => {
    const response = await GET(new Request('http://localhost/api/credentials/spend?force=1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toContainEqual(expect.objectContaining({
      id: 'env_twilio',
      provider: 'Twilio',
      status: 'active',
      usage: expect.objectContaining({ costToday: 1.25, costMonth: 11.75 }),
    }))
  })
})
