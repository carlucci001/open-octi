import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('../lib/dataStore', () => ({
  readData: file => store.get(file) || null,
  writeData: (file, data) => store.set(file, data),
}))

describe('owner inbox', () => {
  beforeEach(() => {
    store.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('captures legitimate opportunity email for monitored domains', async () => {
    const { ingestOwnerInboxMessage, listOwnerInboxMessages } = await import('../lib/ownerInbox')

    const result = ingestOwnerInboxMessage({
      provider: 'nylas',
      providerMessageId: 'msg_1',
      from: 'buyer@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Need a CRM demo and pricing',
      snippet: 'Can we schedule a call about your automation CRM?',
      receivedAt: '2026-06-24T12:00:00.000Z',
    })

    expect(result.ok).toBe(true)
    const inbox = listOwnerInboxMessages({ inbox: 'farringtondevelopment' })
    expect(inbox.messages).toHaveLength(1)
    expect(inbox.messages[0]).toMatchObject({
      inboxId: 'farringtondevelopment',
      inboxLabel: 'Farrington Development',
      domain: 'farringtondevelopment.com',
    })
    expect(inbox.messages[0].classification.category).toBe('opportunity')
  })

  it('filters obvious spam before it reaches the owner inbox', async () => {
    const { ingestOwnerInboxMessage, listOwnerInboxMessages } = await import('../lib/ownerInbox')

    const result = ingestOwnerInboxMessage({
      provider: 'nylas',
      providerMessageId: 'msg_2',
      from: 'spam@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Casino winner prize',
      snippet: 'Limited time offer with crypto lottery winner prize.',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('spam_filtered')
    expect(listOwnerInboxMessages({ inbox: 'all' }).messages).toHaveLength(0)
  })

  it('deduplicates provider messages while preserving archive state', async () => {
    const { ingestOwnerInboxMessage, listOwnerInboxMessages, updateOwnerInboxMessages } = await import('../lib/ownerInbox')

    ingestOwnerInboxMessage({
      provider: 'nylas',
      providerMessageId: 'msg_3',
      from: 'editor@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Website support',
      snippet: 'I need help with an article page.',
    })
    updateOwnerInboxMessages(['nylas:msg_3'], { archived: true })
    ingestOwnerInboxMessage({
      provider: 'nylas',
      providerMessageId: 'msg_3',
      from: 'editor@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Website support updated',
      snippet: 'Same thread, extra details.',
    })

    const withArchived = listOwnerInboxMessages({ inbox: 'wnctimes', includeArchived: true })
    expect(withArchived.messages).toHaveLength(1)
    expect(withArchived.messages[0].subject).toBe('Website support updated')
    expect(withArchived.messages[0].archived).toBe(true)
  })

  it('can import legitimate Nylas messages into the owner catch-all when forwarding hides the original domain', async () => {
    const { ingestOwnerInboxMessage, listOwnerInboxMessages } = await import('../lib/ownerInbox')

    const result = ingestOwnerInboxMessage({
      provider: 'nylas',
      providerMessageId: 'msg_4',
      from: 'carl@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Test email for Carl',
      snippet: 'This is a real test message for the command center inbox.',
      allowCatchAll: true,
    })

    expect(result.ok).toBe(true)
    expect(result.message).toMatchObject({
      inboxId: 'owner-catchall',
      inboxLabel: 'Owner Catch-all',
      catchAll: true,
    })
    expect(listOwnerInboxMessages({ inbox: 'all' }).messages).toHaveLength(1)
  })

  it('deletes junk from normal owner inbox views', async () => {
    const { deleteOwnerInboxMessages, ingestOwnerInboxMessage, listOwnerInboxMessages } = await import('../lib/ownerInbox')

    const result = ingestOwnerInboxMessage({
      provider: 'nylas',
      providerMessageId: 'msg_5',
      from: 'junk@example.com',
      to: ['redacted@example.invalid'],
      subject: 'Random newsletter',
      snippet: 'Not needed.',
      allowCatchAll: true,
    })

    deleteOwnerInboxMessages([result.message.id])

    expect(listOwnerInboxMessages({ inbox: 'all' }).messages).toHaveLength(0)
    expect(listOwnerInboxMessages({ inbox: 'all', includeDeleted: true }).messages[0]).toMatchObject({
      deleted: true,
      archived: false,
      unread: false,
    })
  })

  it('does not report a failed Nylas scan as a successful sync', async () => {
    vi.stubEnv('NYLAS_API_KEY', 'nylas_test_key')
    vi.stubEnv('NYLAS_GRANT_ID', 'grant_1')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    const { listOwnerInboxMessages, syncNylasOwnerInbox } = await import('../lib/ownerInbox')

    const result = await syncNylasOwnerInbox({ limit: 25 })

    expect(result).toMatchObject({ ok: false, error: 'All Nylas mailbox scans failed' })
    expect(listOwnerInboxMessages().lastSyncAt).toBeNull()
  })
})
