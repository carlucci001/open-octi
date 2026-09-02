import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => structuredClone(state.data[filename] || null)),
  writeData: vi.fn(),
}))

import { getSessionFromRequest, verifySessionCookie } from '../lib/portal-auth'

const fixtureValues = ['change-me-portal-secret-dev']

function signedCookie(sessionId = 'session-one') {
  const signature = crypto.createHmac('sha256', fixtureValues[0]).update(sessionId).digest('base64url')
  return `${sessionId}.${signature}`
}

function lease(overrides = {}) {
  return {
    id: 'lease-one',
    clientAccountId: 'account-one',
    tenantId: 'tenant-one',
    status: 'active',
    portalAccess: 'active',
    ...overrides,
  }
}

function session(overrides = {}) {
  return {
    email: 'owner@example.com',
    accountId: 'account-one',
    leaseId: 'lease-one',
    tenantId: 'tenant-one',
    createdAt: Date.now() - 1_000,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  }
}

beforeEach(() => {
  state.data = {
    'portal-sessions.json': { tokens: {}, sessions: { 'session-one': session() }, requestLog: [] },
    'leases.json': { leases: [lease()] },
  }
})

describe('portal session authorization', () => {
  it('returns a modern session only when lease, account, and tenant match exactly', () => {
    expect(verifySessionCookie(signedCookie())).toMatchObject({
      sessionId: 'session-one',
      accountId: 'account-one',
      leaseId: 'lease-one',
      tenantId: 'tenant-one',
    })
  })

  it.each([
    ['lease', { leaseId: 'lease-other' }],
    ['account', { accountId: 'account-other' }],
    ['tenant', { tenantId: 'tenant-other' }],
  ])('rejects a signed session whose %s does not match the lease', (_label, patch) => {
    state.data['portal-sessions.json'].sessions['session-one'] = session(patch)

    expect(verifySessionCookie(signedCookie())).toBeNull()
  })

  it('hydrates a legacy session missing tenantId when its exact lease is unambiguous', () => {
    state.data['portal-sessions.json'].sessions['session-one'] = session({ tenantId: undefined })

    expect(verifySessionCookie(signedCookie())).toMatchObject({
      accountId: 'account-one',
      leaseId: 'lease-one',
      tenantId: 'tenant-one',
    })
  })

  it('hydrates a legacy account-only session when exactly one active enabled lease exists', () => {
    state.data['portal-sessions.json'].sessions['session-one'] = session({ leaseId: undefined, tenantId: undefined })

    expect(verifySessionCookie(signedCookie())).toMatchObject({
      accountId: 'account-one',
      leaseId: 'lease-one',
      tenantId: 'tenant-one',
    })
  })

  it('rejects a legacy account-only session when multiple leases make its scope ambiguous', () => {
    state.data['portal-sessions.json'].sessions['session-one'] = session({ leaseId: undefined, tenantId: undefined })
    state.data['leases.json'].leases.push(lease({ id: 'lease-two', tenantId: 'tenant-two' }))

    expect(verifySessionCookie(signedCookie())).toBeNull()
  })

  it('uses a legacy tenantId to disambiguate multiple active leases for the same account', () => {
    state.data['portal-sessions.json'].sessions['session-one'] = session({ leaseId: undefined, tenantId: 'tenant-two' })
    state.data['leases.json'].leases.push(lease({ id: 'lease-two', tenantId: 'tenant-two' }))

    expect(verifySessionCookie(signedCookie())).toMatchObject({
      leaseId: 'lease-two',
      tenantId: 'tenant-two',
    })
  })

  it('rejects disabled portal access even when all identifiers match', () => {
    state.data['leases.json'].leases[0].portalAccess = 'disabled'

    expect(verifySessionCookie(signedCookie())).toBeNull()
  })

  it('applies the same normalized authorization through request cookie parsing', () => {
    state.data['portal-sessions.json'].sessions['session-one'] = session({ tenantId: undefined })
    const request = new Request('https://portal.farringtondevelopment.com/api/portal/me', {
      headers: { cookie: `fd_portal_session=${signedCookie()}; another=value` },
    })

    expect(getSessionFromRequest(request)).toMatchObject({ tenantId: 'tenant-one', leaseId: 'lease-one' })
  })
})
