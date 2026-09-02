import { NextResponse } from 'next/server'
import { listOwnerInboxMessages, loadOwnerInboxMessageDetail, syncNylasOwnerInbox } from '@/lib/ownerInbox'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const BASE = 'https://api.resend.com'
const OWNER_INBOX_SYNC_MAX_AGE_MS = 60_000

function ownerMessageForComms(message) {
  return {
    ...message,
    created_at: message.receivedAt || message.createdAt,
    last_event: message.unread ? 'received_unread' : 'received',
    _source: 'owner-inbox',
  }
}

function messageIdentity(message) {
  const provider = message.provider || (message._source === 'resend' ? 'resend' : '')
  const rawId = String(message.providerMessageId || message.id || '')
  const providerId = provider && rawId.startsWith(`${provider}:`) ? rawId.slice(provider.length + 1) : rawId
  return provider ? `${provider}:${providerId}` : rawId
}

function recentEnough(lastSyncAt) {
  const syncedAt = Date.parse(lastSyncAt || '')
  return Number.isFinite(syncedAt) && Date.now() - syncedAt < OWNER_INBOX_SYNC_MAX_AGE_MS
}

async function ownerInboxSnapshot() {
  let snapshot = listOwnerInboxMessages({ inbox: 'all' })
  let sync = null
  if (!recentEnough(snapshot.lastSyncAt)) {
    try {
      sync = await syncNylasOwnerInbox({ limit: 50 })
    } catch (error) {
      sync = { ok: false, error: error.message || 'Nylas inbox sync failed' }
    }
    snapshot = listOwnerInboxMessages({ inbox: 'all' })
  }
  return { snapshot, sync }
}

async function resendFetch(path, options = {}) {
  if (!RESEND_API_KEY) return { error: 'RESEND_API_KEY not configured' }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res.json()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list_emails'

  // Sent emails — paginated
  if (action === 'list_emails') {
    const after = searchParams.get('after') || ''
    const before = searchParams.get('before') || ''
    let qs = ''
    if (after) qs += `&after=${after}`
    if (before) qs += `&before=${before}`
    const data = await resendFetch(`/emails${qs ? '?' + qs.slice(1) : ''}`)
    return NextResponse.json(data)
  }

  // Get single email detail
  if (action === 'get_email') {
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const data = await resendFetch(`/emails/${id}`)
    return NextResponse.json(data)
  }

  // Received (inbound) emails
  if (action === 'list_received') {
    const after = searchParams.get('after') || ''
    const before = searchParams.get('before') || ''
    let qs = ''
    if (after) qs += `&after=${after}`
    if (before) qs += `&before=${before}`
    const [resendData, owner] = await Promise.all([
      resendFetch(`/emails/receiving${qs ? '?' + qs.slice(1) : ''}`),
      ownerInboxSnapshot(),
    ])
    const received = Array.isArray(resendData?.data) ? resendData.data.map(message => ({ ...message, _source: 'resend' })) : []
    const ownerMessages = owner.snapshot.messages
      .filter(message => message.kind === 'email')
      .map(ownerMessageForComms)
    const messages = [...received, ...ownerMessages]
      .filter((message, index, all) => all.findIndex(item => messageIdentity(item) === messageIdentity(message)) === index)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    const warnings = []
    if (resendData?.error) warnings.push(`Resend inbound: ${resendData.error}`)
    if (owner.sync?.ok === false) warnings.push(`Mailbox sync: ${owner.sync.error || 'failed'}`)
    return NextResponse.json({
      object: 'list',
      has_more: Boolean(resendData?.has_more),
      data: messages,
      warnings,
      mailbox: { lastSyncAt: owner.snapshot.lastSyncAt, synced: owner.sync },
    })
  }

  if (action === 'get_received') {
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    if (id.startsWith('nylas:')) {
      const result = await loadOwnerInboxMessageDetail(id)
      if (!result.ok) return NextResponse.json({ error: result.error || 'Unable to load mailbox message' }, { status: 502 })
      return NextResponse.json(ownerMessageForComms(result.message))
    }
    const resendId = id.startsWith('resend:') ? id.slice('resend:'.length) : id
    const data = await resendFetch(`/emails/receiving/${encodeURIComponent(resendId)}`)
    return NextResponse.json(data)
  }

  // Attachments
  if (action === 'list_attachments') {
    const emailId = searchParams.get('emailId')
    const received = searchParams.get('received') === 'true'
    const path = received ? `/emails/receiving/${encodeURIComponent(emailId)}/attachments` : `/emails/${encodeURIComponent(emailId)}/attachments`
    const data = await resendFetch(path)
    return NextResponse.json(data)
  }

  if (action === 'get_attachment') {
    const emailId = searchParams.get('emailId')
    const attachId = searchParams.get('attachId')
    const received = searchParams.get('received') === 'true'
    const path = received
      ? `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachId)}`
      : `/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachId)}`
    const data = await resendFetch(path)
    return NextResponse.json(data)
  }

  // Domains
  if (action === 'domains') {
    const data = await resendFetch('/domains')
    return NextResponse.json(data)
  }

  // API keys
  if (action === 'api_keys') {
    const data = await resendFetch('/api-keys')
    return NextResponse.json(data)
  }

  // Contacts
  if (action === 'list_contacts') {
    const audienceId = searchParams.get('audienceId')
    if (!audienceId) return NextResponse.json({ error: 'Missing audienceId' }, { status: 400 })
    const data = await resendFetch(`/audiences/${audienceId}/contacts`)
    return NextResponse.json(data)
  }

  // Audiences
  if (action === 'list_audiences') {
    const data = await resendFetch('/audiences')
    return NextResponse.json(data)
  }

  // Broadcasts
  if (action === 'list_broadcasts') {
    const data = await resendFetch('/broadcasts')
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(request) {
  const body = await request.json()

  // Send email (with scheduling support)
  if (body.action === 'send') {
    const payload = {
      from: body.from || 'Newsroom AIOS <redacted@example.invalid>',
      to: Array.isArray(body.to) ? body.to : [body.to],
      subject: body.subject,
      html: body.html || undefined,
      text: body.text || undefined,
      reply_to: body.replyTo || undefined,
      bcc: body.bcc ? (Array.isArray(body.bcc) ? body.bcc : [body.bcc]) : undefined,
      cc: body.cc ? (Array.isArray(body.cc) ? body.cc : [body.cc]) : undefined,
      scheduled_at: body.scheduledAt || undefined,
      tags: body.tags || undefined,
    }
    const data = await resendFetch('/emails', { method: 'POST', body: JSON.stringify(payload) })
    return NextResponse.json(data)
  }

  // Cancel scheduled email
  if (body.action === 'cancel') {
    const data = await resendFetch(`/emails/${body.id}/cancel`, { method: 'POST' })
    return NextResponse.json(data)
  }

  // Update/reschedule email
  if (body.action === 'update') {
    const payload = {}
    if (body.scheduledAt) payload.scheduled_at = body.scheduledAt
    const data = await resendFetch(`/emails/${body.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    return NextResponse.json(data)
  }

  // Send batch
  if (body.action === 'send_batch') {
    const data = await resendFetch('/emails/batch', { method: 'POST', body: JSON.stringify(body.emails) })
    return NextResponse.json(data)
  }

  // Create broadcast
  if (body.action === 'create_broadcast') {
    const data = await resendFetch('/broadcasts', { method: 'POST', body: JSON.stringify(body.broadcast) })
    return NextResponse.json(data)
  }

  // Send broadcast
  if (body.action === 'send_broadcast') {
    const data = await resendFetch(`/broadcasts/${body.id}/send`, { method: 'POST' })
    return NextResponse.json(data)
  }

  // Create contact
  if (body.action === 'create_contact') {
    const data = await resendFetch(`/audiences/${body.audienceId}/contacts`, { method: 'POST', body: JSON.stringify(body.contact) })
    return NextResponse.json(data)
  }

  // Delete contact
  if (body.action === 'delete_contact') {
    const data = await resendFetch(`/audiences/${body.audienceId}/contacts/${body.contactId}`, { method: 'DELETE' })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const id = searchParams.get('id')

  if (action === 'delete_domain') {
    const data = await resendFetch(`/domains/${id}`, { method: 'DELETE' })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
