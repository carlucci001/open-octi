import { NextResponse } from 'next/server'
import { deleteOwnerInboxMessages, ingestOwnerInboxMessage, listOwnerInboxMessages, loadOwnerInboxMessageDetail, ownerInboxStatus, syncNylasOwnerInbox, updateOwnerInboxMessages } from '@/lib/ownerInbox'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const inbox = searchParams.get('inbox') || 'all'
  const includeArchived = searchParams.get('archived') === '1'
  return NextResponse.json({
    ok: true,
    status: ownerInboxStatus(),
    ...listOwnerInboxMessages({ inbox, includeArchived }),
  })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))

  if (body.action === 'sync_nylas') {
    const result = await syncNylasOwnerInbox({ limit: body.limit || 25 })
    return NextResponse.json({ ok: result.ok !== false, status: ownerInboxStatus(), result, ...listOwnerInboxMessages({ inbox: body.inbox || 'all' }) })
  }

  if (body.action === 'archive') {
    const data = updateOwnerInboxMessages(body.ids || body.id, { archived: true, unread: false })
    return NextResponse.json({ ok: true, status: ownerInboxStatus(), ...data })
  }

  if (body.action === 'delete') {
    const data = deleteOwnerInboxMessages(body.ids || body.id)
    return NextResponse.json({ ok: true, status: ownerInboxStatus(), ...listOwnerInboxMessages({ inbox: body.inbox || 'all' }), raw: data.lastUpdated })
  }

  if (body.action === 'load_detail') {
    const result = await loadOwnerInboxMessageDetail(body.id)
    return NextResponse.json({ ok: result.ok, status: ownerInboxStatus(), result, ...listOwnerInboxMessages({ inbox: body.inbox || 'all', includeArchived: true }) })
  }

  if (body.action === 'mark_read') {
    const data = updateOwnerInboxMessages(body.ids || body.id, { unread: false })
    return NextResponse.json({ ok: true, status: ownerInboxStatus(), ...data })
  }

  if (body.action === 'mark_handled') {
    const data = updateOwnerInboxMessages(body.ids || body.id, { handled: true, handledAt: new Date().toISOString(), unread: false })
    return NextResponse.json({ ok: true, status: ownerInboxStatus(), ...data })
  }

  if (body.action === 'mark_unhandled') {
    const data = updateOwnerInboxMessages(body.ids || body.id, { handled: false, handledAt: null })
    return NextResponse.json({ ok: true, status: ownerInboxStatus(), ...data })
  }

  if (body.action === 'ingest') {
    const result = ingestOwnerInboxMessage(body.message || body)
    return NextResponse.json({ ok: result.ok, status: ownerInboxStatus(), result, ...listOwnerInboxMessages({ inbox: body.inbox || 'all' }) })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
