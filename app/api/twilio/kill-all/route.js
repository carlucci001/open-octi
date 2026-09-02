import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import {
  getTwilioConfig,
  isTwilioNotFound,
  twilioRequest,
} from '@/lib/twilio-account-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireCapability(request, 'settings:manage')
  if (error) return error

  const config = getTwilioConfig()
  if (!config) {
    return NextResponse.json({ ok: false, error: 'Twilio call control is not configured' }, { status: 503 })
  }

  let calls
  try {
    const results = await Promise.all([
      twilioRequest(config, '/Calls.json?Status=in-progress&PageSize=50'),
      twilioRequest(config, '/Calls.json?Status=ringing&PageSize=50'),
      twilioRequest(config, '/Calls.json?Status=queued&PageSize=50'),
    ])
    const bySid = new Map()
    for (const result of results) {
      for (const call of result.calls || []) {
        if (call?.sid) bySid.set(call.sid, call)
      }
    }
    calls = [...bySid.values()]
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'Unable to enumerate active Twilio calls',
    }, { status: 502 })
  }

  let killed = 0
  let alreadyInactive = 0
  const errors = []
  for (const call of calls) {
    try {
      await twilioRequest(config, `/Calls/${call.sid}.json`, {
        method: 'POST',
        body: { Status: 'completed' },
      })
      killed += 1
    } catch (error) {
      if (isTwilioNotFound(error)) {
        alreadyInactive += 1
      } else {
        errors.push({ sid: call.sid, status: error?.status || 502 })
      }
    }
  }

  const result = {
    ok: errors.length === 0,
    partial: errors.length > 0 && killed + alreadyInactive > 0,
    attempted: calls.length,
    killed,
    alreadyInactive,
    failed: errors.length,
    errors,
  }
  return NextResponse.json(result, { status: errors.length > 0 ? 502 : 200 })
}
