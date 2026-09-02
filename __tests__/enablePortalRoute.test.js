import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  admin: null,
  enabled: [],
  issued: [],
  audits: [],
  provisioningError: null,
  walletError: null,
}))

vi.mock('../lib/auth', () => ({
  requireAdmin: vi.fn(async () => state.admin
    ? { user: state.admin, error: null }
    : { user: null, error: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }),
}))

vi.mock('../lib/portal-provisioning', () => ({
  activeLeaseForAccount: vi.fn(() => null),
  isComplimentaryLease: vi.fn(lease => lease?.complimentary === true),
  enablePortalForAccount: vi.fn((accountId, options) => {
    if (state.provisioningError) throw state.provisioningError
    state.enabled.push({ accountId, options })
    return {
      ok: true,
      created: true,
      lease: {
        id: 'lease-acme',
        tenantId: 'tenant-acme',
        clientAccountId: accountId,
        plan: options.complimentary ? 'complimentary' : 'portal-access',
        complimentary: options.complimentary,
        complimentaryExpiresAt: options.complimentaryExpiresAt || '2026-09-25T12:00:00.000Z',
      },
    }
  }),
}))

vi.mock('../lib/credit-wallet', () => ({
  issuePrepaidCredits: vi.fn(input => {
    if (state.walletError) throw state.walletError
    state.issued.push(input)
    return {
      ok: true,
      event: { id: 'cw-grant', occurredAt: '2026-08-26T12:00:00.000Z', expiresAt: input.expiresAt || null },
      wallet: { availableCredits: input.credits },
      idempotent: false,
    }
  }),
}))

vi.mock('../lib/auditLog', () => ({
  logAuditEvent: vi.fn(event => state.audits.push(event)),
}))

import { POST } from '../app/api/accounts/enable-portal/route'

function request(body) {
  return new Request('https://openocti.local/api/accounts/enable-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('account portal enable route', () => {
  beforeEach(() => {
    state.admin = null
    state.enabled = []
    state.issued = []
    state.audits = []
    state.provisioningError = null
    state.walletError = null
  })

  it('requires an owner or administrator', async () => {
    expect((await POST(request({ accountId: 'account-acme' }))).status).toBe(401)
    expect(state.enabled).toEqual([])
  })

  it('enables portal access without automatically making the account complimentary', async () => {
    state.admin = { id: 'admin-one', displayName: 'Admin One', role: 'admin' }

    const response = await POST(request({ accountId: 'account-acme' }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(state.enabled[0]).toMatchObject({
      accountId: 'account-acme',
      options: { enabledBy: 'Admin One', complimentary: false },
    })
    expect(state.issued).toEqual([])
    expect(result).toMatchObject({ ok: true, plan: 'portal-access', complimentary: false })
    expect(state.audits[0]).toMatchObject({
      action: 'client_portal_enabled',
      area: 'accounts',
      targetId: 'account-acme',
      meta: expect.objectContaining({ complimentary: false, promotionalCredits: 0 }),
    })
  })

  it('applies optional comp, promotional credits, expiry, reason, and voice policy', async () => {
    state.admin = { id: 'owner-carl', displayName: 'Carl Farrington', role: 'owner' }

    const response = await POST(request({
      accountId: 'account-acme',
      complimentary: true,
      complimentaryDuration: 'custom',
      complimentaryExpiresAt: '2030-02-01T00:00:00.000Z',
      complimentaryReason: 'Strategic prospect',
      promotionalCreditGrant: {
        enabled: true,
        credits: 10000,
        expiration: 'custom',
        expiresAt: '2030-01-31T23:59:59.999Z',
        reason: 'Thirty-day concierge trial',
        requestId: 'portal-grant-one',
      },
      conciergeVoice: {
        enabled: true,
        dailySeconds: 900,
        maxSessionSeconds: 600,
        idleTimeoutSeconds: 90,
        warningThresholds: [50, 75, 90, 100],
      },
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(state.enabled[0].options).toMatchObject({
      complimentary: true,
      complimentaryDuration: 'custom',
      complimentaryExpiresAt: '2030-02-01T00:00:00.000Z',
      complimentaryReason: 'Strategic prospect',
      conciergeVoice: {
        enabled: true,
        dailySeconds: 900,
        maxSessionSeconds: 600,
        idleTimeoutSeconds: 90,
        warningThresholds: [50, 75, 90, 100],
      },
    })
    expect(state.issued[0]).toMatchObject({
      tenantId: 'tenant-acme',
      accountId: 'account-acme',
      leaseId: 'lease-acme',
      credits: 10000,
      reason: 'Thirty-day concierge trial',
      issuedBy: 'Carl Farrington',
      expiresAt: '2030-01-31T23:59:59.999Z',
      idempotencyKey: 'portal-credit-grant:lease-acme:portal-grant-one',
      metadata: expect.objectContaining({ source: 'portal-onboarding' }),
    })
    expect(result.grant).toMatchObject({ credits: 10000, expiresAt: '2030-01-31T23:59:59.999Z' })
  })

  it('rejects invalid custom dates and voice limits before provisioning', async () => {
    state.admin = { id: 'owner-carl', role: 'owner' }

    const invalidDateResponse = await POST(request({
      accountId: 'account-acme',
      complimentary: true,
      complimentaryDuration: 'custom',
      complimentaryExpiresAt: 'not-a-date',
    }))
    expect(invalidDateResponse.status).toBe(400)
    expect(await invalidDateResponse.json()).toEqual({ ok: false, error: 'Custom expiration must be a future date.' })

    const invalidVoiceResponse = await POST(request({
      accountId: 'account-acme',
      conciergeVoice: { enabled: true, dailySeconds: 0 },
    }))
    expect(invalidVoiceResponse.status).toBe(400)
    expect(await invalidVoiceResponse.json()).toEqual({ ok: false, error: 'Daily voice allowance must be a positive whole number.' })
    expect(state.enabled).toEqual([])
  })

  it('reports a truthful partial success when portal access persists but credits fail', async () => {
    state.admin = { id: 'owner-carl', displayName: 'Carl Farrington', role: 'owner' }
    state.walletError = new Error('SQLite path C:/secrets/private.db failed with token abc123')

    const response = await POST(request({
      accountId: 'account-acme',
      promotionalCreditGrant: {
        enabled: true,
        credits: 10000,
        expiration: '30_days',
        reason: 'Thirty-day concierge trial',
        requestId: 'portal-partial-one',
      },
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      ok: true,
      portalEnabled: true,
      creditGrantFailed: true,
      grant: null,
      creditGrantMessage: expect.stringContaining('Review the credit ledger before retrying'),
    })
    expect(JSON.stringify(result)).not.toContain('private.db')
    expect(JSON.stringify(result)).not.toContain('abc123')
    expect(state.audits[0]).toMatchObject({
      action: 'client_portal_enabled_credit_grant_failed',
      severity: 'warn',
      meta: expect.objectContaining({ creditGrantFailed: true, walletEventId: null }),
    })
  })

  it('sanitizes unexpected provisioning errors', async () => {
    state.admin = { id: 'owner-carl', role: 'owner' }
    state.provisioningError = new Error('Internal path C:/secrets/crm.sqlite and token abc123')

    const response = await POST(request({ accountId: 'account-acme' }))
    const result = await response.json()

    expect(response.status).toBe(500)
    expect(result).toEqual({ ok: false, error: 'Portal access could not be enabled.' })
    expect(JSON.stringify(result)).not.toContain('crm.sqlite')
    expect(JSON.stringify(result)).not.toContain('abc123')
  })
})
