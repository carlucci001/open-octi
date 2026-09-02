import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildActiveCallEntries,
  createActiveCallHint,
  formatCallDuration,
  normalizeHangupTarget,
} from '../lib/twilio-call-controls'

const root = process.cwd()
const CALL_ONE = `CA${'1'.repeat(32)}`
const CALL_TWO = `CA${'2'.repeat(32)}`
const CALL_THREE = `CA${'3'.repeat(32)}`
const CONFERENCE_ONE = `CF${'a'.repeat(32)}`

const permission = vi.hoisted(() => ({
  result: { user: { id: 'usr_owner', role: 'owner' }, error: null },
}))

vi.mock('@/lib/permissions', () => ({
  requireCapability: vi.fn(async () => permission.result),
}))

function request(body) {
  return new Request('https://openocti.local/api/twilio/hangup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('Twilio call controls', () => {
  beforeEach(() => {
    permission.result = { user: { id: 'usr_owner', role: 'owner' }, error: null }
    vi.stubEnv('TWILIO_ACCOUNT_SID', `AC${'9'.repeat(32)}`)
    vi.stubEnv('TWILIO_API_KEY_SID', `SK${'8'.repeat(32)}`)
    vi.stubEnv('TWILIO_API_KEY_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('never couples the Twilio tray to browser voice-agent state', () => {
    const source = fs.readFileSync(path.join(root, 'app/components/EmergencyHangup.js'), 'utf8')
    expect(source).not.toContain('fcc:voice-active')
    expect(source).not.toContain('__fccKillVoice')
    expect(source).not.toContain('__fccVoiceActive')
  })

  it('uses the phone event and targeted endpoint for a persistent per-call tray', () => {
    const source = fs.readFileSync(path.join(root, 'app/components/EmergencyHangup.js'), 'utf8')
    expect(source).toContain("window.addEventListener('fcc:active-call'")
    expect(source).toContain("fetch('/api/twilio/hangup'")
    expect(source).toContain('minWidth: 48')
    expect(source).toContain('minHeight: 48')

    const moreStart = source.indexOf('aria-label="More call controls"')
    const moreControl = source.slice(moreStart, source.indexOf('</button>', moreStart))
    expect(moreControl).toContain('width: 48')
    expect(moreControl).toContain('height: 48')

    const emergencyStart = source.indexOf('onClick={killAll}')
    const emergencyControl = source.slice(emergencyStart, source.indexOf('</button>', emergencyStart))
    expect(emergencyControl).toContain('minHeight: 48')
  })

  it('offers a compact accessible hold control only for named conference targets', () => {
    const source = fs.readFileSync(path.join(root, 'app/components/EmergencyHangup.js'), 'utf8')
    expect(source).toContain("fetch('/api/twilio/hold'")
    expect(source).toContain('entry.conferenceName &&')
    expect(source).toContain('aria-label={entry.held ? `Resume ${entry.label}` : `Hold ${entry.label}`}')

    const holdStart = source.indexOf('onClick={() => onToggleHold(entry)}')
    const holdControl = source.slice(holdStart, source.indexOf('</button>', holdStart))
    expect(holdControl).toContain('width: 48')
    expect(holdControl).toContain('height: 48')
  })

  it('keeps the last verified calls visible when polling degrades and avoids the video-call dock', () => {
    const source = fs.readFileSync(path.join(root, 'app/components/EmergencyHangup.js'), 'utf8')
    expect(source).toContain('setPollDegraded(true)')
    expect(source).toContain('Call status unavailable')
    expect(source).toContain('window.__fccCallActive')
    expect(source).toContain('window.__fccConferenceActive')
    expect(source).toContain("window.addEventListener('fcc:start-video-call'")
    expect(source).toContain("const side = isMobile || avoidVideoDock ? { left: 12 } : { right: 18 }")
  })

  it('provides a targeted authenticated Twilio hang-up endpoint', () => {
    expect(fs.existsSync(path.join(root, 'app/api/twilio/hangup/route.js'))).toBe(true)
  })

  it('groups conference participants into one target and keeps unrelated calls independent', () => {
    const connection = { parameters: { CallSid: CALL_ONE } }
    const entries = buildActiveCallEntries({
      calls: [
        { sid: CALL_ONE, from: 'client:carl', to: '***0101', status: 'in-progress' },
        { sid: CALL_TWO, from: '***0101', to: 'client:carl', status: 'in-progress' },
        { sid: CALL_THREE, from: 'client:carl', to: '***0303', status: 'ringing' },
      ],
      conferences: [{
        sid: CONFERENCE_ONE,
        friendlyName: 'ff-research',
        status: 'in-progress',
        dateCreated: '2026-07-12T16:00:00Z',
        participants: [
          { callSid: CALL_ONE, from: 'client:carl', to: '***0101', isClient: true },
          { callSid: CALL_TWO, from: '***0101', to: 'client:carl', isClient: false },
        ],
      }],
    }, [{
      id: 'conference-name:ff-research',
      conferenceName: 'ff-research',
      name: 'Marge',
      number: '***0101',
      startedAt: Date.parse('2026-07-12T16:00:00Z'),
      connection,
    }])

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: `conference:${CONFERENCE_ONE}`,
      label: 'Marge',
      partyLabel: 'client:carl ↔ ***0101',
      conferenceName: 'ff-research',
      held: false,
      target: { conferenceSid: CONFERENCE_ONE },
      connection,
    })
    expect(entries[1]).toMatchObject({
      id: `call:${CALL_THREE}`,
      label: '***0303',
      partyLabel: 'client:carl → ***0303',
      target: { callSid: CALL_THREE },
    })
  })

  it('masks local phone hints and both displayed call parties defensively', () => {
    const hint = createActiveCallHint({
      number: '+18285550101',
      callSid: CALL_ONE,
    }, 1000)
    expect(hint).toMatchObject({ number: '***0101', label: '***0101' })

    const [entry] = buildActiveCallEntries({
      calls: [{
        sid: CALL_ONE,
        from: '+18285550101',
        to: '+18285550303',
        status: 'in-progress',
      }],
    })
    expect(entry.partyLabel).toBe('***0101 → ***0303')
    expect(entry.partyLabel).not.toContain('1828555')
  })

  it('creates an immediate persistent hint from voice-initiated dialing', () => {
    const connection = { parameters: { CallSid: CALL_ONE } }
    expect(createActiveCallHint({
      name: 'Maggie client',
      number: '+18285550101',
      conf: 'ff-voice-dial',
      connection,
    }, 1000)).toMatchObject({
      id: 'conference-name:ff-voice-dial',
      conferenceName: 'ff-voice-dial',
      callSid: CALL_ONE,
      label: 'Maggie client',
      startedAt: 1000,
      connection,
    })
  })

  it('normalizes only a single Twilio call or conference target', () => {
    expect(normalizeHangupTarget({ callSid: CALL_ONE })).toEqual({ kind: 'call', callSid: CALL_ONE })
    expect(normalizeHangupTarget({ conferenceSid: CONFERENCE_ONE })).toEqual({ kind: 'conference', conferenceSid: CONFERENCE_ONE })
    expect(normalizeHangupTarget({ conferenceName: 'ff-carl-1' })).toEqual({ kind: 'conference-name', conferenceName: 'ff-carl-1' })
    expect(() => normalizeHangupTarget({ callSid: 'CA-not-valid' })).toThrow(/valid callSid/i)
    expect(() => normalizeHangupTarget({})).toThrow(/target required/i)
  })

  it('formats call duration without inventing a duration when start time is unavailable', () => {
    expect(formatCallDuration(null, 90_000)).toBe('')
    expect(formatCallDuration(30_000, 90_000)).toBe('01:00')
    expect(formatCallDuration(30_000, 3_750_000)).toBe('1:02:00')
  })

  it('hangs up exactly one call SID through the authenticated endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ sid: CALL_ONE, status: 'completed' })))
    const { POST } = await import('../app/api/twilio/hangup/route')

    const response = await POST(request({ callSid: CALL_ONE }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, terminated: 1, target: { callSid: CALL_ONE } })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/Calls/${CALL_ONE}\\.json$`)),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetch.mock.calls[0][1].body.toString()).toBe('Status=completed')
  })

  it('hangs up one conference SID without enumerating or touching other calls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ sid: CONFERENCE_ONE, status: 'completed' })))
    const { POST } = await import('../app/api/twilio/hangup/route')

    const response = await POST(request({ conferenceSid: CONFERENCE_ONE }))
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, terminated: 1, target: { conferenceSid: CONFERENCE_ONE } })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toMatch(new RegExp(`/Conferences/${CONFERENCE_ONE}\\.json$`))
    expect(fetch.mock.calls[0][0]).not.toContain('/Calls')
  })

  it('resolves an exact conference name and terminates only that conference', async () => {
    const OTHER = `CF${'b'.repeat(32)}`
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/Conferences.json?')) {
        return json({ conferences: [
          { sid: OTHER, friendly_name: 'ff-other', status: 'in-progress' },
          { sid: CONFERENCE_ONE, friendly_name: 'ff-target', status: 'in-progress' },
        ] })
      }
      return json({ sid: CONFERENCE_ONE, status: 'completed' })
    }))
    const { POST } = await import('../app/api/twilio/hangup/route')

    const response = await POST(request({ conferenceName: 'ff-target' }))
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, terminated: 1, target: { conferenceSid: CONFERENCE_ONE } })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toMatch(new RegExp(`/Conferences/${CONFERENCE_ONE}\\.json$`))
    expect(fetch.mock.calls.flatMap(call => call[0])).not.toContain(expect.stringContaining('/Participants'))
  })

  it('rejects unauthenticated targeted hang-up before contacting Twilio', async () => {
    permission.result = {
      user: null,
      error: new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 }),
    }
    vi.stubGlobal('fetch', vi.fn())
    const { POST } = await import('../app/api/twilio/hangup/route')

    const response = await POST(request({ callSid: CALL_ONE }))

    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never pairs an API key SID with the account auth token', async () => {
    vi.stubEnv('TWILIO_API_KEY_SECRET', '')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'account-auth-token')
    vi.stubGlobal('fetch', vi.fn(async () => json({ sid: CALL_ONE, status: 'completed' })))
    const { POST } = await import('../app/api/twilio/hangup/route')

    const response = await POST(request({ callSid: CALL_ONE }))

    expect(response.status).toBe(200)
    const expected = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:account-auth-token`).toString('base64')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Basic ${expected}`)
  })
})
