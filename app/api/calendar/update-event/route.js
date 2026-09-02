import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { readData } from '@/lib/dataStore'
import { requireCrmWrite } from '@/lib/permissions'
import { calendarEventIdForApi } from '@/lib/gcal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders() })
}

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
    const { eventId, calendarId, calendarKey, name, email, phone, startIso, endIso, summary, description, timezone = 'America/New_York' } = await request.json()
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400, headers: corsHeaders() })

    const targetCalendarId = resolveCalendarId({ eventId, calendarId, calendarKey })
    if (!targetCalendarId) return NextResponse.json({ error: 'Calendar not configured' }, { status: 400, headers: corsHeaders() })

    const key = readData('gcal-service-account.json')
    if (!key?.client_email) return NextResponse.json({ error: 'Service account key missing' }, { status: 500, headers: corsHeaders() })
    const jwt = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    })
    const cal = google.calendar({ version: 'v3', auth: jwt })

    const patch = {}
    if (summary !== undefined || name !== undefined) patch.summary = summary || `Client Call - ${name || 'Guest'}`
    if (startIso) patch.start = { dateTime: startIso, timeZone: timezone }
    if (endIso) patch.end = { dateTime: endIso, timeZone: timezone }
    if (description !== undefined || name !== undefined || email !== undefined || phone !== undefined) {
      patch.description = [
        description || '',
        name ? `Name: ${name}` : '',
        phone ? `Phone: ${phone}` : '',
        email ? `Email: ${email}` : '',
      ].filter(Boolean).join('\n')
    }

    const res = await cal.events.patch({
      calendarId: targetCalendarId,
      eventId: calendarEventIdForApi(eventId),
      requestBody: patch,
    })
    return NextResponse.json({
      ok: true,
      eventId: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime || res.data.start?.date,
      end: res.data.end?.dateTime || res.data.end?.date,
      description: res.data.description || '',
    }, { headers: corsHeaders() })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: corsHeaders() })
  }
}
