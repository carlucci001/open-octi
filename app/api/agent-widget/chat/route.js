import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'
import { consumePublicEndpointQuota, PUBLIC_WIDGET_RATE_LIMITS } from '@/lib/public-endpoint-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function apiKey() {
  return process.env.OPENAI_API_KEY || getCred('openai')?.key || ''
}

function clean(value, max = 1600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-8)
    .map(m => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: clean(m?.content, 1200),
    }))
    .filter(m => m.content)
}

function fallbackReply(agent, text) {
  const lower = text.toLowerCase()
  if (/\b(schedule|demo|call|meeting|appointment)\b/.test(lower)) {
    return `I can help route that. Tell me your name, email, company, and the best time window, and I will prepare the handoff for Carl.`
  }
  if (/\b(price|cost|budget|quote|estimate)\b/.test(lower)) {
    return `I can start with scope. What are you trying to build, what system are you replacing, and when does it need to go live?`
  }
  return `I am ${agent.name}. I can answer first-pass questions, qualify the project, and collect the details Carl needs for follow-up. What are you trying to accomplish?`
}

export async function POST(request) {
  const quota = consumePublicEndpointQuota(request, PUBLIC_WIDGET_RATE_LIMITS.chat)
  if (quota.limited) {
    return json({ ok: false, error: 'Too many requests. Try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(quota.retryAfterSeconds) },
    })
  }

  let body = {}
  try { body = await request.json() } catch {}

  const agent = await resolvePublicWidgetAgent(body.agent)
  const messages = safeMessages(body.messages)
  const last = messages.filter(m => m.role === 'user').slice(-1)[0]
  if (!last) return json({ ok: false, error: 'No message provided' }, { status: 400 })

  const key = apiKey()
  if (!key) {
    return json({ ok: true, text: fallbackReply(agent, last.content), mode: 'fallback' })
  }

  const client = new OpenAI({ apiKey: key })
  const system = [
    `You are ${agent.name}, ${agent.title}.`,
    agent.description,
    agent.systemPrompt ? `Public receptionist script:\n${agent.systemPrompt}` : '',
    agent.jobDescription ? `Agent configuration notes: ${agent.jobDescription}` : '',
    'You are embedded on an external website as a Farrington-style concierge agent.',
    'You can answer public-facing questions, qualify interest, collect name/company/email/phone, and suggest a next step.',
    'Do not claim to access private CRM records, credentials, invoices, client files, internal tools, or OpenClaw from this public widget.',
    'If the visitor asks for an internal action, say you can prepare a handoff for Carl rather than claiming the action is complete.',
    'Keep replies concise, professional, and useful. Ask one clear question when qualification details are missing.',
  ].filter(Boolean).join('\n')

  try {
    const response = await client.responses.create({
      model: process.env.PUBLIC_AGENT_WIDGET_MODEL || 'gpt-4.1-mini',
      input: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_output_tokens: 420,
    })
    const text = clean(response.output_text, 1800) || fallbackReply(agent, last.content)
    return json({ ok: true, text })
  } catch (e) {
    return json({ ok: true, text: fallbackReply(agent, last.content), mode: 'fallback', warning: 'model_unavailable' })
  }
}
