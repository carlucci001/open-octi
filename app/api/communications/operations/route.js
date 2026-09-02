import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireAdmin } from '@/lib/auth'
import { normalizeCommunicationNumber, resolveLineOwnership } from '@/lib/communicationLines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const money = value => Number.isFinite(Number(value)) ? Math.abs(Number(value)) : null

function elevenKey() {
  const file = readData('credentials.json') || { credentials: [] }
  const credential = (file.credentials || []).find(c => c.id === 'cred_005' || /elevenlabs/i.test(c.name || ''))
  return (credential?.fields || []).find(field => /api|key|token/i.test(field.label || ''))?.value?.trim() || ''
}

async function twilioSnapshot() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET
  if (!accountSid || !keySid || !keySecret) return { ok: false, needsCredential: true, lines: [], warning: 'Twilio credentials are not configured.' }

  const headers = { Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString('base64')}` }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`
  const [numbersResponse, usageResponse] = await Promise.all([
    fetch(`${base}/IncomingPhoneNumbers.json?PageSize=1000`, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) }),
    fetch(`${base}/Usage/Records/ThisMonth.json?PageSize=1000`, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) }),
  ])
  if (!numbersResponse.ok || !usageResponse.ok) throw new Error(`Twilio returned HTTP ${!numbersResponse.ok ? numbersResponse.status : usageResponse.status}`)

  const numbers = (await numbersResponse.json()).incoming_phone_numbers || []
  const usage = (await usageResponse.json()).usage_records || []
  const costs = usage.map(record => ({
    category: record.category || 'other',
    label: record.description || record.category || 'Usage',
    amount: money(record.price) || 0,
  })).filter(item => item.amount > 0)
  return {
    ok: true,
    lines: numbers.map(line => ({ sid: line.sid, phoneNumber: line.phone_number, friendlyName: line.friendly_name, status: line.status || 'active', purchasedAt: line.date_created })),
    monthToDate: costs.reduce((sum, item) => sum + item.amount, 0),
    costCategories: costs.sort((a, b) => b.amount - a.amount).slice(0, 8),
    currency: usage.find(record => record.price_unit)?.price_unit?.toUpperCase() || 'USD',
  }
}

async function elevenSnapshot() {
  const apiKey = elevenKey()
  if (!apiKey) return { ok: false, needsCredential: true, warning: 'ElevenLabs credential is not available.' }
  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`ElevenLabs returned HTTP ${response.status}`)
  const data = await response.json()
  const used = Number(data.character_count) || 0
  const limit = Number(data.character_limit) || 0
  return {
    ok: true,
    plan: data.tier || 'Unknown',
    charactersUsed: used,
    characterLimit: limit,
    percentUsed: limit ? Math.round((used / limit) * 100) : null,
    nextReset: data.next_character_count_reset_unix ? new Date(data.next_character_count_reset_unix * 1000).toISOString() : null,
    nextInvoice: money(data.next_invoice?.amount_due_cents) != null ? money(data.next_invoice.amount_due_cents) / 100 : null,
    currentOverage: money(data.current_overage),
    openInvoices: Array.isArray(data.open_invoices) ? data.open_invoices.length : (Number(data.open_invoices) || 0),
    currency: String(data.currency || 'USD').toUpperCase(),
  }
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const leases = (readData('leases.json') || { leases: [] }).leases || []
  const settled = await Promise.allSettled([twilioSnapshot(), elevenSnapshot()])
  const twilio = settled[0].status === 'fulfilled' ? settled[0].value : { ok: false, lines: [], warning: settled[0].reason?.message || 'Twilio unavailable.' }
  const elevenlabs = settled[1].status === 'fulfilled' ? settled[1].value : { ok: false, warning: settled[1].reason?.message || 'ElevenLabs unavailable.' }

  const assignments = new Map(leases.filter(lease => lease.twilioPhoneNumber).map(lease => [normalizeCommunicationNumber(lease.twilioPhoneNumber), lease]))
  const assignmentsBySid = new Map(leases.filter(lease => lease.twilioSid).map(lease => [lease.twilioSid, lease]))
  twilio.lines = (twilio.lines || []).map(line => {
    const lease = assignmentsBySid.get(line.sid) || assignments.get(normalizeCommunicationNumber(line.phoneNumber))
    return { ...line, ...resolveLineOwnership(line, lease), leaseId: lease?.id || null }
  }).sort((a, b) => Number(a.assigned) - Number(b.assigned) || String(a.company || a.phoneNumber).localeCompare(String(b.company || b.phoneNumber)))
  const providerNumbers = new Set(twilio.lines.map(line => normalizeCommunicationNumber(line.phoneNumber)))
  twilio.missingAtProvider = leases.filter(lease => lease.twilioPhoneNumber && !providerNumbers.has(normalizeCommunicationNumber(lease.twilioPhoneNumber))).map(lease => ({ leaseId: lease.id, phoneNumber: lease.twilioPhoneNumber, company: lease.tenantName, agent: lease.agentName }))

  return NextResponse.json({ ok: twilio.ok || elevenlabs.ok, fetchedAt: new Date().toISOString(), twilio, elevenlabs })
}
