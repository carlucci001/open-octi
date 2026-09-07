import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { getClients } from '@/lib/clients'
import { requireCapability } from '@/lib/permissions'
import { OPENAI_REALTIME_TOOLS, OPENAI_REALTIME_VOICES } from '@/lib/realtime-voice-tools'
import { COMMAND_CENTER_MENU_GUIDE } from '@/lib/commandCenterNavigation'
import { COMMAND_CENTER_LIVE_VOICE_RULES, OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'
import { PRESET_BY_ID } from '@/lib/agent-presets'
import { getOpenAIKeyCandidates, redactedKeyMeta } from '@/lib/openai-key-candidates'
import { isOpenOcti } from '@/lib/edition'
import { openOctiVoiceAgent } from '@/lib/openocti-voice-routing'
import { OPENOCTI_GUIDE_INSTRUCTIONS } from '@/lib/openocti-assistant'
import { readOpenOctiAgentKnowledge } from '@/lib/openocti-knowledge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCTION_VOICE_LOCKED_IDS = new Set(['main', 'coding'])
const OPENAI_VOICE_FALLBACK_IDS = new Set(['finance-manager'])

function buildCrmSnapshot() {
  const sponsorsRaw = readData('sponsor-leads.json')
  const sponsors = Array.isArray(sponsorsRaw) ? sponsorsRaw : sponsorsRaw?.leads || []
  const devLeads = readData('leads.json')?.leads || []
  const clients = getClients()
  const payments = readData('payments.json')?.payments || []
  const domains = readData('domains.json')?.domains || []

  const sponsorByStatus = {}
  sponsors.forEach(l => { sponsorByStatus[l.st] = (sponsorByStatus[l.st] || 0) + 1 })
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthPayments = payments.filter(p => p.date >= monthStart && p.status === 'succeeded')
  const monthRevenue = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)

  return {
    clients: clients.length,
    clientNames: clients.map(c => c.name).slice(0, 30),
    devLeads: devLeads.length,
    sponsorsTotal: sponsors.length,
    sponsorByStatus,
    monthRevenue,
    monthPaymentCount: monthPayments.length,
    domainsTotal: domains.length,
  }
}

function resolveAgent(agentId) {
  const agentsFile = readData('agents.json') || { agents: {} }
  const local = agentsFile.agents?.[agentId] || null
  const preset = PRESET_BY_ID[agentId] || null
  if (isOpenOcti()) {
    const starter = openOctiVoiceAgent(agentId, local || {}, preset || {})
    if (starter) return starter
  }
  if (!local && !preset && agentId !== 'matilda') return null
  if (isOpenOcti() && agentId === 'octi-guide' && local) {
    return { ...local, id: agentId, name: local.name || 'Octi', firstName: 'Octi', voice: { provider: 'openai', openaiVoice: 'marin', openaiModel: 'gpt-realtime' } }
  }
  const explicitOpenAiVoice = local?.voice?.provider === 'openai' || local?.voice?.voiceProvider === 'openai'
  if (PRODUCTION_VOICE_LOCKED_IDS.has(agentId) && !explicitOpenAiVoice) return { error: `${local?.name || agentId} is locked to ElevenLabs for production voice.` }
  if (local && local.draft !== true && !OPENAI_VOICE_FALLBACK_IDS.has(agentId) && !explicitOpenAiVoice) {
    return { error: `${local.name || agentId} is a production agent. OpenAI Realtime is only available for lab draft agents.` }
  }
  if (agentId === 'matilda') {
    const defaultCfg = readData('voice-agent.json') || {}
    return {
      id: 'matilda',
      name: defaultCfg.name || 'Matilda',
      firstName: 'Matilda',
      jobDescription: 'You are Matilda, Workspace owner\'s in-Command Center voice assistant. Be brief, direct, and useful. Use the Command Center tools when Carl asks you to act.',
      voice: { provider: 'openai', openaiVoice: 'marin', openaiModel: 'gpt-realtime' },
    }
  }
  return {
    id: agentId,
    name: local?.name || preset?.name || agentId,
    firstName: local?.firstName || (local?.name || preset?.name || agentId).split(/\s+/)[0],
    jobDescription: local?.jobDescription || preset?.jobDescription || local?.description || preset?.description || '',
    voice: {
      ...(local?.voice || {}),
      provider: 'openai',
      openaiVoice: local?.voice?.openaiVoice || local?.voice?.voiceName || 'ash',
      openaiModel: local?.voice?.openaiModel || local?.voice?.model || 'gpt-realtime',
    },
  }
}

function buildInstructions(agent, snapshot) {
  if (isOpenOcti() && agent.id === 'octi-guide') return OPENOCTI_GUIDE_INSTRUCTIONS
  if (isOpenOcti()) return [
    `You are ${agent.firstName || agent.name}, the user's ${agent.role || 'assistant'} in OpenOcti. Keep this identity.`,
    'Always begin and respond in English. Change languages only when the user explicitly asks.',
    `When the session opens, greet the user briefly as ${agent.firstName || agent.name}. Keep that same name and specialist role for every subsequent reply.`,
    'Be brief, direct, and helpful. Use available tools for workspace actions. Do not claim an action succeeded without a confirming tool result.',
    'Ask before sending messages, making purchases, or deleting data. Never ask for passwords or API keys in conversation.',
    'You are an AI assistant with an AI-generated voice.',
    `Your specialist knowledge:\n${readOpenOctiAgentKnowledge(agent.id)}`,
    `Authoritative identity: You are ${agent.firstName || agent.name}. A navigation tool changes the displayed page, never your identity. A request to speak with a teammate requires transfer_to_agent. Do not impersonate that teammate in this session.`,
  ].join('\n')
  const facts = [
    'CURRENT CRM STATE:',
    `- Clients: ${snapshot.clients}${snapshot.clientNames?.length ? ` (${snapshot.clientNames.join(', ')})` : ''}`,
    `- Dev leads: ${snapshot.devLeads}`,
    `- Sponsor CRM leads: ${snapshot.sponsorsTotal}`,
    `- This month's revenue: $${Number(snapshot.monthRevenue || 0).toLocaleString()} across ${snapshot.monthPaymentCount} payment(s)`,
    `- Domains managed: ${snapshot.domainsTotal}`,
  ].join('\n')

  return [
    agent.jobDescription,
    '',
    COMMAND_CENTER_LIVE_VOICE_RULES,
    '',
    OFFICE_AGENT_CONDUCT,
    '',
    facts,
    '',
    'You are in a live CRM demo. Keep responses short, confident, and conversational.',
    `Voice identity lock: You are ${agent.firstName || agent.name || 'this agent'}. Keep the same voice identity for the entire call. Do not change gender, accent, age, or vocal style mid-session.`,
    'When Carl asks you to do something available as a tool, call the tool silently and then report only the necessary result.',
    'When Carl says he is done, goodbye, bye, have a good day, end the call, hang up, disconnect, stop listening, or anything similar, say one short natural goodbye and call end_session or end_call. Never say only Carl can end the call.',
    `Authoritative Command Center menu map:\n${COMMAND_CENTER_MENU_GUIDE}`,
    'For repository/repo/Gitea/Git/source control/source code/code repository requests, call navigate_to with section "repository". Do not open Documents, Products, Product Lab, or Ops Lab.',
    'Do not claim you sent, created, opened, booked, or changed anything unless a tool result confirms it.',
    'For emails, phone calls, billing actions, or destructive actions, confirm the recipient/action out loud before using the tool.',
    'The audio voice is AI-generated and part of a Your organization CRM demo.',
  ].filter(Boolean).join('\n')
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const keyCandidates = getOpenAIKeyCandidates()
  if (!keyCandidates.length) return NextResponse.json({ error: 'Add an OpenAI API key in Models & Keys to enable voice.' }, { status: 400 })

  const url = new URL(request.url)
  const agentId = url.searchParams.get('agent') || 'matilda'
  const agent = resolveAgent(agentId)
  if (!agent) return NextResponse.json({ error: `Unknown OpenAI voice agent: ${agentId}` }, { status: 404 })
  if (agent.error) return NextResponse.json({ error: agent.error }, { status: 409 })

  const offerSdp = await request.text()
  if (!offerSdp || !offerSdp.includes('v=0')) {
    return NextResponse.json({ error: 'Expected raw WebRTC SDP offer' }, { status: 400 })
  }

  const voice = OPENAI_REALTIME_VOICES.includes(agent.voice?.openaiVoice) ? agent.voice.openaiVoice : 'marin'
  const model = agent.voice?.openaiModel || 'gpt-realtime'
  const snapshot = buildCrmSnapshot()
  const requestId = Math.random().toString(36).slice(2, 9)
  console.log(`[openai-voice] start requestId=${requestId} agent=${agent.id || agentId} voice=${voice} model=${model}`)
  const sessionConfig = {
    type: 'realtime',
    model,
    instructions: buildInstructions(agent, snapshot),
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe' },
      },
      output: { voice },
    },
    tools: isOpenOcti() && agent.id === 'octi-guide' ? [] : OPENAI_REALTIME_TOOLS,
    tool_choice: 'auto',
  }

  const makeForm = () => {
    const form = new FormData()
    form.set('sdp', offerSdp)
    form.set('session', JSON.stringify(sessionConfig))
    return form
  }

  let lastFailure = null
  for (const candidate of keyCandidates) {
    const meta = redactedKeyMeta(candidate)
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.key}`,
        'OpenAI-Safety-Identifier': 'openocti',
      },
      body: makeForm(),
      signal: request.signal,
    })

    const text = await upstream.text()
    if (upstream.ok) {
      console.log(`[openai-voice] connected requestId=${requestId} agent=${agent.id || agentId} keySource=${meta.source} keySuffix=${meta.suffix}`)
      return new NextResponse(text, {
        status: 200,
        headers: { 'Content-Type': 'application/sdp' },
      })
    }

    lastFailure = { status: upstream.status, text, meta }
    console.warn(`[openai-voice] upstream failed requestId=${requestId} status=${upstream.status} keySource=${meta.source} keySuffix=${meta.suffix} body=${text.slice(0, 240)}`)
    if (upstream.status !== 401 && upstream.status !== 403) break
  }
  return NextResponse.json({ error: `OpenAI Realtime ${lastFailure?.status || 'failed'}: ${(lastFailure?.text || '').slice(0, 300)}` }, { status: 502 })
}
