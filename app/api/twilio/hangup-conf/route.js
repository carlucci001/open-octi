import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import {
  clearPendingConferenceCall,
  getPendingConferenceCall,
  getTwilioConfig,
  isTwilioNotFound,
  normalizeConferenceName,
  resolveActiveConference,
  twilioRequest,
} from '@/lib/twilio-account-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireCapability(request, 'settings:manage')
  if (error) return error

  let input
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'A JSON conference target is required' }, { status: 400 })
  }
  const conferenceName = normalizeConferenceName(input?.conf)
  if (!conferenceName) {
    return NextResponse.json({ ok: false, error: 'A valid conference name is required' }, { status: 400 })
  }

  const config = getTwilioConfig()
  if (!config) {
    return NextResponse.json({ ok: false, error: 'Twilio call control is not configured' }, { status: 503 })
  }

  let conference
  try {
    conference = await resolveActiveConference(config, conferenceName)
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to resolve the Twilio conference' }, { status: 502 })
  }

  if (!conference) {
    const pendingCallSid = getPendingConferenceCall(conferenceName)
    if (pendingCallSid) {
      try {
        await twilioRequest(config, `/Calls/${pendingCallSid}.json`, {
          method: 'POST',
          body: { Status: 'completed' },
        })
        clearPendingConferenceCall(conferenceName)
        return NextResponse.json({
          ok: true,
          terminated: 1,
          target: { conferenceName, callSid: pendingCallSid },
        })
      } catch (error) {
        if (isTwilioNotFound(error)) {
          clearPendingConferenceCall(conferenceName)
          return NextResponse.json({
            ok: true,
            terminated: 0,
            target: { conferenceName, callSid: pendingCallSid },
            note: 'Call is already inactive',
          })
        }
        return NextResponse.json({ ok: false, error: 'Conference hang-up failed' }, { status: 502 })
      }
    }
    return NextResponse.json({
      ok: false,
      pending: true,
      terminated: 0,
      target: { conferenceName },
      error: 'Conference is not active yet; retry hang-up',
    }, { status: 409 })
  }

  try {
    await twilioRequest(config, `/Conferences/${conference.sid}.json`, {
      method: 'POST',
      body: { Status: 'completed' },
    })
    clearPendingConferenceCall(conferenceName)
    return NextResponse.json({
      ok: true,
      terminated: 1,
      target: { conferenceSid: conference.sid },
    })
  } catch (error) {
    if (isTwilioNotFound(error)) {
      clearPendingConferenceCall(conferenceName)
      return NextResponse.json({
        ok: true,
        terminated: 0,
        target: { conferenceSid: conference.sid },
        note: 'Conference is already inactive',
      })
    }
    return NextResponse.json({ ok: false, error: 'Conference hang-up failed' }, { status: 502 })
  }
}
