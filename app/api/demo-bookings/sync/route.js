// Compatibility shim — delegates to the unified Inbound Channels syncOnce.
import { NextResponse } from 'next/server'
import { syncOnce, getChannelStatus } from '@/lib/inboundChannels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHANNEL_ID = 'newsroomaios_demos'

export async function POST() {
  try {
    const before = getChannelStatus(CHANNEL_ID)
    const result = await syncOnce(CHANNEL_ID)
    if (!result.ok) return NextResponse.json(result, { status: 200 })
    // Wait briefly so the snapshot has a chance to fire and import counts to update.
    await new Promise(r => setTimeout(r, 800))
    const after = getChannelStatus(CHANNEL_ID)
    return NextResponse.json({
      ok: true,
      pulled: Math.max(0, after.importedCount - before.importedCount + (after.skippedCount - before.skippedCount)),
      imported: Math.max(0, after.importedCount - before.importedCount),
      skipped: Math.max(0, after.skippedCount - before.skippedCount),
      errored: Math.max(0, after.errorCount - before.errorCount),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err.message || 'Demo booking sync failed.',
      pulled: 0,
      imported: 0,
      skipped: 0,
      errored: 1,
    }, { status: 200 })
  }
}
