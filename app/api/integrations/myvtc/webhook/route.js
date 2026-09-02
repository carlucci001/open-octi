import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { logAuditEvent } from '@/lib/auditLog'
import {
  hasProcessed,
  ingestContact,
  markProcessed,
  recordEvent,
  verifyMyvtcSignature,
} from '@/lib/myvtc/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function webhookSecret() {
  const credential = getCred('MyVTC Webhook')
  const field = credential?.fields?.find(item => /^signing secret$/i.test(String(item?.label || '').trim()))
  return String(field?.value || '').trim()
}

function jsonError(error, status) {
  return NextResponse.json({ error }, { status })
}

export async function POST(request) {
  const rawBody = await request.text()
  const secret = webhookSecret()
  if (!secret) return jsonError('NOT_CONFIGURED', 503)

  const signature = request.headers.get('x-myvtc-signature') || ''
  if (!verifyMyvtcSignature(secret, rawBody, signature)) return jsonError('INVALID_SIGNATURE', 401)

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return jsonError('INVALID_JSON', 400)
  }

  const eventId = String(event?.id || '').trim()
  const eventType = String(event?.type || event?.data?.type || '').trim()
  const headerEventId = String(request.headers.get('x-myvtc-event-id') || '').trim()
  if (!eventId || !eventType || (headerEventId && headerEventId !== eventId)) {
    return jsonError('INVALID_EVENT', 400)
  }
  if (hasProcessed(eventId)) return NextResponse.json({ ok: true, duplicate: true })

  const receivedAt = new Date().toISOString()
  recordEvent({ id: eventId, type: eventType, receivedAt, outcome: 'received' })

  if (eventType !== 'contact.received') {
    markProcessed(eventId, { outcome: 'ignored' })
    logAuditEvent({
      request,
      action: 'myvtc_webhook_ignored',
      area: 'integrations',
      targetId: eventId,
      meta: { eventType, outcome: 'ignored' },
    })
    return NextResponse.json({ ok: true, ignored: true })
  }

  const contactId = String(event?.data?.contactId || '').trim()
  if (!contactId) {
    recordEvent({ id: eventId, type: eventType, outcome: 'invalid' })
    return jsonError('INVALID_EVENT', 400)
  }

  try {
    const result = await ingestContact(contactId)
    markProcessed(eventId, {
      outcome: result.skipped ? 'duplicate_contact' : 'lead_created',
      leadId: result.leadId,
    })
    logAuditEvent({
      request,
      action: 'myvtc_contact_received',
      area: 'integrations',
      targetId: eventId,
      meta: { eventType, outcome: result.skipped ? 'duplicate_contact' : 'lead_created', leadId: result.leadId || '' },
    })
    return NextResponse.json({ ok: true, ...(result.leadId ? { leadId: result.leadId } : { skipped: true }) })
  } catch {
    recordEvent({ id: eventId, type: eventType, outcome: 'retry' })
    return jsonError('UPSTREAM_ERROR', 502)
  }
}
