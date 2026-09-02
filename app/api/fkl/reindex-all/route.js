// POST /api/fkl/reindex-all
// Indexes every configured vault from notes-config.json into FKL.
// The mounted vault roots are the source map — file paths are stored in the
// same `${rootId}/relPath` shape walkVaultMd uses, so semantic hits open
// correctly through the existing notes read action.

import { NextResponse } from 'next/server'
import { requireCrmWrite } from '@/lib/permissions'
import { getVaults } from '@/lib/obsidianVaults'
import { indexVault } from '@/lib/fkl-index'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  try {
    const vaults = getVaults()
    const results = []

    for (const vault of vaults) {
      const roots = Array.isArray(vault.roots) ? vault.roots.filter(r => r.available) : []
      if (roots.length) {
        for (const root of roots) {
          const r = await indexVault(vault.id, root.path, `${root.id}/`)
          results.push({ vault: vault.id, root: root.id, ...r })
        }
      } else if (vault.available && vault.path) {
        const r = await indexVault(vault.id, vault.path, '')
        results.push({ vault: vault.id, root: null, ...r })
      } else {
        results.push({ vault: vault.id, root: null, error: 'unavailable', filesSeen: 0, filesIndexed: 0, chunksAdded: 0 })
      }
    }

    const totals = results.reduce((acc, r) => ({
      filesSeen: acc.filesSeen + (r.filesSeen || 0),
      filesIndexed: acc.filesIndexed + (r.filesIndexed || 0),
      chunksAdded: acc.chunksAdded + (r.chunksAdded || 0),
    }), { filesSeen: 0, filesIndexed: 0, chunksAdded: 0 })

    return NextResponse.json({ ok: true, totals, results })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: 'POST /api/fkl/reindex-all — indexes every configured vault root into FKL',
  })
}
