// Universal inbound intake for website contact forms and generic events.
// Sites POST here BEFORE sending any email, so every inquiry lands in the
// Command Center inbound feed even if downstream email delivery fails.
// Auth: x-inbound-secret header (INBOUND_WEBHOOK_SECRET, falls back to
// AUTOMATION_BRIDGE_SECRET so prod works without a new env var).
import { NextResponse } from 'next/server'
import { recordInboundItem } from '@/lib/inbound-ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request) {
  const secret = (process.env.INBOUND_WEBHOOK_SECRET || process.env.AUTOMATION_BRIDGE_SECRET || '').trim()
  if (!secret) return false
  const provided = (request.headers.get('x-inbound-secret') || '').trim()
  return Boolean(provided) && provided === secret
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const kind = ['form', 'email', 'call', 'sms'].includes(body.kind) ? body.kind : 'form'
  const site = String(body.site || '').trim().toLowerCase()
  const contactEmail = String(body.email || '').trim()
  const name = String(body.name || '').trim()
  const from = contactEmail && name ? `${name} <${contactEmail}>` : (contactEmail || name || 'unknown')

  const lines = []
  if (body.message) lines.push(String(body.message))
  if (body.phone) lines.push(`Phone: ${String(body.phone).trim()}`)
  if (body.page) lines.push(`Page: ${String(body.page).trim()}`)

  const result = await recordInboundItem({
    provider: site ? `form:${site}` : 'form',
    providerMessageId: String(body.externalId || '').trim()
      || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    inboxId: String(body.inboxId || '').trim() || undefined,
    from,
    to: site.includes('.') ? [`info@${site}`] : [],
    subject: String(body.subject || '').trim()
      || `Website inquiry${name ? ` from ${name}` : ''}${site ? ` (${site})` : ''}`,
    body: lines.join('\n\n'),
    phone: String(body.phone || '').trim() || undefined,
    allowCatchAll: true,
    receivedAt: new Date().toISOString(),
  })

  if (!result.ok) {
    // Spam-filtered or unroutable — acknowledge so form clients don't retry.
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 })
  }
  return NextResponse.json({ ok: true, id: result.message.id })
}
