import { NextResponse } from 'next/server'
import { clearSessionCookie, getCurrentUser, touchUser } from '@/lib/auth'
import { getNetworkMode } from '@/lib/networkMode'
import { isOwner } from '@/lib/roles'
import { avatarRef } from '@/lib/avatars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const u = await getCurrentUser(request)
  if (!u) return NextResponse.json({ ok: false }, { status: 401 })
  if (!isOwner(u) && getNetworkMode() === 'solo') {
    const res = NextResponse.json({ ok: false, error: 'solo mode active' }, { status: 403 })
    res.headers.set('Set-Cookie', clearSessionCookie())
    return res
  }
  if (request.headers.get('x-fcc-auth-gate') !== 'middleware') touchUser(u.id)
  return NextResponse.json({ ok: true, user: { id: u.id, username: u.username, displayName: u.displayName, role: u.role, email: u.email, location: u.location, avatarUrl: avatarRef(u) } })
}
