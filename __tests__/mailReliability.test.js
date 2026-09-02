import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ownerInbox = vi.hoisted(() => ({
  list: vi.fn(),
  loadDetail: vi.fn(),
  sync: vi.fn(),
}))

const resend = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@/lib/ownerInbox', () => ({
  listOwnerInboxMessages: ownerInbox.list,
  loadOwnerInboxMessageDetail: ownerInbox.loadDetail,
  syncNylasOwnerInbox: ownerInbox.sync,
}))

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: resend.send }
    }
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  ownerInbox.list.mockReturnValue({ lastSyncAt: new Date().toISOString(), messages: [] })
  ownerInbox.sync.mockResolvedValue({ ok: true, imported: 0, scanned: 0 })
  resend.send.mockResolvedValue({ data: { id: 'sent_1' }, error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('mail reliability', () => {
  it('uses the current Resend receiving endpoint and merges Nylas owner mail', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_mail_reliability')
    const receivedAt = '2026-08-31T00:03:30.000Z'
    ownerInbox.list.mockReturnValue({
      lastSyncAt: new Date().toISOString(),
      messages: [{
        id: 'nylas:reply_1',
        kind: 'email',
        provider: 'nylas',
        providerMessageId: 'reply_1',
        from: 'redacted@example.invalid',
        to: ['redacted@example.invalid'],
        subject: 'Re: Podcast and other elements',
        receivedAt,
        unread: true,
      }],
    })
    const fetchMock = vi.fn(async () => ({ json: async () => ({ object: 'list', data: [], has_more: false }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { GET } = await import('../app/api/comms/route.js')

    const response = await GET(new Request('https://openocti.local/api/comms?action=list_received'))
    const body = await response.json()

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails/receiving')
    expect(body.data).toEqual([expect.objectContaining({
      id: 'nylas:reply_1',
      created_at: receivedAt,
      last_event: 'received_unread',
    })])
  })

  it('keeps calls and texts out of email while deduplicating stored Resend mail', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_mail_reliability')
    ownerInbox.list.mockReturnValue({
      lastSyncAt: new Date().toISOString(),
      messages: [
        { id: 'twilio:CA123', kind: 'call', provider: 'twilio', providerMessageId: 'CA123', subject: 'Inbound call from client:carl', receivedAt: '2026-08-31T12:00:00.000Z' },
        { id: 'twilio:SM123', kind: 'sms', provider: 'twilio', providerMessageId: 'SM123', subject: 'Inbound text', receivedAt: '2026-08-31T11:00:00.000Z' },
        { id: 'resend:inbound_1', kind: 'email', provider: 'resend', providerMessageId: 'inbound_1', subject: 'Stored copy', receivedAt: '2026-08-31T10:00:00.000Z' },
      ],
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ object: 'list', data: [{ id: 'inbound_1', subject: 'Provider copy', created_at: '2026-08-31T10:00:00.000Z' }], has_more: false }) })))
    const { GET } = await import('../app/api/comms/route.js')

    const response = await GET(new Request('https://openocti.local/api/comms?action=list_received'))
    const body = await response.json()

    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ id: 'inbound_1', subject: 'Provider copy' })
    expect(body.data.some(message => message.kind === 'call' || message.kind === 'sms')).toBe(false)
  })

  it('loads Nylas message detail through the received-mail route', async () => {
    ownerInbox.loadDetail.mockResolvedValue({
      ok: true,
      message: { id: 'nylas:reply_1', receivedAt: '2026-08-31T00:03:30.000Z', body: 'Two more links', unread: false },
    })
    const { GET } = await import('../app/api/comms/route.js')

    const response = await GET(new Request('https://openocti.local/api/comms?action=get_received&id=nylas%3Areply_1'))
    const body = await response.json()

    expect(ownerInbox.loadDetail).toHaveBeenCalledWith('nylas:reply_1')
    expect(body).toMatchObject({ id: 'nylas:reply_1', body: 'Two more links', last_event: 'received' })
  })

  it('sets a real Resend SDK replyTo address for account email', async () => {
    vi.stubEnv('CONCIERGE_TOOL_SECRET', 'test-mail-secret')
    vi.stubEnv('RESEND_API_KEY', 're_test_mail_reliability')
    const { POST } = await import('../app/api/tools/send-email/route.js')
    const response = await POST(new Request('https://openocti.local/api/tools/send-email', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-mail-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'client@example.com', subject: 'Follow up', body: 'Hello' }),
    }))

    expect(response.status).toBe(200)
    expect(resend.send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['client@example.com'],
      replyTo: 'redacted@example.invalid',
    }))
    expect(resend.send.mock.calls[0][0]).not.toHaveProperty('reply_to')
  })

  it('does not pass raw API reply_to fields to the Resend SDK', () => {
    const routeFiles = [
      'app/api/agent/execute/route.js',
      'app/api/agent-widget/handoff/route.js',
      'app/api/calendar/send-meet-link/route.js',
      'app/api/concierge/send-email/route.js',
      'app/api/documents/route.js',
      'app/api/invoices/route.js',
      'app/api/products/inquiry/route.js',
      'app/api/tools/send-email/route.js',
      'app/api/video/invite/route.js',
    ]

    for (const routeFile of routeFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), routeFile), 'utf8')
      expect(source, routeFile).not.toContain('reply_to:')
    }
  })

  it('exposes the repaired inbox in the active Communications workspace', () => {
    const phoneSource = fs.readFileSync(path.join(process.cwd(), 'app/phone/Phone.js'), 'utf8')
    const inboxSource = fs.readFileSync(path.join(process.cwd(), 'app/comms/CommsInbox.js'), 'utf8')

    expect(phoneSource).toContain("{ id: 'email', label: 'Email', Icon: Mail }")
    expect(phoneSource).toContain("{view === 'email' && <CommsInbox />}")
    expect(inboxSource).toContain("useState('received')")
  })
})
