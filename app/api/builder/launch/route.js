import { NextResponse } from 'next/server'
import { findUserById, requireOwner } from '@/lib/auth'
import { issueBuilderHandoff } from '@/lib/builderHandoff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_BUILDER_URL = process.env.NODE_ENV === 'production'
  ? 'https://builder.farringtondevelopment.com/'
  : 'http://localhost:5173/'
const ALLOWED_THEMES = new Set(['command', 'codex', 'codex-blue'])

export async function POST(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error

  const storedUser = findUserById(user.id)
  if (!storedUser || storedUser.suspended) {
    return NextResponse.json({ ok: false, error: 'owner session unavailable' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const theme = ALLOWED_THEMES.has(body?.theme) ? body.theme : 'command'
  const code = issueBuilderHandoff({ uid: storedUser.id, ver: storedUser.tokenVersion || 1 })
  const url = new URL(process.env.BUILDER_PUBLIC_URL || DEFAULT_BUILDER_URL)
  url.searchParams.set('handoff', code)
  url.searchParams.set('theme', theme)

  return NextResponse.json(
    { ok: true, url: url.toString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
