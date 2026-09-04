import { NextResponse } from 'next/server'
import { createBooking, checkAvailability, findBookingByRequestId } from '@/lib/gcal'
import { requireCapability } from '@/lib/permissions'
import { hasExplicitIsoOffset, normalizeReminderMinutes } from '@/lib/calendarBooking'

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

const DOW = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const ALLOWED_CALENDAR_KEYS = new Set(['farrington-dev', 'ContentStudio'])

async function authorizeBooking(request) {
  const expected = (process.env.CONCIERGE_TOOL_SECRET || '').trim()
  const auth = (request.headers.get('authorization') || '').trim()
  if (expected && auth === `Bearer ${expected}`) return { authorized: true, error: null }
  const { error } = await requireCapability(request, 'crm:write')
  return { authorized: !error, error }
}

function easternWeekday(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(date).toLowerCase()
}

async function sendVideoInvite({ name, email, startIso, summary, origin, isDemo }) {
  if (!email || !email.includes('@')) return null
  try {
    const base = origin || process.env.FARRINGTON_PUBLIC_URL || 'http://localhost:3000'
    const r = await fetch(`${base}/api/calendar/send-meet-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        attendeeName: name,
        eventTitle: summary || (isDemo ? 'Farrington Development demo' : 'Farrington Development appointment'),
        eventStart: startIso,
        isDemo,
      }),
    }).then(r => r.json())
    return r?.meetUrl || null
  } catch {
    return null
  }
}

function nextOccurrenceOfDow(targetDow) {
  const now = new Date()
  const out = new Date(now)
  out.setDate(out.getDate() + ((targetDow - now.getDay() + 7) % 7 || 7))
  return out
}

function buildEasternIso(dateUtc, hour24, minute = 0) {
  const y = dateUtc.getFullYear()
  const m = String(dateUtc.getMonth() + 1).padStart(2, '0')
  const d = String(dateUtc.getDate()).padStart(2, '0')
  const hh = String(hour24).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:00-04:00`
}

async function findOpenSlot(dayOfWeek, preferredHour, { weeksAhead = 4, isDemo = false, calendarKey, source } = {}) {
  const dow = DOW[(dayOfWeek || '').toLowerCase()]
  if (dow === undefined) return { error: 'Invalid day of week' }

  const hours = isDemo ? [13, 14, 15, 16] : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  const preferred = typeof preferredHour === 'number' && hours.includes(preferredHour) ? preferredHour : null
  const candidate = nextOccurrenceOfDow(dow)

  for (let w = 0; w < weeksAhead; w++) {
    const dateThisWeek = new Date(candidate)
    dateThisWeek.setDate(dateThisWeek.getDate() + w * 7)
    if (dateThisWeek < new Date()) continue

    const order = preferred ? [preferred, ...hours.filter(h => h !== preferred)] : hours
    for (const h of order) {
      const startIso = buildEasternIso(dateThisWeek, h, 0)
      const endIso = buildEasternIso(dateThisWeek, h, 30)
      try {
        const avail = await checkAvailability(new Date(startIso).toISOString(), new Date(endIso).toISOString(), { calendarKey, source })
        if (avail.available) return { startIso, endIso, hour: h, date: dateThisWeek }
      } catch {
        // Keep scanning. The caller receives a no-slot response if all checks fail.
      }
    }
  }

  return {
    error: isDemo
      ? 'No open demo slot between 1 and 5 PM Eastern on that day for the next 4 weeks.'
      : 'No open appointment slot was found on that day for the next 4 weeks.',
  }
}

function parsePreferredHour(preferredTime) {
  if (!preferredTime) return null
  const m = String(preferredTime).match(/(\d{1,2})/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  if (/pm/i.test(preferredTime) && h < 12) h += 12
  if (/am/i.test(preferredTime) && h === 12) h = 0
  return h
}

function displayEastern(iso) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' Eastern'
}

export async function POST(request) {
  try {
    const access = await authorizeBooking(request)
    if (!access.authorized) return access.error
    const body = await request.json()
    let {
      name,
      email,
      phone,
      startIso,
      endIso,
      durationMinutes = 30,
      summary,
      description,
      timezone,
      dayOfWeek,
      preferredTime,
      calendarKey,
      source,
      kind,
      isDemo,
      sendVideoLink,
      reminderMinutes,
      allowReschedule = true,
      clientRequestId,
    } = body

    let normalizedReminderMinutes
    try {
      normalizedReminderMinutes = normalizeReminderMinutes(reminderMinutes)
    } catch (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: corsHeaders() })
    }

    const text = `${summary || ''} ${description || ''} ${kind || ''}`.toLowerCase()
    isDemo = Boolean(isDemo) || /\bdemo\b/.test(text)
    kind = isDemo ? 'demo' : (kind || 'client_call')
    source = source || (isDemo ? 'ContentStudio_demos' : 'manual')
    calendarKey = calendarKey || (isDemo ? 'ContentStudio' : 'farrington-dev')
    summary = summary || `${isDemo ? 'Demo' : 'Client Call'} - ${name || 'Guest'}`
    if (!ALLOWED_CALENDAR_KEYS.has(calendarKey)) {
      return NextResponse.json({ ok: false, error: 'That calendar is not available for appointment booking.' }, { status: 400, headers: corsHeaders() })
    }
    if ((calendarKey === 'ContentStudio') !== Boolean(isDemo)) {
      return NextResponse.json({ ok: false, error: 'The requested appointment type does not match the selected calendar.' }, { status: 400, headers: corsHeaders() })
    }

    if (!startIso && dayOfWeek) {
      const slot = await findOpenSlot(dayOfWeek, parsePreferredHour(preferredTime), { isDemo, calendarKey, source })
      if (slot.error) return NextResponse.json({ ok: false, error: slot.error }, { status: 409, headers: corsHeaders() })
      startIso = slot.startIso
      endIso = slot.endIso
    }

    if (!startIso) return NextResponse.json({ ok: false, error: 'Need either startIso or dayOfWeek' }, { status: 400, headers: corsHeaders() })
    if (!hasExplicitIsoOffset(startIso) || (endIso && !hasExplicitIsoOffset(endIso))) {
      return NextResponse.json({ ok: false, error: 'startIso and endIso must include Z or an explicit UTC offset such as -04:00' }, { status: 400, headers: corsHeaders() })
    }

    const start = new Date(startIso)
    const end = endIso ? new Date(endIso) : new Date(start.getTime() + Number(durationMinutes || 30) * 60000)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ ok: false, error: 'startIso and endIso must define a valid future time range' }, { status: 400, headers: corsHeaders() })
    }
    const now = new Date()
    if (start < now) {
      return NextResponse.json({ ok: false, error: `Cannot book in the past. Received ${start.toISOString()} but current time is ${now.toISOString()}. Please retry with a future date.` }, { status: 400, headers: corsHeaders() })
    }

    const startHourET = new Date(start.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours()
    if (isDemo && (startHourET < 13 || startHourET > 16)) {
      return NextResponse.json({ ok: false, error: `Demos must start between 1 PM and 4 PM Eastern. ${startHourET}:00 is outside that window.` }, { status: 400, headers: corsHeaders() })
    }

    const avail = await checkAvailability(start.toISOString(), end.toISOString(), { calendarKey, source })
    if (!avail.available) {
      const existing = clientRequestId ? await findBookingByRequestId({
        clientRequestId,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        summary,
        reminderMinutes: normalizedReminderMinutes,
        calendarKey,
        source,
      }) : null
      if (existing) {
        return NextResponse.json({
          ok: true,
          bookingId: existing.id,
          summary: existing.summary,
          start: existing.start,
          end: existing.end,
          meetUrl: existing.meetLink || null,
          calendarName: existing.calendarName,
          verified: existing.verified,
          reminderMinutes: existing.reminderMinutes,
          replayed: true,
          displayTime: displayEastern(existing.start),
          message: `Verified the existing booking for ${name || 'guest'} at ${displayEastern(existing.start)}.`,
        }, { headers: corsHeaders() })
      }
      if (allowReschedule === false) {
        return NextResponse.json({
          ok: false,
          error: `The requested time ${displayEastern(start.toISOString())} is unavailable. No event was created.`,
          requestedStart: start.toISOString(),
        }, { status: 409, headers: corsHeaders() })
      }
      const slot = await findOpenSlot(easternWeekday(start), startHourET + 1, { isDemo, calendarKey, source })
      if (slot.error) return NextResponse.json({ ok: false, error: 'That slot is taken and no open slot was found nearby.' }, { status: 409, headers: corsHeaders() })

      const result = await createBooking({ name, email, phone, startIso: slot.startIso, endIso: slot.endIso, summary, description, timezone, calendarKey, source, reminderMinutes: normalizedReminderMinutes, clientRequestId })
      const meetUrl = (isDemo || sendVideoLink) ? await sendVideoInvite({ name, email, startIso: slot.startIso, summary, origin: new URL(request.url).origin, isDemo }) : null
      return NextResponse.json({
        ok: true,
        bookingId: result.id,
        summary: result.summary,
        start: result.start,
        end: result.end,
        meetUrl,
        calendarName: result.calendarName,
        verified: result.verified,
        reminderMinutes: result.reminderMinutes,
        replayed: result.replayed,
        displayTime: displayEastern(result.start),
        message: `Preferred slot was taken - booked ${name || 'guest'} at ${displayEastern(result.start)} instead.${meetUrl ? ' Video link emailed.' : ''}`,
        rescheduled: true,
      }, { headers: corsHeaders() })
    }

    const result = await createBooking({ name, email, phone, startIso: start.toISOString(), endIso: end.toISOString(), summary, description, timezone, calendarKey, source, reminderMinutes: normalizedReminderMinutes, clientRequestId })
    const meetUrl = (isDemo || sendVideoLink) ? await sendVideoInvite({ name, email, startIso: start.toISOString(), summary, origin: new URL(request.url).origin, isDemo }) : null
    return NextResponse.json({
      ok: true,
      bookingId: result.id,
      summary: result.summary,
      start: result.start,
      end: result.end,
      meetUrl,
      calendarName: result.calendarName,
      verified: result.verified,
      reminderMinutes: result.reminderMinutes,
      replayed: result.replayed,
      displayTime: displayEastern(result.start),
      message: `Booked ${name || 'guest'} at ${displayEastern(result.start)}.${meetUrl ? ' Video link emailed.' : ''}`,
    }, { headers: corsHeaders() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: corsHeaders() })
  }
}
