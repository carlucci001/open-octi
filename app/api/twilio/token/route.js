import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Generate a short-lived Twilio access token so the browser can connect directly
// to Twilio via WebRTC. The browser uses this token with @twilio/voice-sdk to
// place outbound calls — audio flows through the computer's mic and speakers.
// No phone, no cell, no intermediate device.

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  const appSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !apiKeySid || !apiKeySecret || !appSid) {
    return NextResponse.json({ error: 'Twilio env not fully configured' }, { status: 400 })
  }

  const AccessToken = twilio.jwt.AccessToken
  const VoiceGrant = AccessToken.VoiceGrant

  const url = new URL(request.url)
  const requestedIdentity = (url.searchParams.get('identity') || '').trim()
  const identity = /^[a-zA-Z0-9_-]{1,64}$/.test(requestedIdentity) ? requestedIdentity : 'carl'
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600, // 1 hour
  })

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: appSid,
    incomingAllow: false, // outbound only for now
  })
  token.addGrant(voiceGrant)

  return NextResponse.json({ token: token.toJwt(), identity })
}
