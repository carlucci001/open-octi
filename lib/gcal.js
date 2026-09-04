import { createRequire } from 'module'
import { readData } from '@/lib/dataStore'
import { buildCalendarReminderConfig, googleEventIdForRequest, normalizeReminderMinutes, verifyCreatedCalendarEvent } from '@/lib/calendarBooking'
import { isOpenOcti } from '@/lib/edition'
import { relativeOpenOctiCalendarSamples } from '@/lib/openocti-sample-data'

const require = createRequire(import.meta.url)
const { google } = require('googleapis')

const FALLBACK_CALENDAR_ID = 'redacted@example.invalid'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
]

function getClient() {
  const key = readData('gcal-service-account.json')
  if (!key?.client_email) throw new Error('Service account key not found at data/gcal-service-account.json')
  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  })
  return google.calendar({ version: 'v3', auth: jwt })
}

function getCalendarConfig() {
  return readData('calendar-config.json') || {
    calendars: {},
    routing: {},
    primary: 'farrington-dev',
    timezone: 'America/New_York',
  }
}

function configuredCalendars() {
  const cfg = getCalendarConfig()
  const entries = Object.entries(cfg.calendars || {})
    .map(([key, cal]) => ({
      key,
      name: cal.name || key,
      color: cal.color || '#89b4fa',
      calendarId: cal.gcalId,
    }))
    .filter(cal => cal.calendarId)

  if (entries.length) return entries
  return [{ key: 'ContentStudio', name: 'ContentStudio Demos', color: '#89b4fa', calendarId: FALLBACK_CALENDAR_ID }]
}

function resolveCalendar({ calendarId, calendarKey, source } = {}) {
  if (calendarId) return { key: calendarKey || '', name: '', color: '#89b4fa', calendarId }

  const cfg = getCalendarConfig()
  const key = calendarKey || cfg.routing?.[source] || cfg.routing?.default || cfg.primary || 'farrington-dev'
  const cal = key ? cfg.calendars?.[key] : null
  if (cal?.gcalId) {
    return { key, name: cal.name || key, color: cal.color || '#89b4fa', calendarId: cal.gcalId }
  }

  return configuredCalendars()[0]
}

function isLegitCalendarEvent(event) {
  if (!event || event.status === 'cancelled') return false
  const text = `${event.summary || ''} ${event.description || ''}`.toLowerCase()
  return !/\b(test|ignore|sample|placeholder|fake|smoke test|dummy)\b/.test(text)
}

export function calendarEventIdForApi(eventId) {
  const value = String(eventId || '')
  const idx = value.indexOf(':')
  return idx >= 0 ? value.slice(idx + 1) : value
}

function googleErrorStatus(error) {
  return Number(error?.code || error?.response?.status || error?.status || 0)
}

function isTransientCalendarReadError(error) {
  const status = googleErrorStatus(error)
  return !status || status === 404 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

async function readCalendarEventWithRetry(cal, args) {
  let lastError
  const delays = [0, 75, 250]
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await new Promise(resolve => setTimeout(resolve, delays[attempt]))
    try {
      return (await cal.events.get(args)).data
    } catch (error) {
      lastError = error
      if (!isTransientCalendarReadError(error)) break
    }
  }
  const pending = new Error(`Calendar verification is pending; retry with the same request ID before creating another event: ${lastError?.message || 'readback failed'}`)
  pending.code = 'CALENDAR_VERIFICATION_PENDING'
  throw pending
}

export async function createBooking(options = {}) {
  return createBookingWithClient(getClient(), options)
}

function bookingResult(verifiedEvent, target, requestedReminderMinutes, replayed) {
  return {
    id: verifiedEvent.id,
    calendarId: target.calendarId,
    calendarKey: target.key,
    calendarName: target.name,
    htmlLink: verifiedEvent.htmlLink,
    meetLink: verifiedEvent.hangoutLink || verifiedEvent.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri,
    start: verifiedEvent.start?.dateTime,
    end: verifiedEvent.end?.dateTime,
    summary: verifiedEvent.summary,
    reminderMinutes: requestedReminderMinutes,
    verified: true,
    replayed,
  }
}

export async function findBookingByRequestId(options = {}) {
  return findBookingByRequestIdWithClient(getClient(), options)
}

export async function findBookingByRequestIdWithClient(cal, { clientRequestId, startIso, endIso, summary, reminderMinutes, calendarId, calendarKey, source } = {}) {
  const requestId = String(clientRequestId || '').trim()
  const eventId = googleEventIdForRequest(requestId)
  if (!eventId) return null
  const target = resolveCalendar({ calendarId, calendarKey, source })
  let event
  try {
    event = (await cal.events.get({ calendarId: target.calendarId, eventId })).data
  } catch (error) {
    if (googleErrorStatus(error) === 404) return null
    throw error
  }
  const requestedReminderMinutes = normalizeReminderMinutes(reminderMinutes)
  verifyCreatedCalendarEvent(event, requestedReminderMinutes, {
    eventId,
    startIso,
    endIso,
    summary,
    clientRequestId: requestId,
  })
  return bookingResult(event, target, requestedReminderMinutes, true)
}

export async function createBookingWithClient(cal, { name, email, phone, startIso, endIso, summary, description, timezone = 'America/New_York', calendarId, calendarKey, source, reminderMinutes, clientRequestId } = {}) {
  const target = resolveCalendar({ calendarId, calendarKey, source })
  const requestedReminderMinutes = normalizeReminderMinutes(reminderMinutes)
  const requestId = String(clientRequestId || '').trim()
  const deterministicEventId = googleEventIdForRequest(requestId)
  const ev = {
    ...(deterministicEventId ? { id: deterministicEventId } : {}),
    summary: summary || `Client Call - ${name || 'Guest'}`,
    description: [
      description || '',
      name ? `Name: ${name}` : '',
      phone ? `Phone: ${phone}` : '',
      email ? `Email: ${email}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: startIso, timeZone: timezone },
    end: { dateTime: endIso, timeZone: timezone },
    reminders: buildCalendarReminderConfig(requestedReminderMinutes),
    ...(requestId ? { extendedProperties: { private: { fccRequestId: requestId } } } : {}),
  }

  let eventId
  let replayed = false
  try {
    const res = await cal.events.insert({
      calendarId: target.calendarId,
      requestBody: ev,
    })
    eventId = res.data?.id
    if (!eventId) throw new Error('Calendar API accepted the request without returning an event ID')
  } catch (error) {
    if (googleErrorStatus(error) !== 409 || !deterministicEventId) throw error
    eventId = deterministicEventId
    replayed = true
  }

  const verifiedEvent = await readCalendarEventWithRetry(cal, {
    calendarId: target.calendarId,
    eventId,
  })
  try {
    verifyCreatedCalendarEvent(verifiedEvent, requestedReminderMinutes, {
      eventId,
      startIso,
      endIso,
      summary: ev.summary,
      clientRequestId: requestId || undefined,
    })
  } catch (error) {
    let rolledBack = false
    if (!replayed) {
      try {
        await cal.events.delete({ calendarId: target.calendarId, eventId })
        rolledBack = true
      } catch {}
    }
    throw new Error(`Calendar event verification failed${rolledBack ? ' and the unverified event was removed' : '; no automatic retry is allowed'}: ${error.message}`)
  }

  return bookingResult(verifiedEvent, target, requestedReminderMinutes, replayed)
}

export async function listEvents({ timeMin, timeMax, calendarId, calendarKey, source } = {}) {
  const localSamples = isOpenOcti() ? relativeOpenOctiCalendarSamples() : []
  if (localSamples.length && !calendarId && !calendarKey && !source && !readData('gcal-service-account.json')?.client_email) return localSamples
  const cal = getClient()
  const now = new Date()
  const from = timeMin || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const to = timeMax || new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString()
  const targets = (calendarId || calendarKey || source)
    ? [resolveCalendar({ calendarId, calendarKey, source })]
    : configuredCalendars()

  const all = []
  for (const target of targets) {
    const res = await cal.events.list({
      calendarId: target.calendarId,
      timeMin: from,
      timeMax: to,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })

    for (const e of (res.data.items || [])) {
      if (!isLegitCalendarEvent(e)) continue
      all.push({
        id: `${target.key || target.calendarId}:${e.id}`,
        rawId: e.id,
        calendarId: target.calendarId,
        calendarKey: target.key,
        title: e.summary || '(no title)',
        description: e.description || '',
        location: e.location || '',
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        organizer: e.organizer?.email || '',
        attendees: (e.attendees || []).map(a => a.email || a.displayName || '').filter(Boolean),
        status: e.status || '',
        htmlLink: e.htmlLink,
        calendarName: target.name,
        calendarColor: target.color,
      })
    }
  }
  return [...all, ...localSamples].sort((a, b) => new Date(a.start) - new Date(b.start))
}

export async function checkAvailability(startIso, endIso, options = {}) {
  const cal = getClient()
  const target = resolveCalendar(options)
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: startIso,
      timeMax: endIso,
      items: [{ id: target.calendarId }],
    },
  })
  const busy = res.data.calendars?.[target.calendarId]?.busy || []
  return { busy, available: busy.length === 0, calendarId: target.calendarId, calendarKey: target.key }
}
