import { NextResponse } from 'next/server'
import { getSweepRun, listSweepRuns } from '@/lib/lead-sweep-runs'
import { requireCrmRead } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Poll target for the async lead sweeps. Shared by both the vertical sweep and
// the organization campaign, which write into the same run store.
export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const params = new URL(request.url).searchParams
  const id = params.get('id')

  if (id) {
    const run = getSweepRun(id)
    if (!run) return NextResponse.json({ ok: false, error: 'Run not found' }, { status: 404 })
    return NextResponse.json({ ok: true, run })
  }

  const kind = params.get('kind') || undefined
  const requested = Number(params.get('limit'))
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 50) : 10
  return NextResponse.json({ ok: true, runs: listSweepRuns({ limit, kind }) })
}
