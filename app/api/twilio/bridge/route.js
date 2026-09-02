import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Twilio fetches this once Carl picks up on his cell.
// We return TwiML that dials the actual destination number.
// Both legs are then bridged into a single call.

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('target') || ''
  const callerId = process.env.TWILIO_PHONE_NUMBER || ''

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting your call.</Say>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${target}</Number>
  </Dial>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}
