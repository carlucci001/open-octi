import { NextResponse } from 'next/server'
import { findUserById, signSession } from '@/lib/auth'
import { publicUser, isOwner } from '@/lib/roles'
import { consumeBuilderHandoff } from '@/lib/builderHandoff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUILDER_SESSION_TTL_MS = 8 * 60 * 60 * 1000

export async function POST(request) {
  const authorization = request.headers.get('authorization') || ''
  const body = await request.json().catch(() => ({}))
  const code = typeof body?.code === 'string'
    ? body.code
    : authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : ''
  const handoff = consumeBuilderHandoff(code)
  if (!handoff) {
    return NextResponse.json({ ok: false, error: 'invalid or expired handoff' }, { status: 401 })
  }

  const user = findUserById(handoff.uid)
  const userVersion = user?.tokenVersion || 1
  if (!user || user.suspended || !isOwner(user) || userVersion !== handoff.ver) {
    return NextResponse.json({ ok: false, error: 'owner authorization failed' }, { status: 403 })
  }

  const sessionToken = await signSession({
    uid: user.id,
    ver: userVersion,
    exp: Date.now() + BUILDER_SESSION_TTL_MS,
  })

  return NextResponse.json(
    { ok: true, sessionToken, user: publicUser(user), maxAge: BUILDER_SESSION_TTL_MS / 1000 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
