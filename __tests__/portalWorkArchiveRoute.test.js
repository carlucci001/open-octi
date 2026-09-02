import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null, sequence: 0, activities: [] }))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => structuredClone(state.data[filename] || null)),
  writeData: vi.fn((filename, value) => { state.data[filename] = structuredClone(value) }),
}))

vi.mock('../lib/entityStore', () => ({
  genId: vi.fn(prefix => `${prefix}_${++state.sequence}`),
  logActivity: vi.fn(input => { state.activities.push(structuredClone(input)); return input }),
}))

import * as supportRoute from '../app/api/portal/support/route'

const session = {
  sessionId: 'session-acme',
  email: 'redacted@example.invalid',
  accountId: 'account-acme',
  leaseId: 'lease-acme',
  tenantId: 'tenant-acme',
}

function request(query = '') {
  return new Request(`http://localhost/api/portal/support${query}`)
}

function post(body) {
  return new Request('http://localhost/api/portal/support', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ticket(id, overrides = {}) {
  return {
    id,
    ticketNumber: `SUP-2026-${id}`,
    accountId: 'account-acme',
    clientId: 'account-acme',
    tenantId: 'tenant-acme',
    subject: `Ticket ${id}`,
    description: `Full private work description ${id}`,
    category: 'other',
    priority: 'normal',
    status: 'new',
    source: 'portal',
    portalVisible: true,
    internalOnly: false,
    comments: [],
    audit: [],
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    deletedAt: null,
    archivedAt: null,
    ...overrides,
  }
}

describe('portal Work archive route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'))
    state.sequence = 0
    state.activities = []
    state.session = { ...session }
    state.data = {
      'accounts.json': { accounts: [{ id: 'account-acme', name: 'Acme' }] },
      'leases.json': {
        leases: [{
          id: 'lease-acme',
          clientAccountId: 'account-acme',
          tenantId: 'tenant-acme',
          status: 'active',
          portalAccess: 'enabled',
        }],
      },
      'support-tickets.json': {
        sequence: 2,
        supportTickets: [
          ticket('active'),
          ticket('archived', { archivedAt: '2026-07-17T12:00:00.000Z' }),
        ],
      },
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters active, archived, and all tickets before pagination', async () => {
    const active = await (await supportRoute.GET(request('?page=1&pageSize=1'))).json()
    const archived = await (await supportRoute.GET(request('?archiveState=archived&page=1&pageSize=1'))).json()
    const all = await (await supportRoute.GET(request('?archiveState=all&page=1&pageSize=1'))).json()

    expect(active.tickets.map(item => item.id)).toEqual(['active'])
    expect(active.pagination.totalItems).toBe(1)
    expect(archived.tickets.map(item => item.id)).toEqual(['archived'])
    expect(archived.tickets[0].archivedAt).toBe('2026-07-17T12:00:00.000Z')
    expect(archived.pagination.totalItems).toBe(1)
    expect(all.pagination.totalItems).toBe(2)
  })

  it('archives and restores an owned ticket without deleting the record', async () => {
    const archivedResponse = await supportRoute.POST(post({ action: 'archive', id: 'active' }))
    const archivedBody = await archivedResponse.json()
    let stored = state.data['support-tickets.json'].supportTickets.find(item => item.id === 'active')

    expect(archivedResponse.status).toBe(200)
    expect(archivedBody.ticket.archivedAt).toBe('2026-07-18T12:00:00.000Z')
    expect(stored.archivedAt).toBe('2026-07-18T12:00:00.000Z')
    expect(stored.deletedAt).toBeNull()
    expect(stored.audit.at(-1)).toMatchObject({ event: 'updated' })

    const restoredResponse = await supportRoute.POST(post({ action: 'restore', id: 'active' }))
    stored = state.data['support-tickets.json'].supportTickets.find(item => item.id === 'active')

    expect(restoredResponse.status).toBe(200)
    expect(stored.archivedAt).toBeNull()
    expect(state.data['support-tickets.json'].supportTickets).toHaveLength(2)
  })

  it('returns not found and does not mutate a cross-tenant ticket', async () => {
    state.data['support-tickets.json'].supportTickets.push(ticket('other', { tenantId: 'tenant-other' }))

    const response = await supportRoute.POST(post({ action: 'archive', id: 'other' }))
    const stored = state.data['support-tickets.json'].supportTickets.find(item => item.id === 'other')

    expect(response.status).toBe(404)
    expect(stored.archivedAt).toBeNull()
    expect(stored.audit).toEqual([])
  })
})
