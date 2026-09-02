import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('managed Twilio call controls', () => {
  it('keeps monitor stop separate from a targeted managed-call hangup', () => {
    const switchboard = read('app/switchboard/Switchboard.js')

    expect(switchboard).toContain("fetch('/api/twilio/hangup'")
    expect(switchboard).toContain('conferenceSid: call.sid')
    expect(switchboard).toContain('`Listen to ${call.label}`')
    expect(switchboard).toContain('`Stop listening to ${call.label}`')
    expect(switchboard).toContain('aria-label={`End call ${call.label}`}')
    expect(switchboard).toContain('minHeight: 48')
    expect(switchboard).not.toContain("fetch('/api/twilio/kill-all'")
  })
})

describe('Daily meeting termination controls', () => {
  it('ends a managed Daily room for everyone before recording it ended', () => {
    const conference = read('app/conference/ConferenceCenter.js')

    expect(conference).toContain("fetch('/api/video/end-room'")
    expect(conference).toContain('body: JSON.stringify({ room: meeting.room })')
    expect(conference).toContain("meeting.room ? 'End meeting' : 'Leave meeting'")
    expect(conference).toContain("endsForEveryone ? 'Meeting ended' : 'Meeting left'")
    expect(conference).toContain('minHeight: 48')
  })

  it('does not resurrect an intentionally ended iframe from a stale live refresh', () => {
    const conference = read('app/conference/ConferenceCenter.js')

    expect(conference).toContain('const intentionallyEndedMeetingIdsRef = useRef(new Set())')
    expect(conference).toContain('!intentionallyEndedMeetingIdsRef.current.has(m.id)')
    expect(conference).toContain('intentionallyEndedMeetingIdsRef.current.add(meeting.id)')
  })

  it('clears a formerly live active meeting when refreshed status is no longer live', () => {
    const conference = read('app/conference/ConferenceCenter.js')

    expect(conference).toContain("updated.status !== 'live' && activeMeeting.status === 'live'")
    expect(conference).toContain('setActiveMeeting(null)')
    expect(conference).toContain('setMinimized(false)')
  })

  it('does not claim an external room will disconnect everyone', () => {
    const conference = read('app/conference/ConferenceCenter.js')

    expect(conference).toContain("const endsForEveryone = !!meeting.room")
    expect(conference).toContain("'Leave this meeting? This closes your CRM meeting view only.'")
  })

  it('keeps a Daily-confirmed end closed even if the CRM record update later fails', () => {
    const conference = read('app/conference/ConferenceCenter.js')
    const confirmed = conference.indexOf("if (!response.ok || !result.ok) throw new Error(result.error || 'Daily could not end the meeting')")
    const tombstone = conference.indexOf('intentionallyEndedMeetingIdsRef.current.add(meeting.id)')
    const recordUpdate = conference.indexOf("const result = await api('end_meeting', { id: meeting.id })")

    expect(confirmed).toBeGreaterThan(-1)
    expect(tombstone).toBeGreaterThan(confirmed)
    expect(tombstone).toBeLessThan(recordUpdate)
  })
})
