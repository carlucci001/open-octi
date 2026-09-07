import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { PRESET_BY_ID } from '@/lib/agent-presets'
import { requireCapability } from '@/lib/permissions'
import { toGeminiFunctionDeclarations } from '@/lib/realtime-voice-tools'
import { COMMAND_CENTER_MENU_GUIDE } from '@/lib/commandCenterNavigation'
import { COMMAND_CENTER_LIVE_VOICE_RULES, OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'
import { isOpenOcti } from '@/lib/edition'
import { resolveProviderKey } from '@/lib/openocti-keys'
import { OPENOCTI_GUIDE_INSTRUCTIONS } from '@/lib/openocti-assistant'
import { openOctiVoiceAgent } from '@/lib/openocti-voice-routing'
import { readOpenOctiAgentKnowledge } from '@/lib/openocti-knowledge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'

function cleanText(value, max = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function getGeminiKey() {
  if (isOpenOcti()) return resolveProviderKey('gemini').key
  return getCred('gemini')?.key || getCred('google gemini')?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function liveModel(value) {
  const model = cleanText(value, 120)
  return /live|native-audio/i.test(model) ? model.replace(/^models\//, '') : DEFAULT_MODEL
}

function resolveAgent(agentId) {
  // 'matilda-gemini' is the synthetic roster entry for the Matilda Gemini Live
  // preview — same persona as agents.matilda, different runtime/voice.
  const personaId = agentId === 'matilda-gemini' ? 'matilda' : agentId
  const agentsFile = readData('agents.json') || { agents: {} }
  const local = agentsFile.agents?.[personaId] || null
  const preset = PRESET_BY_ID[personaId] || null
  if (isOpenOcti()) {
    const starter = openOctiVoiceAgent(personaId, local || {}, preset || {})
    if (starter) return starter
  }
  if (local || preset) {
    const aliasDefaults = personaId !== agentId ? { name: 'Matilda', firstName: 'Matilda' } : {}
    return { id: agentId, ...aliasDefaults, ...(preset || {}), ...(local || {}) }
  }
  return { id: agentId || 'voice-lab', name: agentId || 'Voice Lab Agent', firstName: agentId || 'Agent' }
}

function agentInstructions(agent, { context, toolsEnabled } = {}) {
  if (isOpenOcti() && agent.id === 'octi-guide') return OPENOCTI_GUIDE_INSTRUCTIONS
  if (isOpenOcti()) return [
    `You are ${agent.firstName || agent.name}, the user's ${agent.role || 'assistant'} in OpenOcti. Keep this identity.`,
    'Always begin and respond in English. Change languages only when the user explicitly asks.',
    'Be brief, direct, and helpful. Use available tools for workspace actions. Never claim an action succeeded without a confirming tool result.',
    'Ask before sending messages, making purchases, or deleting data. Never ask for passwords or API keys in conversation.',
    'You are an AI assistant with an AI-generated voice.',
    readOpenOctiAgentKnowledge(agent.id),
    `Authoritative identity: You are ${agent.firstName || agent.name}. Navigating to a page never changes your identity. Transfer to a teammate through transfer_to_agent; do not impersonate another agent.`,
    context?.sectionId ? `Current page: ${cleanText(context.sectionId, 80)}. Page context is not agent identity.` : '',
    toolsEnabled ? `Use only the tools actually declared for this session. Navigation map:\n${COMMAND_CENTER_MENU_GUIDE}` : '',
  ].filter(Boolean).join('\n\n')
  const lines = [
    `You are ${agent.name || agent.firstName || agent.id}, a OpenOcti voice agent.`,
    COMMAND_CENTER_LIVE_VOICE_RULES,
    agent.title ? `Title: ${agent.title}.` : '',
    agent.voiceProfile ? `Voice profile: ${agent.voiceProfile}.` : '',
    agent.description ? `Role context: ${agent.description}` : '',
    agent.jobDescription || '',
    'Keep live voice replies concise, useful, and interruption-friendly. Do not mention implementation details unless Carl asks.',
  ]
  const sectionLabel = cleanText(context?.sectionLabel, 160)
  const sectionId = cleanText(context?.sectionId, 80)
  const record = cleanText(context?.record, 400)
  if (sectionLabel || sectionId) {
    lines.push(`Carl is currently on the "${sectionLabel || sectionId}" page of the CRM${sectionId ? ` (section id "${sectionId}")` : ''}. Treat requests as being about this page unless he names another. When he says "here", "this page", or "add one", act in the context of this page.`)
  }
  if (record) {
    lines.push(`Current visible record/context: ${record}. When Carl says "this", use that context.`)
  }
  if (toolsEnabled) {
    lines.push(OFFICE_AGENT_CONDUCT)
    lines.push(`COMMAND CENTER MENU MAP:\n${COMMAND_CENTER_MENU_GUIDE}`)
    lines.push('You have live tools. Use navigate_to to open Command Center sections, and the other declared tools for CRM facts and actions. When Carl asks you to create and save a document, compose the complete content first and call create_document immediately; never promise background work or claim the document exists unless the tool confirms the save. If a tool call fails, say it failed and report the short error instead of pretending it succeeded. Anything that sends, spends, or is irreversible requires Carl to explicitly confirm in this conversation first. If you do not know a specific detail, say you do not have it in front of you instead of guessing.')
  }
  return lines.filter(Boolean).join('\n\n')
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  let body
  try { body = await request.json() } catch { body = {} }
  const apiKey = getGeminiKey()
  if (!apiKey) return NextResponse.json({ ok: false, error: 'No Gemini API key in vault or environment' }, { status: 400 })

  const agentId = cleanText(body.agentId || 'finance-manager', 80)
  const agent = resolveAgent(agentId)
  const model = liveModel(body.model)
  const voiceName = cleanText(body.voiceName || agent.voice?.voiceName || agent.voice?.geminiVoice || 'Kore', 80) || 'Kore'
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString()

  // Tools are opt-in per request: only the updated VoiceSession client sends
  // enableTools, so older cached clients keep the exact previous behavior and
  // never receive tool calls they cannot answer.
  const toolsEnabled = body.enableTools === true && !(isOpenOcti() && agentId === 'octi-guide')
  const context = body.context && typeof body.context === 'object' ? body.context : null

  const setup = {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
    systemInstruction: { parts: [{ text: agentInstructions(agent, { context, toolsEnabled }) + (body.silent ? '\n\nDo not greet or announce yourself. Stay silent until Carl speaks, then answer what he asks — never open with "this is <name>".' : '') }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: {},
    ...(toolsEnabled ? { tools: [{ functionDeclarations: toGeminiFunctionDeclarations() }] } : {}),
  }

  let token
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })
    const { model: _setupModel, generationConfig, ...sharedConfig } = setup
    token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: generationConfig.responseModalities,
            speechConfig: generationConfig.speechConfig,
            ...sharedConfig,
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: `Gemini Live token failed: ${String(error?.message || error).slice(0, 240)}`,
    }, { status: 502 })
  }
  if (!token?.name) return NextResponse.json({ ok: false, error: 'Gemini did not issue a live-session token' }, { status: 502 })

  return NextResponse.json({
    ok: true,
    token: token.name,
    expiresAt: token.expireTime || expireTime,
    model,
    voiceName,
    agent: { id: agentId, name: agent.name || agent.firstName || agentId, firstName: agent.firstName || String(agent.name || agentId).split(/\s+/)[0] },
    websocketUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token.name)}`,
    setup: { setup },
  })
}
