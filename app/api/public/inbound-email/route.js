// Resend Inbound webhook. Resend POSTs email.received events here for every
// email sent to a receiving domain (replaces ImprovMX forwarding). The event
// carries metadata only, so we fetch the body via the Receiving API, file the
// item in the owner-inbox feed, push ntfy, and forward a copy to Gmail with
// reply-to set to the original sender.
// Auth: ?token=<secret> in the webhook URL we register with Resend
// (RESEND_INBOUND_TOKEN, falls back to INBOUND_WEBHOOK_SECRET / bridge secret).
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { recordInboundItem } from '@/lib/inbound-ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request) {
  const secret = (process.env.RESEND_INBOUND_TOKEN
    || process.env.INBOUND_WEBHOOK_SECRET
    || process.env.AUTOMATION_BRIDGE_SECRET || '').trim()
  if (!secret) return false
  const url = new URL(request.url)
  return (url.searchParams.get('token') || '').trim() === secret
}

async function fetchReceivedEmail(emailId) {
  const key = process.env.RESEND_API_KEY
  if (!key || !emailId) return null
  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const body = await response.json().catch(() => null)
    return body?.data || body || null
  } catch {
    return null
  }
}


async function sendGmailCopy(message, detail) {
  const key = process.env.RESEND_API_KEY
  const to = (process.env.INBOUND_GMAIL_COPY || 'personal@example.invalid').trim()
  if (!key || !to) return
  try {
    const resend = new Resend(key)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Farrington Development <redacted@example.invalid>',
      to,
      replyTo: message.from || undefined,
      subject: `[${message.inboxLabel}] ${message.subject}`,
      html: detail?.html || undefined,
      text: detail?.text || message.body || message.snippet || message.subject,
    })
  } catch (error) {
    console.error('[inbound-email] gmail copy failed:', error?.message)
  }
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let event = {}
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (event?.type !== 'email.received') {
    return NextResponse.json({ ok: true, ignored: event?.type || 'unknown' })
  }
  const data = event.data || {}
  try {
    const detail = await fetchReceivedEmail(data.email_id)
    const recipients = [...(Array.isArray(data.to) ? data.to : []), ...(Array.isArray(data.received_for) ? data.received_for : [])]
    const result = await recordInboundItem({
      provider: 'resend',
      providerMessageId: data.email_id || data.message_id,
      kind: 'email',
      from: data.from,
      to: recipients,
      cc: Array.isArray(data.cc) ? data.cc : [],
      subject: data.subject,
      text: detail?.text || '',
      html: detail?.html || '',
      snippet: detail?.text || data.subject || '',
      receivedAt: data.created_at || event.created_at,
      allowCatchAll: true,
    })
    if (result.ok) await sendGmailCopy(result.message, detail)
    return NextResponse.json({ ok: result.ok, reason: result.reason || undefined, id: result.message?.id || undefined })
  } catch (error) {
    // Non-2xx makes Resend retry later; dedupe by email_id makes retries safe.
    console.error('[inbound-email] failed:', error?.message)
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 })
  }
}
