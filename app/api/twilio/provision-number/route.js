// Buy a Twilio number AND register it with ElevenLabs against a specific agent.
// Two steps in one shot — used at lease time so the leased agent gets a real phone number.
//
// POST { areaCode?: '828', phoneNumber?: '+18285551212', leaseId: 'lease-xyz' }
//   - Finds an available number in that area code from Twilio
//   - Purchases it
//   - Imports it into ElevenLabs ConvAI as a phone-number bound to the lease's agent
//   - Saves twilioSid + phoneNumber + elevenLabsPhoneNumberId on the lease record
//
// Returns the purchased number + IDs so the UI can confirm.

import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { readOpenclawConfig } from '@/lib/openclaw-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isLocalRequest(request) {
  const host = request.headers.get('host') || ''
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:') || host.startsWith('[::1]:')
}

function getElevenKey() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = (creds.credentials || []).find(c => /eleven/i.test(c.name || ''))
  if (!entry) return null
  const f = (entry.fields || []).find(x => /key|token/i.test(x.label || ''))
  return f?.value?.trim() || null
}

async function getTwilioImportCredentials() {
  if (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) {
    return { sid: process.env.TWILIO_API_KEY_SID, token: process.env.TWILIO_API_KEY_SECRET }
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN }
  }

  try {
    const cfg = await readOpenclawConfig()
    const twilioCfg = cfg?.plugins?.entries?.['voice-call']?.config?.twilio
    const sid = twilioCfg?.apiKeySid || twilioCfg?.accountSid
    const token = twilioCfg?.apiKeySecret || twilioCfg?.authToken
    if (typeof sid === 'string' && sid.trim() && typeof token === 'string' && token.trim()) {
      return { sid: sid.trim(), token: token.trim() }
    }
  } catch {}

  return null
}

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  // Prefer API Key auth (more secure than legacy auth token)
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID missing from env')
  let basic
  if (apiKeySid && apiKeySecret) basic = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64')
  else if (authToken) basic = Buffer.from(`${sid}:${authToken}`).toString('base64')
  else throw new Error('Twilio auth missing — need TWILIO_API_KEY_SID/SECRET or TWILIO_AUTH_TOKEN')
  return { sid, header: `Basic ${basic}` }
}

async function twilio(path, opts = {}) {
  const { sid, header } = twilioAuth()
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      Authorization: header,
      ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: opts.body,
  })
  const text = await r.text()
  let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${data?.message || data?.detail || text.slice(0, 200)}`)
  return data
}

export async function POST(request) {
  if (!isLocalRequest(request)) {
    const { error } = await requireCapability(request, 'agents:manage')
    if (error) return error
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }

  const { leaseId, areaCode, phoneNumber } = body
  if (!leaseId) return NextResponse.json({ ok: false, error: 'leaseId required' }, { status: 400 })

  // Load the lease
  const leasesFile = readData('leases.json') || { leases: [] }
  const lease = (leasesFile.leases || []).find(l => l.id === leaseId)
  if (!lease) return NextResponse.json({ ok: false, error: `lease ${leaseId} not found` }, { status: 404 })
  if (lease.twilioPhoneNumber) return NextResponse.json({ ok: false, error: `lease already has number ${lease.twilioPhoneNumber}` }, { status: 409 })

  // Find the leased agent's ElevenLabs agent_id from the roster
  const roster = readData('voice-agent-roster.json') || {}
  const binding = roster[lease.agentId]
  if (!binding?.agentId) return NextResponse.json({ ok: false, error: `Leased agent ${lease.agentId} has no ElevenLabs binding — clone first` }, { status: 400 })

  try {
    // 1. Use the selected number from the lab, or search Twilio for one.
    const ac = (areaCode || '828').replace(/\D/g, '').slice(0, 3)
    const requestedDigits = String(phoneNumber || '').replace(/\D/g, '')
    let pick
    if (requestedDigits) {
      if (requestedDigits.length < 10) throw new Error('Selected phone number is invalid')
      pick = { phone_number: `+1${requestedDigits.slice(-10)}` }
    } else {
      const search = await twilio(`/AvailablePhoneNumbers/US/Local.json?AreaCode=${ac}&VoiceEnabled=true&SmsEnabled=true&PageSize=5`)
      const candidates = search.available_phone_numbers || []
      if (!candidates.length) {
        // Fall back to any US local number
        const fallback = await twilio(`/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&SmsEnabled=true&PageSize=5`)
        const fc = fallback.available_phone_numbers || []
        if (!fc.length) throw new Error(`No available numbers in area ${ac} or US-wide`)
        candidates.push(...fc)
      }
      pick = candidates[0]
    }

    // 2. Purchase the number
    const purchaseBody = new URLSearchParams({ PhoneNumber: pick.phone_number, FriendlyName: `Lease ${leaseId} — ${lease.tenantName || lease.agentName}` }).toString()
    const purchased = await twilio(`/IncomingPhoneNumbers.json`, { method: 'POST', body: purchaseBody })

    // 3. Register with ElevenLabs
    const apiKey = getElevenKey()
    if (!apiKey) throw new Error('ElevenLabs API key missing')

    const twilioImportCredentials = await getTwilioImportCredentials()
    if (!twilioImportCredentials) throw new Error('Twilio import credentials missing')

    const elR = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers/create', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: pick.phone_number,
        label: `${lease.tenantName} — ${lease.agentName}`,
        provider: 'twilio',
        sid: twilioImportCredentials.sid,
        token: twilioImportCredentials.token,
        agent_id: binding.agentId,
      }),
    })
    const elText = await elR.text()
    let elJ; try { elJ = JSON.parse(elText) } catch { elJ = { raw: elText } }
    if (!elR.ok) {
      // ElevenLabs registration failed — but we already bought the number.
      // Return partial success so the UI can guide manual EL registration.
      lease.twilioSid = purchased.sid
      lease.twilioPhoneNumber = pick.phone_number
      lease.elevenLabsImportStatus = 'pending-manual'
      lease.elevenLabsImportError = elJ?.detail?.message || elJ?.detail || elText.slice(0, 200)
      leasesFile.lastUpdated = new Date().toISOString()
      writeData('leases.json', leasesFile)
      return NextResponse.json({
        ok: true,
        partial: true,
        twilio: { sid: purchased.sid, phoneNumber: pick.phone_number },
        elevenLabsError: lease.elevenLabsImportError,
        message: `Bought ${pick.phone_number} from Twilio. ElevenLabs registration failed: ${lease.elevenLabsImportError}. Register it manually at elevenlabs.io/app/conversational-ai/phone-numbers and bind to agent ${binding.agentId}.`,
      })
    }

    // 4. Now bind the ElevenLabs phone-number to the agent (if not already done by import)
    const phoneNumberId = elJ.phone_number_id || elJ.id
    if (phoneNumberId && elJ.assigned_agent?.agent_id !== binding.agentId) {
      await fetch(`https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneNumberId}`, {
        method: 'PATCH',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_agent: { agent_id: binding.agentId } }),
      })
    }

    // 5. Save everything onto the lease
    lease.twilioSid = purchased.sid
    lease.twilioPhoneNumber = pick.phone_number
    lease.elevenLabsPhoneNumberId = phoneNumberId
    lease.elevenLabsImportStatus = 'live'
    lease.provisionedAt = new Date().toISOString()
    leasesFile.lastUpdated = new Date().toISOString()
    writeData('leases.json', leasesFile)

    return NextResponse.json({
      ok: true,
      twilio: { sid: purchased.sid, phoneNumber: pick.phone_number },
      elevenLabs: { phoneNumberId, agentId: binding.agentId },
      message: `Provisioned ${pick.phone_number} → ${binding.agentId}. Customers can call this number now.`,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
