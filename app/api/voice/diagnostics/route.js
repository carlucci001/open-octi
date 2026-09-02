import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function compactError(value) {
  return String(value || 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function getVoiceAgents() {
  const defaultCfg = readData('voice-agent.json') || {}
  const roster = readData('voice-agent-roster.json') || {}
  const agents = []
  if (defaultCfg.agentId) {
    agents.push({
      id: 'matilda',
      name: defaultCfg.name || 'Matilda',
      firstName: 'Matilda',
      provider: 'elevenlabs',
      agentId: defaultCfg.agentId,
      voiceName: defaultCfg.voiceName || '',
    })
  }
  for (const [id, agent] of Object.entries(roster)) {
    if (!agent?.agentId) continue
    agents.push({
      id,
      name: agent.name || agent.firstName || id,
      firstName: agent.firstName || agent.name || id,
      provider: 'elevenlabs',
      agentId: agent.agentId,
      voiceName: agent.voiceName || '',
    })
  }
  return agents
}

function summarizeRecentTransfers() {
  const data = readData('voice-transfer-log.json') || { events: [] }
  const events = Array.isArray(data.events) ? data.events.slice(-80) : []
  const byTarget = new Map()
  for (const event of events) {
    const key = event.agentId || event.to || 'unknown'
    const current = byTarget.get(key) || {
      agentId: event.agentId || '',
      to: event.to || '',
      lastStage: '',
      lastAt: '',
      lastElapsedMs: null,
      starts: 0,
      errors: 0,
      slow: 0,
    }
    current.lastStage = event.stage || current.lastStage
    current.lastAt = event.at || current.lastAt
    current.lastElapsedMs = event.elapsedMs ?? current.lastElapsedMs
    if (event.stage === 'provider-started' || event.stage === 'start-finished') current.starts += 1
    if (String(event.stage || '').includes('error')) current.errors += 1
    if (event.stage === 'provider-start-slow') current.slow += 1
    byTarget.set(key, current)
  }
  return Array.from(byTarget.values()).slice(-20)
}

async function checkElevenLabsAgent(agent, apiKey) {
  const started = Date.now()
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent.agentId)}`, {
      headers: { 'xi-api-key': apiKey },
      cache: 'no-store',
    })
    const elapsedMs = Date.now() - started
    if (!response.ok) {
      const text = await response.text()
      return { ...agent, ok: false, elapsedMs, error: `ElevenLabs ${response.status}: ${compactError(text)}` }
    }
    const data = await response.json()
    return { ...agent, ok: Boolean(data.signed_url), elapsedMs, error: data.signed_url ? '' : 'signed URL missing' }
  } catch (error) {
    return { ...agent, ok: false, elapsedMs: Date.now() - started, error: compactError(error?.message || error) }
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  const agents = getVoiceAgents()
  const cred = getCred('elevenlabs') || getCred('eleven')
  const hasElevenLabsKey = Boolean(cred?.key)
  const checks = []
  for (const agent of agents) {
    if (agent.provider !== 'elevenlabs') {
      checks.push({ ...agent, ok: true, elapsedMs: 0, error: '' })
    } else if (!hasElevenLabsKey) {
      checks.push({ ...agent, ok: false, elapsedMs: 0, error: 'No ElevenLabs API key in vault' })
    } else {
      checks.push(await checkElevenLabsAgent(agent, cred.key))
    }
  }
  return NextResponse.json({
    ok: checks.every(check => check.ok),
    generatedAt: new Date().toISOString(),
    agents: checks,
    summary: {
      total: checks.length,
      passing: checks.filter(check => check.ok).length,
      failing: checks.filter(check => !check.ok).length,
      slow: checks.filter(check => check.elapsedMs > 2500).length,
      hasElevenLabsKey,
    },
    recentTransfers: summarizeRecentTransfers(),
  })
}
