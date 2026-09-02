// GET /api/fkl/metrics?vault=<name>
// Rich semantic-vault diagnostics for the local FKL dashboard.

import { getFKLMetrics } from '@/lib/fkl-index'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const vault = url.searchParams.get('vault') || undefined
    return Response.json({ ok: true, ...getFKLMetrics(vault) })
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    )
  }
}
