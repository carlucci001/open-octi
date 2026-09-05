import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getTwilioConfig,
  trackPendingConferenceCall,
  twilioRequest,
} from '@/lib/twilio-account-control'
import { verifyTwilioWebhook } from '@/lib/twilio-webhook-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Twilio hits this endpoint when the browser SDK places a call.
// Carl's browser leg joins a conference; we asynchronously dial the destination
// into the SAME conference. Once both legs are in, Twilio's native bridge connects them.
// This pattern makes native Hold/Resume + default hold music trivial via the
// Conferences Participants API.

function getTunnelBaseUrl() {
  try {
    const txt = readFileSync(join(process.cwd(), 'data/tunnel-logs/tunnel-url.txt'), 'utf8').trim()
    return txt.replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalize(num) {
  if (!num) return null
  const digits = String(num).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return '+' + digits
}

async function dialDestinationIntoConference({ target, confName, baseUrl, requestedFrom }) {
  const config = getTwilioConfig()
  let from = process.env.TWILIO_PHONE_NUMBER
  if (!config || !from) return

  if (requestedFrom) {
    try {
      const inventory = await twilioRequest(config, `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(requestedFrom)}&PageSize=20`)
      if ((inventory.incoming_phone_numbers || []).some(line => normalize(line.phone_number) === normalize(requestedFrom))) from = normalize(requestedFrom)
    } catch (error) {
      console.error('[twilio] caller ID validation error:', error.message)
    }
  }

  try {
    const call = await twilioRequest(config, '/Calls.json', {
      method: 'POST',
      body: {
        From: from,
        To: target,
        Url: `${baseUrl}/api/twilio/outbound?conf=${encodeURIComponent(confName)}`,
        Timeout: '30',
      },
    })
    trackPendingConferenceCall(confName, call.sid)
  } catch (e) {
    console.error('[twilio] dial destination error:', e.message)
  }
}

async function handle(request) {
  const authError = await verifyTwilioWebhook(request)
  if (authError) return authError
  const url = new URL(request.url)
  let to = url.searchParams.get('To') || url.searchParams.get('to')
  let conf = url.searchParams.get('Conf') || url.searchParams.get('conf')
  let listenConf = url.searchParams.get('ListenConf') || url.searchParams.get('listenConf')
  let fromNumber = url.searchParams.get('FromNumber') || url.searchParams.get('fromNumber')

  if ((!to || !conf || !listenConf) && request.method === 'POST') {
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('application/x-www-form-urlencoded')) {
      const body = await request.text()
      const params = new URLSearchParams(body)
      to = to || params.get('To') || params.get('to')
      conf = conf || params.get('Conf') || params.get('conf')
      listenConf = listenConf || params.get('ListenConf') || params.get('listenConf')
      fromNumber = fromNumber || params.get('FromNumber') || params.get('fromNumber')
    }
  }

  if (listenConf) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" muted="true" startConferenceOnEnter="false" endConferenceOnExit="false">${listenConf}</Conference>
  </Dial>
</Response>`

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    })
  }

  const target = normalize(to)
  if (!target) {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">No destination number was provided. Goodbye.</Say></Response>`, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    })
  }

  const confName = conf || ('ff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))

  const baseUrl = getTunnelBaseUrl() || `${url.protocol}//${url.host}`

  void dialDestinationIntoConference({ target, confName, baseUrl, requestedFrom: normalize(fromNumber) })

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" waitUrl="${baseUrl}/api/twilio/wait">${confName}</Conference>
  </Dial>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

export const GET = handle
export const POST = handle
