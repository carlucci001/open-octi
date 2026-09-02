import { createHmac, timingSafeEqual } from 'node:crypto'
import { mutateData, readData } from '@/lib/dataStore'
import { insertLeadFromChannel } from '@/lib/inboundChannels/leadInsert'
import { ensureMyvtcChannel } from './channel'
import { fetchContactMessage, MyvtcApiError } from './client'

const FILE = 'myvtc-webhook-events.json'
const MAX_EVENTS = 5000
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max)
}

export function verifyMyvtcSignature(secret, rawBody, header, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof rawBody !== 'string' || !header) return false
  const parts = String(header).split(',').map(part => part.trim())
  const timestampPart = parts.find(part => part.startsWith('t='))
  const signaturePart = parts.find(part => part.startsWith('v1='))
  if (!timestampPart || !signaturePart) return false

  const timestampText = timestampPart.slice(2)
  if (!/^\d{1,12}$/.test(timestampText)) return false
  const timestamp = Number(timestampText)
  if (!Number.isSafeInteger(timestamp) || Math.abs(Number(nowSeconds) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false

  const signatureHex = signaturePart.slice(3)
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false
  const supplied = Buffer.from(signatureHex, 'hex')
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest()
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function storedEvents() {
  const data = readData(FILE) || { events: [] }
  return Array.isArray(data.events) ? data.events : []
}

export function recordEvent(event) {
  const id = cleanText(event?.id, 160)
  if (!id) return null
  return mutateData(FILE, current => {
    const data = current && typeof current === 'object' ? current : { events: [] }
    const events = Array.isArray(data.events) ? [...data.events] : []
    const existing = events.find(item => item.id === id) || null
    const next = {
      ...(existing || {}),
      id,
      type: cleanText(event?.type || existing?.type || 'unknown', 120),
      receivedAt: existing?.receivedAt || cleanText(event?.receivedAt, 80) || new Date().toISOString(),
      outcome: cleanText(event?.outcome || existing?.outcome || 'received', 120),
      ...(event?.processedAt ? { processedAt: cleanText(event.processedAt, 80) } : {}),
      ...(event?.leadId ? { leadId: cleanText(event.leadId, 160) } : {}),
    }
    const without = events.filter(item => item.id !== id)
    return {
      data: { events: [next, ...without].slice(0, MAX_EVENTS), lastUpdated: new Date().toISOString() },
      result: next,
    }
  })
}

export function hasProcessed(eventId) {
  const id = cleanText(eventId, 160)
  return Boolean(id && storedEvents().some(event => event.id === id && event.processedAt))
}

export function markProcessed(eventId, { outcome = 'processed', leadId } = {}) {
  const id = cleanText(eventId, 160)
  if (!id) return null
  return recordEvent({ id, outcome, leadId, processedAt: new Date().toISOString() })
}

export function listMyvtcEvents({ limit = 10 } = {}) {
  return storedEvents().slice(0, Math.min(100, Math.max(1, Number(limit) || 10)))
}

export function contactToLeadPayload(message) {
  const topic = cleanText(message?.topic, 120) || 'contact'
  return {
    payload: {
      name: cleanText(message?.name, 240),
      email: cleanText(message?.email, 320),
      message: [message?.subject, message?.message].map(value => cleanText(value, 8000)).filter(Boolean).join('\n\n'),
      tags: ['myvtc', topic],
    },
    sourceMeta: {
      serviceLine: 'MyVTC',
      productOpportunity: topic === 'funeral-home' ? 'MyVTC - Funeral home partnership' : 'MyVTC - Contact form',
      topic,
      myvtcContactId: cleanText(message?.id, 160),
      myvtcCreatedAt: cleanText(message?.createdAt, 80),
    },
  }
}

export async function ingestContactMessage(message, { channel = ensureMyvtcChannel() } = {}) {
  const contactId = cleanText(message?.id, 160)
  if (!contactId) throw new MyvtcApiError('INVALID_CONTACT_ID', { status: 400 })
  const { payload, sourceMeta } = contactToLeadPayload(message)
  const result = await insertLeadFromChannel({
    channel,
    payload,
    externalId: `myvtc:${contactId}`,
    sourceMeta,
  })
  return result.skipped ? { skipped: true } : { leadId: result.lead?.id }
}

export async function ingestContact(contactId) {
  const message = await fetchContactMessage(contactId)
  if (!message) throw new MyvtcApiError('CONTACT_NOT_FOUND', { status: 404 })
  return ingestContactMessage(message)
}
