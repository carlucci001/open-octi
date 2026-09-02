import { NextResponse } from 'next/server'
import { findUserById, updateUser, deleteUser } from '@/lib/auth'
import { requireUserManagement } from '@/lib/permissions'
import { isOwner } from '@/lib/roles'
import { logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const { error } = await requireUserManagement(request)
  if (error) return error
  const u = findUserById(params.id)
  if (!u) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, user: { ...u, passwordHash: undefined } })
}

export async function PUT(request, { params }) {
  const { error, user: caller } = await requireUserManagement(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  if (body?.role === 'owner' && !isOwner(caller)) return NextResponse.json({ ok: false, error: 'owner only' }, { status: 403 })
  try {
    const updated = await updateUser(params.id, body)
    if (!updated) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    logAuditEvent({
      request,
      user: caller,
      action: 'user_updated',
      area: 'users',
      severity: body?.role === 'admin' || body?.suspended !== undefined || body?.password ? 'warn' : 'info',
      targetId: updated.id,
      targetName: updated.username,
      meta: { changed: Object.keys(body || {}).filter(k => k !== 'password' && k !== 'passwordHash') },
    })
    return NextResponse.json({ ok: true, user: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 })
  }
}

export async function DELETE(request, { params }) {
  const { error, user: caller } = await requireUserManagement(request)
  if (error) return error
  if (caller.id === params.id) return NextResponse.json({ ok: false, error: 'cannot delete yourself' }, { status: 400 })
  try {
    const ok = deleteUser(params.id)
    if (!ok) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    logAuditEvent({ request, user: caller, action: 'user_deleted', area: 'users', severity: 'warn', targetId: params.id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 })
  }
}
