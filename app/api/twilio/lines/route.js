import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { readData } from '@/lib/dataStore'
import { getTwilioConfig, twilioRequest } from '@/lib/twilio-account-control'
import { normalizeCommunicationNumber, resolveLineOwnership } from '@/lib/communicationLines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  const config = getTwilioConfig()
  if (!config) return NextResponse.json({ ok: false, lines: [], error: 'Twilio is not configured.' }, { status: 400 })
  try {
    const data = await twilioRequest(config, '/IncomingPhoneNumbers.json?PageSize=1000')
    const leases = (readData('leases.json') || { leases: [] }).leases || []
    const bySid = new Map(leases.filter(item => item.twilioSid).map(item => [item.twilioSid, item]))
    const byNumber = new Map(leases.filter(item => item.twilioPhoneNumber).map(item => [normalizeCommunicationNumber(item.twilioPhoneNumber), item]))
    const lines = (data.incoming_phone_numbers || []).map(item => {
      const lease = bySid.get(item.sid) || byNumber.get(normalizeCommunicationNumber(item.phone_number))
      return { sid: item.sid, phoneNumber: item.phone_number, friendlyName: item.friendly_name, ...resolveLineOwnership(item, lease) }
    })
    return NextResponse.json({ ok: true, lines, defaultNumber: lines.find(line => line.phoneNumber === process.env.TWILIO_PHONE_NUMBER)?.phoneNumber || lines[0]?.phoneNumber || null })
  } catch (cause) {
    return NextResponse.json({ ok: false, lines: [], error: cause.message || 'Unable to load Twilio lines.' }, { status: 502 })
  }
}
