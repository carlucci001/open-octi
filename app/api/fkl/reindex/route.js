// POST /api/fkl/reindex
// Body: { vault: string, vaultDir: string }
// Triggers semantic re-indexing of a vault directory.
// Manual trigger only — no auto-watching. Per docs/farrington-knowledge-layer-2026-05-23.md.

import { indexVault } from '@/lib/fkl-index'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const vault = body.vault
    const vaultDir = body.vaultDir
    if (!vault || !vaultDir) {
      return Response.json(
        { ok: false, error: 'vault and vaultDir required' },
        { status: 400 }
      )
    }
    const result = await indexVault(vault, vaultDir)
    return Response.json({ ok: true, result })
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    )
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    usage: 'POST /api/fkl/reindex with body {"vault":"name","vaultDir":"/abs/path"}',
  })
}
