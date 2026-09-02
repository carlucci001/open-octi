import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null,
  data: {},
  reserveResult: null,
  released: [],
  writeError: false,
}))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  writeData: vi.fn((filename, value) => {
    if (state.writeError) throw new Error('simulated persistence failure')
    state.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

vi.mock('../lib/portal-credit-allowance', () => ({
  ensurePortalSubscriptionAllowance: vi.fn(() => ({
    ok: true,
    wallet: { availableCredits: 8500 },
  })),
}))

vi.mock('../lib/credit-wallet', () => ({
  reserveWalletCredits: vi.fn(() => state.reserveResult || ({
    ok: true,
    reservation: { id: 'wallet_reservation_one' },
  })),
  commitWalletReservation: vi.fn(() => ({
    ok: true,
    wallet: { availableCredits: 8250 },
  })),
  releaseWalletReservation: vi.fn(input => {
    state.released.push(input)
    return { ok: true }
  }),
}))

import { GET, POST } from '../app/api/portal/campaign-assistant/route'

function postRequest(message, requestId) {
  return new Request('https://openocti.local/api/portal/campaign-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, requestId }),
  })
}

describe('portal Campaign Assistant route', () => {
  beforeEach(() => {
    state.session = null
    state.reserveResult = null
    state.released = []
    state.writeError = false
    state.data = {
      'accounts.json': {
        accounts: [
          { id: 'acct_one', name: 'Acme Heating' },
          { id: 'acct_two', name: 'Second Company' },
        ],
      },
      'campaign-studio.json': { campaigns: [] },
    }
  })

  it('requires a signed portal session', async () => {
    const response = await GET(new Request('https://openocti.local/api/portal/campaign-assistant'))
    expect(response.status).toBe(401)
  })

  it('creates seven tenant-scoped social drafts from one chat message', async () => {
    state.session = {
      accountId: 'acct_one',
      tenantId: 'tenant_one',
      email: 'redacted@example.invalid',
    }

    const response = await POST(postRequest('Promote spring HVAC service to homeowners in Asheville.'))
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.ok).toBe(true)
    expect(result.campaign.posts).toHaveLength(7)
    expect(result.usage).toMatchObject({ chargedCredits: 250, remainingCredits: 8250 })
    expect(result.campaign.posts.every(post => post.platform === 'Social' && post.status === 'draft')).toBe(true)

    const stored = state.data['campaign-studio.json'].campaigns[0]
    expect(stored).toMatchObject({
      tenantId: 'tenant_one',
      clientAccountId: 'acct_one',
      cadenceId: 'daily-7',
      platforms: ['Facebook'],
      portalAssistant: {
        source: 'client-portal',
        clientAccountId: 'acct_one',
      },
    })
    expect(stored.posts.every(post => post.platform === 'Facebook')).toBe(true)
  })

  it('does not return another portal account campaign', async () => {
    state.session = { accountId: 'acct_one', tenantId: 'tenant_one' }
    await POST(postRequest('Promote HVAC maintenance to homeowners in Asheville.'))

    state.session = { accountId: 'acct_two', tenantId: 'tenant_two' }
    const response = await GET(new Request('https://openocti.local/api/portal/campaign-assistant'))
    const result = await response.json()

    expect(result.ok).toBe(true)
    expect(result.campaigns).toEqual([])
  })

  it('returns the existing campaign when the same paid request is retried', async () => {
    state.session = { accountId: 'acct_one', tenantId: 'tenant_one' }
    const message = 'Promote HVAC maintenance to homeowners in Asheville.'

    const first = await POST(postRequest(message, 'stable-request-one'))
    const second = await POST(postRequest(message, 'stable-request-one'))
    const result = await second.json()

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(result.idempotent).toBe(true)
    expect(result.usage).toMatchObject({ chargedCredits: 0, originalChargeCredits: 250 })
    expect(state.data['campaign-studio.json'].campaigns).toHaveLength(1)
  })

  it('rejects a request that lacks enough campaign detail', async () => {
    state.session = { accountId: 'acct_one', tenantId: 'tenant_one' }
    const response = await POST(postRequest('Sell it'))
    expect(response.status).toBe(400)
    expect(state.data['campaign-studio.json'].campaigns).toEqual([])
  })

  it('does not create a campaign when the combined wallet is too low', async () => {
    state.session = { accountId: 'acct_one', tenantId: 'tenant_one' }
    state.reserveResult = {
      ok: false,
      code: 'insufficient_credits',
      wallet: { availableCredits: 100 },
    }

    const response = await POST(postRequest('Promote HVAC maintenance to homeowners in Asheville.'))
    const result = await response.json()

    expect(response.status).toBe(402)
    expect(result.creditCost).toBe(250)
    expect(state.data['campaign-studio.json'].campaigns).toEqual([])
  })

  it('releases reserved credits when campaign creation fails', async () => {
    state.session = { accountId: 'acct_one', tenantId: 'tenant_one' }
    state.writeError = true

    const response = await POST(postRequest('Promote HVAC maintenance to homeowners in Asheville.', 'failed-request'))

    expect(response.status).toBe(500)
    expect(state.released).toHaveLength(1)
    expect(state.released[0]).toMatchObject({
      reservationId: 'wallet_reservation_one',
      reason: 'campaign_creation_failed',
    })
  })
})
