import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'
import { requireCrmWrite } from '@/lib/permissions'
import { getCred } from '@/lib/agent-creds'
import { openclawChat } from '@/lib/openclaw-client'
import { readData, writeData } from '@/lib/dataStore'
import { findById, update } from '@/lib/entityStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_FILE = 'harness-settings.json'
const PROVIDERS = ['auto', 'openclaw-hetzner', 'hermes-hetzner', 'deerflow-hetzner']
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
const URL_RE = /https?:\/\/[^\s,)"'\]]+/i

function configuredSecret(value) {
  const v = String(value || '').trim()
  if (!v || ['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(v.toLowerCase())) return ''
  return v
}

function privateHarnessBase(raw, label) {
  const base = String(raw || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  let url
  try { url = new URL(base) } catch { throw new Error(`${label} API base URL is invalid`) }
  const host = url.hostname.toLowerCase()
  const privateHost = host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
  if (!privateHost && process.env.HARNESS_ALLOW_PUBLIC_RUNTIME_URLS !== '1') {
    throw new Error(`${label} must stay on localhost/private networking. Set HARNESS_ALLOW_PUBLIC_RUNTIME_URLS=1 only after adding a separate auth gateway.`)
  }
  return base
}

function settings() {
  const data = readData(SETTINGS_FILE) || {}
  return {
    leadResearchProvider: PROVIDERS.includes(data.leadResearchProvider) ? data.leadResearchProvider : 'openclaw-hetzner',
    updatedAt: data.updatedAt || '',
  }
}

function saveSettings(patch) {
  const next = { ...settings(), ...patch, updatedAt: new Date().toISOString() }
  writeData(SETTINGS_FILE, next)
  return next
}

function findLead(id) {
  const entity = id ? findById('leads', id) : null
  if (!entity) {
    const sponsorsRaw = readData('sponsor-leads.json')
    const sponsors = Array.isArray(sponsorsRaw) ? sponsorsRaw : sponsorsRaw?.leads || []
    const sponsor = sponsors.find(l => String(l.id) === String(id))
    if (!sponsor) return null
    return {
      id: sponsor.id,
      bn: sponsor.bn || sponsor.businessName || '',
      cn: sponsor.cn || sponsor.name || '',
      ph: sponsor.ph || sponsor.phone || '',
      em: sponsor.em || sponsor.email || '',
      web: sponsor.web || sponsor.website || '',
      address: sponsor.address || '',
      notes: sponsor.notes || '',
      source: sponsor.source || sponsor.campaign || 'sponsor-leads',
      status: sponsor.st || sponsor.status || '',
      researchSummary: sponsor.researchSummary || '',
      entity: sponsor,
      store: 'sponsor-leads',
    }
  }
  return {
    id: entity.id,
    bn: entity.businessName || '',
    cn: entity.name || '',
    ph: entity.phone || '',
    em: entity.email || '',
    web: entity.website || entity.web || '',
    address: entity.address || '',
    notes: entity.notes || '',
    source: entity.source || '',
    status: entity.status || '',
    researchSummary: entity.researchSummary || entity.legacy?.researchSummary || '',
    entity,
    store: 'leads',
  }
}

function normalizeLead(lead = {}) {
  return {
    id: lead.id || '',
    bn: lead.bn || lead.businessName || lead.company || '',
    cn: lead.cn || lead.name || lead.contact || '',
    ph: lead.ph || lead.phone || '',
    em: lead.em || lead.email || '',
    web: lead.web || lead.website || '',
    address: lead.address || '',
    notes: lead.notes || '',
    source: lead.source || '',
    status: lead.st || lead.status || '',
    researchSummary: lead.researchSummary || '',
    entity: lead.entity || null,
    store: lead.store || '',
  }
}

function cleanUrl(url) {
  return String(url || '').replace(/\[\d+\]/g, '').replace(/[.)\]]+$/, '').trim()
}

function parseJsonObject(text) {
  try { return JSON.parse(String(text || '').trim()) } catch {}
  const match = String(text || '').match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

function deerFlowHeaders() {
  const internalToken = configuredSecret(process.env.DEER_FLOW_INTERNAL_AUTH_TOKEN)
    || configuredSecret(process.env.DEERFLOW_INTERNAL_AUTH_TOKEN)
  const csrfToken = `fcc-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    Cookie: `csrf_token=${csrfToken}`,
    ...(internalToken ? { 'X-DeerFlow-Internal-Token': internalToken } : {}),
  }
}

async function deerFlowJson({ base, path, body, headers, timeoutMs = 30000 }) {
  const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text().catch(() => '')
  const data = parseJsonObject(text) || {}
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || text.slice(0, 240) || `DeerFlow HTTP ${res.status}`)
  }
  return { data, text, status: res.status }
}

async function deerFlowGet({ base, path, headers, timeoutMs = 30000 }) {
  const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text().catch(() => '')
  const data = parseJsonObject(text) || {}
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || text.slice(0, 240) || `DeerFlow HTTP ${res.status}`)
  }
  return { data, text, status: res.status }
}

function collectDeerFlowAssistantText(streamText) {
  const assistant = []
  const fallback = []

  function visit(value) {
    if (!value) return
    if (typeof value === 'string') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object') return

    const role = String(value.role || value.type || '').toLowerCase()
    const content = value.content ?? value.text ?? value.message
    if (typeof content === 'string' && content.trim()) {
      if (role.includes('assistant') || role === 'ai' || role === 'aimessage') assistant.push(content.trim())
      else fallback.push(content.trim())
    }

    for (const item of Object.values(value)) visit(item)
  }

  const direct = parseJsonObject(streamText)
  if (direct) visit(direct)

  for (const line of String(streamText || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try { visit(JSON.parse(payload)) } catch {}
  }

  return assistant.at(-1) || ''
}

function contractPrompt(lead) {
  return `Research this CRM lead and return JSON only.

JSON schema:
{
  "summary": "",
  "foundPhone": "",
  "foundWebsite": "",
  "foundAddress": "",
  "objections": [],
  "nextSteps": [],
  "confidence": "low|medium|high",
  "sources": []
}

Lead:
${JSON.stringify({
  businessName: lead.bn,
  contact: lead.cn,
  phone: lead.ph,
  email: lead.em,
  website: lead.web,
  address: lead.address,
  notes: lead.notes,
  source: lead.source,
  status: lead.status,
}, null, 2)}`
}

function updatesFromContract(result, lead) {
  const updates = {}
  const found = {}
  const sourceText = Array.isArray(result?.sources) ? result.sources.join(' ') : String(result?.sources || '')
  const phone = String(result?.foundPhone || '').match(PHONE_RE)?.[0] || ''
  const website = cleanUrl(String(result?.foundWebsite || '').match(URL_RE)?.[0] || result?.foundWebsite || sourceText.match(URL_RE)?.[0] || '')
  const address = String(result?.foundAddress || '').trim()
  const summary = String(result?.summary || '').trim()

  if (phone && !lead.ph) { updates.phone = phone; found.phone = phone }
  if (website && !lead.web) { updates.website = website; found.website = website }
  if (address && !lead.address) { updates.address = address; found.address = address }
  if (summary) { updates.researchSummary = summary; found.summary = summary }

  return { updates, found }
}

function applyUpdates(lead, updates) {
  if (!lead?.id || !lead.entity || !Object.keys(updates).length) return null
  if (lead.store === 'sponsor-leads') {
    const raw = readData('sponsor-leads.json')
    const arr = Array.isArray(raw) ? raw : raw?.leads || []
    const idx = arr.findIndex(l => String(l.id) === String(lead.id))
    if (idx < 0) return null
    arr[idx] = {
      ...arr[idx],
      ph: updates.phone || arr[idx].ph,
      web: updates.website || arr[idx].web,
      address: updates.address || arr[idx].address,
      researchSummary: updates.researchSummary || arr[idx].researchSummary,
      updatedAt: new Date().toISOString(),
    }
    writeData('sponsor-leads.json', Array.isArray(raw) ? arr : { ...raw, leads: arr })
    return arr[idx]
  }
  const legacy = { ...(lead.entity.legacy || {}) }
  if (updates.researchSummary) legacy.researchSummary = updates.researchSummary
  return update('leads', lead.id, {
    phone: updates.phone || lead.entity.phone,
    website: updates.website || lead.entity.website,
    address: updates.address || lead.entity.address,
    researchSummary: updates.researchSummary || lead.entity.researchSummary,
    legacy,
  })
}

async function runOpenClaw(lead) {
  const started = Date.now()
  const cred = getCred('open claw') || getCred('openclaw')
  const result = await openclawChat({
    message: contractPrompt(lead),
    sessionKey: `agent:main:lead-research-${lead.id || Date.now()}`,
    token: cred?.key,
    firstChunkMs: 45000,
    betweenChunksMs: 8000,
    maxMs: 150000,
  })
  const parsed = parseJsonObject(result.text)
  return {
    provider: 'openclaw-hetzner',
    ok: true,
    ms: Date.now() - started,
    runId: result.runId || '',
    raw: result.text || '',
    contract: parsed || { summary: result.text || '', confidence: 'low', sources: [], objections: [], nextSteps: [] },
  }
}

async function runOpenAiCompatible({ provider, base, key, model, lead }) {
  const started = Date.now()
  if (!base) throw new Error(`${provider} API base URL is not configured`)
  const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: 'You are a private Farrington Command Center harness. Return valid JSON only.' },
        { role: 'user', content: contractPrompt(lead) },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `${provider} HTTP ${res.status}`)
  const text = data?.choices?.[0]?.message?.content || ''
  return {
    provider,
    ok: true,
    status: res.status,
    ms: Date.now() - started,
    raw: text,
    usage: data?.usage || null,
    contract: parseJsonObject(text) || { summary: text, confidence: 'low', sources: [], objections: [], nextSteps: [] },
  }
}

async function runHermes(lead) {
  const base = privateHarnessBase(process.env.HERMES_API_BASE_URL || process.env.HERMES_API_URL || 'http://127.0.0.1:8642/v1', 'Hermes')
  const key = configuredSecret(process.env.HERMES_API_SERVER_KEY) || configuredSecret(process.env.API_SERVER_KEY) || configuredSecret(process.env.HERMES_API_KEY)
  return runOpenAiCompatible({ provider: 'hermes-hetzner', base, key, model: process.env.HERMES_API_MODEL || 'hermes-agent', lead })
}

async function runDeerFlow(lead) {
  const base = privateHarnessBase(process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL || '', 'DeerFlow')
  if (process.env.DEERFLOW_OPENAI_COMPAT === '1') {
    const key = configuredSecret(process.env.DEERFLOW_API_KEY) || configuredSecret(process.env.DEER_FLOW_API_KEY)
    return runOpenAiCompatible({ provider: 'deerflow-hetzner', base, key, model: process.env.DEERFLOW_API_MODEL || process.env.DEER_FLOW_API_MODEL || 'deerflow-agent', lead })
  }

  const started = Date.now()
  if (!base) throw new Error('deerflow-hetzner API base URL is not configured')

  const headers = deerFlowHeaders()
  const threadId = `fcc-lead-research-${crypto.randomUUID()}`
  const prompt = contractPrompt(lead)

  await deerFlowJson({
    base,
    path: '/api/threads',
    headers,
    body: {
      thread_id: threadId,
      metadata: {
        source: 'farrington-command-center',
        action: 'lead-research',
        provider: 'deerflow-hetzner',
      },
    },
  })

  const stream = await fetch(`${base.replace(/\/+$/, '')}/api/threads/${encodeURIComponent(threadId)}/runs/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      assistant_id: process.env.DEERFLOW_ASSISTANT_ID || process.env.DEER_FLOW_ASSISTANT_ID || 'lead_agent',
      input: {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      config: { recursion_limit: 50 },
      context: {
        is_bootstrap: false,
        mode: 'flash',
        thinking_enabled: false,
        is_plan_mode: false,
        subagent_enabled: false,
      },
      stream_mode: ['values'],
    }),
    signal: AbortSignal.timeout(150000),
  })

  const streamText = await stream.text().catch(() => '')
  if (!stream.ok) {
    const data = parseJsonObject(streamText) || {}
    throw new Error(data?.detail || data?.error || streamText.slice(0, 240) || `DeerFlow HTTP ${stream.status}`)
  }

  const startedRun = parseJsonObject(streamText) || {}
  let runId = startedRun.run_id || ''
  for (const line of streamText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    const data = parseJsonObject(payload)
    if (data?.run_id) runId = data.run_id
  }

  let runStatus = ''
  for (let i = 0; i < 10 && runId; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    const run = await deerFlowGet({
      base,
      path: `/api/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}`,
      headers,
      timeoutMs: 30000,
    })
    runStatus = String(run.data?.status || '')
    if (['success', 'completed', 'error'].includes(runStatus)) break
  }
  if (runStatus === 'error') throw new Error('DeerFlow run ended with status=error')

  const state = await deerFlowGet({
    base,
    path: `/api/threads/${encodeURIComponent(threadId)}/state`,
    headers,
    timeoutMs: 30000,
  }).catch(() => null)

  const text = collectDeerFlowAssistantText(state?.text || streamText)
  return {
    provider: 'deerflow-hetzner',
    ok: true,
    status: stream.status,
    ms: Date.now() - started,
    runId: runId || threadId,
    raw: text || state?.text?.slice(0, 4000) || streamText.slice(0, 4000),
    contract: parseJsonObject(text) || { summary: text || 'DeerFlow returned no assistant text.', confidence: 'low', sources: [], objections: [], nextSteps: [] },
  }
}

async function dispatch(provider, lead) {
  if (provider === 'openclaw-hetzner') return runOpenClaw(lead)
  if (provider === 'hermes-hetzner') return runHermes(lead)
  if (provider === 'deerflow-hetzner') return runDeerFlow(lead)
  if (provider === 'auto') {
    try { return await runOpenClaw(lead) } catch (e) {
      return { provider: 'auto', ok: false, error: `OpenClaw failed in auto mode: ${e.message}` }
    }
  }
  throw new Error('Unknown lead research provider')
}

function runtimeStatus() {
  return [
    { id: 'openclaw-hetzner', label: 'OpenClaw', configured: true, liveCapable: true },
    { id: 'hermes-hetzner', label: 'Hermes', configured: Boolean(process.env.HERMES_API_BASE_URL || process.env.HERMES_API_URL), liveCapable: Boolean(process.env.HERMES_API_BASE_URL || process.env.HERMES_API_URL) },
    { id: 'deerflow-hetzner', label: 'DeerFlow', configured: Boolean(process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL), liveCapable: Boolean(process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL) },
  ]
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  return NextResponse.json({
    ok: true,
    action: 'lead-research',
    contract: {
      inputs: ['leadId', 'lead'],
      outputs: ['summary', 'foundPhone', 'foundWebsite', 'foundAddress', 'objections', 'nextSteps', 'confidence', 'sources'],
    },
    settings: settings(),
    providers: runtimeStatus(),
  })
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'run').trim()

  if (action === 'set_provider') {
    const { error } = await requireAdmin(request)
    if (error) return error
    const provider = String(body.provider || '').trim()
    if (!PROVIDERS.includes(provider)) return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 400 })
    return NextResponse.json({ ok: true, settings: saveSettings({ leadResearchProvider: provider }) })
  }

  const { error } = await requireCrmWrite(request)
  if (error) return error

  const saved = findLead(body.leadId)
  const lead = normalizeLead(saved || body.lead || {})
  if (!lead.bn && !lead.cn) return NextResponse.json({ ok: false, error: 'Lead is required' }, { status: 400 })

  const requested = String(body.provider || '').trim()
  const active = PROVIDERS.includes(requested) ? requested : settings().leadResearchProvider
  const result = await dispatch(active, lead).catch(e => ({ provider: active, ok: false, error: e.message }))
  if (!result.ok) return NextResponse.json({ ok: false, provider: result.provider || active, error: result.error || 'Lead research failed' }, { status: 502 })

  const { updates, found } = updatesFromContract(result.contract, lead)
  const updatedRecord = body.save === false ? null : applyUpdates(lead, updates)

  return NextResponse.json({
    ok: true,
    action: 'lead-research',
    provider: result.provider,
    ms: result.ms,
    runId: result.runId || '',
    found,
    updated: Object.keys(updates),
    saved: Boolean(updatedRecord),
    contract: result.contract,
    raw: result.raw || '',
  })
}
