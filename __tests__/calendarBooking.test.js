import fs from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildCalendarReminderConfig,
  googleEventIdForRequest,
  hasExplicitIsoOffset,
  normalizeReminderMinutes,
  verifyCreatedCalendarEvent,
} from '../lib/calendarBooking'
import { createBookingWithClient, findBookingByRequestIdWithClient } from '../lib/gcal'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('calendar booking safety', () => {
  it('keeps default reminders unless the caller requests an explicit reminder', () => {
    expect(buildCalendarReminderConfig()).toEqual({ useDefault: true })
    expect(buildCalendarReminderConfig(15)).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    })
    expect(buildCalendarReminderConfig(0)).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 0 }],
    })
  })

  it('rejects invalid reminder values', () => {
    expect(() => normalizeReminderMinutes(-1)).toThrow(/reminderMinutes/)
    expect(() => normalizeReminderMinutes(1.5)).toThrow(/reminderMinutes/)
    expect(() => normalizeReminderMinutes(40321)).toThrow(/reminderMinutes/)
  })

  it('requires a read-back event ID and the requested reminder', () => {
    expect(() => verifyCreatedCalendarEvent({}, 15)).toThrow(/event ID/)
    expect(verifyCreatedCalendarEvent({
      id: 'event-1',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
    }, 15)).toBe(true)
    expect(() => verifyCreatedCalendarEvent({
      id: 'event-1',
      reminders: { useDefault: true },
    }, 15)).toThrow(/15-minute reminder/)
  })

  it('requires an explicit timestamp offset', () => {
    expect(hasExplicitIsoOffset('2026-08-20T13:00:00-04:00')).toBe(true)
    expect(hasExplicitIsoOffset('2026-08-20T17:00:00Z')).toBe(true)
    expect(hasExplicitIsoOffset('2026-08-20T13:00:00')).toBe(false)
  })

  it('makes exact-time voice bookings fail instead of silently moving the appointment', () => {
    const route = read('app/api/calendar/book/route.js')
    expect(route).toContain('allowReschedule = true')
    expect(route).toContain('if (allowReschedule === false)')
    expect(route).toContain('No event was created.')
    expect(route).toContain('verified: result.verified')
    expect(route).toContain('reminderMinutes: result.reminderMinutes')
    expect(route).toContain("requireCapability(request, 'crm:write')")
    expect(route).toContain("new Set(['farrington-dev', 'newsroomaios'])")
    expect(route).toContain('hasExplicitIsoOffset(startIso)')
    expect(route).toContain('await findBookingByRequestId({')
  })

  it('reads the created event back and removes an unverified insert', () => {
    const source = read('lib/gcal.js')
    expect(source).toContain('await cal.events.get')
    expect(source).toContain('verifyCreatedCalendarEvent(verifiedEvent, requestedReminderMinutes, {')
    expect(source).toContain('await cal.events.delete')
  })

  it('uses a deterministic event ID and replays a duplicate request safely', async () => {
    const requestId = 'maggie|arvis|2026-08-20T13:00:00-04:00|15'
    const eventId = googleEventIdForRequest(requestId)
    const event = {
      id: eventId,
      summary: 'Appointment with Arvis',
      start: { dateTime: '2026-08-20T13:00:00-04:00' },
      end: { dateTime: '2026-08-20T13:30:00-04:00' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
      extendedProperties: { private: { fccRequestId: requestId } },
    }
    const conflict = Object.assign(new Error('duplicate'), { code: 409 })
    const cal = { events: {
      insert: vi.fn().mockRejectedValue(conflict),
      get: vi.fn().mockResolvedValue({ data: event }),
      delete: vi.fn(),
    } }

    const result = await createBookingWithClient(cal, {
      calendarId: 'calendar-1',
      clientRequestId: requestId,
      name: 'Arvis',
      summary: event.summary,
      startIso: event.start.dateTime,
      endIso: event.end.dateTime,
      reminderMinutes: 15,
    })

    expect(result).toMatchObject({ id: eventId, verified: true, replayed: true })
    expect(cal.events.delete).not.toHaveBeenCalled()
  })

  it('finds an idempotent replay before an occupied slot is rejected', async () => {
    const requestId = 'existing-request'
    const eventId = googleEventIdForRequest(requestId)
    const event = {
      id: eventId,
      summary: 'Appointment with Arvis',
      start: { dateTime: '2026-08-20T13:00:00-04:00' },
      end: { dateTime: '2026-08-20T13:30:00-04:00' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
      extendedProperties: { private: { fccRequestId: requestId } },
    }
    const cal = { events: { get: vi.fn().mockResolvedValue({ data: event }) } }

    const result = await findBookingByRequestIdWithClient(cal, {
      calendarId: 'calendar-1',
      clientRequestId: requestId,
      summary: event.summary,
      startIso: event.start.dateTime,
      endIso: event.end.dateTime,
      reminderMinutes: 15,
    })

    expect(result).toMatchObject({ id: eventId, verified: true, replayed: true })
  })

  it('removes a new insert only after a confirmed verification mismatch', async () => {
    const requestId = 'mismatch-request'
    const eventId = googleEventIdForRequest(requestId)
    const cal = { events: {
      insert: vi.fn().mockResolvedValue({ data: { id: eventId } }),
      get: vi.fn().mockResolvedValue({ data: {
        id: eventId,
        summary: 'Appointment',
        start: { dateTime: '2026-08-20T13:00:00-04:00' },
        end: { dateTime: '2026-08-20T13:30:00-04:00' },
        reminders: { useDefault: true },
        extendedProperties: { private: { fccRequestId: requestId } },
      } }),
      delete: vi.fn().mockResolvedValue({}),
    } }

    await expect(createBookingWithClient(cal, {
      calendarId: 'calendar-1',
      clientRequestId: requestId,
      name: 'Arvis',
      summary: 'Appointment',
      startIso: '2026-08-20T13:00:00-04:00',
      endIso: '2026-08-20T13:30:00-04:00',
      reminderMinutes: 15,
    })).rejects.toThrow(/unverified event was removed/)
    expect(cal.events.delete).toHaveBeenCalledWith({ calendarId: 'calendar-1', eventId })
  })

  it('does not delete a valid insert when Google readback is temporarily unavailable', async () => {
    const requestId = 'transient-read-request'
    const eventId = googleEventIdForRequest(requestId)
    const unavailable = Object.assign(new Error('service unavailable'), { code: 503 })
    const cal = { events: {
      insert: vi.fn().mockResolvedValue({ data: { id: eventId } }),
      get: vi.fn().mockRejectedValue(unavailable),
      delete: vi.fn(),
    } }

    await expect(createBookingWithClient(cal, {
      calendarId: 'calendar-1',
      clientRequestId: requestId,
      name: 'Arvis',
      summary: 'Appointment',
      startIso: '2026-08-20T13:00:00-04:00',
      endIso: '2026-08-20T13:30:00-04:00',
      reminderMinutes: 15,
    })).rejects.toThrow(/verification is pending/)
    expect(cal.events.get).toHaveBeenCalledTimes(3)
    expect(cal.events.delete).not.toHaveBeenCalled()
  })
})
