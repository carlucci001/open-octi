import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    accountName: 'Acme',
    subject: `Ticket ${id}`,
    description: `Description ${id}`,
    category: 'other',
    priority: 'normal',
    status: 'new',
    source: 'portal',
    assignedToUserId: 'staff-private',
    team: 'support',
    watchers: ['staff@example.com'],
    firstResponseDueAt: '2026-07-18T12:00:00.000Z',
    resolutionDueAt: '2026-07-20T12:00:00.000Z',
    visibility: 'portal',
    portalVisible: true,
    internalOnly: false,
    linkedTo: { accountId: 'account-acme', internalRecordId: 'private' },
    documentIds: ['private-document'],
    mediaIds: ['private-media'],
    comments: [],
    audit: [],
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('portal support API', () => {
  beforeEach(() => {
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
          agentId: 'cheryl',
        }],
      },
      'support-tickets.json': { supportTickets: [], sequence: 0 },
    }
  })

  it('requires authentication and one exact active account-tenant lease', async () => {
    state.session = null
    expect((await supportRoute.GET(request())).status).toBe(401)

    state.session = { ...session }
    state.data['leases.json'].leases[0].tenantId = 'tenant-other'
    expect((await supportRoute.GET(request())).status).toBe(403)

    state.data['leases.json'].leases[0].tenantId = 'tenant-acme'
    state.data['leases.json'].leases[0].portalAccess = 'disabled'
    expect((await supportRoute.POST(post({ action: 'add', ticket: { subject: 'Blocked' } }))).status).toBe(403)
  })

  it('creates from an explicit client allowlist and fixes account and tenant ownership', async () => {
    const response = await supportRoute.POST(post({
      action: 'add',
      ticket: {
        subject: '  Need help  ',
        description: 'Please review this request.',
        category: 'feature_request',
        priority: 'high',
        accountId: 'account-other',
        tenantId: 'tenant-other',
        status: 'closed',
        assignedToUserId: 'attacker-selected-staff',
        watchers: ['private@example.com'],
        internalOnly: true,
        sensitiveFlag: true,
        firstResponseDueAt: '2099-01-01T00:00:00.000Z',
      },
    }))
    const json = await response.json()
    const stored = state.data['support-tickets.json'].supportTickets[0]

    expect(response.status).toBe(200)
    expect(stored).toMatchObject({
      accountId: 'account-acme',
      clientId: 'account-acme',
      tenantId: 'tenant-acme',
      subject: 'Need help',
      category: 'feature_request',
      priority: 'high',
      status: 'new',
      internalOnly: false,
    })
    expect(stored.assignedToUserId).toBe('')
    expect(stored.watchers).toEqual([])
    expect(stored.sensitiveFlag).toBe(false)
    expect(stored.firstResponseDueAt).not.toBe('2099-01-01T00:00:00.000Z')
    expect(Object.keys(json.ticket).sort()).toEqual([
      'category', 'closedAt', 'comments', 'createdAt', 'description', 'id', 'priority',
      'reopenedAt', 'resolvedAt', 'status', 'subject', 'ticketNumber', 'updatedAt',
    ])
  })

  it('projects only exact account-tenant tickets and public comment fields', async () => {
    state.data['support-tickets.json'].supportTickets = [
      ticket('owned', {
        comments: [
          { id: 'public', body: 'Visible reply', visibility: 'portal', authorType: 'staff', authorName: 'Private Staff Name', authorId: 'staff-1', createdAt: '2026-07-11T12:00:00.000Z' },
          { id: 'internal', body: 'Internal diagnosis', visibility: 'internal', authorType: 'staff', createdAt: '2026-07-11T13:00:00.000Z' },
        ],
      }),
      ticket('other-tenant', { tenantId: 'tenant-other' }),
      ticket('other-account', { accountId: 'account-other', clientId: 'account-other' }),
    ]

    const list = await (await supportRoute.GET(request('?includeClosed=true'))).json()
    const forbiddenDetail = await supportRoute.GET(request('?id=other-tenant'))

    expect(list.tickets.map(item => item.id)).toEqual(['owned'])
    expect(list.tickets[0].comments).toEqual([{ id: 'public', body: 'Visible reply', authorType: 'staff', createdAt: '2026-07-11T12:00:00.000Z' }])
    expect(list.tickets[0]).not.toHaveProperty('assignedToUserId')
    expect(list.tickets[0]).not.toHaveProperty('linkedTo')
    expect(forbiddenDetail.status).toBe(404)
  })

  it('scopes a legacy linked-account ticket only through one matching active tenant and stamps ownership on update', async () => {
    state.data['support-tickets.json'].supportTickets = [ticket('legacy', {
      accountId: undefined,
      clientId: undefined,
      tenantId: undefined,
      linkedTo: { accountId: 'account-acme' },
    })]

    const list = await (await supportRoute.GET(request('?includeClosed=true'))).json()
    const response = await supportRoute.POST(post({ action: 'comment', id: 'legacy', body: 'Legacy ticket reply' }))
    const stored = state.data['support-tickets.json'].supportTickets[0]

    expect(list.tickets.map(item => item.id)).toEqual(['legacy'])
    expect(response.status).toBe(200)
    expect(stored).toMatchObject({
      accountId: 'account-acme',
      clientId: 'account-acme',
      tenantId: 'tenant-acme',
    })
  })

  it('does not use account-only legacy fallback when the account has active leases in multiple tenants', async () => {
    state.data['leases.json'].leases.push({
      id: 'lease-other-tenant',
      clientAccountId: 'account-acme',
      tenantId: 'tenant-other',
      status: 'active',
      portalAccess: 'enabled',
    })
    state.data['support-tickets.json'].supportTickets = [
      ticket('explicit'),
      ticket('legacy', {
        accountId: undefined,
        clientId: undefined,
        tenantId: undefined,
        linkedTo: { accountId: 'account-acme' },
      }),
    ]

    const list = await (await supportRoute.GET(request('?includeClosed=true'))).json()
    const legacyDetail = await supportRoute.GET(request('?id=legacy'))

    expect(list.tickets.map(item => item.id)).toEqual(['explicit'])
    expect(legacyDetail.status).toBe(404)
  })

  it('filters, stably sorts, and paginates while preserving the full list without pagination parameters', async () => {
    state.data['support-tickets.json'].supportTickets = [
      ticket('b', { subject: 'Website launch', priority: 'high', category: 'website_issue', updatedAt: '2026-07-12T12:00:00.000Z' }),
      ticket('a', { subject: 'Website launch', priority: 'high', category: 'website_issue', updatedAt: '2026-07-12T12:00:00.000Z' }),
      ticket('c', { subject: 'Invoice question', priority: 'normal', category: 'billing_invoice', updatedAt: '2026-07-11T12:00:00.000Z' }),
    ]

    const filtered = await (await supportRoute.GET(request('?q=website&priority=high&category=website_issue&sortBy=subject&sortOrder=asc&page=1&pageSize=1'))).json()
    const all = await (await supportRoute.GET(request())).json()

    expect(filtered.tickets.map(item => item.id)).toEqual(['a'])
    expect(filtered.pagination).toEqual({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 })
    expect(filtered.meta.counts).toEqual({ all: 3, open: 3 })
    expect(all.tickets).toHaveLength(3)
    expect(all.pagination).toEqual({ page: 1, pageSize: 3, totalItems: 3, totalPages: 1 })
  })

  it('comments only on an owned ticket and returns a safe comment projection', async () => {
    state.data['support-tickets.json'].supportTickets = [ticket('owned'), ticket('other', { tenantId: 'tenant-other' })]

    const forbidden = await supportRoute.POST(post({ action: 'comment', id: 'other', body: 'Cross-tenant comment' }))
    const response = await supportRoute.POST(post({ action: 'comment', id: 'owned', body: '  Client reply  ' }))
    const json = await response.json()

    expect(forbidden.status).toBe(404)
    expect(response.status).toBe(200)
    expect(json.comment).toMatchObject({ body: 'Client reply', authorType: 'portal' })
    expect(Object.keys(json.comment).sort()).toEqual(['authorType', 'body', 'createdAt', 'id'])
  })

  it('reopens only resolved or closed owned tickets without deleting history', async () => {
    state.data['support-tickets.json'].supportTickets = [
      ticket('resolved', { status: 'resolved', resolvedAt: '2026-07-11T12:00:00.000Z' }),
      ticket('open'),
    ]

    const invalid = await supportRoute.POST(post({ action: 'reopen', id: 'open' }))
    const response = await supportRoute.POST(post({ action: 'reopen', id: 'resolved', note: 'Issue returned.' }))
    const json = await response.json()
    const stored = state.data['support-tickets.json'].supportTickets.find(item => item.id === 'resolved')

    expect(invalid.status).toBe(409)
    expect(json.ticket.status).toBe('reopened')
    expect(stored.deletedAt).toBeNull()
    expect(stored.comments.at(-1).body).toBe('Issue returned.')
  })

  it('records a close request as tracked work and exposes no hard-delete handler', async () => {
    state.data['support-tickets.json'].supportTickets = [ticket('open')]

    const response = await supportRoute.POST(post({ action: 'request-close', id: 'open', note: 'This is complete.' }))
    const json = await response.json()
    const stored = state.data['support-tickets.json'].supportTickets[0]

    expect(response.status).toBe(200)
    expect(json.ticket.status).toBe('waiting_on_farrington')
    expect(stored.deletedAt).toBeNull()
    expect(stored.comments.at(-1).body).toBe('This is complete.')
    expect(supportRoute.DELETE).toBeUndefined()
  })
})
