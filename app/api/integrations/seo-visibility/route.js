import { NextResponse } from 'next/server'

import { mutateData } from '@/lib/dataStore'
import { verifyVisibilitySignature } from '@/lib/seo-visibility-signature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORE = 'seo-visibility-events.json'
const ALLOWED_EVENTS = new Set(['audit.completed', 'lead.created'])
export async function POST(request) {
  const secret = process.env.SEO_VISIBILITY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'SEO Visibility webhook is not configured.' },
      { status: 503 },
    )
  }

  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > 131_072) {
    return NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 })
  }
  const rawBody = await request.text()
  if (rawBody.length > 131_072) {
    return NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 })
  }
  if (
    !verifyVisibilitySignature({
      secret,
      timestamp: request.headers.get('x-fv-timestamp') || '',
      rawBody,
      supplied: request.headers.get('x-fv-signature') || '',
    })
  ) {
    return NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 401 })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
  }

  const tenantId = request.headers.get('x-tenant-id')?.trim()
  const eventData = normalizeEventData(event)
  if (
    !event?.id ||
    !ALLOWED_EVENTS.has(event.type) ||
    !tenantId ||
    event.tenantId !== tenantId ||
    !eventData
  ) {
    return NextResponse.json({ ok: false, error: 'Invalid event.' }, { status: 422 })
  }

  const outcome = mutateData(STORE, (current) => {
    const document =
      current && typeof current === 'object' && Array.isArray(current.events)
        ? current
        : { events: [] }
    if (document.events.some((item) => item.id === event.id)) {
      return { data: document, result: { duplicate: true } }
    }
    const sanitized = {
      id: String(event.id).slice(0, 100),
      type: event.type,
      tenantId,
      occurredAt: String(event.occurredAt || new Date().toISOString()).slice(0, 40),
      receivedAt: new Date().toISOString(),
      data: eventData,
    }
    return {
      data: { events: [sanitized, ...document.events].slice(0, 500) },
      result: { duplicate: false },
    }
  })

  return NextResponse.json({ ok: true, accepted: !outcome.duplicate, duplicate: outcome.duplicate })
}

function normalizeEventData(event) {
  const data = event?.data
  if (!data || typeof data !== 'object') return null
  if (event.type === 'audit.completed') {
    if (
      typeof data.auditId !== 'string' ||
      typeof data.hostname !== 'string' ||
      !Number.isFinite(data.combinedScore) ||
      !data.scores ||
      typeof data.scores !== 'object'
    ) {
      return null
    }
    return {
      auditId: data.auditId.slice(0, 100),
      hostname: data.hostname.slice(0, 253),
      combinedScore: Math.max(0, Math.min(100, Math.round(data.combinedScore))),
      scores: Object.fromEntries(
        ['SEO', 'AEO', 'GEO'].map((discipline) => [
          discipline,
          Math.max(0, Math.min(100, Math.round(Number(data.scores[discipline]?.score) || 0))),
        ]),
      ),
      shareToken: String(data.shareToken || '').slice(0, 64),
    }
  }
  if (event.type === 'lead.created') {
    if (
      typeof data.leadId !== 'string' ||
      typeof data.name !== 'string' ||
      typeof data.email !== 'string' ||
      typeof data.website !== 'string'
    ) {
      return null
    }
    return {
      leadId: data.leadId.slice(0, 100),
      name: data.name.slice(0, 120),
      email: data.email.slice(0, 254),
      company: String(data.company || '').slice(0, 120),
      website: data.website.slice(0, 500),
    }
  }
  return null
}
