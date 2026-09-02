import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  secret: 'fake_webhook_secret',
  processed: new Set(),
  ingestError: null,
  leadCalls: 0,
  signatureValid: true,
}))

const recordEvent = vi.hoisted(() => vi.fn())
const markProcessed = vi.hoisted(() => vi.fn(eventId => state.processed.add(eventId)))

vi.mock('../lib/agent-creds', () => ({
  getCred: vi.fn(() => state.secret ? { fields: [{ label: 'Signing Secret', value: state.secret }] } : null),
}))

vi.mock('../lib/auditLog', () => ({ logAuditEvent: vi.fn() }))

vi.mock('../lib/myvtc/webhook', () => ({
  verifyMyvtcSignature: vi.fn(() => state.signatureValid),
  hasProcessed: vi.fn(eventId => state.processed.has(eventId)),
  recordEvent,
  markProcessed,
  ingestContact: vi.fn(async () => {
    state.leadCalls += 1
    if (state.ingestError) throw state.ingestError
    return { leadId: 'lead_1' }
  }),
}))

import { POST } from '../app/api/integrations/myvtc/webhook/route'

function webhookRequest(body, eventId = 'evt_1') {
  return new NextRequest('https://openocti.local/api/integrations/myvtc/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-myvtc-signature': 't=1,v1=fake',
      'x-myvtc-event-id': eventId,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function event(id = 'evt_1') {
  return { id, type: 'contact.received', createdAt: '2026-08-30T12:00:00.000Z', data: { type: 'contact.received', contactId: 'contact-1' } }
}

beforeEach(() => {
  state.secret = 'fake_webhook_secret'
  state.processed = new Set()
  state.ingestError = null
  state.leadCalls = 0
  state.signatureValid = true
  recordEvent.mockClear()
  markProcessed.mockClear()
})

describe('MyVTC webhook route', () => {
  it('returns 503 when the signing secret is missing', async () => {
    state.secret = ''
    const response = await POST(webhookRequest(event()))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'NOT_CONFIGURED' })
    expect(state.leadCalls).toBe(0)
  })

  it('returns 401 for a bad signature', async () => {
    state.signatureValid = false
    const response = await POST(webhookRequest(event()))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'INVALID_SIGNATURE' })
    expect(state.leadCalls).toBe(0)
  })

  it('processes a repeated event id exactly once', async () => {
    const first = await POST(webhookRequest(event()))
    const second = await POST(webhookRequest(event()))

    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ ok: true, leadId: 'lead_1' })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ ok: true, duplicate: true })
    expect(state.leadCalls).toBe(1)
    expect(markProcessed).toHaveBeenCalledTimes(1)
  })

  it('returns 502 and does not mark the event processed when the MyVTC lookup fails', async () => {
    state.ingestError = new Error('network failure')
    const response = await POST(webhookRequest(event()))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'UPSTREAM_ERROR' })
    expect(markProcessed).not.toHaveBeenCalled()
    expect(state.processed.size).toBe(0)
    expect(recordEvent).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'evt_1', outcome: 'retry' }))
  })

  it('rejects invalid JSON after signature verification', async () => {
    const response = await POST(webhookRequest('{bad json'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_JSON' })
  })
})
