import { NextResponse } from 'next/server'
import {
  listNotifications,
  unreadCount,
  pushNotification,
  markRead,
  markAllRead,
  dismiss,
  clearAll,
} from '@/lib/notifications'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const includeDismissed = url.searchParams.get('all') === '1'
  const list = listNotifications({ includeDismissed })
  return NextResponse.json({ ok: true, notifications: list, unread: list.filter(n => !n.read).length })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  if (!String(body?.title || '').trim()) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'title required' })
  }
  const n = pushNotification(body || {})
  if (!n) return NextResponse.json({ ok: true, ignored: true })
  return NextResponse.json({ ok: true, notification: n })
}

export async function PATCH(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const action = body?.action

  if (action === 'read') {
    if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    markRead(body.id)
  } else if (action === 'read-all') {
    markAllRead()
  } else if (action === 'dismiss') {
    if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    dismiss(body.id)
  } else if (action === 'clear') {
    clearAll()
  } else {
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  }
  return NextResponse.json({ ok: true, unread: unreadCount() })
}
