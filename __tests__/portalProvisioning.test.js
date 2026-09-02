import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, activities: [] }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(name => structuredClone(state.data[name])),
  writeData: vi.fn((name, value) => { state.data[name] = structuredClone(value) }),
}))

vi.mock('../lib/entityStore', () => ({
  findById: vi.fn((type, id) => type === 'accounts' ? state.data['accounts.json']?.accounts?.find(item => item.id === id) : null),
  logActivity: vi.fn(activity => state.activities.push(structuredClone(activity))),
}))

import { disablePortalForAccount, enablePortalForAccount, isComplimentaryLease } from '../lib/portal-provisioning'

describe('portal provisioning access switch', () => {
  beforeEach(() => {
    state.activities = []
    state.data = {
      'accounts.json': { accounts: [{ id: 'acct-one', name: 'Acme' }] },
      'leases.json': { leases: [{ id: 'lease-one', clientAccountId: 'acct-one', status: 'active', portalAccess: 'active' }] },
      'portal-sessions.json': {
        sessions: { one: { accountId: 'acct-one' }, other: { accountId: 'acct-other' } },
        tokens: { magic: { accountId: 'acct-one' }, other: { accountId: 'acct-other' } },
        requestLog: [],
      },
    }
  })

  it('disables portal access and revokes only that account sessions and tokens', () => {
    const result = disablePortalForAccount('acct-one', { disabledBy: 'Carl' })

    expect(result).toMatchObject({ ok: true, disabledLeases: 1, revokedSessions: 1, revokedTokens: 1 })
    expect(state.data['leases.json'].leases[0]).toMatchObject({ status: 'active', portalAccess: 'disabled', portalDisabledBy: 'Carl' })
    expect(Object.keys(state.data['portal-sessions.json'].sessions)).toEqual(['other'])
    expect(Object.keys(state.data['portal-sessions.json'].tokens)).toEqual(['other'])
  })

  it('restores portal access without creating or changing the active service lease', () => {
    disablePortalForAccount('acct-one', { disabledBy: 'Carl' })
    const result = enablePortalForAccount('acct-one', { enabledBy: 'Carl' })

    expect(result).toMatchObject({ ok: true, created: false, reenabled: true })
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(state.data['leases.json'].leases[0]).toMatchObject({ id: 'lease-one', status: 'active', portalAccess: 'active' })
  })

  it('creates portal access independently from complimentary status', () => {
    state.data['leases.json'] = { leases: [] }

    const result = enablePortalForAccount('acct-one', {
      enabledBy: 'Carl',
      now: '2026-08-26T12:00:00.000Z',
    })

    expect(result).toMatchObject({ ok: true, created: true })
    expect(result.lease).toMatchObject({
      clientAccountId: 'acct-one',
      status: 'active',
      portalAccess: 'active',
      plan: 'portal-access',
      tierId: 'portal-access',
      complimentary: false,
    })
    expect(result.lease).not.toHaveProperty('complimentaryExpiresAt')
  })

  it('optionally provisions a time-limited complimentary account and voice allowance', () => {
    state.data['leases.json'] = { leases: [] }

    const result = enablePortalForAccount('acct-one', {
      enabledBy: 'Carl',
      now: '2026-08-26T12:00:00.000Z',
      complimentary: true,
      complimentaryDuration: '30_days',
      complimentaryReason: 'Prospect evaluation',
      conciergeVoice: {
        enabled: true,
        dailySeconds: 900,
        maxSessionSeconds: 600,
        idleTimeoutSeconds: 90,
        warningThresholds: [50, 75, 90, 100],
      },
    })

    expect(result.lease).toMatchObject({
      complimentary: true,
      complimentaryDuration: '30_days',
      complimentaryReason: 'Prospect evaluation',
      complimentaryStartsAt: '2026-08-26T12:00:00.000Z',
      complimentaryExpiresAt: '2026-09-25T12:00:00.000Z',
      conciergeVoice: {
        enabled: true,
        dailySeconds: 900,
        maxSessionSeconds: 600,
        idleTimeoutSeconds: 90,
        warningThresholds: [50, 75, 90, 100],
      },
    })
    expect(state.activities.at(-1)).toMatchObject({
      subject: 'Portal enabled (complimentary)',
      meta: expect.objectContaining({
        complimentary: true,
        complimentaryReason: 'Prospect evaluation',
        complimentaryExpiresAt: '2026-09-25T12:00:00.000Z',
      }),
    })
  })

  it('stops treating complimentary status as active after its expiration', () => {
    const lease = {
      complimentary: true,
      complimentaryExpiresAt: '2026-09-25T12:00:00.000Z',
    }

    expect(isComplimentaryLease(lease, '2026-09-25T11:59:59.999Z')).toBe(true)
    expect(isComplimentaryLease(lease, '2026-09-25T12:00:00.000Z')).toBe(false)
  })

  it('removes prior complimentary status only when an administrator explicitly turns it off', () => {
    state.data['leases.json'].leases[0] = {
      ...state.data['leases.json'].leases[0],
      portalAccess: 'disabled',
      plan: 'complimentary',
      complimentary: true,
      complimentaryDuration: 'never',
      complimentaryStartsAt: '2026-08-01T00:00:00.000Z',
      complimentaryReason: 'Prior courtesy access',
    }

    const result = enablePortalForAccount('acct-one', {
      enabledBy: 'Carl',
      complimentary: false,
      now: '2026-08-26T12:00:00.000Z',
    })

    expect(result.lease).toMatchObject({ complimentary: false, portalAccess: 'active' })
    expect(result.lease).not.toHaveProperty('complimentaryDuration')
    expect(result.lease).not.toHaveProperty('complimentaryReason')
    expect(isComplimentaryLease(result.lease)).toBe(false)
  })
})
