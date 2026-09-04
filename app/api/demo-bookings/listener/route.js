// Compatibility shim — the demo bookings listener is now channel
// 'ContentStudio_demos' in the unified Inbound Channels system. This route
// keeps the old /api/demo-bookings/listener path alive so existing clients
// (DemoBookingsPanel) keep working until they're migrated to /api/inbound-channels.
import { NextResponse } from 'next/server'
import { startChannel, stopChannel, getChannelStatus, listChannels } from '@/lib/inboundChannels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHANNEL_ID = 'ContentStudio_demos'

function findChannel() {
  return listChannels().find(c => c.id === CHANNEL_ID)
}

function asLegacyShape() {
  const status = getChannelStatus(CHANNEL_ID)
  return {
    running: status.running,
    startedAt: status.startedAt,
    lastEventAt: status.lastEventAt,
    importedCount: status.importedCount,
    skippedCount: status.skippedCount,
    errorCount: status.errorCount,
    lastError: status.lastError,
    lastImported: status.lastImported,
    project: 'newsroomasios',
    collection: 'demoBookings',
  }
}

export async function GET() {
  try {
    const before = getChannelStatus(CHANNEL_ID)
    if (!before.running) {
      const ch = findChannel()
      if (ch) startChannel(ch)
    }
    return NextResponse.json(asLegacyShape())
  } catch (err) {
    return NextResponse.json({
      running: false,
      importedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      lastError: err.message || 'Demo booking listener failed.',
      lastImported: null,
      project: 'newsroomasios',
      collection: 'demoBookings',
    }, { status: 200 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    if (body.action === 'stop') {
      stopChannel(CHANNEL_ID)
    } else {
      const ch = findChannel()
      if (ch) startChannel(ch)
    }
    return NextResponse.json(asLegacyShape())
  } catch (err) {
    return NextResponse.json({
      running: false,
      importedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      lastError: err.message || 'Demo booking listener failed.',
      lastImported: null,
      project: 'newsroomasios',
      collection: 'demoBookings',
    }, { status: 200 })
  }
}
