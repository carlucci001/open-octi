// Handoff latency for the Voice/Agents panel.
// CRM-side handoff = switching the active voice agent in the browser
//   (mic grant -> signed URL from our backend -> ElevenLabs provider connects).
// Source: data/voice-transfer-log.json (events[], each with stage + elapsedMs).
// Also reports in-call ElevenLabs agent->agent transfers (transfer_to_agent),
//   which currently don't appear in recorded conversations — stubbed until they do.
//
// GET -> { ok, crm: { overall, last7d, byAgent, byStage, errors }, elevenlabs: {...}, fetchedAt }

import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 60 * 1000
let _cache = null

function stats(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const sum = s.reduce((a, b) => a + b, 0)
  return {
    n: s.length,
    min: Math.round(s[0]),
    p50: Math.round(q(0.5)),
    p90: Math.round(q(0.9)),
    max: Math.round(s[s.length - 1]),
    avg: Math.round(sum / s.length),
  }
}

// Collapse raw stage events into one total-duration sample per handoff id.
function perHandoff(events) {
  const byId = {}
  for (const e of events) {
    if (!e || !e.id) continue
    if (!byId[e.id]) byId[e.id] = { id: e.id, at: e.at, to: e.to || '', total: 0, errored: false }
    if (typeof e.elapsedMs === 'number' && e.elapsedMs > byId[e.id].total) byId[e.id].total = e.elapsedMs
    if (/error|slow/i.test(e.stage || '')) byId[e.id].errored = true
  }
  return Object.values(byId)
}

function getElevenKey() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = (creds.credentials || []).find(c => /eleven/i.test(c.name || ''))
  if (!entry) return null
  const f = (entry.fields || []).find(x => /key|token/i.test(x.label || ''))
  return f?.value?.trim() || null
}

async function elevenlabsTransfers(key) {
  // Lightweight: one list call, count conversations whose tool_names include a transfer.
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/convai/conversations?page_size=100', {
      headers: { 'xi-api-key': key },
    })
    if (!r.ok) return { ok: false, status: r.status }
    const j = await r.json()
    const convs = j.conversations || []
    let transferConvs = 0
    for (const c of convs) {
      if ((c.tool_names || []).some(t => /transfer/i.test(t))) transferConvs++
    }
    const dates = convs.map(c => c.start_time_unix_secs).filter(Boolean)
    return {
      ok: true,
      scanned: convs.length,
      transferConversations: transferConvs,
      lastConversationAt: dates.length ? new Date(Math.max(...dates) * 1000).toISOString() : null,
      note: transferConvs === 0
        ? 'No in-call transfer_to_agent events recorded yet. Latency will populate once agents start transferring mid-call.'
        : null,
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'
  if (!force && _cache && Date.now() - _cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...(_cache.payload), cached: true, ageMs: Date.now() - _cache.at })
  }

  const log = readData('voice-transfer-log.json') || { events: [] }
  const events = Array.isArray(log.events) ? log.events : []
  const handoffs = perHandoff(events)

  const now = Date.now()
  const WEEK = 7 * 24 * 60 * 60 * 1000
  const recent = handoffs.filter(h => h.at && now - new Date(h.at).getTime() < WEEK)

  // Per-stage breakdown (where the time goes) over the last week of raw events.
  const byStageArr = {}
  for (const e of events) {
    if (!e.at || now - new Date(e.at).getTime() >= WEEK) continue
    if (typeof e.elapsedMs !== 'number' || e.elapsedMs <= 0) continue
    ;(byStageArr[e.stage] ||= []).push(e.elapsedMs)
  }
  const byStage = {}
  for (const k of Object.keys(byStageArr)) byStage[k] = stats(byStageArr[k])

  // Per destination agent (last week).
  const byAgentArr = {}
  for (const h of recent) (byAgentArr[h.to || '(unknown)'] ||= []).push(h.total)
  const byAgent = {}
  for (const k of Object.keys(byAgentArr)) byAgent[k] = stats(byAgentArr[k])

  const errorCount = recent.filter(h => h.errored).length
  const dates = handoffs.map(h => h.at).filter(Boolean).sort()

  const key = getElevenKey()
  const elevenlabs = key ? await elevenlabsTransfers(key) : { ok: false, error: 'ElevenLabs key missing' }

  const payload = {
    ok: true,
    crm: {
      overall: stats(handoffs.map(h => h.total)),
      last7d: stats(recent.map(h => h.total)),
      byStage,
      byAgent,
      errorsLast7d: errorCount,
      firstSeen: dates[0] || null,
      lastSeen: dates[dates.length - 1] || null,
    },
    elevenlabs,
    fetchedAt: new Date().toISOString(),
  }
  _cache = { at: Date.now(), payload }
  return NextResponse.json(payload)
}
