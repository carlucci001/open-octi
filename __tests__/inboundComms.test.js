import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('../lib/dataStore', () => ({
  readData: file => store.get(file) || null,
  writeData: (file, data) => store.set(file, data),
}))

describe('inbound comms unification', () => {
  beforeEach(() => {
    store.clear()
    vi.resetModules()
  })

  it('routes a website form inquiry to the Gorilla Skills inbox with kind + handled tracking', async () => {
    const { ingestOwnerInboxMessage, listOwnerInboxMessages } = await import('../lib/ownerInbox')

    const result = ingestOwnerInboxMessage({
      provider: 'form:gorillaskills.com',
      providerMessageId: 'form_1',
      kind: 'form',
      from: 'Jane Doe <jane@example.com>',
      to: ['redacted@example.invalid'],
      subject: 'Website inquiry from Jane Doe',
      body: 'Interested in a quote for your CRM automation build.',
      phone: '+18285551234',
      receivedAt: '2026-07-24T12:00:00.000Z',
      allowCatchAll: true,
    })

    expect(result.ok).toBe(true)
    expect(result.message).toMatchObject({
      inboxId: 'gorillaskills',
      kind: 'form',
      handled: false,
      phone: '+18285551234',
    })
    const inbox = listOwnerInboxMessages({ inbox: 'gorillaskills' })
    expect(inbox.messages).toHaveLength(1)
  })

  it('records an inbound Twilio call into the catch-all with keepSpam', async () => {
    const { ingestOwnerInboxMessage } = await import('../lib/ownerInbox')

    const result = ingestOwnerInboxMessage({
      provider: 'twilio',
      providerMessageId: 'CA123',
      kind: 'call',
      from: '+18285559999',
      to: ['+18285550000'],
      subject: 'Inbound call from +18285559999',
      body: 'Status: completed, 45s',
      allowCatchAll: true,
      keepSpam: true,
    })

    expect(result.ok).toBe(true)
    expect(result.message.kind).toBe('call')
    expect(result.message.inboxId).toBe('owner-catchall')
  })

  it('preserves handled state when the same provider message is re-ingested', async () => {
    const { ingestOwnerInboxMessage, updateOwnerInboxMessages, listOwnerInboxMessages } = await import('../lib/ownerInbox')

    const first = ingestOwnerInboxMessage({
      provider: 'resend',
      providerMessageId: 'em_1',
      from: 'client@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Project proposal question',
      body: 'Following up on the proposal pricing.',
      allowCatchAll: true,
    })
    expect(first.ok).toBe(true)
    updateOwnerInboxMessages([first.message.id], { handled: true, handledAt: '2026-07-24T13:00:00.000Z' })

    const again = ingestOwnerInboxMessage({
      provider: 'resend',
      providerMessageId: 'em_1',
      from: 'client@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Project proposal question',
      body: 'Following up on the proposal pricing.',
      allowCatchAll: true,
    })
    expect(again.ok).toBe(true)
    const inbox = listOwnerInboxMessages({ inbox: 'farringtondevelopment' })
    expect(inbox.messages).toHaveLength(1)
    expect(inbox.messages[0].handled).toBe(true)
  })

  it('lists only unhandled items older than the digest window', async () => {
    const { ingestOwnerInboxMessage, updateOwnerInboxMessages, listUnhandledOwnerInboxMessages } = await import('../lib/ownerInbox')

    const old = ingestOwnerInboxMessage({
      provider: 'resend', providerMessageId: 'em_old',
      from: 'a@example.com', to: ['redacted@example.invalid'],
      subject: 'Old inquiry about a project quote', body: 'Still waiting on pricing.',
      receivedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), allowCatchAll: true,
    })
    ingestOwnerInboxMessage({
      provider: 'resend', providerMessageId: 'em_fresh',
      from: 'b@example.com', to: ['redacted@example.invalid'],
      subject: 'Fresh inquiry about a demo call', body: 'Can we meet?',
      receivedAt: new Date().toISOString(), allowCatchAll: true,
    })
    const handled = ingestOwnerInboxMessage({
      provider: 'resend', providerMessageId: 'em_done',
      from: 'c@example.com', to: ['redacted@example.invalid'],
      subject: 'Handled inquiry about support help', body: 'Resolved already.',
      receivedAt: new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString(), allowCatchAll: true,
    })
    updateOwnerInboxMessages([handled.message.id], { handled: true })

    const stale = listUnhandledOwnerInboxMessages({ olderThanHours: 24 })
    expect(stale.map(m => m.id)).toEqual([old.message.id])
  })

  it('includes the two new company inboxes', async () => {
    const { OWNER_INBOXES } = await import('../lib/ownerInbox')
    const ids = OWNER_INBOXES.map(inbox => inbox.id)
    expect(ids).toContain('gorillaskills')
    expect(ids).toContain('trysafehouse')
  })
})
