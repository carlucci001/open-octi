
import { readData } from '@/lib/dataStore'
import { getClients } from '@/lib/clients'
import { DEERFLOW_VOICE_TOOLS, OPENAI_REALTIME_TOOLS } from '@/lib/realtime-voice-tools'
import { COMMAND_CENTER_MENU_GUIDE } from '@/lib/commandCenterNavigation'
import { COMMAND_CENTER_LIVE_VOICE_RULES, OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'
import { PRESET_BY_ID } from '@/lib/agent-presets'
import { isOpenOcti } from '@/lib/edition'
import { openOctiVoiceAgent } from '@/lib/openocti-voice-routing'
import { OPENOCTI_GUIDE_INSTRUCTIONS } from '@/lib/openocti-assistant'
import { voiceRuntimeFact } from '@/lib/voice-runtime-fact'
import { readOpenOctiAgentKnowledge } from '@/lib/openocti-knowledge'
import { SASHA_MEDIA_INSTRUCTIONS } from '@/lib/sasha-media-instructions'

// Persona building shared by the OpenAI Realtime route and the GPT-Live route.
// Route files may only export HTTP handlers, so the helpers live here.

const PRODUCTION_VOICE_LOCKED_IDS = new Set(['main', 'coding'])
const OPENAI_VOICE_FALLBACK_IDS = new Set(['finance-manager'])
const DEERFLOW_RUNTIME = 'deerflow-hetzner'

// DeerFlow crew agents are research roles whose results come from public web
// pages, so they get session control, navigation and read-only lookups instead of
// every CRM action tool. Widen deliberately, not by default.
export const DEERFLOW_CRM_TOOL_NAMES = Object.freeze([
  'end_session', 'end_call', 'transfer_to_agent', 'navigate_to', 'fcc_navigate_to',
  'open_record', 'fcc_open_record', 'account_summary', 'crm_capabilities', 'daily_briefing', 'whats_next',
])

export const DEERFLOW_BACKGROUND_RESEARCH = 'RESEARCH IN THIS VOICE SESSION: research runs in the background. This replaces any instruction above to call deep_research_dossier or another DeerFlow tool, which are not attached here. To research, call start_deep_research with the target and any context Carl gave, tell Carl in one sentence that it has started, and keep talking; never wait for it. When Carl asks for progress or results, call research_status and summarize the spokenSummary in a few spoken sentences once it is ready; if it is still running, say so briefly. If Carl says cancel, stop, or never mind, call cancel_research. Never claim a finding that research_status did not return.'

// The two studio producers (Iris, Wes) also get the generic CRM action gateway so
// they can still produce files from a live session. The execute route's own
// policy gate (paid_generation, approval bound to the exact args) stays in force.
export const STUDIO_TOOL_NAME = 'deerflow_studio_produce'
export const DEERFLOW_STUDIO_CRM_TOOL_NAMES = Object.freeze([...DEERFLOW_CRM_TOOL_NAMES, 'crm_action'])

export const DEERFLOW_STUDIO_PRODUCTION = 'STUDIO PRODUCTION IN THIS VOICE SESSION: the deerflow_studio_produce tool is not attached directly. Fulfil every production request (video, image, music, podcast, voiceover, deck, report, chart, newsletter) by calling crm_action with toolName "deerflow_studio_produce" and argsJson holding one JSON object: {"kind": one of video, image, music, podcast, voiceover, deck, report, chart, newsletter; "brief": what Carl asked for, in his words; "context": "Requested by Carl by voice through <your name>."}. Use crm_action for nothing else. Ask one short question only when the kind or the brief is missing. Tell Carl in one sentence that you submitted it and that production costs real money, so approval rules apply; do not quote prices. If the result says it is waiting for approval, nothing has been produced: say so, and once Carl says he approved it, call crm_action again with exactly the same toolName and argsJson, because approval is bound to those exact arguments. Never put approval or confirmation values in argsJson. A render runs inside that one call and can take several minutes. Never say a file exists, is ready, or is on the studio page until the result lists files; if the result lists none, say nothing was produced and read out its summary.'

export function buildCrmSnapshot() {
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

export function resolveAgent(agentId) {
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

export function buildInstructions(agent, snapshot) {
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
    agent.id === 'social-media' ? SASHA_MEDIA_INSTRUCTIONS : '',
    voiceRuntimeFact('openai'),
  ].filter(Boolean).join('\n')
}

function rosterEntry(agentId) {
  const entry = readData('voice-agent-roster.json')?.[agentId]
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null
}

// Any CRM voice agent as GPT-Live needs it: identity, role, runtime and the
// owner's optional voice override. No production-voice lock applies here; the
// GPT-Live route decides which agents may use it (never phone-bound ones).
export function resolveVoiceAgent(agentId) {
  const local = readData('agents.json')?.agents?.[agentId] || null
  const preset = PRESET_BY_ID[agentId] || null
  const roster = rosterEntry(agentId)
  if (!local && !preset && !roster && agentId !== 'matilda') return null
  const defaultCfg = agentId === 'matilda' ? readData('voice-agent.json') || {} : {}
  const name = String(local?.name || roster?.name || (agentId === 'matilda' ? defaultCfg.name : '') || preset?.name || (agentId === 'matilda' ? 'Matilda' : agentId))
  const jobDescription = agentId === 'matilda' && !local?.jobDescription
    ? 'You are Matilda, Workspace owner\'s in-Command Center voice assistant. Be brief, direct, and useful. Use the Command Center tools when Carl asks you to act.'
    : local?.jobDescription || preset?.jobDescription || local?.description || preset?.description || ''
  return {
    id: agentId,
    name,
    firstName: String(local?.firstName || roster?.firstName || (agentId === 'matilda' ? 'Matilda' : name.split(/\s+/)[0])),
    title: local?.title || preset?.title || '',
    role: local?.role || preset?.role || '',
    jobDescription,
    runtimeProvider: preset?.runtimeProvider || local?.runtimeProvider || null,
    studioProducer: Array.isArray(preset?.tools) && preset.tools.includes('deerflow_studio_produce'),
    gender: local?.gender || preset?.gender || '',
    gptLiveVoice: roster?.gptLiveVoice || local?.gptLiveVoice || '',
    phoneNumber: roster?.phoneNumber || '',
    binding: typeof roster?.agentId === 'string' ? roster.agentId : '',
  }
}

const toLiveTool = tool => ({
  type: 'function', name: tool.name, description: tool.description || '',
  parameters: tool.parameters || { type: 'object', properties: {}, additionalProperties: false }, strict: false,
})

// crm_action is a gateway to every CRM tool. The studio producers only need one,
// so the schema they are given pins toolName to it. This narrows what the model
// is offered; the execute route's policy gate is still what enforces approval.
function studioActionTool(tool) {
  return {
    ...tool,
    description: `${tool.description} In this session it is limited to ${STUDIO_TOOL_NAME}.`,
    parameters: {
      ...tool.parameters,
      properties: {
        ...tool.parameters.properties,
        toolName: { type: 'string', enum: [STUDIO_TOOL_NAME], description: `Always ${STUDIO_TOOL_NAME}.` },
      },
    },
  }
}

// Persona and tool declarations for an agent with no ElevenLabs binding (DeerFlow
// crew, synthetic Matilda, OpenAI-only agents). `context` is applied by
// buildLiveSession as the CURRENT CRM VIEW, so it is accepted here for symmetry.
export function buildNativePersona({ agentId, context = {} } = {}) {
  void context
  const agent = resolveVoiceAgent(agentId)
  if (!agent) throw new Error('Unknown voice agent.')
  const deerFlow = agent.runtimeProvider === DEERFLOW_RUNTIME
  const base = buildInstructions(agent, buildCrmSnapshot())
  const studio = deerFlow && agent.studioProducer
  const instructions = deerFlow
    ? [base, DEERFLOW_BACKGROUND_RESEARCH, studio ? DEERFLOW_STUDIO_PRODUCTION : ''].filter(Boolean).join('\n\n')
    : base
  const allowed = studio ? DEERFLOW_STUDIO_CRM_TOOL_NAMES : DEERFLOW_CRM_TOOL_NAMES
  const crmTools = deerFlow
    ? OPENAI_REALTIME_TOOLS.filter(tool => allowed.includes(tool.name)).map(tool => (studio && tool.name === 'crm_action' ? studioActionTool(tool) : tool))
    : OPENAI_REALTIME_TOOLS
  const tools = [...crmTools, ...(deerFlow ? DEERFLOW_VOICE_TOOLS : [])].map(toLiveTool)
  return { instructions, tools }
}
