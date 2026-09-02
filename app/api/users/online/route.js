import { NextResponse } from 'next/server'
import { getCurrentUser, listUsers } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONLINE_WINDOW_MS = 90 * 1000

export async function GET(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const all = listUsers()
  const now = Date.now()
  const withStatus = all.map(u => {
    const last = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      online: !!last && (now - last) < ONLINE_WINDOW_MS,
      lastSeenAt: u.lastSeenAt || null,
    }
  })
  return NextResponse.json({ ok: true, users: withStatus })
}
