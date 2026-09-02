import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { getClients } from '@/lib/clients'
import { requireCrmRead } from '@/lib/permissions'
import { OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'

function buildContext() {
  const leads = readData('leads.json')?.leads || []
  const sponsors = (() => {
    const raw = readData('sponsor-leads.json')
    return Array.isArray(raw) ? raw : raw?.leads || []
  })()
  const clients = getClients()
  const payments = readData('payments.json')?.payments || []
  const domains = readData('domains.json')?.domains || []
  const statusCounts = {}
  for (const l of sponsors) statusCounts[l.st] = (statusCounts[l.st] || 0) + 1
  return {
    counts: {
      devLeads: leads.length, sponsorLeads: sponsors.length,
      clients: clients.length, payments: payments.length, domains: domains.length,
    },
    sponsorStatusCounts: statusCounts,
    recentSponsorLeads: sponsors.slice(0, 20).map(l => ({ id: l.id, name: l.bn, contact: l.cn, phone: l.ph, status: l.st, campaign: l.campaign || 'sponsors' })),
  }
}

function systemPromptFor(ctx, leadContext) {
  return `You are the AI assistant inside the Farrington Command Center CRM, built by Carl Farrington at Farrington Development LLC in Asheville, NC.

You help Carl work his leads, draft outreach, research prospects, and run his CRM. Be terse, direct, and action-oriented. Use bullet points. Never add filler.

${OFFICE_AGENT_CONDUCT}

Current CRM state:
- Dev leads: ${ctx.counts.devLeads}
- Sponsor/CRM leads: ${ctx.counts.sponsorLeads}
- Clients: ${ctx.counts.clients}
- Payments logged: ${ctx.counts.payments}
- Domains: ${ctx.counts.domains}
- Sponsor statuses: ${JSON.stringify(ctx.sponsorStatusCounts)}
${leadContext ? `\n\nCurrently viewing lead:\n${JSON.stringify(leadContext, null, 2)}` : ''}`
}

function parseProviderJson(text, provider) {
  try {
    return JSON.parse(text || '{}')
  } catch {
    const html = /^\s*<!doctype html/i.test(text || '') || /^\s*<html/i.test(text || '')
    throw new Error(`${provider} returned ${html ? 'HTML' : 'invalid JSON'} instead of API data`)
  }
}

function timeoutSignal(ms = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

// Provider dispatchers
async function callAnthropic(model, system, messages) {
  const cred = getCred('anthropic')
  if (!cred?.key) throw new Error('No Anthropic API key in vault')
  const timeout = timeoutSignal()
  let res
  let text
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cred.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
      signal: timeout.signal,
    })
    text = await res.text()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Anthropic timed out')
    throw e
  } finally {
    timeout.done()
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
  const data = parseProviderJson(text, 'Anthropic')
  return { text: (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'), usage: data.usage }
}

async function callGemini(system, messages) {
  const cred = getCred('gemini')
  if (!cred?.key) throw new Error('No Gemini API key in vault')
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  const timeout = timeoutSignal()
  let res
  let text
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cred.key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1024 } }),
      signal: timeout.signal,
    })
    text = await res.text()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Gemini timed out')
    throw e
  } finally {
    timeout.done()
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`)
  const data = parseProviderJson(text, 'Gemini')
  const out = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || ''
  return { text: out, usage: data.usageMetadata }
}

async function callPerplexity(system, messages) {
  const cred = getCred('perplexity')
  if (!cred?.key) throw new Error('No Perplexity API key in vault')
  const fullMessages = [{ role: 'system', content: system }, ...messages]
  const timeout = timeoutSignal()
  let res
  let text
  try {
    res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cred.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar', messages: fullMessages, max_tokens: 1024 }),
      signal: timeout.signal,
    })
    text = await res.text()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Perplexity timed out')
    throw e
  } finally {
    timeout.done()
  }
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${text.slice(0, 200)}`)
  const data = parseProviderJson(text, 'Perplexity')
  return { text: data.choices?.[0]?.message?.content || '', usage: data.usage }
}

async function callOpenRouter(model, system, messages) {
  const cred = getCred('openrouter')
  if (!cred?.key) throw new Error('No OpenRouter API key in vault')
  const fullMessages = [{ role: 'system', content: system }, ...messages]
  const timeout = timeoutSignal()
  let res
  let text
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cred.key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'Farrington Command Center' },
      body: JSON.stringify({ model, messages: fullMessages, max_tokens: 1024 }),
      signal: timeout.signal,
    })
    text = await res.text()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('OpenRouter timed out')
    throw e
  } finally {
    timeout.done()
  }
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
  const data = parseProviderJson(text, 'OpenRouter')
  return { text: data.choices?.[0]?.message?.content || '', usage: data.usage }
}

const MODEL_MAP = {
  'gemini-flash':  { call: (s, m) => callGemini(s, m),                               label: 'Gemini 2.0 Flash',  cost: '$' },
  'claude-haiku':  { call: (s, m) => callAnthropic('claude-haiku-4-5-20251001', s, m), label: 'Claude Haiku 4.5', cost: '$$' },
  'claude-sonnet': { call: (s, m) => callAnthropic('claude-sonnet-4-6', s, m),        label: 'Claude Sonnet 4.6', cost: '$$$' },
  'perplexity':    { call: (s, m) => callPerplexity(s, m),                            label: 'Perplexity Sonar',  cost: '$' },
  'openrouter':    { call: (s, m) => callOpenRouter('google/gemini-2.0-flash-001', s, m), label: 'OpenRouter (Gemini)', cost: '$' },
}

const FALLBACK_CHAIN = ['gemini-flash', 'openrouter', 'perplexity']

function errorResponse(error, status = 500) {
  return NextResponse.json(
    { ok: false, error: error?.message || String(error || 'Lead AI failed') },
    { status }
  )
}

export async function POST(request) {
  try {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { messages, leadContext, model = 'gemini-flash' } = await request.json()
  const ctx = buildContext()
  const system = systemPromptFor(ctx, leadContext)

  // Try requested model first, then fall through to other providers on quota/rate-limit errors.
  const attempts = [model, ...FALLBACK_CHAIN.filter(m => m !== model)]
  let lastError = null
  const tried = []

  for (const m of attempts) {
    const entry = MODEL_MAP[m]
    if (!entry) continue
    try {
      const r = await entry.call(system, messages || [])
      return NextResponse.json({
        text: r.text,
        usage: r.usage,
        model: entry.label,
        fellBackFrom: tried.length > 0 ? tried[0] : null,
      })
    } catch (e) {
      tried.push(m)
      lastError = e.message
      // Only cascade on rate-limit/quota errors — credential/malformed errors should surface immediately.
        if (!/429|quota|exhausted|rate.?limit|resource.?exhaust|timed out|abort/i.test(e.message)) break
    }
  }

  return NextResponse.json({ ok: false, error: lastError, triedProviders: tried }, { status: 502 })
  } catch (e) {
    return errorResponse(e)
  }
}
