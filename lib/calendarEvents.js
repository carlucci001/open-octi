/**
 * Central appointment-creation helper.
 *
 * Every booking — from the public concierge widget, the ContentHub demo form, an agent
 * dispatching a call, a manual CRM task — should funnel through this single function so
 * we never have a silent drop. It:
 *
 *   1. Resolves which Google Calendar to write to based on the source (per data/calendar-config.json)
 *   2. Formats a clean title + description with a deep-link back to the lead in the CRM
 *   3. Calls lib/gcal.js to insert the event
 *   4. Returns the event metadata so callers can store the eventId on the lead
 *
 * If no `when` is provided, no event is created — caller should create a "schedule this"
 * task instead so it never falls through.
 */
import { readData } from '@/lib/dataStore'
import { createBooking } from '@/lib/gcal'

const DEFAULT_DURATION_MINUTES = {
  demo: 30,
  callback: 15,
  meeting: 30,
  client_call: 30,
  intake: 30,
}

function getCalendarConfig() {
  return readData('calendar-config.json') || { calendars: {}, routing: {}, primary: 'farrington-dev', timezone: 'America/New_York' }
}

function resolveCalendarKey({ source, calendarKey }) {
  if (calendarKey) return calendarKey
  const cfg = getCalendarConfig()
  const routing = cfg.routing || {}
  return routing[source] || routing.default || cfg.primary || null
}

function getCalendar(calendarKey) {
  const cfg = getCalendarConfig()
  return (cfg.calendars || {})[calendarKey] || null
}

function getCrmBaseUrl() {
  return process.env.PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.FARRINGTON_PUBLIC_URL
    || 'http://localhost:3000'
}

function buildLeadLink(leadId) {
  if (!leadId) return null
  const base = getCrmBaseUrl().replace(/\/$/, '')
  return `${base}/leads?id=${encodeURIComponent(leadId)}`
}

function parseWhen(when, timezone = 'America/New_York') {
  // Accept either:
  //   - ISO string: "2026-05-02T19:00:00Z"
  //   - Loose phrase: "Thursday 2pm ET", "Tuesday 2pm", etc.
  // For loose phrases we don't try to parse — caller can flag them as needing review.
  if (!when) return null
  if (typeof when !== 'string') return null
  const trimmed = when.trim()
  // ISO?
  const iso = new Date(trimmed)
  if (!isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return { startIso: iso.toISOString(), parsed: true, original: trimmed }
  }
  // Loose phrase — don't auto-book, just return the phrase for human follow-up
  return { startIso: null, parsed: false, original: trimmed }
}

function addMinutes(iso, mins) {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString()
}

/**
 * Create a calendar event for an appointment.
 *
 * @param {Object}  opts
 * @param {string}  opts.source            — channel id e.g. 'ContentHub_demos', 'fd-concierge'
 * @param {string?} opts.calendarKey       — explicit calendar key from calendar-config.json (overrides source routing)
 * @param {string?} opts.when              — ISO datetime ('2026-05-02T19:00:00Z') OR loose phrase ('Tuesday 2pm ET')
 * @param {string}  opts.kind              — 'demo' | 'callback' | 'meeting' | 'intake' | 'client_call' (default 'client_call')
 * @param {number?} opts.durationMinutes   — overrides default per-kind duration
 * @param {Object}  opts.person            — { name, email, phone }
 * @param {string?} opts.leadId            — links event back to this lead in CRM
 * @param {string?} opts.opportunityId
 * @param {string?} opts.accountId
 * @param {string?} opts.brief             — summary of why they're booking (AI-drafted brief, chat transcript snippet, etc.)
 *
 * @returns {Promise<{ created: boolean, event?: object, calendarKey?: string, calendarName?: string, reason?: string }>}
 */
export async function createAppointmentEvent(opts = {}) {
  const { source, calendarKey: explicitKey, when, kind = 'client_call', durationMinutes, person = {}, leadId, opportunityId, accountId, brief } = opts

  const cfg = getCalendarConfig()
  const tz = cfg.timezone || 'America/New_York'

  // Resolve calendar
  const calendarKey = resolveCalendarKey({ source, calendarKey: explicitKey })
  const calendar = calendarKey && getCalendar(calendarKey)
  if (!calendar?.gcalId) {
    return { created: false, reason: `No calendar configured for source="${source}" (calendarKey="${calendarKey}")` }
  }

  // Parse the time
  const whenParsed = parseWhen(when, tz)
  if (!whenParsed?.parsed) {
    // No machine-readable time. Tell caller — they should create a "schedule this" task
    // so the appointment never silently disappears.
    return {
      created: false,
      reason: 'Unparseable time' + (whenParsed?.original ? ` ("${whenParsed.original}")` : ' (none provided)'),
      needsManualScheduling: true,
      originalWhen: whenParsed?.original || null,
      calendarKey,
    }
  }

  // Build event content
  const dur = Number(durationMinutes) > 0 ? Number(durationMinutes) : (DEFAULT_DURATION_MINUTES[kind] || 30)
  const startIso = whenParsed.startIso
  const endIso = addMinutes(startIso, dur)

  const titlePersonPart = person?.name ? person.name : 'Visitor'
  const sourceLabel = sourceLabelFor(source)
  const titlePrefix = kind === 'callback'
    ? 'Callback'
    : kind === 'demo'
      ? 'Demo'
      : kind === 'client_call'
        ? 'Client Call'
        : (kind.charAt(0).toUpperCase() + kind.slice(1))
  const summary = `${titlePrefix}: ${titlePersonPart}${sourceLabel ? ` — ${sourceLabel}` : ''}`

  const leadLink = buildLeadLink(leadId)
  const meetLink = calendar.defaultMeetLink || ''
  const descriptionLines = [
    brief ? brief.trim() : '',
    '',
    meetLink ? `Join: ${meetLink}` : '',
    person?.email ? `Email: ${person.email}` : '',
    person?.phone ? `Phone: ${person.phone}` : '',
    sourceLabel ? `Source: ${sourceLabel}` : '',
    leadLink ? `Lead in CRM: ${leadLink}` : '',
    opportunityId ? `Opportunity: ${opportunityId}` : '',
    accountId ? `Account: ${accountId}` : '',
  ].filter(Boolean)
  const description = descriptionLines.join('\n')

  // Insert
  try {
    const event = await createBooking({
      name: person?.name,
      email: person?.email,
      phone: person?.phone,
      startIso,
      endIso,
      summary,
      description,
      timezone: tz,
      calendarId: calendar.gcalId,
    })
    return {
      created: true,
      event,
      calendarKey,
      calendarName: calendar.name,
    }
  } catch (e) {
    return { created: false, reason: 'Calendar API error: ' + e.message, calendarKey }
  }
}

function sourceLabelFor(source) {
  if (!source) return ''
  const map = {
    'ContentHub_demos': 'ContentHub',
    'fd_inquiries': 'Farrington Development',
    'fd-concierge': 'Farrington Development (concierge)',
    'manual': 'Manual booking',
  }
  return map[source] || source
}
