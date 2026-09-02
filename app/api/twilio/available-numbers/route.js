import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID missing from env')
  let basic
  if (apiKeySid && apiKeySecret) basic = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64')
  else if (authToken) basic = Buffer.from(`${sid}:${authToken}`).toString('base64')
  else throw new Error('Twilio auth missing - need TWILIO_API_KEY_SID/SECRET or TWILIO_AUTH_TOKEN')
  return { sid, header: `Basic ${basic}` }
}

async function twilio(path) {
  const { sid, header } = twilioAuth()
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    headers: { Authorization: header },
    cache: 'no-store',
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${data?.message || data?.detail || text.slice(0, 200)}`)
  return data
}

function normalizePrefixes(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/)
  return raw.map(v => String(v || '').replace(/\D/g, '').slice(0, 3)).filter(v => v.length === 3)
}

function localPrefix(phoneNumber = '') {
  const digits = String(phoneNumber || '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-7, -4) : ''
}

function publicNumber(number) {
  const capabilities = number.capabilities || {}
  return {
    phoneNumber: number.phone_number,
    friendlyName: number.friendly_name || number.phone_number,
    locality: number.locality || '',
    region: number.region || '',
    postalCode: number.postal_code || '',
    isoCountry: number.iso_country || 'US',
    localPrefix: localPrefix(number.phone_number),
    voice: !!capabilities.voice,
    sms: !!capabilities.sms,
    mms: !!capabilities.mms,
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:manage')
  if (error) return error

  const url = new URL(request.url)
  const areaCode = (url.searchParams.get('areaCode') || '828').replace(/\D/g, '').slice(0, 3)
  const prefixes = normalizePrefixes(url.searchParams.get('prefixes') || url.searchParams.get('prefix'))
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 8) || 8, 20))

  try {
    const search = await twilio(`/AvailablePhoneNumbers/US/Local.json?AreaCode=${encodeURIComponent(areaCode)}&VoiceEnabled=true&SmsEnabled=true&PageSize=50`)
    let numbers = (search.available_phone_numbers || []).map(publicNumber)
    if (prefixes.length) numbers = numbers.filter(n => prefixes.includes(n.localPrefix))
    return NextResponse.json({
      ok: true,
      areaCode,
      prefixes,
      count: numbers.length,
      numbers: numbers.slice(0, limit),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 })
  }
}
