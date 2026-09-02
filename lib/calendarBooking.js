import { createHash } from 'node:crypto'

const MAX_REMINDER_MINUTES = 28 * 24 * 60

export function normalizeReminderMinutes(value) {
  if (value === undefined || value === null || value === '') return null

  const minutes = Number(value)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_REMINDER_MINUTES) {
    throw new Error(`reminderMinutes must be a whole number from 0 to ${MAX_REMINDER_MINUTES}`)
  }
  return minutes
}

export function buildCalendarReminderConfig(value) {
  const minutes = normalizeReminderMinutes(value)
  if (minutes === null) return { useDefault: true }
  return { useDefault: false, overrides: [{ method: 'popup', minutes }] }
}

export function googleEventIdForRequest(clientRequestId) {
  const value = String(clientRequestId || '').trim()
  if (!value) return null
  return `fcc${createHash('sha256').update(value).digest('hex')}`
}

export function hasExplicitIsoOffset(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(String(value || ''))
}

function sameInstant(actual, expected) {
  if (!actual || !expected) return false
  const actualTime = new Date(actual).getTime()
  const expectedTime = new Date(expected).getTime()
  return Number.isFinite(actualTime) && Number.isFinite(expectedTime) && actualTime === expectedTime
}

export function verifyCreatedCalendarEvent(event, requestedReminderMinutes, expected = {}) {
  if (!event?.id) throw new Error('Calendar API did not return a verifiable event ID')

  if (expected.eventId && event.id !== expected.eventId) throw new Error('Calendar event ID does not match the request')
  if (expected.startIso && !sameInstant(event.start?.dateTime, expected.startIso)) throw new Error('Calendar event start does not match the request')
  if (expected.endIso && !sameInstant(event.end?.dateTime, expected.endIso)) throw new Error('Calendar event end does not match the request')
  if (expected.summary && event.summary !== expected.summary) throw new Error('Calendar event title does not match the request')
  if (expected.clientRequestId && event.extendedProperties?.private?.fccRequestId !== expected.clientRequestId) {
    throw new Error('Calendar event request ID does not match the request')
  }

  const minutes = normalizeReminderMinutes(requestedReminderMinutes)
  if (minutes === null) return true

  const reminders = event.reminders || {}
  const overrides = Array.isArray(reminders.overrides) ? reminders.overrides : []
  const matched = reminders.useDefault === false
    && overrides.some(item => item?.method === 'popup' && Number(item?.minutes) === minutes)
  if (!matched) throw new Error(`Calendar event does not contain the requested ${minutes}-minute reminder`)
  return true
}
