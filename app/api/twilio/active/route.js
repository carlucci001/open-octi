import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { getTwilioConfig, twilioRequest } from '@/lib/twilio-account-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanPhone(value) {
  if (!value) return ''
  const raw = String(value)
  if (raw.startsWith('client:')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 4) return `***${digits.slice(-4)}`
  return raw
}

function publicCall(call) {
  return {
    sid: call.sid,
    from: cleanPhone(call.from),
    to: cleanPhone(call.to),
    status: call.status,
    start: call.start_time,
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'settings:manage')
  if (error) return error

  const config = getTwilioConfig()
  if (!config) return NextResponse.json({ configured: false, count: 0 })

  try {
    const results = await Promise.all([
      twilioRequest(config, '/Calls.json?Status=in-progress&PageSize=20'),
      twilioRequest(config, '/Calls.json?Status=ringing&PageSize=20'),
      twilioRequest(config, '/Calls.json?Status=queued&PageSize=20'),
      twilioRequest(config, '/Conferences.json?Status=in-progress&PageSize=20'),
    ])

    const callMap = new Map()
    for (const result of results.slice(0, 3)) {
      for (const call of result.calls || []) {
        if (call?.sid) callMap.set(call.sid, call)
      }
    }
    const calls = [...callMap.values()]

    const conferences = await Promise.all((results[3].conferences || []).map(async conference => {
      const partList = await twilioRequest(
        config,
        `/Conferences/${conference.sid}/Participants.json?PageSize=20`,
      )
      const participants = (partList.participants || []).map(participant => {
        const call = callMap.get(participant.call_sid) || {}
        return {
          callSid: participant.call_sid,
          muted: !!participant.muted,
          hold: !!participant.hold,
          status: participant.status,
          from: cleanPhone(call.from),
          to: cleanPhone(call.to),
          direction: call.direction || '',
          isClient: String(call.from || '').startsWith('client:')
            || String(call.to || '').startsWith('client:'),
        }
      })
      return {
        sid: conference.sid,
        friendlyName: conference.friendly_name,
        status: conference.status,
        dateCreated: conference.date_created,
        participants,
      }
    }))

    return NextResponse.json({
      configured: true,
      count: calls.length,
      calls: calls.map(publicCall),
      conferences,
    })
  } catch {
    return NextResponse.json({
      ok: false,
      configured: true,
      error: 'Unable to verify active Twilio calls',
    }, { status: 502 })
  }
}
