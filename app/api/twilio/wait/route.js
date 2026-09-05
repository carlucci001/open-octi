import { NextResponse } from 'next/server'
import { verifyTwilioWebhook } from '@/lib/twilio-webhook-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Twilio calls this as waitUrl while waiting for the called party to answer.
// Plays Twilio demo hold music while waiting for the called party to answer.
const WAIT = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="20">https://demo.twilio.com/docs/classic.mp3</Play>
</Response>`

async function handle(request) {
  const authError = await verifyTwilioWebhook(request)
  if (authError) return authError
  return new NextResponse(WAIT, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export const GET = handle
export const POST = handle
