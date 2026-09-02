import { NextResponse } from 'next/server'
import { bootUser, findUserById } from '@/lib/auth'
import { requireUserManagement } from '@/lib/permissions'
import { isOwner } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/users/:id/boot
// Admin-only. Force-logs-out the target user on every device by bumping their
// tokenVersion. They keep their account but are kicked back to /login on their
// next request (most clients poll /api/auth/me every 30s, so it lands within seconds).
export async function POST(request, { params }) {
  const { error, user: me } = await requireUserManagement(request)
  if (error) return error
  if (me.id === params.id) return NextResponse.json({ ok: false, error: 'cannot boot yourself' }, { status: 400 })
  const target = findUserById(params.id)
  if (!target) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (isOwner(target)) return NextResponse.json({ ok: false, error: 'owner cannot be booted' }, { status: 400 })
  bootUser(params.id)
  return NextResponse.json({ ok: true })
}
