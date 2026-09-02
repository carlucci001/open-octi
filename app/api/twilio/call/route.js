import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One-click click-to-call via Twilio.
// Flow:
//   1. CRM POSTs { to: "<destination phone>" }
//   2. We tell Twilio: call Carl's cell first (TWILIO_CARL_CELL)
//      When Carl answers, Twilio fetches the TwiML at /api/twilio/bridge
//      which instructs it to <Dial> the destination number.
//   3. Carl picks up. Destination rings. They talk.
// Zero browser UI at any step.

function normalize(num) {
  if (!num) return null
  const digits = String(num).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return '+' + digits
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  try {
    const { to } = await request.json()
    const destination = normalize(to)
    if (!destination) return NextResponse.json({ ok: false, error: 'Missing or invalid `to` phone number' }, { status: 400 })

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    // Prefer API Key auth (SK SID + Secret) which is Twilio's current recommendation.
    // Fall back to legacy Auth Token if no API key is configured.
    const authSid = process.env.TWILIO_API_KEY_SID || accountSid
    const authToken = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN
    const twilioNumber = normalize(process.env.TWILIO_PHONE_NUMBER)
    const carlCell = normalize(process.env.TWILIO_CARL_CELL)

    if (!accountSid || !authToken) return NextResponse.json({ ok: false, error: 'TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SECRET (or TWILIO_AUTH_TOKEN) must be set in .env.local' }, { status: 400 })
    if (!twilioNumber) return NextResponse.json({ ok: false, error: 'TWILIO_PHONE_NUMBER not set (your Twilio-provisioned number, e.g. +18287709428)' }, { status: 400 })
    if (!carlCell) return NextResponse.json({ ok: false, error: 'TWILIO_CARL_CELL not set (your personal cell Twilio should ring first)' }, { status: 400 })

    // Public URL where Twilio can fetch the TwiML. Comes from .env, or falls back
    // to the cloudflared tunnel URL that start-farrington.bat already maintains.
    let publicBase = process.env.PUBLIC_APP_URL
    if (!publicBase) {
      try {
        const fs = await import('fs')
        const p = process.cwd() + '/data/tunnel-logs/tunnel-url.txt'
        if (fs.existsSync(p)) publicBase = fs.readFileSync(p, 'utf-8').trim()
      } catch {}
    }
    if (!publicBase) return NextResponse.json({ ok: false, error: 'No public base URL — start-farrington.bat must be running so Twilio can reach the bridge TwiML endpoint' }, { status: 400 })

    const bridgeUrl = `${publicBase}/api/twilio/bridge?target=${encodeURIComponent(destination)}`

    // Initiate the call via Twilio REST API
    const body = new URLSearchParams({
      To: carlCell,              // ring Carl first
      From: twilioNumber,        // from your Twilio business line
      Url: bridgeUrl,            // when Carl picks up, Twilio fetches this to get dial instructions
      Method: 'GET',
    })
    const auth = Buffer.from(`${authSid}:${authToken}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ ok: false, error: data.message || 'Twilio rejected the call', twilio: data }, { status: 502 })

    return NextResponse.json({ ok: true, callSid: data.sid, status: data.status, to: destination })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
