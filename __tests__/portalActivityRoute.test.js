import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null }))
const fixtureValues = ['not-for-the-portal']

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => structuredClone(state.data[filename] || null)),
  mutateData: vi.fn((filename, mutator) => {
    const outcome = mutator(structuredClone(state.data[filename] || null))
    state.data[filename] = structuredClone(outcome.data)
    return outcome.result
  }),
}))

import { GET, PATCH } from '../app/api/portal/activity/route'

const session = {
  sessionId: 'session-acme',
  email: 'redacted@example.invalid',
  accountId: 'account-acme',
  leaseId: 'lease-acme',
  tenantId: 'tenant-acme',
}

function request(query = '') {
  return new Request(`http://localhost/api/portal/activity${query}`)
}

function patchRequest(body) {
  return new Request('http://localhost/api/portal/activity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function activity(id, overrides = {}) {
  return {
    id,
    type: 'note',
    subject: `Activity ${id}`,
    body: `Details for ${id}`,
    tenantId: 'tenant-acme',
    createdAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('portal activity API', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T12:00:00.000Z'))
    state.session = { ...session }
    state.data = {
      'leases.json': {
        leases: [{
          id: 'lease-acme',
          clientAccountId: 'account-acme',
          tenantId: 'tenant-acme',
          status: 'active',
          portalAccess: 'enabled',
        }],
      },
      'activities.json': { activities: [] },
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires a signed-in portal session', async () => {
    state.session = null

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it.each([
    ['a different account', { clientAccountId: 'account-other' }, session],
    ['a different tenant', { tenantId: 'tenant-other' }, session],
    ['a disabled portal', { portalAccess: 'disabled' }, session],
    ['a session without a tenant', {}, { ...session, tenantId: null }],
  ])('rejects %s instead of resolving a fallback scope', async (_label, leasePatch, sessionPatch) => {
    state.data['leases.json'].leases[0] = {
      ...state.data['leases.json'].leases[0],
      ...leasePatch,
    }
    state.session = { ...sessionPatch }

    const response = await GET(request())

    expect(response.status).toBe(403)
  })

  it('excludes cross-tenant and untagged activity', async () => {
    state.data['activities.json'].activities = [
      activity('owned'),
      activity('other', { tenantId: 'tenant-other' }),
      activity('untagged', { tenantId: undefined }),
    ]

    const response = await GET(request())
    const json = await response.json()

    expect(json.activities.map(item => item.id)).toEqual(['owned'])
    expect(json.usage.totalActivities).toBe(1)
  })

  it('preserves the default 50-record ceiling and returns only client-safe fields', async () => {
    state.data['activities.json'].activities = Array.from({ length: 55 }, (_, index) => activity(`activity-${index}`, {
      createdAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
      tenantId: 'tenant-acme',
      agentId: 'internal-agent',
      linkedTo: { accountId: 'account-acme' },
      meta: { secret: fixtureValues[0] },
      internalNote: 'hidden',
    }))

    const response = await GET(request())
    const json = await response.json()

    expect(json.activities).toHaveLength(50)
    expect(json.activities[0].id).toBe('activity-54')
    expect(Object.keys(json.activities[0]).sort()).toEqual(['archivedAt', 'body', 'createdAt', 'id', 'subject', 'type'])
  })

  it('filters by search text, type, and inclusive date range', async () => {
    state.data['activities.json'].activities = [
      activity('match', { type: 'email_sent', subject: 'July launch', createdAt: '2026-07-10T12:00:00.000Z' }),
      activity('wrong-type', { type: 'note', subject: 'July launch', createdAt: '2026-07-10T12:00:00.000Z' }),
      activity('wrong-text', { type: 'email_sent', subject: 'Invoice sent', createdAt: '2026-07-10T12:00:00.000Z' }),
      activity('too-early', { type: 'email_sent', subject: 'July launch', createdAt: '2026-07-01T23:59:59.000Z' }),
      activity('too-late', { type: 'email_sent', subject: 'July launch', createdAt: '2026-07-17T00:00:00.000Z' }),
    ]

    const response = await GET(request('?q=launch&type=email_sent&from=2026-07-02&to=2026-07-16'))
    const json = await response.json()

    expect(json.activities.map(item => item.id)).toEqual(['match'])
    expect(json.pagination.totalItems).toBe(1)
  })

  it('builds type metadata only from the newest 50 tenant records before filtering', async () => {
    const owned = Array.from({ length: 55 }, (_, index) => activity(`owned-${index}`, {
      type: index < 5 ? 'older_private_type' : (index % 2 ? 'email_sent' : 'note'),
      createdAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    }))
    state.data['activities.json'].activities = [
      ...owned,
      activity('other-tenant', { tenantId: 'tenant-other', type: 'cross_tenant_type' }),
      activity('untagged', { tenantId: undefined, type: 'untagged_type' }),
    ]

    const response = await GET(request('?type=email_sent'))
    const json = await response.json()

    expect(json.meta.types).toEqual(['email_sent', 'note'])
    expect(json.activities.every(item => item.type === 'email_sent')).toBe(true)
  })

  it('uses allowlisted stable sorting with an id tie-breaker', async () => {
    state.data['activities.json'].activities = [
      activity('b', { subject: 'Same', createdAt: '2026-07-10T12:00:00.000Z' }),
      activity('a', { subject: 'Same', createdAt: '2026-07-10T12:00:00.000Z' }),
      activity('c', { subject: 'Zulu', createdAt: '2026-07-11T12:00:00.000Z' }),
    ]

    const ascending = await (await GET(request('?sortBy=subject&sortOrder=asc'))).json()
    const invalid = await (await GET(request('?sortBy=tenantId&sortOrder=sideways'))).json()

    expect(ascending.activities.map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(invalid.activities.map(item => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('paginates filtered activity and clamps invalid page values and oversized page sizes', async () => {
    state.data['activities.json'].activities = Array.from({ length: 60 }, (_, index) => activity(`activity-${String(index).padStart(2, '0')}`, {
      createdAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    }))

    const pageTwo = await (await GET(request('?page=2&pageSize=10'))).json()
    const clamped = await (await GET(request('?page=-4&pageSize=500'))).json()

    expect(pageTwo.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 50, totalPages: 5 })
    expect(pageTwo.activities).toHaveLength(10)
    expect(clamped.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 50, totalPages: 1 })
    expect(clamped.activities).toHaveLength(50)
  })

  it('calculates usage totals across the tenant scope instead of only the displayed page', async () => {
    state.data['activities.json'].activities = [
      activity('email', { type: 'email_sent', createdAt: '2026-07-15T12:00:00.000Z' }),
      activity('call', { type: 'call_logged', createdAt: '2026-07-14T12:00:00.000Z' }),
      activity('time', { type: 'time_tracked', createdAt: '2026-07-13T12:00:00.000Z', meta: { durationSeconds: 1800 } }),
    ]

    const response = await GET(request('?page=1&pageSize=1'))
    const json = await response.json()

    expect(json.activities).toHaveLength(1)
    expect(json.usage).toMatchObject({
      totalActivities: 3,
      thisMonthActivities: 3,
      emailsSent: 1,
      callsLogged: 1,
      timeTrackedSeconds: 1800,
    })
  })

  it('archives without mutating the audit record and filters active, archived, and all states', async () => {
    const original = activity('owned', {
      meta: { internalOnly: 'must-not-leak' },
      operatorId: 'private-operator',
    })
    state.data['activities.json'].activities = [original]

    const archiveResponse = await PATCH(patchRequest({ activityId: 'owned', archived: true }))
    const archived = await archiveResponse.json()
    vi.setSystemTime(new Date('2026-07-17T13:00:00.000Z'))
    const repeatedArchive = await (await PATCH(patchRequest({ activityId: 'owned', archived: true }))).json()
    const activeList = await (await GET(request())).json()
    const archivedList = await (await GET(request('?archiveState=archived'))).json()
    const allList = await (await GET(request('?archiveState=all'))).json()

    expect(archiveResponse.status).toBe(200)
    expect(archived.activity).toEqual({
      id: 'owned',
      type: 'note',
      subject: 'Activity owned',
      body: 'Details for owned',
      createdAt: '2026-07-10T12:00:00.000Z',
      archivedAt: '2026-07-17T12:00:00.000Z',
    })
    expect(repeatedArchive.activity.archivedAt).toBe('2026-07-17T12:00:00.000Z')
    expect(state.data['activities.json'].activities).toEqual([original])
    expect(activeList.activities).toEqual([])
    expect(activeList.usage.totalActivities).toBe(1)
    expect(archivedList.activities.map(item => item.id)).toEqual(['owned'])
    expect(allList.activities.map(item => item.id)).toEqual(['owned'])
  })

  it('keeps archive state across session rotation for the same exact lease scope and restores it', async () => {
    state.data['activities.json'].activities = [activity('owned')]
    await PATCH(patchRequest({ activityId: 'owned', archived: true }))

    state.session = { ...session, sessionId: 'session-other' }
    const otherSession = await (await GET(request())).json()
    state.session = { ...session }

    const restoreResponse = await PATCH(patchRequest({ activityId: 'owned', archived: false }))
    const restored = await restoreResponse.json()
    const active = await (await GET(request())).json()

    expect(otherSession.activities).toEqual([])
    expect(state.data['portal-activity-preferences.json'].scopes[0]).not.toHaveProperty('sessionId')
    expect(restored.activity.archivedAt).toBeNull()
    expect(active.activities.map(item => item.id)).toEqual(['owned'])
  })

  it('returns 404 when PATCH targets cross-tenant or nonexposed activity', async () => {
    state.data['activities.json'].activities = [
      activity('older-hidden'),
      ...Array.from({ length: 50 }, (_, index) => activity(`new-${index}`)),
      activity('other', { tenantId: 'tenant-other' }),
    ]

    const hidden = await PATCH(patchRequest({ activityId: 'older-hidden', archived: true }))
    const other = await PATCH(patchRequest({ activityId: 'other', archived: true }))
    const missing = await PATCH(patchRequest({ activityId: 'missing', archived: true }))

    expect(hidden.status).toBe(404)
    expect(other.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(state.data['portal-activity-preferences.json']).toBeUndefined()
  })

  it('requires an exact active lease and validates PATCH and archiveState inputs', async () => {
    state.data['activities.json'].activities = [activity('owned')]
    state.data['leases.json'].leases[0].clientAccountId = 'account-other'

    const unauthorized = await PATCH(patchRequest({ activityId: 'owned', archived: true }))
    state.data['leases.json'].leases[0].clientAccountId = 'account-acme'
    const invalidPatch = await PATCH(patchRequest({ activityId: 'owned', archived: 'yes' }))
    const invalidState = await GET(request('?archiveState=deleted'))

    expect(unauthorized.status).toBe(403)
    expect(invalidPatch.status).toBe(400)
    expect(invalidState.status).toBe(400)
  })
})
