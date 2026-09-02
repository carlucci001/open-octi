// Per-agent usage from ElevenLabs.
// For each CRM agent that has a roster binding, pull recent conversations and
// aggregate counts/minutes. Cached for 5 minutes to avoid pounding the API.
//
// GET → { ok, agents: [ { id, name, conversationsCount, totalMinutes, lastConversationAt } ] }

import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 5 * 60 * 1000
let _cache = null

function getElevenKey() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = (creds.credentials || []).find(c => /eleven/i.test(c.name || ''))
  if (!entry) return null
  const f = (entry.fields || []).find(x => /key|token/i.test(x.label || ''))
  return f?.value?.trim() || null
}

async function fetchConversations(apiKey, elevenAgentId) {
  // Pull up to 100 most recent conversations for this agent
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${elevenAgentId}&page_size=100`, {
    headers: { 'xi-api-key': apiKey },
  })
  if (!r.ok) return { ok: false, status: r.status, conversations: [] }
  const j = await r.json()
  return { ok: true, conversations: j.conversations || [] }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'

  if (!force && _cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...(_cache.payload), cached: true, ageMs: Date.now() - _cache.at })
  }

  const apiKey = getElevenKey()
  if (!apiKey) return NextResponse.json({ ok: false, error: 'ElevenLabs key missing' }, { status: 503 })

  const agentsFile = readData('agents.json') || { agents: {} }
  const roster = readData('voice-agent-roster.json') || {}

  const out = []
  for (const [crmId, ag] of Object.entries(agentsFile.agents || {})) {
    const binding = roster[crmId]
    if (!binding?.agentId) {
      out.push({
        id: crmId, name: ag.name, tenantId: ag.tenantId || 'farrington-development',
        hasBinding: false, conversationsCount: 0, totalMinutes: 0, lastConversationAt: null,
      })
      continue
    }
    const r = await fetchConversations(apiKey, binding.agentId)
    let totalSecs = 0, latestStart = 0
    for (const c of r.conversations) {
      totalSecs += c.call_duration_secs || 0
      if (c.start_time_unix_secs > latestStart) latestStart = c.start_time_unix_secs
    }
    out.push({
      id: crmId,
      name: ag.name,
      tenantId: ag.tenantId || 'farrington-development',
      hasBinding: true,
      conversationsCount: r.conversations.length,
      totalMinutes: Math.round((totalSecs / 60) * 10) / 10,
      lastConversationAt: latestStart ? new Date(latestStart * 1000).toISOString() : null,
    })
  }

  const payload = { ok: true, agents: out, fetchedAt: new Date().toISOString() }
  _cache = { at: Date.now(), payload }
  return NextResponse.json(payload)
}
