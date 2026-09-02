import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import {
  getTwilioConfig,
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
    return NextResponse.json({ ok: false, error: 'A JSON hold target is required' }, { status: 400 })
  }
  const conferenceName = normalizeConferenceName(input?.conf)
  if (!conferenceName || typeof input?.hold !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'A conference name and boolean hold state are required' }, { status: 400 })
  }

  const config = getTwilioConfig()
  if (!config) {
    return NextResponse.json({ ok: false, error: 'Twilio call control is not configured' }, { status: 503 })
  }

  try {
    const conference = await resolveActiveConference(config, conferenceName, { attempts: 1 })
    if (!conference) {
      return NextResponse.json({
        ok: false,
        error: `Conference "${conferenceName}" is not active`,
      }, { status: 404 })
    }

    const partList = await twilioRequest(
      config,
      `/Conferences/${conference.sid}/Participants.json?PageSize=20`,
    )
    const participantCalls = await Promise.all((partList.participants || []).map(async participant => ({
      participant,
      call: await twilioRequest(config, `/Calls/${participant.call_sid}.json`),
    })))
    const targetSids = participantCalls
      .filter(({ call }) => (
        !String(call.from || '').startsWith('client:')
        && !String(call.to || '').startsWith('client:')
      ))
      .map(({ participant }) => participant.call_sid)

    if (targetSids.length === 0) {
      return NextResponse.json({
        ok: false,
        pending: true,
        error: 'No destination participant is active yet',
      }, { status: 409 })
    }

    const results = []
    const failures = []
    const holdUrl = process.env.TWILIO_HOLD_MUSIC_URL
    for (const callSid of targetSids) {
      const body = { Hold: input.hold ? 'true' : 'false' }
      if (input.hold && holdUrl) body.HoldUrl = holdUrl
      try {
        const updated = await twilioRequest(
          config,
          `/Conferences/${conference.sid}/Participants/${callSid}.json`,
          { method: 'POST', body },
        )
        results.push({ callSid, hold: !!updated.hold })
      } catch (error) {
        failures.push({ callSid, status: error?.status || 502 })
      }
    }

    if (failures.length > 0) {
      return NextResponse.json({
        ok: false,
        partial: results.length > 0,
        hold: input.hold,
        updated: results.length,
        failed: failures.length,
        errors: failures,
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      hold: input.hold,
      participants: results,
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Twilio hold update failed' }, { status: 502 })
  }
}
