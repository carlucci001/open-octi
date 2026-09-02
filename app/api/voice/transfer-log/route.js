import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { buildRealtimeVoiceUsageEvent, recordUsageEvent } from '@/lib/usage-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'voice-transfer-log.json'

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanEvent(body) {
  return {
    id: `vtx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: cleanText(body?.at, 40) || new Date().toISOString(),
    stage: cleanText(body?.stage, 60),
    toolName: cleanText(body?.toolName, 80),
    from: cleanText(body?.from, 80),
    to: cleanText(body?.to, 80),
    agentId: cleanText(body?.agentId, 80),
    provider: cleanText(body?.provider, 40),
    model: cleanText(body?.model, 120),
    runId: cleanText(body?.runId || body?.sessionId, 120),
    clientId: cleanText(body?.clientId || body?.accountId, 120),
    productId: cleanText(body?.productId, 120),
    requestId: cleanText(body?.requestId, 120),
    status: cleanText(body?.status, 40),
    result: cleanText(body?.result, 220),
    error: cleanText(body?.error, 220),
    reason: cleanText(body?.reason, 160),
    elapsedMs: Number.isFinite(Number(body?.elapsedMs)) ? Math.max(0, Math.round(Number(body.elapsedMs))) : null,
    route: cleanText(body?.route, 180),
  }
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  try {
    const body = await request.json()
    const event = cleanEvent(body)
    if (!event.stage) return NextResponse.json({ ok: false, error: 'stage required' }, { status: 400 })
    const data = readData(FILE) || { events: [] }
    const events = Array.isArray(data.events) ? data.events : []
    events.push(event)
    writeData(FILE, { events: events.slice(-250), lastUpdated: new Date().toISOString() })
    if (event.stage === 'realtime-session-ended' && event.elapsedMs > 0) {
      recordUsageEvent(buildRealtimeVoiceUsageEvent({
        provider: event.provider,
        model: event.model,
        durationSeconds: event.elapsedMs / 1000,
        agentId: event.agentId,
        clientId: event.clientId,
        productId: event.productId || 'voice',
        requestId: event.requestId,
        runId: event.runId,
      }))
    }
    console.info('[voice-transfer]', event.stage, event.from || '-', '->', event.to || '-', event.elapsedMs ?? '')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.warn('[voice-transfer] log failed', e?.message || e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
