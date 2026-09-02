import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  owner: null,
  data: {},
  issued: [],
  audits: [],
}))

vi.mock('../lib/auth', () => ({
  requireOwner: vi.fn(async () => state.owner
    ? { user: state.owner, error: null }
    : { user: null, error: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
}))

vi.mock('../lib/credit-wallet', () => ({
  getCreditWallet: vi.fn(() => ({
    availableCredits: 500,
    subscription: { availableCredits: 300 },
    prepaid: { availableCredits: 200 },
  })),
  issuePrepaidCredits: vi.fn(input => {
    state.issued.push(input)
    return {
      ok: true,
      idempotent: false,
      event: { id: 'cw_evt_grant', occurredAt: '2026-07-16T17:00:00.000Z' },
      wallet: {
        availableCredits: 1000,
        subscription: { availableCredits: 300 },
        prepaid: { availableCredits: 700 },
      },
    }
  }),
}))

vi.mock('../lib/auditLog', () => ({
  logAuditEvent: vi.fn(input => state.audits.push(input)),
}))

import { GET, POST } from '../app/api/admin/credit-grants/route'

function request(body) {
  return new Request('https://openocti.local/api/admin/credit-grants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('owner credit grants route', () => {
  beforeEach(() => {
    state.owner = null
    state.issued = []
    state.audits = []
    state.data = {
      'leases.json': {
        leases: [{
          id: 'lease_acme',
          status: 'active',
          tenantId: 'tenant_acme',
          clientAccountId: 'account_acme',
          tierId: 'receptionist',
          tierName: 'Receptionist',
        }],
      },
      'accounts.json': { accounts: [{ id: 'account_acme', name: 'Acme Heating' }] },
    }
  })

  it('is owner-only', async () => {
    expect((await GET(new Request('https://openocti.local/api/admin/credit-grants'))).status).toBe(401)
    expect((await POST(request({ leaseId: 'lease_acme', credits: 500, reason: 'Courtesy' }))).status).toBe(401)
  })

  it('derives tenant ownership from the active lease and records the grant', async () => {
    state.owner = { id: 'owner_carl', name: 'Carl Farrington', role: 'owner' }
    const response = await POST(request({
      leaseId: 'lease_acme',
      credits: 500,
      reason: 'Demo launch courtesy capacity',
      requestId: 'grant-one',
      tenantId: 'forged_tenant',
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.ok).toBe(true)
    expect(state.issued[0]).toMatchObject({
      tenantId: 'tenant_acme',
      accountId: 'account_acme',
      leaseId: 'lease_acme',
      credits: 500,
      reason: 'Demo launch courtesy capacity',
      issuedBy: 'Carl Farrington',
      idempotencyKey: 'owner-credit-grant:lease_acme:grant-one',
    })
    expect(state.audits[0]).toMatchObject({ action: 'client_credits_issued', area: 'billing' })
  })

  it('issues an expiring promotional grant and includes expiry in the audit record', async () => {
    state.owner = { id: 'owner_carl', name: 'Carl Farrington', role: 'owner' }
    const response = await POST(request({
      leaseId: 'lease_acme',
      credits: 500,
      reason: 'Thirty-day concierge trial',
      expiration: 'custom',
      expiresAt: '2030-02-01T00:00:00.000Z',
      requestId: 'grant-expiring',
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(state.issued[0]).toMatchObject({
      expiresAt: '2030-02-01T00:00:00.000Z',
      metadata: expect.objectContaining({ source: 'owner-credit-console', promotional: true }),
    })
    expect(result.grant).toMatchObject({ expiresAt: '2030-02-01T00:00:00.000Z' })
    expect(state.audits[0]).toMatchObject({
      meta: expect.objectContaining({ expiresAt: '2030-02-01T00:00:00.000Z' }),
    })
  })

  it('rejects an invalid custom expiration', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }

    expect((await POST(request({
      leaseId: 'lease_acme',
      credits: 500,
      reason: 'Courtesy',
      expiration: 'custom',
      expiresAt: 'not-a-date',
    }))).status).toBe(400)
    expect(state.issued).toEqual([])
  })

  it('rejects invalid amounts and missing reasons', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    expect((await POST(request({ leaseId: 'lease_acme', credits: 0, reason: 'Courtesy' }))).status).toBe(400)
    expect((await POST(request({ leaseId: 'lease_acme', credits: 500, reason: '' }))).status).toBe(400)
    expect(state.issued).toEqual([])
  })
})
