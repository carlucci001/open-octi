import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { buildRealtimeVoiceUsageEvent, recordUsageEvent } from '@/lib/usage-events'
import { estimateModelCost } from '@/lib/model-prices'

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
    ...(body?.stage === 'gpt-live-session-ended' ? {
      finalizationConfirmed: body.finalizationConfirmed === true,
      usageSeconds: typeof body.usageSeconds === 'number' && Number.isFinite(body.usageSeconds) ? Math.max(0, body.usageSeconds) : null,
      backendUsage: Array.isArray(body.backendUsage) ? body.backendUsage.slice(0, 200).map(entry => ({
        responseId: cleanText(entry.responseId, 120),
        inputTokens: Math.max(0, Math.floor(Number(entry.usage?.input_tokens) || 0)),
        outputTokens: Math.max(0, Math.floor(Number(entry.usage?.output_tokens) || 0)),
      })) : [],
      timingSamples: Array.isArray(body.timingSamples) ? body.timingSamples.slice(0, 50).map(sample => ({
        speechGapMs: Number.isFinite(sample.speechGapMs) ? Math.max(0, sample.speechGapMs) : null,
        backendMs: Number.isFinite(sample.backendMs) ? Math.max(0, sample.backendMs) : null,
      })) : [],
    } : {}),
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
    if (event.stage === 'gpt-live-session-ended' && event.runId && events.some(previous => previous.stage === event.stage && previous.runId === event.runId)) {
      return NextResponse.json({ ok: true })
    }
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
    if (event.stage === 'gpt-live-session-ended') {
      const confirmed = event.finalizationConfirmed && event.usageSeconds !== null
      // Initialization is billed at 15 seconds minimum. An interrupted close is
      // an estimate, explicitly marked unknown; the API dashboard remains final.
      const seconds = confirmed ? event.usageSeconds : Math.max(event.requestId ? 15 : 0, (event.elapsedMs || 0) / 1000)
      recordUsageEvent({ provider: 'openai', model: 'gpt-live-1', agentId: event.agentId,
        runId: event.runId, requestId: event.requestId, clientId: event.clientId, source: 'voice', productId: 'voice',
        estCostUsd: seconds * 0.05 / 60, unknown: !confirmed })
      for (const usage of event.backendUsage) {
        recordUsageEvent({ provider: 'openai', model: 'gpt-6-luna', agentId: event.agentId,
          runId: event.runId, requestId: usage.responseId, clientId: event.clientId, source: 'voice', productId: 'voice',
          promptTokens: usage.inputTokens, completionTokens: usage.outputTokens,
          ...estimateModelCost({ model: 'gpt-6-luna', promptTokens: usage.inputTokens, completionTokens: usage.outputTokens }) })
      }
    }
    console.info('[voice-transfer]', event.stage, event.from || '-', '->', event.to || '-', event.elapsedMs ?? '')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.warn('[voice-transfer] log failed', e?.message || e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
