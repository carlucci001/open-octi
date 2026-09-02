import { NextResponse } from 'next/server'
import { getCurrentUser, updateCurrentUserProfile } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, user })
}

export async function PUT(request) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  try {
    const updated = await updateCurrentUserProfile(user.id, body)
    logAuditEvent({
      request,
      user,
      action: body?.newPassword ? 'account_password_updated' : 'account_profile_updated',
      area: 'users',
      severity: body?.newPassword ? 'warn' : 'info',
      targetId: user.id,
      targetName: user.username,
      meta: { changed: Object.keys(body || {}).filter(k => !/password/i.test(k)) },
    })
    return NextResponse.json({ ok: true, user: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 })
  }
}
