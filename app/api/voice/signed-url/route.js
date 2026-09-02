import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { getClients } from '@/lib/clients'
import { requireCapability } from '@/lib/permissions'
import { PRESET_BY_ID } from '@/lib/agent-presets'

function buildCrmSnapshot() {
  const sponsorsRaw = readData('sponsor-leads.json')
  const sponsors = Array.isArray(sponsorsRaw) ? sponsorsRaw : sponsorsRaw?.leads || []
  const devLeads = readData('leads.json')?.leads || []
  const clients = getClients()
  const payments = readData('payments.json')?.payments || []
  const domains = readData('domains.json')?.domains || []

  const sponsorByStatus = {}
  sponsors.forEach(l => { sponsorByStatus[l.st] = (sponsorByStatus[l.st] || 0) + 1 })
  const sponsorByCampaign = { sponsors: 0, newspaper: 0, tda: 0, farrington_dev: 0 }
  sponsors.forEach(l => {
    if (l.campaign === 'farrington_dev') sponsorByCampaign.farrington_dev++
    else if (l.lt === 'newspaper') sponsorByCampaign.newspaper++
    else if (l.lt === 'tda') sponsorByCampaign.tda++
    else sponsorByCampaign.sponsors++
  })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthPayments = payments.filter(p => p.date >= monthStart && p.status === 'succeeded')
  const monthRevenue = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const expiringSoon = domains.filter(d => {
    if (!d.expirationDate) return false
    const exp = new Date(d.expirationDate)
    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    return exp <= in30
  })

  return {
    clients: clients.length,
    clientNames: clients.map(c => c.name).slice(0, 30),
    devLeads: devLeads.length,
    sponsorsTotal: sponsors.length,
    sponsorByCampaign,
    sponsorByStatus,
    monthRevenue,
    monthPaymentCount: monthPayments.length,
    domainsTotal: domains.length,
    domainsExpiringSoon: expiringSoon.length,
  }
}

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
  // Roster lookup by CRM agent id
  const r = roster[requestedId]
  if (r) {
    const local = agentsFile.agents?.[requestedId] || {}
    return { agentId: r.agentId, voiceName: r.voiceName, name: r.name, firstName: r.firstName, jobDescription: local.jobDescription || '' }
  }
  return null
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const url = new URL(request.url)
  const requestedId = url.searchParams.get('agent') || ''
  const preset = PRESET_BY_ID[requestedId]
  if (preset?.runtimeProvider === 'deerflow-hetzner') {
    return NextResponse.json({
      error: `${preset.name || requestedId} uses DeerFlow with Gemini Chirp and is not routed through ElevenLabs signed URLs.`,
      provider: 'chirp3',
      runtimeProvider: preset.runtimeProvider,
    }, { status: 409 })
  }

  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) return NextResponse.json({ error: 'No ElevenLabs API key in vault' }, { status: 400 })

  const resolved = resolveAgent(requestedId)
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
