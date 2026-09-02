import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('../lib/dataStore', () => ({
  readData: file => store.get(file) || null,
  writeData: (file, data) => store.set(file, data),
}))

describe('support tickets', () => {
  beforeEach(() => {
    store.clear()
    vi.resetModules()
  })

  it('creates account-linked support tickets with SLA fields and audit history', async () => {
    const { createSupportTicket, listSupportTickets } = await import('../lib/supportTickets')

    const ticket = createSupportTicket({
      accountId: 'ac_wnc',
      accountName: 'WNC Times',
      subject: 'Portal login problem',
      description: 'Client cannot open the billing page.',
      category: 'access_login',
      priority: 'high',
    }, { type: 'staff', name: 'Carl' })

    expect(ticket).toMatchObject({
      accountId: 'ac_wnc',
      accountName: 'WNC Times',
      subject: 'Portal login problem',
      category: 'access_login',
      priority: 'high',
      status: 'new',
      portalVisible: true,
    })
    expect(ticket.ticketNumber).toMatch(/^SUP-\d{4}-0001$/)
    expect(ticket.firstResponseDueAt).toBeTruthy()
    expect(ticket.resolutionDueAt).toBeTruthy()

    const list = listSupportTickets({ accountId: 'ac_wnc' })
    expect(list).toHaveLength(1)
    expect(list[0].audit[0]).toMatchObject({ event: 'created', actorName: 'Carl' })
  })

  it('keeps internal comments out of the portal view', async () => {
    const { addSupportTicketComment, createSupportTicket, getSupportTicket } = await import('../lib/supportTickets')

    const ticket = createSupportTicket({
      accountId: 'ac_wnc',
      subject: 'Website image issue',
      description: 'Hero image is wrong.',
    }, { type: 'portal', name: 'client@example.com' })

    addSupportTicketComment(ticket.id, { body: 'Internal diagnosis', visibility: 'internal' }, { type: 'staff', name: 'Carl' })
    addSupportTicketComment(ticket.id, { body: 'We are checking it now.', visibility: 'portal' }, { type: 'staff', name: 'Carl' })

    const portal = getSupportTicket(ticket.id, { portal: true, portalAccountId: 'ac_wnc' })
    expect(portal.comments.map(c => c.body)).toEqual([
      'Hero image is wrong.',
      'We are checking it now.',
    ])
  })

  it('soft deletes tickets from normal lists', async () => {
    const { createSupportTicket, deleteSupportTicket, listSupportTickets } = await import('../lib/supportTickets')

    const ticket = createSupportTicket({ accountId: 'ac_1', subject: 'Close me' }, { type: 'staff', name: 'Carl' })
    deleteSupportTicket(ticket.id, { type: 'staff', name: 'Carl' })

    expect(listSupportTickets({ accountId: 'ac_1' })).toHaveLength(0)
    expect(listSupportTickets({ accountId: 'ac_1', includeDeleted: true })).toHaveLength(1)
  })
})
