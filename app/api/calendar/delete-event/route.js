import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { readData } from '@/lib/dataStore'
import { requireCrmWrite } from '@/lib/permissions'
import { calendarEventIdForApi } from '@/lib/gcal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveCalendarId({ eventId, calendarId, calendarKey }) {
  if (calendarId) return calendarId
  const prefix = String(eventId || '').includes(':') ? String(eventId).split(':')[0] : calendarKey
  const cfg = readData('calendar-config.json') || {}
  return cfg.calendars?.[prefix]?.gcalId || cfg.calendars?.[cfg.primary]?.gcalId
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  try {
    const { eventId, calendarId, calendarKey } = await request.json()
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

    const targetCalendarId = resolveCalendarId({ eventId, calendarId, calendarKey })
    if (!targetCalendarId) return NextResponse.json({ error: 'Calendar not configured' }, { status: 400 })

    const key = readData('gcal-service-account.json')
    if (!key?.client_email) return NextResponse.json({ error: 'Service account key missing' }, { status: 500 })
    const jwt = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    })
    const cal = google.calendar({ version: 'v3', auth: jwt })
    await cal.events.delete({ calendarId: targetCalendarId, eventId: calendarEventIdForApi(eventId) })
    return NextResponse.json({ ok: true, deleted: eventId })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
