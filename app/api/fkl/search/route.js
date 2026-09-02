// GET /api/fkl/search?q=<query>&vault=<name>&limit=<n>
// Semantic search across indexed chunks. Read-only.
// Per docs/farrington-knowledge-layer-2026-05-23.md.

import { searchFKL, getFKLStats } from '@/lib/fkl-index'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')
    const vault = url.searchParams.get('vault') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '10', 10)
    const minScore = parseFloat(url.searchParams.get('minScore') || '0')

    if (!q) {
      return Response.json({
        ok: true,
        usage: 'GET /api/fkl/search?q=<query>&vault=<name>&limit=<n>&minScore=<0..1>',
        stats: getFKLStats(),
      })
    }

    const result = await searchFKL(q, { vault, limit, minScore })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    )
  }
}
