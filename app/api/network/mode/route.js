import { NextResponse } from 'next/server'
import { requireAdmin, listUsers, bootUser } from '@/lib/auth'
import { getNetworkMode, setNetworkMode } from '@/lib/networkMode'
import { isOwner } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  return NextResponse.json({ ok: true, mode: getNetworkMode() })
}

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const mode = body?.mode
  if (mode !== 'solo' && mode !== 'multi') {
    return NextResponse.json({ ok: false, error: 'mode must be "solo" or "multi"' }, { status: 400 })
  }

  setNetworkMode(mode)

  // Entering solo: boot every non-owner so existing member/admin cookies stop
  // working immediately. Solo mode means Carl/owner only.
  let booted = 0
  if (mode === 'solo') {
    for (const u of listUsers()) {
      if (!isOwner(u)) {
        bootUser(u.id)
        booted++
      }
    }
  }

  return NextResponse.json({ ok: true, mode, booted })
}
