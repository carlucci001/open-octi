import { NextResponse } from 'next/server'
import { restartAll, getAllStatuses } from '@/lib/inboundChannels'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One-shot boot guard. Without this, every page mount of app/page.js fires this
// route, which previously called restartAll() on every ping — tearing down and
// reattaching Firestore listeners hundreds of times per session and eventually
// crashing the Node process from leaked handles. The dashboard pings this on
// every navigation, so we only run the boot once per process lifetime; use the
// POST {action:'restart'} variant when configuration actually changes.
const G = (globalThis.__inboundChannelsBootedV2 ||= { booted: false })

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  if (!G.booted) {
    restartAll()
    G.booted = true
  }
  return NextResponse.json({ ok: true, channels: getAllStatuses() })
}

// POST { action: 'restart' } — kicks the orchestrator (used after config changes)
export async function POST(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const body = await request.json().catch(() => ({}))
  if (body.action === 'restart') {
    restartAll()
  }
  return NextResponse.json({ ok: true, channels: getAllStatuses() })
}
