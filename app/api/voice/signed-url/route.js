import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { buildCrmSnapshot } from '@/lib/voice-crm-snapshot'
import { requireCapability } from '@/lib/permissions'
import { PRESET_BY_ID } from '@/lib/agent-presets'

function resolveAgent(requestedId) {
  // Default: Matilda (legacy single-agent voice-agent.json)
  const defaultCfg = readData('voice-agent.json') || {}
  const roster = readData('voice-agent-roster.json') || {}
  const agentsFile = readData('agents.json') || { agents: {} }

  // No agent requested → Matilda
  if (!requestedId) {
    return { agentId: defaultCfg.agentId, voiceName: defaultCfg.voiceName, name: defaultCfg.name || 'Matilda', firstName: 'Matilda', jobDescription: agentsFile.agents?.matilda?.jobDescription || '' }
  }
  // 'matilda' or the legacy id → Matilda
  if (requestedId === 'matilda' || requestedId === 'main-default') {
    return { agentId: defaultCfg.agentId, voiceName: defaultCfg.voiceName, name: defaultCfg.name || 'Matilda', firstName: 'Matilda', jobDescription: agentsFile.agents?.matilda?.jobDescription || '' }
  }
  // Preserve exact IDs, then accept a unique display name (Doreen -> receptionist).
  // Voice names and partial matches are not identities and can belong to multiple agents.
  const name = requestedId.trim().toLowerCase()
  const matches = Object.entries(roster).filter(([, agent]) =>
    [agent?.firstName, agent?.name].some(value => value && String(value).trim().toLowerCase() === name)
  )
  const rosterId = Object.hasOwn(roster, requestedId)
    ? requestedId
    : matches.length === 1 ? matches[0][0] : ''
  const r = roster[rosterId]
  if (r) {
    const local = agentsFile.agents?.[rosterId] || {}
    return { crmAgentId: rosterId, agentId: r.agentId, voiceName: r.voiceName, name: r.name, firstName: r.firstName, jobDescription: local.jobDescription || '' }
  }
  return null
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const url = new URL(request.url)
  const requestedId = url.searchParams.get('agent') || ''
  const resolved = resolveAgent(requestedId)
  const preset = PRESET_BY_ID[requestedId] || PRESET_BY_ID[resolved?.crmAgentId]
  if (preset?.runtimeProvider === 'deerflow-hetzner') {
    return NextResponse.json({
      error: `${preset.name || requestedId} uses DeerFlow with Gemini Chirp and is not routed through ElevenLabs signed URLs.`,
      provider: 'chirp3',
      runtimeProvider: preset.runtimeProvider,
    }, { status: 409 })
  }

  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) return NextResponse.json({ error: 'No ElevenLabs API key in vault' }, { status: 400 })

  if (!resolved) return NextResponse.json({ error: `Unknown voice agent: ${requestedId}` }, { status: 404 })
  if (!resolved.agentId) return NextResponse.json({ error: 'No voice-agent.json — run the agent setup first' }, { status: 400 })

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(resolved.agentId)}`, {
      headers: { 'xi-api-key': cred.key },
    })
    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json({ error: `ElevenLabs ${res.status}: ${t.slice(0, 300)}` }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json({
      signedUrl: data.signed_url,
      agentId: resolved.agentId,
      voiceName: resolved.voiceName,
      agentName: resolved.name,
      firstName: resolved.firstName,
      jobDescription: resolved.jobDescription || '',
      snapshot: buildCrmSnapshot(),
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
