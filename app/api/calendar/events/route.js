import { NextResponse } from 'next/server'
import { listEvents } from '@/lib/gcal'
import { requireCrmRead } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    const events = await listEvents()
    const sources = Object.values(events.reduce((acc, event) => {
      const name = event.calendarName || 'Calendar'
      if (!acc[name]) acc[name] = { name, count: 0, error: null }
      acc[name].count += 1
      return acc
    }, {}))
    return NextResponse.json({
      events,
      sources,
      fetchedAt: new Date().toISOString(),
      count: events.length,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Calendar fetch failed: ' + e.message }, { status: 500 })
  }
}
