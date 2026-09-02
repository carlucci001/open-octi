import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { normalizeHangupTarget } from '@/lib/twilio-call-controls'
import {
  clearPendingConferenceCall,
  getPendingConferenceCall,
  getTwilioConfig,
  isTwilioNotFound,
  resolveActiveConference,
  twilioRequest,
} from '@/lib/twilio-account-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicTarget(target) {
  if (target.kind === 'call') return { callSid: target.callSid }
  if (target.kind === 'conference') return { conferenceSid: target.conferenceSid }
  return { conferenceName: target.conferenceName }
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'settings:manage')
  if (error) return error

  let input
  let conferenceNameToClear = ''
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'A JSON hang-up target is required' }, { status: 400 })
  }

  let target
  try {
    target = normalizeHangupTarget(input)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }

  const config = getTwilioConfig()
  if (!config) {
    return NextResponse.json({ ok: false, error: 'Twilio call control is not configured' }, { status: 503 })
  }

  try {
    if (target.kind === 'conference-name') {
      const conferenceName = target.conferenceName
      const conference = await resolveActiveConference(config, target.conferenceName)
      if (!conference) {
        const pendingCallSid = getPendingConferenceCall(conferenceName)
        if (pendingCallSid) {
          let terminated = 1
          try {
            await twilioRequest(config, `/Calls/${pendingCallSid}.json`, {
              method: 'POST',
              body: { Status: 'completed' },
            })
          } catch (error) {
            if (!isTwilioNotFound(error)) throw error
            terminated = 0
          }
          clearPendingConferenceCall(conferenceName)
          return NextResponse.json({
            ok: true,
            terminated,
            target: { conferenceName, callSid: pendingCallSid },
          })
        }
        return NextResponse.json({
          ok: false,
          pending: true,
          terminated: 0,
          target: publicTarget(target),
          error: 'Conference is not active yet; retry hang-up',
        }, { status: 409 })
      }
      conferenceNameToClear = conferenceName
      target = { kind: 'conference', conferenceSid: conference.sid }
    }

    if (target.kind === 'conference') {
      await twilioRequest(config, `/Conferences/${target.conferenceSid}.json`, {
        method: 'POST',
        body: { Status: 'completed' },
      })
    } else {
      await twilioRequest(config, `/Calls/${target.callSid}.json`, {
        method: 'POST',
        body: { Status: 'completed' },
      })
    }

    if (conferenceNameToClear) clearPendingConferenceCall(conferenceNameToClear)

    return NextResponse.json({
      ok: true,
      terminated: 1,
      target: publicTarget(target),
    })
  } catch (error) {
    if (isTwilioNotFound(error)) {
      if (conferenceNameToClear) clearPendingConferenceCall(conferenceNameToClear)
      return NextResponse.json({
        ok: true,
        terminated: 0,
        target: publicTarget(target),
        note: 'Call is already inactive',
      })
    }
    return NextResponse.json({
      ok: false,
      error: 'Targeted Twilio hang-up failed',
    }, { status: 502 })
  }
}
