import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { pollIncidentSources } from '@/lib/incident-poller'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request) {
  const expected = String(process.env.FCC_INCIDENT_POLL_TOKEN || '').trim()
  if (!expected) return { ok: false, status: 503, error: 'Incident polling is not configured.' }
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ? { ok: true }
    : { ok: false, status: 401, error: 'Unauthorized.' }
}

export async function POST(request) {
  const auth = authorized(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  try {
    const result = await pollIncidentSources()
    return NextResponse.json({ ok: true, generatedAt: result.generatedAt, platforms: result.platforms, incidentCount: result.incidents.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[incident-poll] failed:', error?.message)
    return NextResponse.json({ ok: false, error: 'Incident poll failed.' }, { status: 500 })
  }
}
