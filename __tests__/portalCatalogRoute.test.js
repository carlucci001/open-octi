import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: null, data: {} }))

vi.mock('../lib/portal-auth', () => ({ getSessionFromRequest: vi.fn(() => state.session) }))
vi.mock('../lib/dataStore', () => ({ readData: vi.fn(filename => state.data[filename] || null) }))

import { GET } from '../app/api/portal/catalog/route'

beforeEach(() => {
  state.session = { accountId: 'ac_one', leaseId: 'lease_one', email: 'owner@example.com' }
  state.data = {
    'pricing-tiers.json': {
      currency: 'USD',
      tiers: [
        { id: 'receptionist', name: 'Receptionist', monthlyFee: 99, capabilities: ['Unchecked claim'] },
        { id: 'not-audited', name: 'Unreviewed service', monthlyFee: 500, capabilities: ['Magic'] },
      ],
    },
    'automations.json': {
      automations: [
        { id: 'weak', name: 'Weak listing', verified: true, monthlyFee: 50 },
        {
          id: 'verified', name: 'Template: Verified workflow', description: 'Tracked workflow', verified: true, monthlyFee: 75,
          marketplace: { customerVisible: true, capabilityVerified: true },
          fulfillment: { handler: 'verified_workflow', trackedRecord: 'documents' },
        },
      ],
    },
  }
})

describe('GET /api/portal/catalog audited listings', () => {
  it('requires a portal session', async () => {
    state.session = null
    expect((await GET(new Request('https://openocti.local/api/portal/catalog'))).status).toBe(401)
  })

  it('returns only capability-audited cards with truthful commerce status', async () => {
    const response = await GET(new Request('https://openocti.local/api/portal/catalog'))
    const body = await response.json()
    expect(body.tiers).toHaveLength(1)
    expect(body.tiers[0]).toMatchObject({
      id: 'receptionist',
      capabilities: expect.not.arrayContaining(['Unchecked claim']),
      commerce: { mode: 'request', directOrder: false },
    })
    expect(body.automations).toHaveLength(1)
    expect(body.automations[0]).toMatchObject({ id: 'verified', commerce: { mode: 'request', directOrder: false } })
  })
})
