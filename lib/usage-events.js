import { create, findById, genId, loadAll, logActivity, saveAll, update } from './entityStore'
import { readData, writeData } from './dataStore'
import { pushNtfy } from './ntfy'
import { estimateModelCost, providerForModel } from './model-prices'

export const USAGE_RETENTION_DAYS = 90
export const USAGE_SOURCES = Object.freeze(['ai-lab', 'deerflow', 'studio', 'orca', 'voice', 'other'])
export const STUDIO_FIXED_COST_USD = Object.freeze({
  image: 0.13,
  video: 0.80,
  deck: 0.65,
  chart: 0.10,
  report: 0.35,
  newsletter: 0.20,
  podcast: 0.25,
  voiceover: 0.17,
  music: 0.12,
})
export const REALTIME_VOICE_RATE_USD_PER_MINUTE = Object.freeze({
  openai: 0.04512,
  gemini: 0.013536,
  elevenlabs: 0.17,
})

const SETTINGS_FILE = 'usage-settings.json'
const MAINTENANCE_FILE = 'usage-maintenance.json'

function text(value, fallback = '') {
  return String(value ?? '').trim() || fallback
}

function amount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(6)) : 0
}

function tokens(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0
}

function optional(target, key, value) {
  const clean = text(value)
  if (clean) target[key] = clean
}

export function normalizeUsageEvent(input = {}, options = {}) {
  const source = USAGE_SOURCES.includes(input.source) ? input.source : 'other'
  const event = {
    id: text(options.id || input.id, genId('ue')),
    ts: text(options.ts || input.ts, new Date().toISOString()),
    agentId: text(input.agentId, 'unknown'),
    provider: text(input.provider, 'unknown'),
    model: text(input.model, 'unknown'),
    promptTokens: tokens(input.promptTokens),
    completionTokens: tokens(input.completionTokens),
    estCostUsd: amount(input.estCostUsd),
    source,
    unknown: Boolean(input.unknown),
  }
  optional(event, 'clientId', input.clientId)
  optional(event, 'productId', input.productId)
  optional(event, 'requestId', input.requestId)
  optional(event, 'runId', input.runId)
  return event
}

function rowDay(row) {
  return text(row.day || row.ts).slice(0, 10)
}

function rollupKey(row) {
  return [rowDay(row), row.agentId || 'unknown', row.clientId || '', row.productId || '', row.provider || 'unknown'].join('\u001f')
}

function unknownCount(row) {
  if (row.unknownEvents !== null && row.unknownEvents !== undefined) return tokens(row.unknownEvents)
  return row.unknown ? Math.max(1, tokens(row.events || 1)) : 0
}

export function rollupUsageEvents(rows = []) {
  const groups = new Map()
  for (const row of rows) {
    const day = rowDay(row)
    if (!day) continue
    const key = rollupKey(row)
    const current = groups.get(key) || {
      id: `ur_${Buffer.from(key).toString('base64url').slice(0, 80)}`,
      day,
      agentId: text(row.agentId, 'unknown'),
      clientId: text(row.clientId),
      productId: text(row.productId),
      provider: text(row.provider, 'unknown'),
      events: 0,
      promptTokens: 0,
      completionTokens: 0,
      estCostUsd: 0,
      unknownEvents: 0,
      unknown: false,
    }
    current.events += Math.max(1, tokens(row.events || 1))
    current.promptTokens += tokens(row.promptTokens)
    current.completionTokens += tokens(row.completionTokens)
    current.estCostUsd = amount(current.estCostUsd + amount(row.estCostUsd))
    current.unknownEvents += unknownCount(row)
    current.unknown = current.unknownEvents > 0
    groups.set(key, current)
  }
  return [...groups.values()].sort((a, b) => rollupKey(a).localeCompare(rollupKey(b)))
}

function groupKey(row, groupBy) {
  if (groupBy === 'client') return text(row.clientId, 'unattributed')
  if (groupBy === 'product') return text(row.productId, 'unattributed')
  if (groupBy === 'provider') return text(row.provider, 'unknown')
  return text(row.agentId, 'unknown')
}

export function summarizeUsageRows(rows = [], groupBy = 'agent') {
  const groups = new Map()
  for (const row of rows) {
    const key = groupKey(row, groupBy)
    const current = groups.get(key) || { key, events: 0, promptTokens: 0, completionTokens: 0, estCostUsd: 0, unknownEvents: 0, unknown: false }
    current.events += Math.max(1, tokens(row.events || 1))
    current.promptTokens += tokens(row.promptTokens)
    current.completionTokens += tokens(row.completionTokens)
    current.estCostUsd = amount(current.estCostUsd + amount(row.estCostUsd))
    current.unknownEvents += unknownCount(row)
    current.unknown = current.unknownEvents > 0
    groups.set(key, current)
  }
  return [...groups.values()].sort((a, b) => b.estCostUsd - a.estCostUsd || a.key.localeCompare(b.key))
}

function boundedDate(value, fallback, endOfDay = false) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  const date = value ? new Date(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : value) : fallback
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid usage date range')
  return date
}

export function queryUsage({ from, to, groupBy = 'agent' } = {}) {
  if (!['agent', 'client', 'product', 'provider'].includes(groupBy)) throw new Error('groupBy must be agent, client, product, or provider')
  const now = new Date()
  const startDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const start = boundedDate(from, startDefault)
  const end = boundedDate(to, now, true)
  if (start > end) throw new Error('from must be before to')
  const raw = loadAll('usageEvents').filter(row => {
    const ts = Date.parse(row.ts)
    return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime()
  })
  const rollups = loadAll('usageRollups').filter(row => {
    const ts = Date.parse(`${row.day}T00:00:00.000Z`)
    return Number.isFinite(ts) && ts >= start.getTime() && ts <= end.getTime()
  })
  const groups = summarizeUsageRows([...raw, ...rollups], groupBy)
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    groupBy,
    groups,
    totals: summarizeUsageRows([...raw, ...rollups], 'provider').reduce((total, row) => ({
      events: total.events + row.events,
      promptTokens: total.promptTokens + row.promptTokens,
      completionTokens: total.completionTokens + row.completionTokens,
      estCostUsd: amount(total.estCostUsd + row.estCostUsd),
      unknownEvents: total.unknownEvents + row.unknownEvents,
      unknown: total.unknown || row.unknown,
    }), { events: 0, promptTokens: 0, completionTokens: 0, estCostUsd: 0, unknownEvents: 0, unknown: false }),
  }
}

export function getUsageSettings() {
  const stored = readData(SETTINGS_FILE) || {}
  return {
    agentMonthlyUsd: stored.agentMonthlyUsd && typeof stored.agentMonthlyUsd === 'object' ? stored.agentMonthlyUsd : {},
    clientMonthlyUsd: stored.clientMonthlyUsd && typeof stored.clientMonthlyUsd === 'object' ? stored.clientMonthlyUsd : {},
    alertState: stored.alertState && typeof stored.alertState === 'object' ? stored.alertState : {},
  }
}

function cleanThresholdMap(input) {
  return Object.fromEntries(Object.entries(input && typeof input === 'object' ? input : {})
    .map(([key, value]) => [text(key), amount(value)])
    .filter(([key, value]) => key && value > 0))
}

export function saveUsageSettings(input = {}) {
  const current = getUsageSettings()
  const next = {
    agentMonthlyUsd: cleanThresholdMap(input.agentMonthlyUsd ?? current.agentMonthlyUsd),
    clientMonthlyUsd: cleanThresholdMap(input.clientMonthlyUsd ?? current.clientMonthlyUsd),
    alertState: current.alertState,
    updatedAt: new Date().toISOString(),
  }
  writeData(SETTINGS_FILE, next)
  return next
}

function attachCostToRequest(event) {
  if (!event.requestId) return
  const request = findById('supportTickets', event.requestId)
  if (!request) return
  update('supportTickets', request.id, {
    estCostUsd: amount(Number(request.estCostUsd || 0) + event.estCostUsd),
    usageUnknown: Boolean(request.usageUnknown || event.unknown),
    usageEventCount: Number(request.usageEventCount || 0) + 1,
  })
}

function monthBounds(ts) {
  const date = new Date(ts)
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1)
  return { from: from.toISOString(), to: to.toISOString(), month: from.toISOString().slice(0, 7) }
}

function checkBudgetAlerts(event) {
  const settings = getUsageSettings()
  const { from, to, month } = monthBounds(event.ts)
  const checks = [
    { type: 'agent', id: event.agentId, threshold: settings.agentMonthlyUsd[event.agentId] },
    { type: 'client', id: event.clientId, threshold: settings.clientMonthlyUsd[event.clientId] },
  ]
  let changed = false
  for (const check of checks) {
    if (!check.id || !(Number(check.threshold) > 0)) continue
    const total = queryUsage({ from, to, groupBy: check.type }).groups.find(row => row.key === check.id)?.estCostUsd || 0
    const alertKey = `${month}:${check.type}:${check.id}`
    if (total < check.threshold || settings.alertState[alertKey]) continue
    settings.alertState[alertKey] = { at: event.ts, total, threshold: check.threshold }
    changed = true
    const subject = `Usage budget alert: ${check.type} ${check.id}`
    const body = `${check.type} ${check.id} reached $${total.toFixed(2)} against the $${Number(check.threshold).toFixed(2)} monthly threshold.`
    logActivity({ type: 'note', subject, body, meta: { usageBudget: true, ...settings.alertState[alertKey] }, agentId: event.agentId })
    void pushNtfy({ title: subject, body, priority: 'high', tags: ['moneybag', 'warning'] })
  }
  if (changed) writeData(SETTINGS_FILE, { ...settings, updatedAt: new Date().toISOString() })
}

export function recordUsageEvent(input = {}) {
  const normalized = normalizeUsageEvent(input)
  try {
    const recorded = create('usageEvents', normalized)
    attachCostToRequest(recorded)
    checkBudgetAlerts(recorded)
    return recorded
  } catch (error) {
    console.warn('[usage-events] record failed:', error?.message || error)
    return null
  }
}

export function buildDeerFlowUsageEvent({ agentId, clientId, productId, requestId, runId, model, usage = {} } = {}) {
  const promptTokens = tokens(usage.promptTokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.input_tokens)
  const completionTokens = tokens(usage.completionTokens ?? usage.completion_tokens ?? usage.outputTokens ?? usage.output_tokens)
  const estimate = estimateModelCost({ model, promptTokens, completionTokens, exactCostUsd: usage.cost_usd ?? usage.costUsd })
  return normalizeUsageEvent({
    agentId,
    provider: providerForModel(model, 'deerflow-hetzner'),
    model,
    promptTokens,
    completionTokens,
    ...estimate,
    clientId,
    productId,
    requestId,
    runId,
    source: 'deerflow',
  })
}

export function buildStudioUsageEvent({ kind, agentId = 'studio-producer', clientId, productId, requestId, runId } = {}) {
  const cost = STUDIO_FIXED_COST_USD[kind]
  return normalizeUsageEvent({
    agentId,
    provider: 'google',
    model: text(kind, 'unknown'),
    promptTokens: 0,
    completionTokens: 0,
    estCostUsd: cost ?? 0,
    unknown: cost === undefined,
    clientId,
    productId: productId || kind,
    requestId,
    runId,
    source: 'studio',
  })
}

export function buildRealtimeVoiceUsageEvent({ provider, model, durationSeconds = 0, agentId = 'voice', clientId, productId = 'voice', requestId, runId } = {}) {
  const cleanProvider = text(provider, 'unknown').toLowerCase()
  const rate = REALTIME_VOICE_RATE_USD_PER_MINUTE[cleanProvider]
  return normalizeUsageEvent({
    agentId,
    provider: cleanProvider,
    model,
    promptTokens: 0,
    completionTokens: 0,
    estCostUsd: rate === undefined ? 0 : amount((Number(durationSeconds) / 60) * rate),
    unknown: rate === undefined,
    clientId,
    productId,
    requestId,
    runId,
    source: 'voice',
  })
}

export function pruneUsageEvents({ now = new Date() } = {}) {
  const date = now instanceof Date ? now : new Date(now)
  const cutoff = date.getTime() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const events = loadAll('usageEvents')
  const expired = events.filter(event => Date.parse(event.ts) < cutoff)
  if (!expired.length) return { pruned: 0, retained: events.length, rollups: loadAll('usageRollups').length }
  const retained = events.filter(event => Date.parse(event.ts) >= cutoff)
  const rollups = rollupUsageEvents([...loadAll('usageRollups'), ...expired])
  saveAll('usageEvents', retained)
  saveAll('usageRollups', rollups)
  return { pruned: expired.length, retained: retained.length, rollups: rollups.length }
}

export function maybeRunNightlyUsageMaintenance({ now = new Date() } = {}) {
  const date = now instanceof Date ? now : new Date(now)
  const day = date.toISOString().slice(0, 10)
  const state = readData(MAINTENANCE_FILE) || {}
  if (state.lastPrunedDay === day) return { skipped: true, day }
  const result = pruneUsageEvents({ now: date })
  writeData(MAINTENANCE_FILE, { lastPrunedDay: day, ranAt: date.toISOString(), result })
  return { ...result, day }
}
