import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: null, data: {}, writeData: vi.fn() }))

vi.mock('../lib/portal-auth', () => ({ getSessionFromRequest: vi.fn(() => state.session) }))
vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  writeData: state.writeData,
}))

import { POST } from '../app/api/portal/order/route'

function request(body) {
  return new Request('https://openocti.local/api/portal/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.session = { accountId: 'ac_one', leaseId: 'lease_one', email: 'owner@example.com' }
  state.data = {
    'pricing-tiers.json': { tiers: [{ id: 'receptionist', name: 'Receptionist', monthlyFee: 99 }] },
    'leases.json': { leases: [{ id: 'lease_one', tierId: null, status: 'active', plan: 'complimentary' }] },
  }
  state.writeData.mockReset()
})

describe('POST /api/portal/order safety gate', () => {
  it('requires authentication', async () => {
    state.session = null
    expect((await POST(request({ kind: 'tier', id: 'receptionist' }))).status).toBe(401)
  })

  it('blocks premature lease mutation, provisioning, and closed-won creation', async () => {
    const before = structuredClone(state.data)
    const response = await POST(request({ kind: 'tier', id: 'receptionist' }))
    const body = await response.json()
    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      ok: false,
      code: 'configuration_review_required',
      requestHref: expect.stringContaining('managed-plan-receptionist'),
    })
    expect(state.data).toEqual(before)
    expect(state.writeData).not.toHaveBeenCalled()
  })

  it('does not expose an unreviewed backend product', async () => {
    state.data['pricing-tiers.json'].tiers.push({ id: 'unreviewed', name: 'Unreviewed', monthlyFee: 10 })
    expect((await POST(request({ kind: 'tier', id: 'unreviewed' }))).status).toBe(404)
  })
})
