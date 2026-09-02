import { readData, writeData } from '@/lib/dataStore'
import { recordUsageEvent } from '@/lib/usage-events'

const FILE = 'voice-usage.json'
const MAX_EVENTS = 2000

const TTS_PRICES = {
  'gemini-3.1-flash-tts-preview': { inputPerMillion: 1, outputPerMillion: 20, audioTokensPerSecond: 25 },
  'gemini-2.5-pro-preview-tts': { inputPerMillion: 1, outputPerMillion: 20, audioTokensPerSecond: 32 },
  'gemini-2.5-flash-preview-tts': { inputPerMillion: 0.5, outputPerMillion: 10, audioTokensPerSecond: 32 },
}

function round(value, places = 6) {
  const factor = 10 ** places
  return Math.round(Number(value || 0) * factor) / factor
}

function estimateTextTokens(textChars = 0) {
  return Math.max(1, Math.ceil(Number(textChars || 0) / 4))
}

function numberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function percentile(values, p) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function estimateVoiceCost({ provider, model, textChars = 0, durationSeconds = 0 }) {
  const minutes = Math.max(0, Number(durationSeconds || 0) / 60)
  if (provider === 'gemini') {
    const pricing = TTS_PRICES[model] || TTS_PRICES['gemini-2.5-pro-preview-tts']
    const inputTokens = estimateTextTokens(textChars)
    const outputTokens = Math.ceil(Math.max(0, Number(durationSeconds || 0)) * pricing.audioTokensPerSecond)
    const inputCost = (inputTokens * pricing.inputPerMillion) / 1_000_000
    const outputCost = (outputTokens * pricing.outputPerMillion) / 1_000_000
    return {
      inputTokens,
      outputTokens,
      durationSeconds: round(durationSeconds, 3),
      estimatedCost: round(inputCost + outputCost),
      pricingBasis: `$${pricing.inputPerMillion}/1M text input + $${pricing.outputPerMillion}/1M audio output`,
    }
  }
  if (provider === 'elevenlabs') {
    const estimatedCost = minutes * 0.17
    return {
      inputTokens: null,
      outputTokens: null,
      durationSeconds: round(durationSeconds, 3),
      estimatedCost: round(estimatedCost),
      pricingBasis: 'CRM planning estimate at $0.17/minute; actual subscription credit math can differ by plan/model.',
    }
  }
  if (provider === 'chirp3') {
    const billableCharacters = Math.max(0, Number(textChars || 0))
    return {
      inputTokens: null,
      outputTokens: null,
      durationSeconds: round(durationSeconds, 3),
      estimatedCost: round((billableCharacters * 30) / 1_000_000),
      pricingBasis: 'Google Cloud Chirp 3 HD: first 1M characters free, then $30 / 1M characters.',
    }
  }
  if (provider === 'chatterbox') {
    return {
      inputTokens: null,
      outputTokens: null,
      durationSeconds: round(durationSeconds, 3),
      estimatedCost: 0,
      pricingBasis: 'No vendor API fee; local hardware/ops cost only.',
    }
  }
  return {
    inputTokens: null,
    outputTokens: null,
    durationSeconds: round(durationSeconds, 3),
    estimatedCost: 0,
    pricingBasis: 'No pricing rule configured.',
  }
}

export function logVoiceUsage(event) {
  try {
    const now = new Date().toISOString()
    const data = readData(FILE) || { events: [] }
    const clean = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      ...buildVoiceUsageEvent(event),
    }
    const events = [clean, ...(data.events || [])].slice(0, MAX_EVENTS)
    writeData(FILE, { lastUpdated: now, events })
    recordUsageEvent({
      agentId: clean.agentId || 'voice',
      provider: clean.provider || 'unknown',
      model: clean.model || 'unknown',
      promptTokens: clean.inputTokens || 0,
      completionTokens: clean.outputTokens || 0,
      estCostUsd: clean.estimatedCost || 0,
      unknown: clean.pricingBasis === 'No pricing rule configured.',
      clientId: event.clientId || event.accountId,
      productId: event.productId || 'voice',
      requestId: event.requestId,
      runId: event.runId || event.sessionId,
      source: 'voice',
    })
    return clean
  } catch (e) {
    console.warn(`[voice-usage] log failed: ${e.message}`)
    return null
  }
}

export function buildVoiceUsageEvent(event) {
  const cost = estimateVoiceCost(event)
  return {
    area: event.area || 'voice-lab',
    provider: event.provider,
    model: event.model,
    voiceName: event.voiceName || '',
    agentId: event.agentId || '',
    textChars: Number(event.textChars || 0),
    status: event.status || 'ok',
    brainMs: numberOrNull(event.brainMs),
    ttsMs: numberOrNull(event.ttsMs),
    totalMs: numberOrNull(event.totalMs),
    ...cost,
  }
}

export function summarizeVoiceUsage({ since } = {}) {
  const data = readData(FILE) || { events: [] }
  const start = since ? new Date(since) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const events = (data.events || []).filter(e => {
    const created = new Date(e.createdAt)
    return !Number.isNaN(created.getTime()) && created >= start && e.status === 'ok'
  })
  const byProvider = {}
  for (const e of events) {
    const key = e.provider || 'unknown'
    if (!byProvider[key]) byProvider[key] = { provider: key, events: 0, durationSeconds: 0, estimatedCost: 0, textChars: 0 }
    byProvider[key].events += 1
    byProvider[key].durationSeconds += Number(e.durationSeconds || 0)
    byProvider[key].estimatedCost += Number(e.estimatedCost || 0)
    byProvider[key].textChars += Number(e.textChars || 0)
  }
  const scoreEvents = (data.events || []).filter(e => {
    const created = new Date(e.createdAt)
    return !Number.isNaN(created.getTime()) && created >= start && Number.isFinite(Number(e.totalMs))
  })
  const scoreByProvider = {}
  for (const e of scoreEvents) {
    const key = e.provider || 'unknown'
    if (!scoreByProvider[key]) {
      scoreByProvider[key] = {
        provider: key,
        runs: 0,
        totalValues: [],
        brainValues: [],
        ttsValues: [],
        estimatedCost: 0,
        durationSeconds: 0,
      }
    }
    const bucket = scoreByProvider[key]
    bucket.runs += 1
    bucket.totalValues.push(Number(e.totalMs))
    if (Number.isFinite(Number(e.brainMs))) bucket.brainValues.push(Number(e.brainMs))
    if (Number.isFinite(Number(e.ttsMs))) bucket.ttsValues.push(Number(e.ttsMs))
    bucket.estimatedCost += Number(e.status === 'ok' ? e.estimatedCost || 0 : 0)
    bucket.durationSeconds += Number(e.status === 'ok' ? e.durationSeconds || 0 : 0)
  }
  const scoreboard = Object.values(scoreByProvider).map(item => ({
    provider: item.provider,
    runs: item.runs,
    avgTotalMs: round(item.totalValues.reduce((sum, value) => sum + value, 0) / Math.max(1, item.totalValues.length), 2),
    p50TotalMs: percentile(item.totalValues, 50),
    p95TotalMs: percentile(item.totalValues, 95),
    avgBrainMs: item.brainValues.length ? round(item.brainValues.reduce((sum, value) => sum + value, 0) / item.brainValues.length, 2) : null,
    avgTtsMs: item.ttsValues.length ? round(item.ttsValues.reduce((sum, value) => sum + value, 0) / item.ttsValues.length, 2) : null,
    estimatedCost: round(item.estimatedCost, 4),
    durationSeconds: round(item.durationSeconds, 2),
  })).sort((a, b) => Number(a.avgTotalMs || Infinity) - Number(b.avgTotalMs || Infinity))
  return {
    since: start.toISOString(),
    eventCount: events.length,
    totalEstimatedCost: round(events.reduce((sum, e) => sum + Number(e.estimatedCost || 0), 0), 4),
    byProvider: Object.values(byProvider).map(item => ({
      ...item,
      durationSeconds: round(item.durationSeconds, 2),
      estimatedCost: round(item.estimatedCost, 4),
    })),
    scoreboard: { byProvider: scoreboard },
    recent: events.slice(0, 8),
  }
}
