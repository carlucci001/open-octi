import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const permissions = vi.hoisted(() => ({
  requireCapability: vi.fn(),
}))

vi.mock('@/lib/permissions', () => permissions)

import { GET as getActiveCalls } from '../app/api/twilio/active/route.js'
import { POST as killAllCalls } from '../app/api/twilio/kill-all/route.js'
import { POST as hangupTarget } from '../app/api/twilio/hangup/route.js'
import { POST as hangupConference } from '../app/api/twilio/hangup-conf/route.js'
import { POST as setConferenceHold } from '../app/api/twilio/hold/route.js'
import {
  clearPendingConferenceCall,
  trackPendingConferenceCall,
} from '../lib/twilio-account-control.js'

const ACCOUNT_SID = `AC${'1'.repeat(32)}`
const KEY_SID = `SK${'2'.repeat(32)}`
const CALL_ONE = `CA${'3'.repeat(32)}`
const CALL_TWO = `CA${'4'.repeat(32)}`
const CONFERENCE_ONE = `CF${'5'.repeat(32)}`
const CONFERENCE_OTHER = `CF${'6'.repeat(32)}`

function response(data = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  const options = { method }
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  return new Request(`https://openocti.local${path}`, options)
}

function fetchUrls(fetchMock) {
  return fetchMock.mock.calls.map(([url]) => String(url))
}

describe('Twilio account controls', () => {
  beforeEach(() => {
    permissions.requireCapability.mockReset()
    permissions.requireCapability.mockResolvedValue({
      user: { id: 'usr_owner', role: 'owner' },
      error: null,
    })
    vi.stubEnv('TWILIO_ACCOUNT_SID', ACCOUNT_SID)
    vi.stubEnv('TWILIO_API_KEY_SID', KEY_SID)
    vi.stubEnv('TWILIO_API_KEY_SECRET', 'key-secret')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'account-token')
  })

  afterEach(() => {
    clearPendingConferenceCall('ff-starting')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('requires settings management for every account-level enumerate or mutation route', async () => {
    permissions.requireCapability.mockResolvedValue({
      user: null,
      error: response({ ok: false, error: 'permission denied' }, 403),
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([
      getActiveCalls(request('/api/twilio/active')),
      killAllCalls(request('/api/twilio/kill-all', {})),
      hangupTarget(request('/api/twilio/hangup', { callSid: CALL_ONE })),
      hangupConference(request('/api/twilio/hangup-conf', { conf: 'ff-target' })),
      setConferenceHold(request('/api/twilio/hold', { conf: 'ff-target', hold: true })),
    ])

    expect(results.map(result => result.status)).toEqual([403, 403, 403, 403, 403])
    expect(permissions.requireCapability).toHaveBeenCalledTimes(5)
    for (const [, capability] of permissions.requireCapability.mock.calls) {
      expect(capability).toBe('settings:manage')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the account SID and auth token when an API key pair is incomplete', async () => {
    vi.stubEnv('TWILIO_API_KEY_SECRET', '')
    const fetchMock = vi.fn(async url => (
      String(url).includes('/Conferences.json')
        ? response({ conferences: [] })
        : response({ calls: [] })
    ))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getActiveCalls(request('/api/twilio/active'))

    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenCalled()
    const authorization = fetchMock.mock.calls[0][1].headers.Authorization
    expect(Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8'))
      .toBe(`${ACCOUNT_SID}:account-token`)
  })

  it('returns a non-success response instead of an empty active snapshot when Twilio fails', async () => {
    const fetchMock = vi.fn(async url => {
      const value = String(url)
      if (value.includes('Status=ringing')) {
        return response({ message: 'upstream rejected key-secret' }, 500)
      }
      return value.includes('/Conferences.json')
        ? response({ conferences: [] })
        : response({ calls: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getActiveCalls(request('/api/twilio/active'))
    const body = await result.json()

    expect(result.status).toBe(502)
    expect(body).toMatchObject({ ok: false, configured: true })
    expect(body).not.toHaveProperty('count', 0)
    expect(JSON.stringify(body)).not.toContain('key-secret')
  })

  it('reuses listed active calls for conference participants without per-participant call requests', async () => {
    const fetchMock = vi.fn(async url => {
      const value = String(url)
      if (value.includes('/Calls.json?Status=in-progress')) {
        return response({ calls: [{
          sid: CALL_ONE,
          from: 'client:carl',
          to: '+18285550199',
          status: 'in-progress',
          direction: 'outbound-api',
        }] })
      }
      if (value.includes('/Calls.json?')) return response({ calls: [] })
      if (value.includes('/Conferences.json?')) {
        return response({ conferences: [{
          sid: CONFERENCE_ONE,
          friendly_name: 'ff-target',
          status: 'in-progress',
        }] })
      }
      if (value.includes(`/Conferences/${CONFERENCE_ONE}/Participants.json`)) {
        return response({ participants: [{ call_sid: CALL_ONE, muted: false, hold: false, status: 'connected' }] })
      }
      throw new Error(`Unexpected request: ${value}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getActiveCalls(request('/api/twilio/active'))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body.conferences[0].participants[0]).toMatchObject({
      callSid: CALL_ONE,
      from: 'client:carl',
      to: '***0199',
      isClient: true,
    })
    expect(fetchUrls(fetchMock)).not.toContain(expect.stringContaining(`/Calls/${CALL_ONE}.json`))
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('reports kill-all partial failure truthfully and does not expose upstream secrets', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (options.method !== 'POST' && value.includes('Status=in-progress')) {
        return response({ calls: [{ sid: CALL_ONE }] })
      }
      if (options.method !== 'POST' && value.includes('Status=ringing')) {
        return response({ calls: [{ sid: CALL_TWO }] })
      }
      if (options.method !== 'POST') return response({ calls: [] })
      if (value.includes(CALL_ONE)) return response({ sid: CALL_ONE, status: 'completed' })
      return response({ message: 'bad key-secret' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await killAllCalls(request('/api/twilio/kill-all', {}))
    const body = await result.json()

    expect(result.status).toBe(502)
    expect(body).toMatchObject({
      ok: false,
      partial: true,
      attempted: 2,
      killed: 1,
      failed: 1,
    })
    expect(JSON.stringify(body)).not.toContain('key-secret')
  })

  it('retries exact conference-name resolution before targeted hang-up succeeds', async () => {
    let lookups = 0
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/Conferences.json?')) {
        lookups += 1
        if (lookups < 3) return response({ conferences: [] })
        return response({ conferences: [
          { sid: CONFERENCE_OTHER, friendly_name: 'ff-other', status: 'in-progress' },
          { sid: CONFERENCE_ONE, friendly_name: 'ff-target', status: 'in-progress' },
        ] })
      }
      expect(options.method).toBe('POST')
      return response({ sid: CONFERENCE_ONE, status: 'completed' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await hangupTarget(request('/api/twilio/hangup', { conferenceName: 'ff-target' }))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body).toMatchObject({ ok: true, terminated: 1, target: { conferenceSid: CONFERENCE_ONE } })
    expect(lookups).toBe(3)
    expect(fetchUrls(fetchMock).at(-1)).toContain(`/Conferences/${CONFERENCE_ONE}.json`)
  })

  it('returns a truthful pending response when a named conference is not present after bounded retry', async () => {
    const fetchMock = vi.fn(async () => response({ conferences: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await hangupTarget(request('/api/twilio/hangup', { conferenceName: 'ff-starting' }))
    const body = await result.json()

    expect(result.status).toBe(409)
    expect(body).toMatchObject({ ok: false, pending: true, terminated: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('terminates the exact tracked outbound leg before its conference has materialized', async () => {
    trackPendingConferenceCall('ff-starting', CALL_TWO)
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/Conferences.json?')) return response({ conferences: [] })
      expect(value).toContain(`/Calls/${CALL_TWO}.json`)
      expect(options.method).toBe('POST')
      return response({ sid: CALL_TWO, status: 'completed' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await hangupTarget(request('/api/twilio/hangup', { conferenceName: 'ff-starting' }))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      terminated: 1,
      target: { conferenceName: 'ff-starting', callSid: CALL_TWO },
    })
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it('records the REST-created destination call against its exact conference name', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/api/twilio/voice/route.js'), 'utf8')
    expect(source).toContain('trackPendingConferenceCall(confName, call.sid)')
  })

  it.each([
    ['call', { callSid: CALL_ONE }, { callSid: CALL_ONE }],
    ['conference', { conferenceSid: CONFERENCE_ONE }, { conferenceSid: CONFERENCE_ONE }],
  ])('treats a clearly stale direct %s as already inactive', async (_kind, target, expectedTarget) => {
    const fetchMock = vi.fn(async () => response({ code: 20404, message: 'The requested resource was not found' }, 404))
    vi.stubGlobal('fetch', fetchMock)

    const result = await hangupTarget(request('/api/twilio/hangup', target))
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(body).toMatchObject({ ok: true, terminated: 0, target: expectedTarget })
  })

  it('legacy conference hang-up terminates only the exact named conference and never scans ringing calls', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/Conferences.json?')) {
        return response({ conferences: [
          { sid: CONFERENCE_OTHER, friendly_name: 'ff-other', status: 'in-progress' },
          { sid: CONFERENCE_ONE, friendly_name: 'ff-target', status: 'in-progress' },
        ] })
      }
      expect(options.method).toBe('POST')
      return response({ sid: CONFERENCE_ONE, status: 'completed' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await hangupConference(request('/api/twilio/hangup-conf', { conf: 'ff-target' }))
    const body = await result.json()
    const urls = fetchUrls(fetchMock)

    expect(result.status).toBe(200)
    expect(body).toMatchObject({ ok: true, terminated: 1, target: { conferenceSid: CONFERENCE_ONE } })
    expect(urls.at(-1)).toContain(`/Conferences/${CONFERENCE_ONE}.json`)
    expect(urls.some(url => url.includes('/Calls.json?Status=ringing'))).toBe(false)
  })

  it('legacy conference hang-up reports pending rather than false success while the room is starting', async () => {
    const fetchMock = vi.fn(async () => response({ conferences: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await hangupConference(request('/api/twilio/hangup-conf', { conf: 'ff-starting' }))
    const body = await result.json()

    expect(result.status).toBe(409)
    expect(body).toMatchObject({ ok: false, pending: true, terminated: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('hold resolves the exact conference and fails when Twilio rejects a participant update', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/Conferences.json?')) {
        return response({ conferences: [
          { sid: CONFERENCE_OTHER, friendly_name: 'ff-other', status: 'in-progress' },
          { sid: CONFERENCE_ONE, friendly_name: 'ff-target', status: 'in-progress' },
        ] })
      }
      if (value.includes(`/Conferences/${CONFERENCE_ONE}/Participants.json`)) {
        return response({ participants: [{ call_sid: CALL_ONE }] })
      }
      if (value.includes(`/Calls/${CALL_ONE}.json`)) {
        return response({ sid: CALL_ONE, from: '+18285550199', to: '+18285550200' })
      }
      if (options.method === 'POST') return response({ message: 'hold rejected' }, 503)
      throw new Error(`Unexpected request: ${value}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await setConferenceHold(request('/api/twilio/hold', { conf: 'ff-target', hold: true }))
    const body = await result.json()

    expect(result.status).toBe(502)
    expect(body).toMatchObject({ ok: false })
    expect(fetchUrls(fetchMock).some(url => url.includes(CONFERENCE_OTHER) && url.includes('/Participants'))).toBe(false)
  })
})
