'use client'
import ThemedSelect from './ThemedSelect'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import VoiceFullscreen from './VoiceFullscreen'
import { resolveCommandCenterTab, labelForCommandCenterTab, COMMAND_CENTER_SECTIONS } from '@/lib/commandCenterNavigation'
import { COMMAND_CENTER_LIVE_VOICE_RULES, OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'
import { OPENAI_REALTIME_TOOLS } from '@/lib/realtime-voice-tools'
import { buildAgentHandoffPayload } from '@/lib/agent-handoff'
import { buildWakeStartOptions } from '@/lib/voiceWakeStart'
import { appendVoiceTranscriptChunk, isVoiceEndIntent } from '@/lib/voice-end-intent'
import { parseCrmActionArgs, rankCrmCapabilities } from '@/lib/crm-operator-tools'
import { clientCapabilityStatus } from '@/lib/client-capabilities'
import {
  escapeRegExp,
  findRosterAgent,
  isDirectTransferPhrase,
  isWakeTransferPhrase,
  resolveTransferTarget,
} from '@/lib/voiceAgentRouting'

// Master list of every client tool any of our agents might call. Keep in sync
// with the tool definitions in `start()` below — adding a name here is what tells
// the ElevenLabs SDK at session-init time that we have a handler, which kills
// the "Client tool with name X is not defined" warning. The stable proxy at
// hook-level forwards each call to the live implementations populated when a
// session starts (they close over per-session helpers and can't be top-level).
const CLIENT_TOOL_NAMES = [
  'check_jules_status', 'delegate_to_jules', 'create_plugin_change_request', 'create_openclaw_plugin_spec',
  'daily_briefing', 'ops_status', 'repository_status', 'backup_status', 'whats_next', 'whats_overdue',
  'pipeline_status', 'account_summary', 'outstanding_invoices', 'invoice_command', 'client_balance',
  'overdue_items', 'overhead_summary', 'recent_payments',
  'create_account', 'create_task', 'complete_task', 'log_activity',
  'dictate_email', 'move_pipeline_stage',
  'draft_legal_document', 'save_document_to_account',
  'send_document', 'generate_and_send_document', 'send_signature_document',
  'end_session', 'end_call', 'hang_up',
  'check_domain_availability', 'register_domain', 'open_record', 'fcc_open_record', 'send_email',
  'create_contact', 'find_contact', 'create_calendar_event', 'book_demo',
  'start_video_call', 'filter_leads', 'navigate_to', 'fcc_navigate_to',
  'command_center_action', 'crm_capabilities', 'crm_action', 'transfer_to_agent',
  'search_twilio_numbers', 'prepare_twilio_number_setup',
  'dial_phone', 'list_upcoming_events',
  'create_content_draft', 'generate_image', 'list_media',
  'take_note_for_client', 'remember_fact', 'recall_memory', 'list_agent_memory',
  'forget_memory', 'save_call_memory', 'send_media_to_client',
  'start_orchestration', 'answer_flow_question', 'check_flow_status',
]

async function discoverCrmCapabilities({ component = '', task = '' } = {}) {
  const response = await fetch('/api/agent/execute', { cache: 'no-store', credentials: 'include' })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Could not read CRM capabilities')
  const browserCapabilities = [{
    name: 'command_center_action',
    description: 'Operate Command Center browser controls and create or list Documents. Args: { action: create_document|list_documents|open_ai|open_switchboard|open_repository|open_messages|open_notifications|open_help|open_settings|open_transcription|arm_transcription|start_transcription|open_api_meter|close_api_meter|hide_api_meter|open_api_spend_panel|toggle_network_mode|toggle_sidebar|toggle_right_rail, target?: title or target name, value?: complete document text or control value }. For create_document, target is the title and value is the complete composed document.',
  }, {
    name: 'build_automation',
    description: 'Start the guided Build > Automations interview and create a real disabled draft. Args: { name: string, description?: string }. Continue with build_automation_answer.',
  }, {
    name: 'build_automation_answer',
    description: 'Save the answer to the current automation interview question. Args: { answer: string }. Returns the single next question or completed draft summary.',
  }, {
    name: 'create_agent_draft',
    description: 'Create a disabled review-stage agent in Build > Agents. Args: { name: string, job: string, description?: string }.',
  }, {
    name: 'create_platform_draft',
    description: 'Register an inert platform record in Build > Platforms without credentials or deployment. Args: { name: string, platformId: string, url: string (HTTPS), environment?: production|staging, notes?: string }.',
  }, {
    name: 'create_campaign_draft',
    description: 'Create review-only draft campaign posts in Build > Campaigns; nothing is approved, scheduled, or published. Args: { name: string, objective: string, audience: string, market?: string, channels?: string[] }.',
  }]
  const matches = rankCrmCapabilities([...(payload.tools || []), ...browserCapabilities], { component, task })
  return JSON.stringify({
    component: String(component || ''),
    task: String(task || ''),
    count: matches.length,
    tools: matches,
    guidance: matches.length
      ? 'Choose the exact matching tool, read its Args contract, ask only for missing required values, then call crm_action.'
      : 'No close match was found. Try crm_capabilities again with the record type and desired action in plain language.',
  })
}

async function runCrmAction({ toolName, tool, argsJson } = {}) {
  const selectedTool = String(toolName || tool || '').trim()
  if (!selectedTool) throw new Error('toolName is required')
  if (selectedTool === 'crm_action' || selectedTool === 'fcc_call') throw new Error('Nested CRM action calls are not allowed')
  const parsedArgs = parseCrmActionArgs(argsJson)
  if (VOICE_AUTOMATION_ACTIONS.has(selectedTool)) {
    const target = parsedArgs.name || parsedArgs.target || ''
    const value = parsedArgs.answer ?? parsedArgs.description ?? parsedArgs.value ?? ''
    return runVoiceAutomationAction(selectedTool, target, value)
  }
  if (VOICE_BUILD_DRAFT_ACTIONS.has(selectedTool)) return runVoiceBuildDraftAction(selectedTool, parsedArgs)
  if (VOICE_CAMPAIGN_ACTIONS.has(selectedTool)) return runVoiceCampaignAction(selectedTool, parsedArgs.name || parsedArgs.target, parsedArgs.audience || parsedArgs.value)
  if (selectedTool === 'command_center_action') {
    const key = String(parsedArgs.action || parsedArgs.target || '').toLowerCase().trim().replace(/^the\s+/, '').replace(/\s+/g, '_')
    if (!key) throw new Error('command_center_action requires an action')
    if (VOICE_AUTOMATION_ACTIONS.has(key)) return runVoiceAutomationAction(key, parsedArgs.target, parsedArgs.value)
    if (VOICE_CAMPAIGN_ACTIONS.has(key)) return runVoiceCampaignAction(key, parsedArgs.target, parsedArgs.value)
    if (VOICE_DOCUMENT_ACTIONS.has(key)) return runVoiceDocumentAction(key, parsedArgs.target, parsedArgs.value)
    window.dispatchEvent(new CustomEvent('fcc:command-action', { detail: { action: key, target: parsedArgs.target, value: parsedArgs.value } }))
    return `Completed Command Center action ${key}.`
  }
  const response = await fetch('/api/agent/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ tool: selectedTool, args: parsedArgs }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `CRM tool ${selectedTool} failed`)
  return typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result ?? {})
}

const FALLBACK_VOICE_AGENTS = [
  {
    id: 'matilda',
    firstName: 'Matilda',
    name: 'Matilda',
    voiceName: 'Kore',
    voiceProvider: 'gemini',
    geminiVoice: 'Kore',
    geminiModel: 'gemini-3.1-flash-live-preview',
    voiceProfile: { provider: 'gemini', geminiVoice: 'Kore', geminiModel: 'gemini-3.1-flash-live-preview', voiceName: 'Kore' },
    role: 'Default voice assistant — Gemini Live',
  },
  {
    id: 'main',
    firstName: 'Maggie',
    name: 'Maggie',
    voiceName: 'Maggie',
    voiceProvider: 'elevenlabs',
    role: 'Office Manager',
    category: 'operations',
  },
  {
    id: 'coding',
    firstName: 'Craig',
    name: 'Craig',
    voiceName: 'Craig',
    voiceProvider: 'elevenlabs',
    role: 'Engineering Assistant',
    category: 'engineering',
  },
  {
    id: 'finance-manager',
    firstName: 'Frank',
    name: 'Frank',
    voiceName: 'ash',
    voiceProvider: 'openai',
    openaiVoice: 'ash',
    openaiModel: 'gpt-realtime',
    role: 'Finance Manager',
    category: 'operations',
  },
  {
    id: 'social-media',
    firstName: 'Sasha',
    name: 'Sasha',
    voiceName: 'Sasha',
    voiceProvider: 'elevenlabs',
    role: 'Creative and social media',
    category: 'creative',
  },
  {
    id: 'legal',
    firstName: 'Linda',
    name: 'Linda',
    voiceName: 'Linda',
    voiceProvider: 'elevenlabs',
    role: 'Legal and contracts',
    category: 'legal',
  },
  {
    id: 'communications',
    firstName: 'Cameron',
    name: 'Cameron',
    voiceName: 'Cameron',
    voiceProvider: 'elevenlabs',
    role: 'Communications',
    category: 'communications',
  },
  {
    id: 'newsroomaios-promoter',
    firstName: 'Mark',
    name: 'Mark',
    voiceName: 'Mark',
    voiceProvider: 'elevenlabs',
    role: 'Marketing',
    category: 'marketing',
  },
  {
    id: 'doreen',
    firstName: 'Doreen',
    name: 'Doreen',
    voiceName: 'Doreen',
    voiceProvider: 'elevenlabs',
    role: 'Reception',
    category: 'reception',
  },
  {
    id: 'diane',
    firstName: 'Diane',
    name: 'Diane',
    voiceName: 'Diane',
    voiceProvider: 'elevenlabs',
    role: 'Morning brief',
    category: 'briefing',
  },
  {
    id: 'deep-research-analyst',
    firstName: 'Nadia',
    name: 'Nadia',
    voiceName: 'en-US-Chirp3-HD-Aoede',
    voiceProvider: 'chirp3',
    chirp3Model: 'chirp3-hd',
    chirp3Voice: 'en-US-Chirp3-HD-Aoede',
    runtimeProvider: 'deerflow-hetzner',
    role: 'Deep Research Analyst',
    category: 'research',
  },
  {
    id: 'deerflow-lead-research-analyst',
    firstName: 'Leo',
    name: 'Leo',
    voiceName: 'en-US-Chirp3-HD-Puck',
    voiceProvider: 'chirp3',
    chirp3Model: 'chirp3-hd',
    chirp3Voice: 'en-US-Chirp3-HD-Puck',
    runtimeProvider: 'deerflow-hetzner',
    role: 'Lead Intelligence Analyst',
    category: 'research',
  },
  {
    id: 'deerflow-client-vetting-analyst',
    firstName: 'Vera',
    name: 'Vera',
    voiceName: 'en-US-Chirp3-HD-Kore',
    voiceProvider: 'chirp3',
    chirp3Model: 'chirp3-hd',
    chirp3Voice: 'en-US-Chirp3-HD-Kore',
    runtimeProvider: 'deerflow-hetzner',
    role: 'Vendor Risk Analyst',
    category: 'research',
  },
  {
    id: 'deerflow-market-competitor-analyst',
    firstName: 'Mason',
    name: 'Mason',
    voiceName: 'en-US-Chirp3-HD-Charon',
    voiceProvider: 'chirp3',
    chirp3Model: 'chirp3-hd',
    chirp3Voice: 'en-US-Chirp3-HD-Charon',
    runtimeProvider: 'deerflow-hetzner',
    role: 'Market Research Analyst',
    category: 'research',
  },
  {
    id: 'deerflow-reputation-risk-analyst',
    firstName: 'Rowan',
    name: 'Rowan',
    voiceName: 'en-US-Chirp3-HD-Sulafat',
    voiceProvider: 'chirp3',
    chirp3Model: 'chirp3-hd',
    chirp3Voice: 'en-US-Chirp3-HD-Sulafat',
    runtimeProvider: 'deerflow-hetzner',
    role: 'Property Research Analyst',
    category: 'research',
  },
]

const DIRECT_DEERFLOW_WAKE_ALIASES = [
  { id: 'deep-research-analyst', names: ['nadia', 'nadiya', 'nadya', 'nadja', 'nardia', 'nydia', 'nadea', 'nadi a', 'hey nadia', 'hey nadiya'] },
  { id: 'deerflow-lead-research-analyst', names: ['leo', 'lio', 'lee oh'] },
  { id: 'deerflow-client-vetting-analyst', names: ['vera', 'veera', 'vira'] },
  { id: 'deerflow-market-competitor-analyst', names: ['mason', 'mayson', 'maisyn'] },
  { id: 'deerflow-reputation-risk-analyst', names: ['rowan', 'rohan', 'rowen'] },
]

const PENDING_VOICE_TRANSFER_KEY = 'fcc-pending-voice-transfer'
const VOICE_LAB_RESULTS_KEY = 'fcc-voice-lab-results-v1'
const DEFAULT_VOICE_SESSION_MAX_MS = 15 * 60 * 1000
const VOICE_SESSION_MAX_MS = Math.max(
  60 * 1000,
  Number(process.env.NEXT_PUBLIC_VOICE_SESSION_MAX_MS || DEFAULT_VOICE_SESSION_MAX_MS) || DEFAULT_VOICE_SESSION_MAX_MS
)
// Derived from the canonical section list so the voice prompt can never drift
// from what navigate_to actually accepts (the old hand-maintained list had
// fallen 20 sections behind).
const COMPACT_COMMAND_CENTER_MAP = COMMAND_CENTER_SECTIONS.map(s => s.id).join(', ')

function compactTransferValue(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

// Wake-gate visibility. The wake listener is suppressed whenever a live voice
// session owns the mic — correct behaviour, but indistinguishable from a
// permanently stuck flag, which is how the wake word died silently on every
// device on 2026-07-24. Log the block (throttled, and only when the gating
// flags actually change) so "wake is gated" always shows up in the prod
// journal alongside a stuck-flag warning if it never clears.
let lastWakeGateSignature = ''
let lastWakeGateLoggedAt = 0
let wakeGateSince = 0

// The OTHER way wake dies: not gated by a stale flag, but simply switched off.
// logWakeGateBlock never covered this, so a wakeOn=false toggle produced no
// console line and no journal line — which is why "I have to click Go Live"
// was invisible in prod for weeks. Throttled to one line a minute.
let lastWakeOffIdleLoggedAt = 0
function logWakeOffIdle() {
  const now = Date.now()
  if (now - lastWakeOffIdleLoggedAt < 60000) return
  lastWakeOffIdleLoggedAt = now
  logVoiceTransferEvent({
    stage: 'wake-off-idle',
    reason: 'wake word is switched off while no session is running',
    status: 'NOT-LISTENING',
  })
}

function logWakeGateBlock(source) {
  if (typeof window === 'undefined') return
  const flags = [
    window.__fccChirpSessionActive ? 'chirp' : null,
    window.__fccVoiceActive ? 'voiceActive' : null,
    window.__fccVoiceStarting ? 'voiceStarting' : null,
  ].filter(Boolean)
  const signature = `${source}:${flags.join('+')}`
  const now = Date.now()
  if (!wakeGateSince || signature !== lastWakeGateSignature) wakeGateSince = now
  // New reason logs immediately; an unchanged reason logs at most every 30s.
  if (signature === lastWakeGateSignature && now - lastWakeGateLoggedAt < 30000) return
  lastWakeGateSignature = signature
  lastWakeGateLoggedAt = now
  const heldMs = now - wakeGateSince
  logVoiceTransferEvent({
    stage: 'wake-gate-blocked',
    reason: `wake suppressed by ${flags.join('+') || 'unknown'} via ${source}`,
    status: heldMs > 120000 ? 'STUCK-FLAG-SUSPECTED' : 'gated',
    elapsedMs: heldMs,
  })
}

function logVoiceTransferEvent(event = {}) {
  if (typeof window === 'undefined') return
  const payload = {
    stage: compactTransferValue(event.stage, 60),
    toolName: compactTransferValue(event.toolName, 80),
    from: compactTransferValue(event.from, 80),
    to: compactTransferValue(event.to, 80),
    agentId: compactTransferValue(event.agentId, 80),
    provider: compactTransferValue(event.provider, 40),
    model: compactTransferValue(event.model, 120),
    runId: compactTransferValue(event.runId || event.sessionId, 120),
    clientId: compactTransferValue(event.clientId || event.accountId, 120),
    productId: compactTransferValue(event.productId, 120),
    requestId: compactTransferValue(event.requestId, 120),
    status: compactTransferValue(event.status, 40),
    result: compactTransferValue(event.result, 220),
    error: compactTransferValue(event.error, 220),
    reason: compactTransferValue(event.reason, 160),
    elapsedMs: Number.isFinite(event.elapsedMs) ? Math.max(0, Math.round(event.elapsedMs)) : null,
    route: compactTransferValue(`${window.location.pathname}${window.location.search}`, 180),
    at: new Date().toISOString(),
  }
  try { console.info('[voice-transfer]', payload) } catch {}
  const body = JSON.stringify(payload)
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/api/voice/transfer-log', new Blob([body], { type: 'application/json' }))
      if (ok) return
    }
  } catch {}
  try {
    fetch('/api/voice/transfer-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

function chirpAudioRegistry() {
  if (typeof window === 'undefined') return null
  if (!window.__fccChirpAudioEls) window.__fccChirpAudioEls = new Set()
  return window.__fccChirpAudioEls
}

function stopAllChirpAudio() {
  const registry = chirpAudioRegistry()
  if (registry) {
    registry.forEach(audio => {
      try {
        audio.pause()
        audio.removeAttribute('src')
        audio.load?.()
      } catch {}
    })
    registry.clear()
  }
  try {
    document.querySelectorAll('audio[data-fcc-chirp-voice="1"]').forEach(audio => {
      try {
        audio.pause()
        audio.removeAttribute('src')
        audio.load?.()
      } catch {}
    })
  } catch {}
  try { window.speechSynthesis?.cancel?.() } catch {}
}

function emitVoiceLabTest(event = {}) {
  if (typeof window === 'undefined') return
  const at = event.at || new Date().toISOString()
  const runId = event.runId || window.__fccVoiceLabRunId || `voice-${Date.now().toString(36)}`
  const nextEvent = { ...event, runId, at }
  const read = () => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        const parsed = JSON.parse(store.getItem(VOICE_LAB_RESULTS_KEY) || '[]')
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
    return []
  }
  const runs = read()
  const index = runs.findIndex(item => item.runId === runId)
  const current = index >= 0 ? runs[index] : { runId, startedAt: at, events: [], messages: [] }
  const updated = {
    ...current,
    agentId: event.agentId || current.agentId || '',
    agentName: event.agentName || current.agentName || '',
    provider: event.provider || current.provider || '',
    model: event.model || current.model || '',
    voiceName: event.voiceName || current.voiceName || '',
    status: event.status || event.stage || current.status || 'running',
    endedAt: event.endedAt || (event.stage === 'ended' || event.stage === 'error' ? at : current.endedAt),
    handoff: event.handoff || current.handoff || null,
    error: event.error || current.error || '',
    events: [...(current.events || []), {
      at,
      stage: event.stage || event.status || 'event',
      detail: event.detail || event.reason || event.error || '',
    }].slice(-24),
    messages: event.text
      ? [...(current.messages || []), { at, role: event.role || 'event', text: String(event.text || '').slice(0, 1200) }].slice(-18)
      : (current.messages || []),
  }
  const next = [updated, ...runs.filter(item => item.runId !== runId)].slice(0, 16)
  try { window.localStorage.setItem(VOICE_LAB_RESULTS_KEY, JSON.stringify(next)) } catch {}
  try { window.sessionStorage.setItem(VOICE_LAB_RESULTS_KEY, JSON.stringify(next)) } catch {}
  window.__fccVoiceLabRunId = runId
  window.dispatchEvent(new CustomEvent('fcc:voice-lab-test', { detail: updated }))
}

function mergeVoiceRoster(agents = []) {
  const byId = new Map(FALLBACK_VOICE_AGENTS.map(agent => [agent.id, agent]))
  for (const agent of agents || []) {
    if (!agent?.id) continue
    byId.set(agent.id, { ...(byId.get(agent.id) || {}), ...agent })
  }
  return Array.from(byId.values())
}

function firstNameOfAgent(agent = {}) {
  return (agent.firstName || (agent.name || '').trim().split(/\s+/)[0] || '').toLowerCase()
}

const VOICE_PICKUPS = [
  'I am here, Carl.',
  'Ready when you are.',
  'Go ahead, Carl.',
  'I am listening.',
  'With you, Carl.',
  'How can I help?',
  'Ready to help.',
  'I am online.',
]
let lastVoicePickup = ''

function pickVoicePickup() {
  const choices = VOICE_PICKUPS.filter(item => item !== lastVoicePickup)
  const picked = choices[Math.floor(Math.random() * choices.length)] || VOICE_PICKUPS[0]
  lastVoicePickup = picked
  return picked
}

const TRANSFER_CONFIRMATIONS = [
  'Connecting you with {name} now.',
  'I am transferring you to {name}.',
  'Sending you to {name} now.',
  'One moment. I am bringing in {name}.',
  'Routing you to {name}.',
  '{name} is coming on now.',
]
let lastTransferConfirmation = ''

function pickTransferConfirmation(name) {
  const choices = TRANSFER_CONFIRMATIONS.filter(item => item !== lastTransferConfirmation)
  const template = choices[Math.floor(Math.random() * choices.length)] || TRANSFER_CONFIRMATIONS[0]
  lastTransferConfirmation = template
  return template.replace('{name}', name || 'the agent')
}

function wantsSignatureRequest(...parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase()
  return /\b(nda|non[-\s]?disclosure|signature|signing|sign it|for signature|review and sign)\b/.test(text)
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function voiceExternalSendApproval(agent = {}) {
  const agentName = agent.firstName || agent.name || 'voice agent'
  return {
    approvedByCarl: true,
    humanApproved: true,
    explicitApproval: true,
    approvalSource: 'voice_session',
    approvalAgentName: agentName,
  }
}

function isMobileOrTabletDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches || window.matchMedia?.('(max-width: 1023px)').matches
}

function voiceMicErrorMessage(error) {
  const name = error?.name || ''
  const message = error?.message || ''
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const localHint = host === 'localhost' || host === '127.0.0.1'
    ? ' Localhost is valid for mic access, but the embedded preview browser or Windows can still block the device.'
    : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return `Microphone permission was denied.${localHint} Allow microphone access for this browser, then start the voice agent again.`
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone device was found. Check Windows input settings or plug in a mic, then try again.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is already in use or Windows could not open it. Close other voice apps or release the mic, then try again.'
  }
  if (name === 'SecurityError') {
    return 'The browser blocked microphone access for this page. Use HTTPS or localhost in a browser that allows mic permissions.'
  }
  return message || 'Could not start voice session because the microphone could not be opened.'
}

function compactContext(value) {
  if (!value || typeof value !== 'object') return ''
  const out = {
    type: value.type || value.recordType || '',
    id: value.id || value.recordId || '',
    name: value.name || value.bn || value.title || value.email || '',
    tab: value.tab || '',
    subtab: value.subtab || '',
  }
  return JSON.stringify(out)
}

// --- Automations & campaigns by voice ---------------------------------------
// Routed through the already-declared command_center_action tool (ElevenLabs
// path) and the Gemini tool dispatcher, so no new ElevenLabs dashboard tool
// declarations are needed. Module-level: pure fetch helpers, no session state.
const VOICE_AUTOMATION_ACTIONS = new Set([
  'list_automations', 'automation_status', 'run_automation', 'run_automation_confirmed',
  'create_automation_draft', 'list_automation_templates',
  'build_automation', 'build_automation_answer', 'build_automation_status', 'cancel_automation_build',
  'enable_automation', 'enable_automation_confirmed', 'disable_automation',
])
const VOICE_CAMPAIGN_ACTIONS = new Set(['list_campaigns', 'campaign_status', 'create_campaign_draft'])
const VOICE_BUILD_DRAFT_ACTIONS = new Set(['create_agent_draft', 'create_platform_draft', 'create_campaign_draft'])

function voiceFuzzyByName(list, target) {
  const q = String(target || '').toLowerCase().trim()
  if (!q) return null
  return list.find(x => String(x.name || '').toLowerCase() === q)
    || list.find(x => String(x.name || '').toLowerCase().includes(q))
    || list.find(x => q.includes(String(x.name || '').toLowerCase()) && String(x.name || '').length > 3)
    || null
}

// --- Conversational automation builder ---------------------------------------
// Matilda interviews Carl field-by-field. Interview state lives ON the draft
// automation record (builder key), so it survives page changes, session drops,
// and even switching voice agents mid-build. The record is created disabled and
// stays disabled until Carl explicitly enables it (spoken confirm or the screen).
// Mirrors the Automations screen's hardcoded roster.
const AUTOMATION_BUILDER_AGENTS = [
  { id: 'deerflow-client-vetting-analyst', name: 'Vera' },
  { id: 'deerflow-lead-research-analyst', name: 'Leo' },
  { id: 'deerflow-market-competitor-analyst', name: 'Mason' },
  { id: 'deerflow-reputation-risk-analyst', name: 'Rowan' },
  { id: 'newsroomaios-promoter', name: 'Mark' },
  { id: 'main', name: 'Maggie' },
  { id: 'communications', name: 'Cameron' },
  { id: 'social-media', name: 'Sasha' },
  { id: 'coding', name: 'Craig' },
]
const AUTOMATION_BUILDER_STAGES = ['purpose', 'scope', 'trigger', 'agent', 'steps', 'delivery']

function automationBuilderQuestion(stage, automation) {
  const name = automation?.name || 'the automation'
  switch (stage) {
    case 'purpose': return `What should "${name}" do? One or two sentences.`
    case 'scope': return `Is "${name}" in-house, or for a client? If it's for a client, say the client's name.`
    case 'trigger': return `How does it start — on demand when you ask, or on a schedule? If scheduled, say the cadence, like "every Monday morning" or "daily".`
    case 'agent': return `Which agent should run it — Vera, Leo, Mason, Rowan, Mark, Maggie, Cameron, Sasha, or Craig — or say "skip" to decide later?`
    case 'steps': return `Walk me through the steps in order. For example: "research the company, then draft the summary, then hold it for my approval."`
    case 'delivery': return `Where does the result go — stay in the CRM for your review, or get emailed? If emailed, say the address.`
    default: return ''
  }
}

function parseAutomationBuilderAnswer(stage, rawAnswer) {
  const answer = String(rawAnswer || '').trim()
  const lower = answer.toLowerCase()
  if (stage === 'purpose') {
    return { patch: { description: answer }, spoken: 'Got it.' }
  }
  if (stage === 'scope') {
    if (/\b(in.?house|internal|for (us|me|myself)|my own|our own|mine)\b/.test(lower) || lower === 'no' || lower === 'none') {
      return { patch: { scope: 'in-house', clientName: '' }, spoken: 'In-house.' }
    }
    // Treat anything else as a client name; strip lead-ins like "for a client called".
    const clientName = answer.replace(/^(it'?s\s+)?(for\s+)?(a\s+|the\s+)?(client|customer)(\s+called|\s+named)?\s*/i, '').trim() || answer
    // NOTE: tenantId is deliberately left null from voice — linking the account
    // id (which can auto-provision a portal lease) stays a screen action.
    return { patch: { scope: 'client', clientName }, spoken: `For ${clientName}.` }
  }
  if (stage === 'trigger') {
    const scheduled = /\b(daily|weekly|monthly|hourly|every|each|schedule|scheduled|morning|evening|night|noon|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekdays?|weekends?)\b/.test(lower)
      && !/\b(on demand|manual|manually|when i ask|when i say)\b/.test(lower)
    if (scheduled) {
      return { patch: { trigger: { type: 'schedule', config: { cadence: answer } }, cadence: answer }, spoken: `Scheduled: ${answer}.` }
    }
    return { patch: { trigger: { type: 'manual', config: { cadence: 'On demand' } }, cadence: 'On demand' }, spoken: 'On demand.' }
  }
  if (stage === 'agent') {
    if (/\b(skip|none|nobody|no one|later|not sure|pass)\b/.test(lower)) {
      return { patch: {}, spoken: 'Skipping the agent for now.' }
    }
    const match = AUTOMATION_BUILDER_AGENTS.find(a => lower.includes(a.name.toLowerCase()))
    if (!match) return { patch: {}, spoken: `I didn't catch an agent name, so I'll leave it unassigned for now.` }
    return { patch: { assignedAgentId: match.id, assignedAgentName: match.name }, spoken: `${match.name} runs it.` }
  }
  if (stage === 'steps') {
    const parts = answer
      .split(/(?:\band then\b|\bthen\b|;|\bafter that\b|\bnext\b|(?:^|\s)\d+[.)]\s*)/i)
      .map(s => s.trim().replace(/^(,|and)\s+/i, '').replace(/[.,]$/, '').trim())
      .filter(s => s.length > 2)
    const kindFor = (label) => {
      const l = label.toLowerCase()
      if (/\b(research|find|look up|fetch|collect|gather|pull|scan|search)\b/.test(l)) return 'fetch'
      if (/\b(draft|write|generate|compose|summar|create|build|produce)\b/.test(l)) return 'generate'
      if (/\b(wait|hold|approval|approve|review|pause)\b/.test(l)) return 'wait'
      return 'action'
    }
    const steps = parts.map((label, i) => ({
      id: `step_voice_${i + 1}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24)}`,
      label,
      kind: kindFor(label),
    }))
    const meaningful = steps.filter(s => s.label.split(/\s+/).length >= 2)
    if (!meaningful.length) return { patch: {}, spoken: `I couldn't pick out any steps from that — try again, separating them with "then".`, repeat: true }
    return { patch: { steps: meaningful }, spoken: `${meaningful.length} step${meaningful.length === 1 ? '' : 's'} captured.` }
  }
  if (stage === 'delivery') {
    const email = (answer.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0]
    if (email) {
      return { patch: { delivery: { method: 'draft', channels: ['email'], recipients: [email] } }, spoken: `Delivers by email to ${email}, as a draft until approved.` }
    }
    return { patch: { delivery: { method: 'draft', channels: ['crm'], recipients: [] } }, spoken: 'Results stay in the CRM for your review.' }
  }
  return { patch: {}, spoken: '' }
}

function automationBuilderSummary(a) {
  const parts = [
    `"${a.name}" is built and saved, disabled`,
    a.description ? `Purpose: ${a.description}` : '',
    a.scope === 'client' ? `For client ${a.clientName || 'unnamed'}` : 'In-house',
    a.trigger?.type === 'schedule' ? `Runs on a schedule: ${a.cadence}` : 'Runs on demand',
    a.assignedAgentName ? `${a.assignedAgentName} runs it` : 'No agent assigned yet',
    `${(a.steps || []).length} step(s)`,
    (a.delivery?.recipients || []).length ? `Delivers to ${a.delivery.recipients.join(', ')}` : 'Results stay in the CRM',
  ].filter(Boolean)
  return `${parts.join('. ')}. Say "enable ${a.name}" to turn it on, or review it in the Automations screen.`
}

async function runVoiceAutomationAction(action, target, value) {
  if (action === 'build_automation') {
    window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'automations' }))
  }
  const res = await fetch('/api/automations', { cache: 'no-store', credentials: 'include' }).then(r => r.json()).catch(() => null)
  if (!res?.ok) return `Couldn't load automations: ${res?.error || 'request failed'}.`
  const automations = res.automations || []
  const templates = res.templates || []
  if (action === 'list_automations') {
    if (!automations.length) return 'There are no automations yet. Carl can create one with create_automation_draft or in the Automations screen.'
    const lines = automations.slice(0, 10).map(a => `${a.name} (${a.scope === 'client' ? `client: ${a.clientName || a.tenantId || 'unassigned'}` : 'in-house'}, ${a.enabled ? 'enabled' : 'disabled'}, ${a.status})`)
    return `There ${automations.length === 1 ? 'is 1 automation' : `are ${automations.length} automations`}${automations.length > 10 ? ' (first 10)' : ''}: ${lines.join('; ')}.`
  }
  if (action === 'list_automation_templates') {
    if (!templates.length) return 'No automation templates are available.'
    return `Automation templates: ${templates.slice(0, 12).map(t => t.name || t.id).join('; ')}.`
  }
  if (action === 'create_automation_draft') {
    const name = String(target || '').trim()
    if (!name) return 'I need a name for the new automation. Ask Carl for the name.'
    const template = voiceFuzzyByName(templates, String(value || '')) || voiceFuzzyByName(templates, name)
    const r = await fetch('/api/automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(template
        ? { action: 'createFromTemplate', templateId: template.id, patch: { name, description: String(value || '') } }
        : { action: 'create', automation: { name, description: String(value || ''), enabled: false, status: 'draft' } }),
    }).then(r => r.json()).catch(() => null)
    if (!r?.ok) return `Couldn't create the draft: ${r?.error || 'request failed'}.`
    return `Draft automation "${name}" created${template ? ` from the "${template.name || template.id}" template` : ''}. It stays disabled until Carl finishes and enables it in the Automations screen.`
  }
  const postAutomation = async (body) => fetch('/api/automations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(() => null)

  // --- Conversational builder verbs ---
  if (action === 'build_automation') {
    const name = String(target || '').trim()
    if (!name) return 'I need a name for the new automation first. Ask Carl what to call it.'
    if (voiceFuzzyByName(automations, name)) return `An automation named like "${name}" already exists. Pick a different name, or use build_automation_status to continue an unfinished build.`
    const purpose = String(value || '').trim()
    const stage = purpose ? 'scope' : 'purpose'
    const r = await postAutomation({
      action: 'create',
      automation: {
        name,
        description: purpose,
        enabled: false,
        status: 'draft',
        builder: { stage, startedAt: new Date().toISOString() },
      },
    })
    if (!r?.ok) return `Couldn't start the build: ${r?.error || 'request failed'}.`
    return `Started building "${name}"${purpose ? ` — purpose captured` : ''}. Ask Carl: ${automationBuilderQuestion(stage, r.automation)}`
  }

  const findActiveBuild = () => {
    if (String(target || '').trim()) {
      const named = voiceFuzzyByName(automations, target)
      if (named?.builder?.stage && named.builder.stage !== 'done') return named
    }
    return automations
      .filter(a => a.builder?.stage && a.builder.stage !== 'done')
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null
  }

  if (action === 'build_automation_answer') {
    const building = findActiveBuild()
    if (!building) return 'There is no automation build in progress. Start one with build_automation and a name.'
    const stage = building.builder.stage
    const parsed = parseAutomationBuilderAnswer(stage, value ?? target)
    if (parsed.repeat) return parsed.spoken
    const idx = AUTOMATION_BUILDER_STAGES.indexOf(stage)
    const nextStage = AUTOMATION_BUILDER_STAGES[idx + 1] || 'done'
    const r = await postAutomation({
      action: 'update',
      id: building.id,
      patch: {
        ...parsed.patch,
        builder: {
          ...(building.builder || {}),
          stage: nextStage,
          answers: { ...(building.builder?.answers || {}), [stage]: String(value ?? target ?? '') },
          ...(nextStage === 'done' ? { completedAt: new Date().toISOString() } : {}),
        },
      },
    })
    if (!r?.ok) return `Couldn't save that answer: ${r?.error || 'request failed'}.`
    if (nextStage === 'done') return `${parsed.spoken} That's everything. ${automationBuilderSummary(r.automation)}`
    return `${parsed.spoken} Next question for Carl: ${automationBuilderQuestion(nextStage, r.automation)}`
  }

  if (action === 'build_automation_status') {
    const building = findActiveBuild()
    if (!building) return 'No automation build is in progress.'
    const stage = building.builder.stage
    const doneStages = AUTOMATION_BUILDER_STAGES.slice(0, AUTOMATION_BUILDER_STAGES.indexOf(stage))
    return `Building "${building.name}". Completed: ${doneStages.length ? doneStages.join(', ') : 'nothing yet'}. Current question: ${automationBuilderQuestion(stage, building)}`
  }

  if (action === 'cancel_automation_build') {
    const building = findActiveBuild()
    if (!building) return 'No automation build is in progress.'
    const r = await postAutomation({ action: 'update', id: building.id, patch: { builder: null } })
    if (!r?.ok) return `Couldn't cancel: ${r?.error || 'request failed'}.`
    return `Stopped building "${building.name}". What was captured so far is kept as a disabled draft.`
  }

  const automation = voiceFuzzyByName(automations, target)
  if (!automation) return `I couldn't find an automation named "${target}". Use list_automations to hear what exists.`

  if (action === 'enable_automation') {
    if (automation.enabled) return `"${automation.name}" is already enabled.`
    const scheduled = automation.trigger?.type === 'schedule'
    return `Enabling "${automation.name}" will ${scheduled ? `put it on its schedule (${automation.cadence || 'as configured'}) so it runs on its own` : 'make it available to run'}. Ask Carl to confirm, and only after he clearly says yes call command_center_action with action enable_automation_confirmed and target "${automation.name}".`
  }
  if (action === 'enable_automation_confirmed') {
    if (automation.enabled) return `"${automation.name}" is already enabled.`
    const r = await postAutomation({ action: 'toggle', id: automation.id })
    if (!r?.ok) return `Couldn't enable it: ${r?.error || 'request failed'}.`
    return `"${automation.name}" is now enabled${r.automation?.trigger?.type === 'schedule' ? ` and on its schedule: ${r.automation.cadence}` : ''}.`
  }
  if (action === 'disable_automation') {
    if (!automation.enabled) return `"${automation.name}" is already disabled.`
    const r = await postAutomation({ action: 'toggle', id: automation.id })
    if (!r?.ok) return `Couldn't disable it: ${r?.error || 'request failed'}.`
    return `"${automation.name}" is disabled.`
  }

  if (action === 'automation_status') {
    const last = (automation.runHistory || [])[0]
    return `${automation.name}: ${automation.enabled ? 'enabled' : 'disabled'}, status ${automation.status}, ${automation.runCount || 0} run(s). ${last ? `Last run ${last.status}: ${last.note || last.summary || 'no summary'}.` : 'No runs yet.'}`
  }
  if (action === 'run_automation') {
    const channels = automation.delivery?.channels?.length ? automation.delivery.channels.join(', ') : (automation.delivery?.method || 'the configured delivery path')
    return `Ready to run "${automation.name}" (${automation.scope === 'client' ? `for ${automation.clientName || 'a client'}` : 'in-house'}). It delivers via ${channels}. Tell Carl exactly that and ask him to confirm. Only after he clearly confirms in this conversation, call command_center_action with action run_automation_confirmed and target "${automation.name}". If he declines, do nothing.`
  }
  if (action === 'run_automation_confirmed') {
    const r = await fetch('/api/automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'run', id: automation.id }),
    }).then(r => r.json()).catch(() => null)
    if (!r?.ok) return `The run failed: ${r?.error || 'request failed'}.`
    const last = (r.automation?.runHistory || [])[0]
    return `Ran "${automation.name}". ${last?.note || last?.summary || 'Run recorded.'}`
  }
  return `Unknown automation action ${action}.`
}

async function runVoiceCampaignAction(action, target, value) {
  const res = await fetch('/api/campaign-studio', { cache: 'no-store', credentials: 'include' }).then(r => r.json()).catch(() => null)
  if (!res?.ok) return `Couldn't load campaigns: ${res?.error || 'request failed'}.`
  const campaigns = res.campaigns || []
  if (action === 'list_campaigns') {
    if (!campaigns.length) return 'There are no campaigns yet. Carl can start one with create_campaign_draft or in Campaign Studio.'
    const lines = campaigns.slice(0, 10).map(c => `${c.name} (${(c.posts || []).length} post(s)${c.kind === 'social_operator' ? ', Social Operator' : ''})`)
    return `There ${campaigns.length === 1 ? 'is 1 campaign' : `are ${campaigns.length} campaigns`}${campaigns.length > 10 ? ' (first 10)' : ''}: ${lines.join('; ')}.`
  }
  if (action === 'campaign_status') {
    const campaign = voiceFuzzyByName(campaigns, target)
    if (!campaign) return `I couldn't find a campaign named "${target}". Use list_campaigns to hear what exists.`
    const posts = campaign.posts || []
    const drafted = posts.filter(p => p.status === 'draft').length
    return `${campaign.name}: ${posts.length} post(s), ${drafted} in draft${campaign.kind === 'social_operator' ? '. This is a Social Operator campaign — approval and publishing stay in the Campaign Studio screen' : ''}.`
  }
  if (action === 'create_campaign_draft') {
    window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'campaign-studio' }))
    const name = String(target || '').trim()
    if (!name) return 'I need a name for the campaign. Ask Carl for the name.'
    const r = await fetch('/api/campaign-studio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'create_campaign', campaign: { name, ...(String(value || '').trim() ? { audience: String(value).trim() } : {}) } }),
    }).then(r => r.json()).catch(() => null)
    if (!r?.ok) return `Couldn't create the campaign: ${r?.error || 'request failed'}.`
    const count = (r.campaign?.posts || []).length
    return `Draft campaign "${name}" created with ${count} draft post(s). Nothing publishes or spends until Carl reviews it in Campaign Studio.`
  }
  return `Unknown campaign action ${action}.`
}

function logRealtimeVoiceUsage(run, reason = 'voice session ended') {
  if (!run || run.usageLogged || !['openai', 'gemini', 'elevenlabs'].includes(run.provider)) return
  run.usageLogged = true
  logVoiceTransferEvent({
    stage: 'realtime-session-ended',
    to: run.agentName,
    agentId: run.agentId,
    provider: run.provider,
    model: run.model,
    runId: run.runId,
    clientId: run.clientId,
    productId: run.productId || 'voice',
    requestId: run.requestId,
    elapsedMs: Math.max(0, Date.now() - Number(run.startedAt || Date.now())),
    reason,
  })
}

function buildDraftId(prefix, name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42)
  return `${prefix}-${slug || Date.now().toString(36)}-${Date.now().toString(36)}`
}

async function runVoiceBuildDraftAction(action, args = {}) {
  if (action === 'create_agent_draft') {
    const name = String(args.name || '').trim()
    const job = String(args.job || '').trim()
    if (!name) return 'What should the agent be called?'
    if (!job) return `What job should ${name} own?`
    window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'agents' }))
    const id = buildDraftId('agent', name)
    const response = await fetch('/api/openclaw/agents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        action: 'save', id, reason: 'voice-agent-draft-create',
        payload: {
          name, title: '', role: job, description: String(args.description || job).trim(),
          category: 'custom', tags: [], channels: [], tools: [], enabled: false, draft: true,
          runtimeProvider: 'openclaw-hetzner', schedule: { mode: 'on-demand' },
          identity: { name }, voice: { provider: 'gemini' },
        },
      }),
    }).then(r => r.json()).catch(() => null)
    if (!response?.ok) return `Couldn't create the agent draft: ${response?.error || 'request failed'}.`
    return `Created disabled agent draft "${name}" in Agents. Its job is: ${job}. It has no live schedule, tools, or external voice binding until Carl reviews and approves those settings.`
  }

  if (action === 'create_platform_draft') {
    const name = String(args.name || '').trim()
    const platformId = String(args.platformId || '').trim()
    const url = String(args.url || '').trim()
    if (!name) return 'What is the platform name?'
    if (!platformId) return `What stable short identifier should I use for ${name}?`
    if (!url) return `What is the HTTPS address for ${name}?`
    window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'platforms' }))
    const response = await fetch('/api/platforms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        name, platformId, url,
        environment: args.environment === 'staging' ? 'staging' : 'production',
        adminApiBasePath: '', credentialRef: '', notes: String(args.notes || '').trim(),
      }),
    }).then(r => r.json()).catch(() => null)
    if (!response?.ok) return `Couldn't register the platform: ${response?.error || 'request failed'}.`
    return `Registered "${name}" in Platforms as an inert ${args.environment === 'staging' ? 'staging' : 'production'} record. No credentials were stored and nothing was deployed.`
  }

  if (action === 'create_campaign_draft') {
    const name = String(args.name || '').trim()
    const objective = String(args.objective || '').trim()
    const audience = String(args.audience || '').trim()
    if (!name) return 'What should the campaign be called?'
    if (!objective) return `What result should "${name}" produce?`
    if (!audience) return `Who should "${name}" reach?`
    window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'campaign-studio' }))
    const requestedChannels = Array.isArray(args.channels) ? args.channels.map(String).filter(Boolean) : []
    const response = await fetch('/api/campaign-studio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        action: 'create_campaign',
        campaign: {
          name, objective, audience, market: String(args.market || '').trim(),
          platforms: requestedChannels.length ? requestedChannels : ['BlueSky'],
        },
      }),
    }).then(r => r.json()).catch(() => null)
    if (!response?.ok) return `Couldn't create the campaign draft: ${response?.error || 'request failed'}.`
    const count = (response.campaign?.posts || []).length
    return `Created campaign draft "${name}" with ${count} review-stage post${count === 1 ? '' : 's'}. Nothing is approved, scheduled, published, or sent.`
  }

  return `Unknown Build lane draft action ${action}.`
}

const VOICE_DOCUMENT_ACTIONS = new Set(['create_document', 'list_documents'])

// Documents by voice: Matilda composes content in-conversation and saves it as
// a real Documents-screen draft. Both runtimes (ElevenLabs + Gemini preview)
// reach this through the same command_center_action dispatcher.
async function runVoiceDocumentAction(action, target, value) {
  if (action === 'list_documents') {
    const res = await fetch('/api/documents', { cache: 'no-store', credentials: 'include' }).then(r => r.json()).catch(() => null)
    const docs = res?.documents || []
    if (!docs.length) return 'There are no documents yet.'
    const recent = docs.slice(-10).reverse().map(d => d.title || d.templateName || d.id)
    return `There ${docs.length === 1 ? 'is 1 document' : `are ${docs.length} documents`}${docs.length > 10 ? ' (latest 10)' : ''}: ${recent.join('; ')}.`
  }
  if (action === 'create_document') {
    const title = String(target || '').trim()
    const body = String(value || '').trim()
    if (!title) return 'I need a title for the document. Ask Carl what to name it, then call create_document again.'
    if (!body) return 'The value argument must contain the complete document text. Compose the full content first, then call create_document again with the title as target and the entire text as value.'
    const r = await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'save', title, templateName: 'Voice document', body, status: 'draft' }),
    }).then(r => r.json()).catch(() => null)
    if (!r?.ok) return `Couldn't save the document: ${r?.error || 'request failed'}.`
    return `Saved "${title}" as a draft in the Documents screen. Tell Carl it is there now.`
  }
  return `Unknown document action ${action}.`
}

function useAudioLevel(isActive, getFrequencyData) {
  const [level, setLevel] = useState(0)
  const rafRef = useRef(null)
  useEffect(() => {
    if (!isActive) { setLevel(0); return }
    const tick = () => {
      try {
        const bytes = getFrequencyData?.()
        if (bytes && bytes.length) {
          let sum = 0
          for (let i = 0; i < bytes.length; i++) sum += bytes[i]
          const avg = sum / bytes.length / 255
          setLevel(Math.min(1, avg * 2.2))
        }
      } catch {}
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isActive, getFrequencyData])
  return level
}

// The single live indicator. Grayed + static when off; bright, gently pulsing,
// and scaling to the live audio level (mic when listening, agent when speaking)
// when on. Reuses the component's existing `level` (0..1).
function EqualizerMeter({ live, level = 0 }) {
  const bars = [0.5, 0.82, 1, 0.66, 0.9, 0.58]
  const amp = live ? Math.min(1, 0.3 + level * 1.7) : 0
  const GOLD = '#f5b400'
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      height: 26, width: 86, padding: '0 8px', borderRadius: 8,
      background: live ? 'rgba(245,180,0,0.14)' : 'var(--surface, #eef2f7)',
      transition: 'background 200ms',
    }}>
      {bars.map((b, i) => (
        <span key={i} className={live ? 'fcc-eq-bar fcc-eq-live' : 'fcc-eq-bar'} style={{
          width: 4,
          borderRadius: 2,
          transformOrigin: 'center',
          height: `${live ? Math.round((0.3 + amp * b) * 100) : 34}%`,
          background: live ? GOLD : 'var(--text-muted, #9ca3af)',
          opacity: live ? 1 : 0.5,
          transition: 'height 90ms linear, opacity 200ms',
          animationDelay: `${i * 90}ms`,
        }} />
      ))}
      <style jsx>{`
        .fcc-eq-live { animation: fccEqPulse 760ms ease-in-out infinite alternate; }
        @keyframes fccEqPulse { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }
      `}</style>
    </span>
  )
}

function VoiceTelemetryStrip({ active, connecting, speaking, level = 0, tick = 0, agent, runtime, lastUserText, lastAgentText }) {
  if (!active && !connecting) return null
  const startedAt = runtime?.startedAt || Date.now()
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const label = `${agent?.firstName || agent?.name || runtime?.agentName || 'Agent'}`
  const provider = runtime?.provider === 'gemini' ? 'Gemini Live' : runtime?.provider === 'openai' ? 'OpenAI Realtime' : runtime?.provider === 'elevenlabs' ? 'ElevenLabs' : runtime?.provider || 'Voice'
  const bars = Array.from({ length: 34 }, (_, i) => {
    const wave = Math.sin((tick + i * 1.7) / 3.2) * 0.5 + 0.5
    const pulse = active ? Math.max(level, 0.12) : 0.08
    return Math.max(10, Math.round((14 + wave * 56) * (0.55 + pulse)))
  })
  const transcript = (lastAgentText || lastUserText || '').trim()
  return (
    <div
      className="voice-telemetry-strip"
      style={{
        width: 'min(520px, calc(100vw - 24px))',
        borderRadius: 12,
        border: '1px solid rgba(245,180,0,0.38)',
        background: 'linear-gradient(135deg, rgba(9,13,20,0.96), rgba(23,28,42,0.96))',
        boxShadow: '0 16px 40px rgba(0,0,0,0.28)',
        color: '#f8fafc',
        padding: 10,
        overflow: 'hidden',
      }}
      title={`${provider}${runtime?.model ? ` / ${runtime.model}` : ''}${runtime?.voiceName ? ` / ${runtime.voiceName}` : ''}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label} · {provider}
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(226,232,240,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {runtime?.model || 'model pending'} · {runtime?.voiceName || 'voice pending'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: connecting ? '#facc15' : speaking ? '#38bdf8' : '#22c55e', boxShadow: '0 0 14px currentColor', color: connecting ? '#facc15' : speaking ? '#38bdf8' : '#22c55e' }} />
          <span style={{ fontSize: 11, fontWeight: 800 }}>{connecting ? 'connecting' : speaking ? 'speaking' : 'listening'}</span>
          <span style={{ fontSize: 11, color: 'rgba(226,232,240,0.68)', fontVariantNumeric: 'tabular-nums' }}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
        </div>
      </div>
      <div style={{ height: 58, display: 'flex', alignItems: 'center', gap: 3 }}>
        {bars.map((height, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height,
              borderRadius: 999,
              background: speaking
                ? 'linear-gradient(180deg, #67e8f9, #2563eb)'
                : 'linear-gradient(180deg, #facc15, #f97316)',
              opacity: active ? 0.9 : 0.45,
              transition: 'height 90ms linear, opacity 140ms ease',
            }}
          />
        ))}
      </div>
      <div style={{ minHeight: 18, marginTop: 7, fontSize: 11, color: 'rgba(226,232,240,0.78)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {transcript || 'Waiting for speech...'}
      </div>
    </div>
  )
}

function VoiceButton({ activeContext, activeSection }) {
  const [error, setError] = useState(null)
  const [lastEvent, setLastEvent] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [lastUserText, setLastUserText] = useState('')
  const [lastAgentText, setLastAgentText] = useState('')
  const [wakeOn, setWakeOn] = useState(() => {
    if (typeof window === 'undefined') return false
    return !isMobileOrTabletDevice()
  })
  const wakeRecRef = useRef(null)
  const wakeSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  // Multi-agent roster: each entry { id, firstName, name, voiceName, agentId, role }
  const [roster, setRoster] = useState(() => mergeVoiceRoster())
  const [activeAgent, setActiveAgent] = useState(null) // The agent the current session is connected to
  const [selectedAgentId, setSelectedAgentId] = useState('matilda') // Which agent the click-to-start button launches
  const [pickerOpen, setPickerOpen] = useState(false) // AI-icon reveals the agent dropdown
  const [listenArmed, setListenArmed] = useState(false) // "Go Live" = ear open, NO agent connected/talking until summoned
  const [manualTransferTargetId, setManualTransferTargetId] = useState('')
  const [activeVoiceRuntime, setActiveVoiceRuntime] = useState(null)
  const [latestVoiceLabRun, setLatestVoiceLabRun] = useState(null)
  const [lastHeard, setLastHeard] = useState('') // Most recent wake-word transcript (for debug visibility)
  const transferInFlightRef = useRef(false)
  const pendingVoiceTransferRef = useRef(null)
  const signedUrlCacheRef = useRef(new Map())
  const startRef = useRef(null)
  const activeVoiceLabRunRef = useRef(null)
  const userVoiceTranscriptHandlerRef = useRef(() => false)
  const voiceEndIntentInFlightRef = useRef(false)

  const warmSignedUrl = useCallback(async (agentId = '') => {
    if (typeof window === 'undefined') return null
    const key = agentId || 'matilda'
    const cached = signedUrlCacheRef.current.get(key)
    if (cached?.data?.signedUrl && Date.now() - cached.at < 4 * 60 * 1000) return cached.data
    const url = agentId ? `/api/voice/signed-url?agent=${encodeURIComponent(agentId)}` : '/api/voice/signed-url'
    try {
      const data = await fetch(url, { credentials: 'include' }).then(r => r.json())
      if (!data?.error && data?.signedUrl) signedUrlCacheRef.current.set(key, { data, at: Date.now() })
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/voice/roster').then(r => r.json()),
      clientCapabilityStatus('elevenlabs'),
    ]).then(([j, voiceCapability]) => {
      if (cancelled) return
      const merged = mergeVoiceRoster(Array.isArray(j.agents) ? j.agents : [])
      setRoster(merged)
      if (voiceCapability.status === 'configured') {
        const warmable = merged.filter(a => (a.voiceProfile?.provider || a.voiceProvider || 'elevenlabs') === 'elevenlabs')
        warmable.slice(0, 8).forEach((agent, index) => {
          window.setTimeout(() => { void warmSignedUrl(agent.id === 'matilda' ? '' : agent.id) }, index * 250)
        })
      }
    }).catch(() => {
      if (!cancelled) setRoster(mergeVoiceRoster())
    })
    return () => { cancelled = true }
  }, [warmSignedUrl])

  useEffect(() => {
    if (typeof window === 'undefined' || !roster.length) return
    let pending = null
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_VOICE_TRANSFER_KEY) || 'null')
      sessionStorage.removeItem(PENDING_VOICE_TRANSFER_KEY)
    } catch {
      pending = null
    }
    if (!pending?.agentId) return
    const matched = roster.find(a => a.id === pending.agentId)
    setSelectedAgentId(pending.agentId)
    setLastEvent(`starting ${matched?.firstName || pending.agentName || 'agent'} after transfer`)
    logVoiceTransferEvent({
      stage: 'recovered-from-reload',
      to: matched?.firstName || pending.agentName,
      agentId: pending.agentId,
      provider: matched?.voiceProvider,
      elapsedMs: Date.now() - (pending.at || Date.now()),
    })
    if (pending.handoff) {
      window.dispatchEvent(new CustomEvent('fcc:agent-handoff', { detail: pending.handoff }))
      if (pending.handoff.tab) {
        window.dispatchEvent(new CustomEvent('fcc:navigate', {
          detail: {
            tab: pending.handoff.tab,
            subtab: pending.handoff.subtab,
          },
        }))
      }
    }
    setTimeout(() => startRef.current?.(matched?.id || pending.agentId), 350)
  }, [roster])

  // Live client-tool implementations are populated inside `start()` and read by
  // the stable proxy below. Keeping them in a ref lets us pass a hook-stable
  // clientTools object to useConversation (which silences the SDK's
  // "tool not defined" warning) while still building the real handlers
  // per-session with all their per-call closures.
  const clientToolsRef = useRef({})
  const stableClientTools = useMemo(() => {
    const out = {}
    for (const name of CLIENT_TOOL_NAMES) {
      out[name] = async (args) => {
        const startedAt = Date.now()
        const meta = clientToolsRef.current?._voiceMeta || {}
        const fn = clientToolsRef.current?.[name]
        if (typeof fn !== 'function') {
          const message = `Tool ${name} not ready.`
          logVoiceTransferEvent({
            stage: 'tool-call-missing-handler',
            toolName: name,
            agentId: meta.agentId,
            from: meta.agentName,
            provider: meta.provider,
            status: 'missing_handler',
            error: message,
            elapsedMs: Date.now() - startedAt,
          })
          return `${message} Try again in a moment.`
        }
        logVoiceTransferEvent({
          stage: 'tool-call-start',
          toolName: name,
          agentId: meta.agentId,
          from: meta.agentName,
          provider: meta.provider,
          status: 'started',
        })
        try {
          const result = await fn(args)
          logVoiceTransferEvent({
            stage: 'tool-call-success',
            toolName: name,
            agentId: meta.agentId,
            from: meta.agentName,
            provider: meta.provider,
            status: 'ok',
            result: typeof result === 'string' ? result : JSON.stringify(result || '').slice(0, 220),
            elapsedMs: Date.now() - startedAt,
          })
          return result
        } catch (e) {
          const message = e?.message || String(e)
          logVoiceTransferEvent({
            stage: 'tool-call-error',
            toolName: name,
            agentId: meta.agentId,
            from: meta.agentName,
            provider: meta.provider,
            status: 'error',
            error: message,
            elapsedMs: Date.now() - startedAt,
          })
          return `Tool ${name} failed: ${message}`
        }
      }
    }
    return out
  }, [])

  const runDirectTransferFromTranscript = useCallback((transcript) => {
    const match = resolveTransferTarget(roster, transcript, { activeAgentId: activeAgent?.id })
    if ((!isDirectTransferPhrase(transcript) && !isWakeTransferPhrase(transcript, match)) || transferInFlightRef.current) return
    if (!match || activeAgent?.id === match.id) return
    // Skip when the target agent's Chirp session is already live or a voice start is in flight
    // (wake listener and in-session transcript can both fire for the same phrase).
    if (labLiveRef.current?.active && labLiveRef.current?.agentId === match.id) return
    if (startInFlightRef.current || (typeof window !== 'undefined' && window.__fccVoiceStarting)) return
    const fn = clientToolsRef.current?.transfer_to_agent
    if (typeof fn !== 'function') return
    logVoiceTransferEvent({
      stage: 'transcript-transfer-detected',
      from: activeAgent?.firstName || activeAgent?.name || 'current agent',
      to: match.firstName || match.name || match.id,
      agentId: match.id,
      provider: match.voiceProvider,
      reason: String(transcript || '').slice(0, 120),
    })
    void fn({ agentName: match.firstName || match.name || match.id, reason: 'Direct voice transfer request detected from transcript.' })
  }, [activeAgent?.id, roster])

  function normalizeConversationMessage(event) {
    const payload = event?.message && typeof event.message === 'object' ? event.message : event
    const raw = payload?.message ?? payload?.text ?? payload?.transcript ?? event?.text ?? ''
    const text = typeof raw === 'string' ? raw : ''
    const source = String(payload?.source || payload?.role || payload?.type || event?.source || event?.role || event?.type || '').toLowerCase()
    return { text, source }
  }

  function isUserTranscriptSource(source) {
    return /\b(user|human|input)\b/.test(source)
  }

  function isAgentTranscriptSource(source) {
    return /\b(ai|agent|assistant|output)\b/.test(source)
  }

  const conversation = useConversation({
    clientTools: stableClientTools,
    onConnect: () => {
      console.log('[voice] connected'); setError(null); setLastEvent('connected')
      emitVoiceLabTest({ ...(activeVoiceLabRunRef.current || {}), stage: 'connected', status: 'connected' })
    },
    onDisconnect: (reason) => {
      console.log('[voice] disconnected', reason); setLastEvent('disconnected: ' + (reason?.reason || reason?.code || 'closed')); setFullscreen(false)
      emitVoiceLabTest({ ...(activeVoiceLabRunRef.current || {}), stage: 'ended', status: 'ended', reason: reason?.reason || reason?.code || 'closed' })
      logRealtimeVoiceUsage(activeVoiceLabRunRef.current, reason?.reason || reason?.code || 'closed')
      activeVoiceLabRunRef.current = null
      setActiveVoiceRuntime(null)
    },
    onError: (e) => {
      console.log('[voice] error', e)
      const message = typeof e === 'string' ? e : (e?.message || JSON.stringify(e).slice(0, 200) || 'Voice error')
      setError(message)
      emitVoiceLabTest({ ...(activeVoiceLabRunRef.current || {}), stage: 'error', status: 'error', error: message })
    },
    onMessage: (m) => {
      console.log('[voice] message', m)
      const { text: msg, source: src } = normalizeConversationMessage(m)
      if (!msg) return
      if (isUserTranscriptSource(src)) {
        setLastUserText(msg)
        emitVoiceLabTest({ ...(activeVoiceLabRunRef.current || {}), stage: 'transcript', role: 'user', text: msg, status: 'running' })
        if (userVoiceTranscriptHandlerRef.current(msg, { provider: 'elevenlabs' })) return
        runDirectTransferFromTranscript(msg)
      } else if (isAgentTranscriptSource(src)) {
        setLastAgentText(msg)
        emitVoiceLabTest({ ...(activeVoiceLabRunRef.current || {}), stage: 'transcript', role: 'assistant', text: msg, status: 'running' })
      }
    },
    onStatusChange: (s) => { console.log('[voice] status', s); setLastEvent('status: ' + (s?.status || s)) },
    onDebug: (d) => { console.log('[voice] debug', d) },
  })

  const openAiRef = useRef({ pc: null, dc: null, audioEl: null, micStream: null })
  const labLiveRef = useRef({ active: false, recognition: null, audioEl: null, audioUrl: '', sessionId: '', messages: [] })
  const elevenStatusRef = useRef(conversation.status)
  elevenStatusRef.current = conversation.status

  // Live page-context updates: when Carl navigates to another section or opens
  // a different record mid-session, tell the active ElevenLabs agent without
  // restarting the session. Guarded: no-op if the SDK lacks sendContextualUpdate.
  const lastContextUpdateRef = useRef(null) // null = not primed for this session
  useEffect(() => {
    if (conversation.status !== 'connected') { lastContextUpdateRef.current = null; return }
    const sectionLabel = activeSection ? (labelForCommandCenterTab(activeSection) || activeSection) : ''
    const recordSummary = compactContext(activeContext)
    const update = [
      sectionLabel ? `Carl is now on the "${sectionLabel}" page of the CRM (section id "${activeSection}"). Treat requests as being about this page unless he names another.` : '',
      recordSummary ? `Current visible record/context: ${recordSummary}. When Carl says "this", use that context.` : '',
    ].filter(Boolean).join(' ')
    // Prime on the first tick after connect — session start already injected
    // the current context into the prompt; only send genuine mid-session changes.
    if (lastContextUpdateRef.current === null) { lastContextUpdateRef.current = update; return }
    if (!update || update === lastContextUpdateRef.current) return
    lastContextUpdateRef.current = update
    try {
      if (typeof conversation.sendContextualUpdate === 'function') conversation.sendContextualUpdate(update)
    } catch {}
  }, [conversation, conversation.status, activeSection, activeContext])
  const startInFlightRef = useRef(false)
  const voiceStartGuardRef = useRef({ key: '', at: 0 })
  const [openAiStatus, setOpenAiStatus] = useState('idle')
  const [labLiveStatus, setLabLiveStatus] = useState('idle')

  const endOpenAiSession = useCallback(() => {
    const s = openAiRef.current
    logRealtimeVoiceUsage(s, 'OpenAI Realtime stopped')
    try { s.dc?.close() } catch {}
    try {
      s.audioEl?.pause()
      const stream = s.audioEl?.srcObject
      if (stream?.getTracks) stream.getTracks().forEach(t => t.stop())
      if (s.audioEl) s.audioEl.srcObject = null
    } catch {}
    try { s.pc?.close() } catch {}
    try { s.micStream?.getTracks()?.forEach(t => t.stop()) } catch {}
    try { s.audioEl?.remove() } catch {}
    try {
      document.querySelectorAll('audio[data-fcc-openai-voice="1"]').forEach(el => {
        try {
          el.pause()
          const stream = el.srcObject
          if (stream?.getTracks) stream.getTracks().forEach(t => t.stop())
          el.srcObject = null
          el.remove()
        } catch {}
      })
    } catch {}
    openAiRef.current = { pc: null, dc: null, audioEl: null, micStream: null }
    setOpenAiStatus('idle')
  }, [])

  const endLabLiveSession = useCallback(({ reason = 'voice lab session stopped' } = {}) => {
    const s = labLiveRef.current
    logRealtimeVoiceUsage(s?.active ? s : activeVoiceLabRunRef.current, reason)
    if (s?.active && s?.provider === 'chirp3') {
      logVoiceTransferEvent({ stage: 'chirp-session-ended', to: s.agentName, agentId: s.agentId, provider: 'chirp3', reason: String(reason || '').slice(0, 160) })
    }
    if (s?.runId) {
      emitVoiceLabTest({
        runId: s.runId,
        agentId: s.agentId,
        agentName: s.agentName,
        provider: s.provider,
        model: s.model,
        voiceName: s.voiceName,
        stage: 'ended',
        status: 'ended',
        reason,
      })
    }
    s.active = false
    try { s.apiAbort?.abort?.() } catch {}
    try { s.recognition?.stop?.() } catch {}
    try { s.ws?.close?.() } catch {}
    try { s.processor?.disconnect?.() } catch {}
    try { s.source?.disconnect?.() } catch {}
    try { s.silenceGain?.disconnect?.() } catch {}
    try { s.micStream?.getTracks?.().forEach(t => t.stop()) } catch {}
    try { s.scheduledSources?.forEach(src => { try { src.stop() } catch {} }) } catch {}
    try { s.audioContext?.close?.() } catch {}
    try { s.audioEl?.pause?.() } catch {}
    try { if (s.recWatchdog) clearInterval(s.recWatchdog) } catch {}
    if (typeof window !== 'undefined') window.__fccChirpSessionActive = false
    stopAllChirpAudio()
    try {
      if (s.audioUrl) URL.revokeObjectURL(s.audioUrl)
    } catch {}
    labLiveRef.current = { active: false, recognition: null, audioEl: null, audioUrl: '', sessionId: '', messages: [], scheduledSources: [], apiAbort: null }
    setLabLiveStatus('idle')
    activeVoiceLabRunRef.current = null
    setActiveVoiceRuntime(null)
    setLastEvent(reason)
  }, [])

  const hardStopVoiceSession = useCallback(({ reloadFallback = true, reason = 'voice stopped', aggressive = false, farewell = '', disarmListening = true } = {}) => {
    if (disarmListening) {
      // Turning the ear OFF is an explicit user action — the panic hangup, the
      // spacebar kill, the Stop control. It is NOT the natural end of a
      // conversation. Ending a session by speaking ("thanks" / "goodbye") used
      // to land here and run setWakeOn(false), which persisted
      // fcc-wake-word-on='0' to localStorage and left "Go Live" as the only way
      // back — on every future page load too. Conversational ends now pass
      // disarmListening:false and fall through to always-listening.
      logVoiceTransferEvent({ stage: 'wake-disarmed', reason, status: 'explicit-stop' })
      setListenArmed(false)
      setWakeOn(false)
      try { wakeRecRef.current?.stop?.() } catch {}
      wakeRecRef.current = null
    }
    try {
      window.__fccMicStreams?.forEach(s => { try { s.getTracks().forEach(t => t.stop()) } catch {} })
      window.__fccMicStreams?.clear?.()
    } catch {}
    if (aggressive && typeof document !== 'undefined') {
      try { conversation.setVolume({ volume: 0 }) } catch {}
      try {
        document.querySelectorAll('audio[data-fcc-openai-voice="1"], audio[data-fcc-chirp-voice="1"]').forEach(el => {
          try {
            el.muted = true
            el.pause()
            const stream = el.srcObject
            if (stream?.getTracks) stream.getTracks().forEach(t => t.stop())
            el.srcObject = null
            el.removeAttribute('src')
            el.load?.()
          } catch {}
        })
      } catch {}
    }
    startInFlightRef.current = false
    if (typeof window !== 'undefined') {
      window.__fccVoiceStarting = false
      if (aggressive) {
        window.__fccVoiceActive = false
        window.__fccVoiceSpeaking = false
        try { window.dispatchEvent(new CustomEvent('fcc:voice-active', { detail: false })) } catch {}
      }
    }
    logRealtimeVoiceUsage(activeVoiceLabRunRef.current, reason)
    try { conversation.endSession() } catch {}
    try { endOpenAiSession() } catch {}
    try { endLabLiveSession({ reason }) } catch {}
    stopAllChirpAudio()
    setLastEvent(reason)
    const farewellText = String(farewell || '').trim()
    if (farewellText && typeof window !== 'undefined') {
      try {
        const Utterance = window.SpeechSynthesisUtterance
        if (Utterance && window.speechSynthesis?.speak) {
          const utterance = new Utterance(farewellText)
          utterance.rate = 1.05
          utterance.volume = 0.85
          window.speechSynthesis.speak(utterance)
        }
      } catch {}
    }
    if (reloadFallback && typeof window !== 'undefined') {
      setTimeout(() => {
        const elevenStillActive = ['connected', 'connecting'].includes(elevenStatusRef.current)
        const openAiStillActive = !!(openAiRef.current?.pc || openAiRef.current?.dc || openAiRef.current?.micStream)
        const labStillActive = !!labLiveRef.current?.active
        if (elevenStillActive || openAiStillActive || labStillActive) {
          try { window.location.reload() } catch {}
        }
      }, 2000)
    }
  }, [conversation, endOpenAiSession, endLabLiveSession])

  const handleUserVoiceTranscript = useCallback((transcript, { provider = 'browser-agent' } = {}) => {
    const allowBareStop = activeSection !== 'meeting-capture'
    if (!isVoiceEndIntent(transcript, { allowBareStop }) || voiceEndIntentInFlightRef.current) return false
    voiceEndIntentInFlightRef.current = true
    logVoiceTransferEvent({
      stage: 'voice-end-intent',
      from: activeAgent?.firstName || activeAgent?.name || 'browser agent',
      agentId: activeAgent?.id,
      provider,
      reason: String(transcript || '').slice(0, 120),
    })
    hardStopVoiceSession({
      reloadFallback: true,
      reason: `voice ended by spoken ${provider} intent`,
      aggressive: true,
      // Ending a conversation returns to always-listening. It must never
      // switch the wake word off — that is what forced a Go Live click.
      disarmListening: false,
      // No speechSynthesis farewell here: it spoke through the browser's
      // built-in system voice rather than the agent's, so closing an agent out
      // sounded like a second, unfamiliar person answering.
    })
    window.setTimeout(() => { voiceEndIntentInFlightRef.current = false }, 1500)
    return true
  }, [activeAgent, activeSection, hardStopVoiceSession])

  useEffect(() => {
    userVoiceTranscriptHandlerRef.current = handleUserVoiceTranscript
    return () => { userVoiceTranscriptHandlerRef.current = () => false }
  }, [handleUserVoiceTranscript])

  const isElevenActive = conversation.status === 'connected'
  const isElevenConnecting = conversation.status === 'connecting'
  const isOpenAiActive = openAiStatus === 'connected'
  const isLabLiveActive = labLiveStatus !== 'idle'
  const isActive = isElevenActive || isOpenAiActive || isLabLiveActive
  const isSpeaking = isElevenActive ? conversation.isSpeaking : labLiveStatus === 'speaking'
  const isConnecting = isElevenConnecting || openAiStatus === 'connecting' || labLiveStatus === 'thinking'
  const outputLevel = useAudioLevel(isActive && isSpeaking, conversation.getOutputByteFrequencyData)
  const inputLevel = useAudioLevel(isActive && !isSpeaking, conversation.getInputByteFrequencyData)
  const level = isSpeaking ? outputLevel : inputLevel

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onLabRun = (event) => {
      const run = event.detail
      if (!run?.runId) return
      if (['ended', 'error'].includes(run.status) || ['ended', 'error'].includes(run.stage)) setLatestVoiceLabRun(run)
    }
    window.addEventListener('fcc:voice-lab-test', onLabRun)
    return () => window.removeEventListener('fcc:voice-lab-test', onLabRun)
  }, [])

  // Mount hygiene: clear stale voice globals from any previous mount so the
  // wake listener can never be permanently suppressed by a flag whose owning
  // session no longer exists. __fccVoiceActive MUST be included — it gates the
  // wake launcher and the watchdog, so a stale `true` (left by an unmount
  // during a live session, a navigation, or a hot reload) kills wake on the
  // whole page with no recovery path and no log line. That is exactly what
  // took the wake word down on every device on 2026-07-24 (36c5331).
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccVoiceStarting = false
    window.__fccChirpSessionActive = false
    window.__fccVoiceActive = false
  }, [])

  // Broadcast voice-active state so other components (ChatPanel closed tab, EmergencyHangup
  // panic button) can show an indicator and trigger a forced disconnect.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccVoiceActive = isActive || isConnecting
    window.dispatchEvent(new CustomEvent('fcc:voice-active', { detail: isActive || isConnecting }))
    // Unmount cleanup: never leave __fccVoiceActive latched true. Without this
    // the flag outlives the component that owns it and permanently gates the
    // wake listener.
    return () => {
      if (typeof window === 'undefined') return
      window.__fccVoiceActive = false
      try { window.dispatchEvent(new CustomEvent('fcc:voice-active', { detail: false })) } catch {}
    }
  }, [isActive, isConnecting])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isActive && !isConnecting) return
    const maxMinutes = Math.round(VOICE_SESSION_MAX_MS / 60000)
    const timer = window.setTimeout(() => {
      hardStopVoiceSession({
        reloadFallback: true,
        aggressive: true,
        reason: `voice session auto-stopped after ${maxMinutes} minutes`,
        // A safety timeout ends the session, not the ear.
        disarmListening: false,
      })
    }, VOICE_SESSION_MAX_MS)
    return () => window.clearTimeout(timer)
  }, [isActive, isConnecting, hardStopVoiceSession])

  // Broadcast WHICH agent is connected so the header badge can show their avatar/name.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const a = (isActive || isConnecting) ? activeAgent : null
    const detail = a ? { id: a.id, name: a.firstName || a.name || 'Agent', avatar: (typeof a.avatar === 'string' ? a.avatar : a.avatar?.url) || null } : null
    window.__fccVoiceAgent = detail
    window.dispatchEvent(new CustomEvent('fcc:voice-agent', { detail }))
  }, [activeAgent, isActive, isConnecting])

  // Broadcast the roster so the live equalizer's hover-switcher can list agents (avatar + name).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const list = (roster || []).map(a => ({ id: a.id, name: a.firstName || a.name || a.id, avatar: (typeof a.avatar === 'string' ? a.avatar : a.avatar?.url) || null }))
    window.__fccVoiceRoster = list
    window.dispatchEvent(new CustomEvent('fcc:voice-roster', { detail: list }))
  }, [roster])

  useEffect(() => {
    if (isActive || isConnecting || startInFlightRef.current) return
    const pending = pendingVoiceTransferRef.current
    if (!pending?.agentId) return
    const timer = setTimeout(() => {
      const next = pendingVoiceTransferRef.current
      if (!next?.agentId || isActive || isConnecting || startInFlightRef.current) return
      setSelectedAgentId(next.agentId)
      setLastEvent(`starting ${next.agentName || 'agent'} after transfer`)
      logVoiceTransferEvent({
        stage: 'idle-start',
        to: next.agentName,
        agentId: next.agentId,
        provider: next.provider,
        elapsedMs: Date.now() - (next.at || Date.now()),
      })
      try {
        const started = Promise.resolve(startRef.current?.(next.agentId))
        setTimeout(() => { transferInFlightRef.current = false }, 1500)
        started.then(ok => {
          transferInFlightRef.current = false
          if (ok !== false) pendingVoiceTransferRef.current = null
        }).catch(() => {
          transferInFlightRef.current = false
        })
      } catch {
        transferInFlightRef.current = false
      }
    }, 1100)
    return () => clearTimeout(timer)
  }, [isActive, isConnecting])

  // Hard kill switch — bypasses the SDK's graceful close. Mutes the agent's audio
  // output and stops the mic so even if the WebSocket lingers, the loop is broken
  // immediately. Then triggers endSession; final fallback is a page reload after 2s.
  // Called by EmergencyHangup, the spacebar handler, and any panic event.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const kill = () => hardStopVoiceSession({ reloadFallback: true, reason: 'voice hard-stopped', aggressive: true })
    window.__fccKillVoice = kill
    const onPanic = () => kill()
    window.addEventListener('fcc:kill-voice', onPanic)
    return () => {
      window.removeEventListener('fcc:kill-voice', onPanic)
      if (window.__fccKillVoice === kill) window.__fccKillVoice = null
    }
  }, [hardStopVoiceSession])

  // Spacebar = instant kill switch while a voice session is active.
  // Bypasses the agent / SDK entirely so there's no 30s fade waiting on end_call.
  // Ignored when typing in inputs/textareas/contenteditable so it doesn't break normal typing.
  useEffect(() => {
    if (!isActive && !isConnecting) return
    const handler = (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
      console.log('[voice] spacebar kill — ending session')
      hardStopVoiceSession({ reloadFallback: true, reason: 'voice hard-stopped by spacebar', aggressive: true })
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [isActive, isConnecting, hardStopVoiceSession])

  // Broadcast speaking state + expose analyser so ambient screen-edge glow can react to her voice.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccVoiceSpeaking = isActive && isSpeaking
    window.__fccVoiceGetOutputBytes = conversation.getOutputByteFrequencyData || null
    window.dispatchEvent(new CustomEvent('fcc:voice-speaking', { detail: isActive && isSpeaking }))
  }, [isActive, isSpeaking, conversation.getOutputByteFrequencyData])

  // When Matilda's session ENDS, check for a pending Twilio dial that was queued during the
  // session. This gives the mic time to release before Twilio Voice SDK grabs it.
  useEffect(() => {
    if (isActive) return
    const pending = typeof window !== 'undefined' ? window.__fccPendingDial : null
    if (!pending || Date.now() - pending.ts > 30000) return
    window.__fccPendingDial = null
    ;(async () => {
      try {
        const { Device } = await import('@twilio/voice-sdk')
        const device = new Device(pending.token, { codecPreferences: ['opus', 'pcmu'] })
        const confName = 'ff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        const connection = await device.connect({ params: { To: pending.clean, Conf: confName } })
        // Optional speaker-monitor mode: route call audio out the laptop speakers
        // so Carl can monitor a rep without a headset. Toggled from page.js header.
        try {
          const monitor = typeof window !== 'undefined' && (window.__fccMonitorOnSpeaker || localStorage.getItem('fcc-monitor-on-speaker') === '1')
          if (monitor && device.audio?.speakerDevices?.set) {
            const devs = await navigator.mediaDevices.enumerateDevices()
            const outs = devs.filter(d => d.kind === 'audiooutput')
            // Prefer a device whose label looks like built-in speakers; fall back to "default"
            const pick = outs.find(d => /speaker/i.test(d.label) && !/headset|head ?phone|bluetooth|airpod/i.test(d.label))
              || outs.find(d => d.deviceId === 'default')
              || outs[0]
            if (pick?.deviceId) await device.audio.speakerDevices.set([pick.deviceId])
          }
        } catch (e) { console.warn('[dial_phone] monitor routing failed:', e) }
        window.dispatchEvent(new CustomEvent('fcc:active-call', { detail: { number: pending.clean, name: pending.name, conf: confName, connection } }))
        connection.on('disconnect', () => { try { device.destroy() } catch {} })
        connection.on('error', (e) => { console.warn('[dial_phone] connection error:', e); try { device.destroy() } catch {} })
      } catch (e) {
        console.warn('[dial_phone] failed after session end:', e)
        setError('Dial failed: ' + (e?.message || e))
      }
    })()
  }, [isActive])

  // Wake-word listener: continuously listens for "hey Matilda" via Web Speech API.
  // Pauses while a session is active so we don't double-listen.
  useEffect(() => {
    const mobileWake = typeof window !== 'undefined' && isMobileOrTabletDevice()
    if (mobileWake && !listenArmed) {
      try { wakeRecRef.current?.stop() } catch {}
      wakeRecRef.current = null
      return
    }
    if (!wakeOn || !wakeSupported || isActive || isConnecting) {
      // Surface the switched-off case. Everything else here is a legitimate
      // pause (a session owns the mic, or the browser has no SpeechRecognition).
      if (wakeSupported && !wakeOn && !isActive && !isConnecting) logWakeOffIdle()
      try { wakeRecRef.current?.stop() } catch {}
      wakeRecRef.current = null
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    let stopped = false
    let recRunning = false
    const launch = () => {
      if (stopped) return
      // A live or starting voice session (ElevenLabs, OpenAI, or Chirp) owns
      // the mic — never bring up a wake recognizer underneath it.
      if (typeof window !== 'undefined' && (window.__fccChirpSessionActive || window.__fccVoiceActive || window.__fccVoiceStarting)) {
        // Log every block. A silent gate is how wake died invisibly on
        // 2026-07-24: nothing in the journal, nothing in the console, and no
        // way to tell "wake is off" from "wake is gated by a stale flag".
        logWakeGateBlock('launch')
        return
      }
      try { wakeRecRef.current?.stop?.() } catch {}
      const rec = new SR()
      rec.onstart = () => { recRunning = true }
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.onresult = (event) => {
        // Any live/starting voice session (Chirp, ElevenLabs, OpenAI) owns the
        // mic. If a zombie wake recognizer survives its stop() call, ignore
        // everything it hears so it can't clobber a live session (this is what
        // silenced Nadia after her greeting, and let a zombie fire wake-matches
        // and steal audio during Craig's ElevenLabs sessions).
        if (typeof window !== 'undefined' && (window.__fccChirpSessionActive || window.__fccVoiceActive || window.__fccVoiceStarting)) return
        // Build dynamic name list from the merged roster, including built-in
        // demo-agent fallbacks before the server roster finishes loading.
        const wakeNameOf = firstNameOfAgent
        const wakeAgents = [...roster]
        for (const fallback of FALLBACK_VOICE_AGENTS) {
          if (!wakeAgents.some(a => a.id === fallback.id)) wakeAgents.push(fallback)
        }
        const names = Array.from(new Set(wakeAgents.map(wakeNameOf).filter(Boolean)))
        const escapeRe = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        // Common SpeechRecognition mishears — map them back to the canonical first name
        const ALIASES = {
          'matilda': ['matilda', 'mathilda', 'matil'],
          'sasha': ['sasha', 'sacha', 'sasher', 'sashah', 'sash'],
          'linda': ['linda', 'lynda'],
          'cameron': ['cameron', 'kameron', 'kamren', 'cam'],
          'mark': ['mark', 'marc'],
          'maggie': ['maggie', 'maggies', 'maggy', 'maggys', 'magi', 'meggie', 'mag', 'mags', 'meg'],
          'craig': ['craig', 'cragg', 'crayg', 'greg'],
          'frank': ['frank', 'franc', 'frankie'],
          'doreen': ['doreen', 'dorene'],
          'diane': ['diane', 'dianne'],
          'nadia': ['nadia', 'nadiya', 'nadya', 'nadja', 'nardia', 'nydia', 'nadea', 'nadiaa'],
          'leo': ['leo', 'lio'],
          'vera': ['vera', 'veera'],
          'mason': ['mason', 'mayson'],
          'rowan': ['rowan', 'rohan'],
        }
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase()
          const heard = transcript
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          // Surface to UI so we can see what speech recognition is actually hearing
          if (transcript.trim()) setLastHeard(transcript.trim().slice(0, 80))
          // Universal phrase — for guests who don't know agent names. Connects the default agent.
          if (/\b(?:hey|hay)\s+(command\s*center|assistant|computer)\b/.test(heard)) {
            if (startInFlightRef.current || window.__fccVoiceStarting) return
            try { rec.stop() } catch {}
            startRef.current?.(selectedAgentId && selectedAgentId !== 'matilda' ? selectedAgentId : null)
            return
          }
          const directDeerFlow = DIRECT_DEERFLOW_WAKE_ALIASES.find(entry => entry.names.some(name => {
            const safeName = escapeRe(name).replace(/\s+/g, '\\s+')
            return new RegExp(`\\b(?:hey|hay)?\\s*${safeName}\\b`).test(heard)
          }))
          if (directDeerFlow) {
            if (startInFlightRef.current || window.__fccVoiceStarting) return
            try { rec.stop() } catch {}
            const matched = wakeAgents.find(a => a.id === directDeerFlow.id) || FALLBACK_VOICE_AGENTS.find(a => a.id === directDeerFlow.id)
            const directNames = directDeerFlow.names.map(name => escapeRe(name).replace(/\s+/g, '\\s+')).join('|')
            const directPrefix = new RegExp(`^.*?\\b(?:hey|hay)?\\s*(?:${directNames})\\b\\s*`)
            const initialText = heard.replace(directPrefix, '').trim()
            logVoiceTransferEvent({
              stage: 'wake-direct-deerflow',
              to: matched?.firstName || matched?.name || directDeerFlow.id,
              agentId: directDeerFlow.id,
              provider: 'chirp3',
              reason: heard.slice(0, 120),
            })
            startRef.current?.(directDeerFlow.id, buildWakeStartOptions({ initialText }))
            return
          }
          for (const n of names) {
            const variants = ALIASES[n] || [n]
            for (const v of variants) {
              const safeVariant = escapeRe(v)
              const re = new RegExp(`\\b(?:hey|hay)\\s+${safeVariant}\\b|\\b${safeVariant}\\s+go\\s+live\\b|\\b${safeVariant}\\s+wake\\s+up\\b`)
              if (re.test(heard)) {
                if (startInFlightRef.current || window.__fccVoiceStarting) return
                try { rec.stop() } catch {}
                const matched = wakeAgents.find(a => wakeNameOf(a) === n)
                const wakePrefix = new RegExp(`^.*?\\b(?:hey|hay)\\s+${safeVariant}\\b\\s*`)
                const commandPrefix = new RegExp(`^.*?\\b${safeVariant}\\s+(?:go\\s+live|wake\\s+up)\\b\\s*`)
                const initialText = heard.replace(wakePrefix, '').replace(commandPrefix, '').trim()
                logVoiceTransferEvent({
                  stage: 'wake-match',
                  to: matched?.firstName || matched?.name || n,
                  agentId: matched?.id || n,
                  provider: matched?.voiceProvider || matched?.voiceProfile?.provider || '',
                  reason: heard.slice(0, 120),
                })
                startRef.current?.(matched?.id || null, buildWakeStartOptions({ initialText }))
                return
              }
            }
          }
        }
      }
      rec.onend = () => { recRunning = false; if (!stopped && wakeOn && !isActive && !isConnecting && !window.__fccVoiceStarting && !window.__fccChirpSessionActive && !window.__fccVoiceActive) setTimeout(() => launch(), 75) }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed') { stopped = true; setWakeOn(false); setError('Microphone permission denied for wake-word'); return }
        // 'no-speech' / 'aborted' / 'audio-capture' — let onend restart us
      }
      try { rec.start(); wakeRecRef.current = rec } catch {}
    }
    launch()
    // Watchdog: rec.start() failures are swallowed above, and a zombie
    // recognizer can hold Chrome's single SpeechRecognition slot — without
    // this, one lost start leaves the wake listener deaf until a full page
    // reload. Re-arm whenever we should be listening but aren't.
    const wakeWatchdog = setInterval(() => {
      if (stopped || recRunning) return
      if (typeof window !== 'undefined' && (window.__fccChirpSessionActive || window.__fccVoiceActive || window.__fccVoiceStarting)) {
        // Self-heal: React state is the source of truth for whether a session
        // is actually live. If the globals claim one is but this component
        // says otherwise for 15s straight, the flags are stale — clear them
        // and re-arm rather than staying deaf until a page reload.
        const reactSaysIdle = !isActive && !isConnecting
        const gatedForMs = wakeGateSince ? Date.now() - wakeGateSince : 0
        if (reactSaysIdle && gatedForMs > 15000) {
          logVoiceTransferEvent({
            stage: 'wake-gate-selfheal',
            reason: 'stale voice globals cleared by wake watchdog (React reports no active session)',
            status: 'recovered',
            elapsedMs: gatedForMs,
          })
          window.__fccChirpSessionActive = false
          window.__fccVoiceActive = false
          window.__fccVoiceStarting = false
          wakeGateSince = 0
          launch()
          return
        }
        logWakeGateBlock('watchdog')
        return
      }
      launch()
    }, 2500)
    return () => { stopped = true; clearInterval(wakeWatchdog); try { wakeRecRef.current?.stop() } catch {}; wakeRecRef.current = null }
  }, [wakeOn, wakeSupported, isActive, isConnecting, listenArmed, roster])

  // Idle animation tick — drives the breathing bars when no audio is playing
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setTick(t => t + 1), 80)
    return () => clearInterval(id)
  }, [isActive])

  const startOpenAiSession = useCallback(async ({ agentId, micStream, clientTools, firstMessage, silent, labRun }) => {
    endOpenAiSession()
    setOpenAiStatus('connecting')
    setLastEvent('starting OpenAI Realtime')
    const pc = new RTCPeerConnection()
    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.dataset.fccOpenaiVoice = '1'
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)
    pc.ontrack = (e) => { audioEl.srcObject = e.streams[0] }
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState || ''
      if (state) setLastEvent(`OpenAI Realtime ${state}`)
      if (state === 'failed' || state === 'disconnected') {
        setError(`OpenAI Realtime connection ${state}.`)
      }
    }
    micStream.getTracks().forEach(track => pc.addTrack(track, micStream))

    const dc = pc.createDataChannel('oai-events')
    const toolNames = new Set(OPENAI_REALTIME_TOOLS.map(t => t.name))
    const sendToolResult = async (call) => {
      const name = call?.name
      const callId = call?.call_id
      if (!name || !callId || !toolNames.has(name)) return
      let args = {}
      try { args = call.arguments ? JSON.parse(call.arguments) : {} } catch {}
      const fn = clientTools?.[name]
      let output
      try {
        output = typeof fn === 'function' ? await fn(args) : `Tool ${name} is not wired in this CRM session.`
      } catch (e) {
        output = `Tool ${name} failed: ${e.message || e}`
      }
      dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: typeof output === 'string' ? output : JSON.stringify(output),
        },
      }))
      dc.send(JSON.stringify({ type: 'response.create' }))
    }

    dc.onopen = () => {
      setOpenAiStatus('connected')
      setLastEvent('OpenAI Realtime connected')
      emitVoiceLabTest({ ...(labRun || activeVoiceLabRunRef.current || {}), stage: 'connected', status: 'connected' })
      // Listen mode: do not speak on connect. Stay silent until Carl talks.
      if (silent) return
      try {
        dc.send(JSON.stringify({
          type: 'response.create',
          response: {
            instructions: firstMessage
              ? `Greet Carl as ${agentId === 'finance-manager' ? 'Frank' : 'your active persona'} in one short sentence: "${firstMessage}"`
              : 'Greet Carl in one short sentence and ask how you can help.',
          },
        }))
      } catch (e) {
        console.warn('[openai voice] initial response failed', e)
      }
    }
    dc.onclose = () => {
      setOpenAiStatus('idle'); setLastEvent('OpenAI Realtime disconnected')
      emitVoiceLabTest({ ...(labRun || activeVoiceLabRunRef.current || {}), stage: 'ended', status: 'ended', reason: 'OpenAI Realtime disconnected' })
      logRealtimeVoiceUsage(labRun || activeVoiceLabRunRef.current, 'OpenAI Realtime disconnected')
      activeVoiceLabRunRef.current = null
      setActiveVoiceRuntime(null)
    }
    dc.onerror = () => {
      setError('OpenAI Realtime data channel error')
      emitVoiceLabTest({ ...(labRun || activeVoiceLabRunRef.current || {}), stage: 'error', status: 'error', error: 'OpenAI Realtime data channel error' })
    }
    dc.onmessage = async (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }
      if (msg.type === 'response.audio_transcript.done' && msg.transcript) {
        setLastAgentText(msg.transcript)
        emitVoiceLabTest({ ...(labRun || activeVoiceLabRunRef.current || {}), stage: 'transcript', role: 'assistant', text: msg.transcript, status: 'running' })
      }
      if (msg.type === 'conversation.item.input_audio_transcription.completed' && msg.transcript) {
        setLastUserText(msg.transcript)
        emitVoiceLabTest({ ...(labRun || activeVoiceLabRunRef.current || {}), stage: 'transcript', role: 'user', text: msg.transcript, status: 'running' })
        if (handleUserVoiceTranscript(msg.transcript, { provider: 'openai' })) return
        runDirectTransferFromTranscript(msg.transcript)
      }
      if (msg.type === 'response.done') {
        const calls = (msg.response?.output || []).filter(o => o.type === 'function_call')
        for (const call of calls) await sendToolResult(call)
      }
      if (msg.type === 'error') {
        const message = msg.error?.message || 'OpenAI Realtime error'
        console.warn('[openai voice] error', msg.error || msg)
        setError(message)
        emitVoiceLabTest({ ...(labRun || activeVoiceLabRunRef.current || {}), stage: 'error', status: 'error', error: message })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const res = await fetch(`/api/voice/openai/session?agent=${encodeURIComponent(agentId || 'matilda')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      credentials: 'include',
      body: offer.sdp,
    })
    const answerText = await res.text()
    if (!res.ok) {
      let message = answerText
      try { message = JSON.parse(answerText).error || message } catch {}
      throw new Error(message || `OpenAI Realtime failed: HTTP ${res.status}`)
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: answerText })
    openAiRef.current = { pc, dc, audioEl, micStream, ...(labRun || {}), provider: 'openai', agentId, model: labRun?.model || 'gpt-realtime', startedAt: labRun?.startedAt || Date.now() }
    setTimeout(() => {
      if (dc.readyState !== 'open' && openAiRef.current?.dc === dc) {
        setError('OpenAI Realtime did not finish connecting. Try again, or use an ElevenLabs-bound agent.')
        setLastEvent('OpenAI Realtime connection timeout')
        try { endOpenAiSession() } catch {}
      }
    }, 12000)
  }, [endOpenAiSession, handleUserVoiceTranscript, runDirectTransferFromTranscript])

  const startLabLiveSession = useCallback(async ({ agent, provider, model, voiceName, micStream, silent, runId, context }) => {
    if (provider !== 'gemini') {
      try { micStream?.getTracks()?.forEach(t => t.stop()) } catch {}
      throw new Error(`${provider} is not wired for full-duplex live mode yet.`)
    }
    endLabLiveSession({ reason: 'resetting Gemini Live session' })
    setLabLiveStatus('thinking')
    setLastEvent(`requesting Gemini Live token for ${agent?.firstName || agent?.name || 'agent'}`)
    const tokenRes = await fetch('/api/voice/gemini-live-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent?.id || selectedAgentId || 'finance-manager', model, voiceName, silent, enableTools: true, context: context || null }),
    })
    const tokenData = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenData?.ok) {
      try { micStream?.getTracks()?.forEach(t => t.stop()) } catch {}
      throw new Error(tokenData?.error || `Gemini Live token failed (${tokenRes.status})`)
    }

    const audioContext = new AudioContext()
    const state = {
      active: true,
      runId,
      agentId: agent?.id || selectedAgentId || 'finance-manager',
      agentName: agent?.firstName || agent?.name || agent?.id || 'Agent',
      provider,
      model: tokenData.model,
      voiceName: tokenData.voiceName,
      startedAt: activeVoiceLabRunRef.current?.startedAt || Date.now(),
      clientId: activeVoiceLabRunRef.current?.clientId || '',
      productId: activeVoiceLabRunRef.current?.productId || 'voice',
      micStream,
      audioContext,
      scheduledSources: [],
      playTime: audioContext.currentTime,
      inputTranscript: '',
    }
    labLiveRef.current = state
    setActiveAgent(agent)
    setActiveVoiceRuntime({ provider, model: tokenData.model, voiceName: tokenData.voiceName })
    activeVoiceLabRunRef.current = {
      runId,
      agentId: state.agentId,
      agentName: state.agentName,
      provider,
      model: tokenData.model,
      voiceName: tokenData.voiceName,
    }
    emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'starting', status: 'starting' })
    setError(null)
    setLabLiveStatus('thinking')
    setLastEvent(`connecting ${agent?.firstName || agent?.name || 'agent'} to Gemini Live`)

    const toBase64 = (bytes) => {
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return btoa(binary)
    }
    const downsampleTo16k = (input, inputRate) => {
      const outputRate = 16000
      const ratio = inputRate / outputRate
      const length = Math.max(1, Math.floor(input.length / ratio))
      const output = new Int16Array(length)
      for (let i = 0; i < length; i++) {
        const idx = Math.min(input.length - 1, Math.floor(i * ratio))
        const sample = Math.max(-1, Math.min(1, input[idx] || 0))
        output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      }
      return new Uint8Array(output.buffer)
    }
    const stopQueuedOutput = () => {
      try { state.scheduledSources.forEach(src => { try { src.stop() } catch {} }) } catch {}
      state.scheduledSources = []
      state.playTime = audioContext.currentTime
    }
    const playPcm24k = (base64) => {
      if (!state.active || labLiveRef.current !== state) return
      const raw = atob(base64)
      const sampleCount = Math.floor(raw.length / 2)
      const floats = new Float32Array(sampleCount)
      for (let i = 0; i < sampleCount; i++) {
        const lo = raw.charCodeAt(i * 2)
        const hi = raw.charCodeAt(i * 2 + 1)
        let value = (hi << 8) | lo
        if (value >= 0x8000) value -= 0x10000
        floats[i] = Math.max(-1, Math.min(1, value / 0x8000))
      }
      const buffer = audioContext.createBuffer(1, sampleCount, 24000)
      buffer.copyToChannel(floats, 0)
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      const startAt = Math.max(audioContext.currentTime + 0.02, state.playTime || audioContext.currentTime)
      source.start(startAt)
      state.playTime = startAt + buffer.duration
      state.scheduledSources.push(source)
      source.onended = () => {
        state.scheduledSources = state.scheduledSources.filter(item => item !== source)
        if (state.scheduledSources.length === 0 && state.active) setLabLiveStatus('listening')
      }
      setLabLiveStatus('speaking')
    }

    const ws = new WebSocket(tokenData.websocketUrl)
    state.ws = ws
    state.setupComplete = false
    let resolveSetup
    let rejectSetup
    const setupReady = new Promise((resolve, reject) => {
      resolveSetup = resolve
      rejectSetup = reject
    })
    const setupTimeout = setTimeout(() => {
      if (state.setupComplete) return
      const message = 'Gemini Live did not finish connecting within 12 seconds'
      logVoiceTransferEvent({ stage: 'gemini-ws-timeout', to: state.agentName, agentId: state.agentId, provider, reason: message })
      rejectSetup(new Error(message))
      try { ws.close(4000, 'setup timeout') } catch {}
    }, 12000)
    ws.onopen = () => {
      ws.send(JSON.stringify(tokenData.setup))
      setLastEvent('Gemini Live setup sent')
      logVoiceTransferEvent({ stage: 'gemini-ws-open', to: state.agentName, agentId: state.agentId, provider })
    }
    // Gemini Live tool-calling: dispatch declared function calls and answer with
    // toolResponse. Navigation and session-end act in the browser; everything
    // else routes through the unified CRM tool router on the server.
    const handleGeminiToolCalls = async (functionCalls) => {
      const functionResponses = []
      for (const call of functionCalls) {
        const name = String(call?.name || '')
        const args = (call && typeof call.args === 'object' && call.args) || {}
        let output
        try {
          if (name === 'navigate_to') {
            const requested = String(args.section || '').toLowerCase().trim().replace(/^the\s+/, '')
            const target = resolveCommandCenterTab(requested)
            if (target) {
              window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: target }))
              output = 'Taking you there now.'
            } else {
              output = `I don't know a section called "${args.section}".`
            }
          } else if (name === 'command_center_action') {
            const key = String(args.action || args.target || '').toLowerCase().trim().replace(/^the\s+/, '').replace(/\s+/g, '_')
            if (VOICE_AUTOMATION_ACTIONS.has(key)) output = await runVoiceAutomationAction(key, args.target, args.value)
            else if (VOICE_CAMPAIGN_ACTIONS.has(key)) output = await runVoiceCampaignAction(key, args.target, args.value)
            else if (VOICE_DOCUMENT_ACTIONS.has(key)) output = await runVoiceDocumentAction(key, args.target, args.value)
            else {
              window.dispatchEvent(new CustomEvent('fcc:command-action', { detail: { action: key, target: args.target, value: args.value } }))
              output = 'Done.'
            }
          } else if (VOICE_AUTOMATION_ACTIONS.has(name)) {
            output = await runVoiceAutomationAction(
              name,
              args.name || args.target || '',
              args.answer ?? args.description ?? args.value ?? '',
            )
          } else if (VOICE_BUILD_DRAFT_ACTIONS.has(name)) {
            output = await runVoiceBuildDraftAction(name, args)
          } else if (name === 'crm_capabilities') {
            output = await discoverCrmCapabilities(args)
          } else if (name === 'crm_action') {
            output = await runCrmAction(args)
          } else if (name === 'end_session' || name === 'end_call' || name === 'hang_up') {
            output = 'All right, goodbye.'
            setTimeout(() => {
              try { endLabLiveSession({ reason: 'agent ended session' }) } catch {}
            }, 900)
          } else if (name !== '_voiceMeta' && typeof clientToolsRef.current?.[name] === 'function') {
            // Gemini Live agents (Matilda et al.) get the same client tools the
            // ElevenLabs sessions register — daily_briefing, transfer_to_agent,
            // tasks, invoices, all of it. Before this branch existed, these
            // calls fell through to /api/agent/execute, which does not know
            // them, so Gemini agents told Carl they "don't have the tool"
            // (found in the 2026-08-27 demo dry run).
            const result = await clientToolsRef.current[name](args)
            output = typeof result === 'string' ? result : JSON.stringify(result ?? { ok: true })
          } else {
            const r = await fetch('/api/agent/execute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
              body: JSON.stringify({ tool: name, args }),
            }).then(r => r.json()).catch(() => null)
            output = r?.ok ? r.result : `Tool ${name} failed: ${r?.error || 'request failed'}`
          }
        } catch (e) {
          output = `Tool ${name} failed: ${e?.message || e}`
        }
        functionResponses.push({
          id: call?.id,
          name,
          response: { output: typeof output === 'string' ? output : JSON.stringify(output ?? '') },
        })
      }
      if (state.active && ws.readyState === WebSocket.OPEN && functionResponses.length) {
        ws.send(JSON.stringify({ toolResponse: { functionResponses } }))
      }
    }

    ws.onmessage = async (event) => {
      let message
      try {
        const raw = typeof event.data === 'string'
          ? event.data
          : typeof event.data?.text === 'function'
            ? await event.data.text()
            : String(event.data || '')
        message = JSON.parse(raw)
      } catch (error) {
        logVoiceTransferEvent({
          stage: 'gemini-message-parse-error',
          to: state.agentName,
          agentId: state.agentId,
          provider,
          reason: error?.message || 'Gemini message was not valid JSON',
        })
        return
      }
      if (message.toolCall?.functionCalls?.length) {
        void handleGeminiToolCalls(message.toolCall.functionCalls)
        return
      }
      if (message.toolCallCancellation) return
      if (message.setupComplete) {
        state.setupComplete = true
        clearTimeout(setupTimeout)
        const source = audioContext.createMediaStreamSource(micStream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        const silenceGain = audioContext.createGain()
        silenceGain.gain.value = 0
        processor.onaudioprocess = (e) => {
          if (!state.active || ws.readyState !== WebSocket.OPEN) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm = downsampleTo16k(input, audioContext.sampleRate)
          ws.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64(pcm), mimeType: 'audio/pcm;rate=16000' } } }))
        }
        source.connect(processor)
        processor.connect(silenceGain)
        silenceGain.connect(audioContext.destination)
        Object.assign(state, { source, processor, silenceGain })
        setLabLiveStatus('listening')
        setLastEvent(`${agent?.firstName || agent?.name || 'Agent'} is live on Gemini Live`)
        emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'connected', status: 'connected' })
        logVoiceTransferEvent({ stage: 'gemini-live-connected', to: state.agentName, agentId: state.agentId, provider })
        resolveSetup()
        return
      }
      const content = message.serverContent
      if (content?.interrupted) stopQueuedOutput()
      if (content?.inputTranscription?.text) {
        state.inputTranscript = appendVoiceTranscriptChunk(state.inputTranscript, content.inputTranscription.text)
        setLastUserText(state.inputTranscript)
      }
      if (content?.outputTranscription?.text) {
        setLastAgentText(content.outputTranscription.text)
        emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'transcript', role: 'assistant', text: content.outputTranscription.text, status: 'running' })
      }
      const parts = content?.modelTurn?.parts || []
      for (const part of parts) {
        const data = part.inlineData?.data || part.inline_data?.data
        if (data) playPcm24k(data)
      }
      if (content?.turnComplete) {
        const completedInput = state.inputTranscript.trim()
        state.inputTranscript = ''
        if (completedInput) {
          emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'transcript', role: 'user', text: completedInput, status: 'running' })
          if (handleUserVoiceTranscript(completedInput, { provider: 'gemini' })) return
          runDirectTransferFromTranscript(completedInput)
        }
        if (state.scheduledSources.length === 0) setLabLiveStatus('listening')
      }
      if (message.goAway?.timeLeft) setLastEvent(`Gemini Live session ending soon`)
    }
    ws.onerror = () => {
      const message = 'Gemini Live WebSocket error'
      clearTimeout(setupTimeout)
      setError(message)
      emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'error', status: 'error', error: message })
      logVoiceTransferEvent({ stage: 'gemini-ws-error', to: state.agentName, agentId: state.agentId, provider, reason: message })
      if (!state.setupComplete) rejectSetup(new Error(message))
    }
    ws.onclose = (event) => {
      clearTimeout(setupTimeout)
      const closeReason = `${event?.code || 'unknown'}${event?.reason ? `: ${event.reason}` : ''}`
      logVoiceTransferEvent({ stage: 'gemini-ws-closed', to: state.agentName, agentId: state.agentId, provider, reason: closeReason })
      if (!state.setupComplete) rejectSetup(new Error(`Gemini Live closed before connecting (${closeReason})`))
      if (state.active) {
        setLabLiveStatus('idle')
        setLastEvent(`Gemini Live closed${event?.reason ? `: ${event.reason}` : ''}`)
        emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'ended', status: 'ended', reason: event?.reason || 'Gemini Live closed' })
        logRealtimeVoiceUsage(activeVoiceLabRunRef.current || state, event?.reason || 'Gemini Live closed')
        activeVoiceLabRunRef.current = null
        setActiveVoiceRuntime(null)
      }
    }
    await setupReady
  }, [endLabLiveSession, handleUserVoiceTranscript, runDirectTransferFromTranscript, selectedAgentId])

  const startChirpTurnSession = useCallback(async ({ agent, model, voiceName, micStream, initialText, runId }) => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      try { micStream?.getTracks()?.forEach(t => t.stop()) } catch {}
      throw new Error('Chirp voice needs browser speech recognition. Use Chrome or Edge for "Hey Nadia" voice turns.')
    }
    endLabLiveSession({ reason: 'resetting Chirp voice session' })
    try { micStream?.getTracks()?.forEach(t => t.stop()) } catch {}
    const sessionId = `chirp-${Date.now().toString(36)}`
    const state = {
      active: true,
      runId,
      agentId: agent?.id || selectedAgentId || 'deep-research-analyst',
      agentName: agent?.firstName || agent?.name || 'Nadia',
      provider: 'chirp3',
      model: model || 'chirp3-hd',
      voiceName: voiceName || 'en-US-Chirp3-HD-Aoede',
      sessionId,
      clientId: activeVoiceLabRunRef.current?.clientId || '',
      requestId: activeVoiceLabRunRef.current?.requestId || '',
      messages: [],
      recognition: null,
      audioEl: null,
      audioUrl: '',
      apiAbort: null,
      phase: 'listening',
    }
    labLiveRef.current = state
    // Claim Chrome's single SpeechRecognition slot for this session: kill the
    // wake-word recognizer and raise a global flag so any zombie wake instance
    // that survives stop() is ignored and never relaunches itself.
    try { wakeRecRef.current?.stop?.() } catch {}
    wakeRecRef.current = null
    if (typeof window !== 'undefined') window.__fccChirpSessionActive = true
    setActiveAgent(agent)
    setActiveVoiceRuntime({ provider: 'chirp3', model: state.model, voiceName: state.voiceName })
    activeVoiceLabRunRef.current = {
      runId,
      agentId: state.agentId,
      agentName: state.agentName,
      provider: 'chirp3',
      model: state.model,
      voiceName: state.voiceName,
    }
    emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'connected', status: 'connected' })
    setError(null)
    const setChirpPhase = (phase) => {
      state.phase = phase
      setLabLiveStatus(phase)
    }
    setChirpPhase('listening')
    setLastEvent(`${state.agentName} is listening on Chirp`)

    const playAudio = async (json) => {
      const binary = atob(json.audio || '')
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: json.contentType || 'audio/mpeg' })
      if (state.audioUrl) {
        try { URL.revokeObjectURL(state.audioUrl) } catch {}
      }
      state.audioUrl = URL.createObjectURL(blob)
      const audio = state.audioEl || new Audio()
      audio.dataset.fccChirpVoice = '1'
      chirpAudioRegistry()?.add(audio)
      state.audioEl = audio
      audio.src = state.audioUrl
      audio.onended = () => {
        chirpAudioRegistry()?.delete(audio)
        if (!state.active || labLiveRef.current !== state) return
        logVoiceTransferEvent({ stage: 'chirp-audio-ended', to: state.agentName, agentId: state.agentId, provider: 'chirp3' })
        setChirpPhase('listening')
        state.ensureRecListening?.()
      }
      setChirpPhase('speaking')
      await audio.play()
    }

    const handleUtterance = async (text, displayText = '', opts = {}) => {
      const clean = String(text || '').trim()
      if (!clean || !state.active || labLiveRef.current !== state) return
      try { state.recognition?.stop?.() } catch {}
      setLastUserText(String(displayText || clean).trim())
      emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'transcript', role: 'user', text: clean, status: 'running' })
      if (handleUserVoiceTranscript(clean, { provider: 'chirp3' })) return
      if (!opts.skipTransferScan) {
        // A transfer-scan failure must never kill the voice turn.
        try {
          runDirectTransferFromTranscript(clean)
        } catch (scanErr) {
          logVoiceTransferEvent({ stage: 'chirp-transfer-scan-error', to: state.agentName, agentId: state.agentId, provider: 'chirp3', reason: `${scanErr?.name || 'Error'}: ${scanErr?.message || scanErr}`.slice(0, 160) })
        }
      }
      setChirpPhase('thinking')
      setLastEvent(`${state.agentName} is thinking`)
      const userMessage = { role: 'user', content: clean }
      try {
        try { state.apiAbort?.abort?.() } catch {}
        const apiAbort = new AbortController()
        state.apiAbort = apiAbort
        logVoiceTransferEvent({
          stage: 'chirp-api-request',
          to: state.agentName,
          agentId: state.agentId,
          provider: 'chirp3',
          reason: clean.slice(0, 120),
        })
        const res = await fetch('/api/voice/conversation-sandbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: apiAbort.signal,
          body: JSON.stringify({
            agentId: state.agentId,
            provider: 'chirp3',
            model: state.model,
            voiceName: state.voiceName,
            text: clean,
            messages: [...state.messages, userMessage],
            sessionId: state.sessionId,
            clientId: state.clientId,
            requestId: state.requestId,
          }),
        })
        if (!state.active || labLiveRef.current !== state) return
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Chirp voice failed (${res.status})`)
        if (!state.active || labLiveRef.current !== state) return
        const assistantMessage = { role: 'assistant', content: json.reply || '' }
        state.messages = [...state.messages, userMessage, assistantMessage].slice(-8)
        setLastAgentText(json.reply || '')
        logVoiceTransferEvent({
          stage: 'chirp-api-response',
          to: state.agentName,
          agentId: state.agentId,
          provider: 'chirp3',
          reason: json.contentType || '',
          elapsedMs: json.metrics?.totalMs,
        })
        emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'transcript', role: 'assistant', text: json.reply || '', status: 'running' })
        if (!state.active || labLiveRef.current !== state) return
        await playAudio(json)
      } catch (e) {
        if (e?.name === 'AbortError') return
        logVoiceTransferEvent({
          stage: 'chirp-api-error',
          to: state.agentName,
          agentId: state.agentId,
          provider: 'chirp3',
          reason: e.message || String(e),
        })
        setError(e.message || 'Chirp voice failed')
        emitVoiceLabTest({ ...activeVoiceLabRunRef.current, stage: 'error', status: 'error', error: e.message || String(e) })
        setChirpPhase('listening')
        setTimeout(() => { state.ensureRecListening?.() }, 500)
      }
    }

    const rec = new SR()
    state.recognition = rec
    state.recRunning = false
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    const ensureRecListening = () => {
      if (!state.active || labLiveRef.current !== state) return
      if (state.recRunning || state.phase === 'thinking' || state.phase === 'speaking') return
      try { wakeRecRef.current?.stop?.() } catch {}
      try {
        rec.start()
      } catch (e) {
        state.recStartFails = (state.recStartFails || 0) + 1
        if (state.recStartFails === 1 || state.recStartFails % 10 === 0) {
          logVoiceTransferEvent({ stage: 'chirp-rec-start-error', to: state.agentName, agentId: state.agentId, provider: 'chirp3', reason: `${e?.name || 'Error'}: ${e?.message || e} (x${state.recStartFails})` })
        }
      }
    }
    state.ensureRecListening = ensureRecListening
    rec.onstart = () => {
      state.recRunning = true
      state.recStartFails = 0
      logVoiceTransferEvent({ stage: 'chirp-rec-listening', to: state.agentName, agentId: state.agentId, provider: 'chirp3' })
    }
    rec.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map(result => result?.[0]?.transcript || '')
        .join(' ')
        .trim()
      if (transcript) {
        logVoiceTransferEvent({ stage: 'chirp-heard', to: state.agentName, agentId: state.agentId, provider: 'chirp3', reason: transcript.slice(0, 120) })
        void handleUtterance(transcript)
      }
    }
    rec.onerror = (event) => {
      if (!state.active) return
      logVoiceTransferEvent({ stage: 'chirp-rec-error', to: state.agentName, agentId: state.agentId, provider: 'chirp3', reason: event.error || 'error' })
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(`Chirp speech recognition: ${event.error || 'error'}`)
    }
    rec.onend = () => {
      state.recRunning = false
      if (!state.active || labLiveRef.current !== state || state.phase === 'thinking' || state.phase === 'speaking') return
      setTimeout(ensureRecListening, 250)
    }
    // Watchdog: if the session claims to be listening but the recognizer lost
    // Chrome's single-recognition slot (e.g. a zombie wake listener stole it),
    // quietly bring the mic back instead of sitting deaf forever.
    state.recWatchdog = setInterval(() => {
      if (!state.active || labLiveRef.current !== state) return
      if (state.phase === 'listening' && !state.recRunning) ensureRecListening()
    }, 2000)
    const spokenInitialText = String(initialText || '').trim()
    const firstTurnText = spokenInitialText
      || 'Carl just greeted you. Reply with exactly: "How can I help you?"'
    setTimeout(() => { void handleUtterance(firstTurnText, spokenInitialText || `Hey ${state.agentName}`, { skipTransferScan: !spokenInitialText }) }, 150)
  }, [endLabLiveSession, handleUserVoiceTranscript, runDirectTransferFromTranscript, selectedAgentId])

  const start = useCallback(async (agentIdOpt, startOpts = {}) => {
    const silent = startOpts.silent === true
    const suppressHandoffNavigation = startOpts.suppressHandoffNavigation === true || startOpts.stayOnPage === true
    const requestedRosterAgent = roster.find(a => a.id === agentIdOpt)
    const targetAgentId = agentIdOpt || selectedAgentId || requestedRosterAgent?.id || 'matilda'
    const startKey = `${targetAgentId}:${requestedRosterAgent?.voiceProvider || selectedVoiceProvider || ''}`
    // "Hey Nadia" while Nadia's Chirp session is already live must NOT rebuild
    // the session (that killed the conversation mid-turn). Treat it as a nudge:
    // make sure her recognizer is actually listening and move on.
    const liveChirp = labLiveRef.current
    if (liveChirp?.active && liveChirp.provider === 'chirp3' && liveChirp.agentId === targetAgentId) {
      logVoiceTransferEvent({
        stage: 'start-ignored-already-active',
        to: requestedRosterAgent?.firstName || requestedRosterAgent?.name || targetAgentId,
        agentId: targetAgentId,
        provider: 'chirp3',
        reason: 'chirp session already live for this agent',
      })
      liveChirp.ensureRecListening?.()
      setLastEvent(`${liveChirp.agentName || 'Agent'} is already live`)
      return false
    }
    const now = Date.now()
    if (startInFlightRef.current || (typeof window !== 'undefined' && window.__fccVoiceStarting)) {
      logVoiceTransferEvent({
        stage: 'start-blocked',
        to: requestedRosterAgent?.firstName || requestedRosterAgent?.name || targetAgentId,
        agentId: targetAgentId,
        provider: requestedRosterAgent?.voiceProvider || selectedVoiceProvider,
        reason: 'voice start already in progress',
      })
      setLastEvent('voice start already in progress')
      return false
    }
    if (voiceStartGuardRef.current.key === startKey && now - voiceStartGuardRef.current.at < 1600) {
      logVoiceTransferEvent({
        stage: 'start-blocked',
        to: requestedRosterAgent?.firstName || requestedRosterAgent?.name || targetAgentId,
        agentId: targetAgentId,
        provider: requestedRosterAgent?.voiceProvider || selectedVoiceProvider,
        reason: 'duplicate wake start suppressed',
      })
      setLastEvent('duplicate voice start suppressed')
      return false
    }
    voiceStartGuardRef.current = { key: startKey, at: now }
    if (typeof window !== 'undefined') window.__fccVoiceStarting = true
    const voiceStartAt = Date.now()
    logVoiceTransferEvent({
      stage: 'start-requested',
      to: requestedRosterAgent?.firstName || requestedRosterAgent?.name || agentIdOpt || selectedAgentId,
      agentId: agentIdOpt || selectedAgentId,
      provider: requestedRosterAgent?.voiceProvider,
    })
    startInFlightRef.current = true
    if (typeof window !== 'undefined') {
      window.__fccVoiceStarting = true
      window.dispatchEvent(new CustomEvent('fcc:voice-starting', {
        detail: {
          starting: true,
          agentId: agentIdOpt || selectedAgentId,
          agentName: requestedRosterAgent?.firstName || requestedRosterAgent?.name || agentIdOpt || selectedAgentId,
        },
      }))
    }
    setError(null); setLastEvent('requesting mic')
    try { conversation.endSession() } catch {}
    try { endOpenAiSession() } catch {}
    try { endLabLiveSession({ reason: 'switching browser voice provider' }) } catch {}
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        const isSecure = typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost')
        throw new Error(isSecure
          ? 'Microphone API unavailable in this browser. Try Chrome or Safari.'
          : 'Voice needs HTTPS on mobile — open the CRM via the cloudflared tunnel URL instead of the LAN IP.')
      }
      let micStream
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (micError) {
        throw new Error(voiceMicErrorMessage(micError))
      }
      if (typeof window !== 'undefined') {
        if (!window.__fccMicStreams) window.__fccMicStreams = new Set()
        window.__fccMicStreams.add(micStream)
      }
      const targetAgentId = agentIdOpt || selectedAgentId
      const selectedRosterAgent = roster.find(a => a.id === targetAgentId)
      const fallbackVoiceAgent = FALLBACK_VOICE_AGENTS.find(a => a.id === targetAgentId)
      const isDeerFlowVoice = selectedRosterAgent?.runtimeProvider === 'deerflow-hetzner' || fallbackVoiceAgent?.runtimeProvider === 'deerflow-hetzner'
      const selectedVoiceProfile = isDeerFlowVoice
        ? {
            ...(selectedRosterAgent?.voiceProfile || {}),
            provider: 'chirp3',
            chirp3Model: selectedRosterAgent?.chirp3Model || fallbackVoiceAgent?.chirp3Model || 'chirp3-hd',
            chirp3Voice: selectedRosterAgent?.chirp3Voice || fallbackVoiceAgent?.chirp3Voice || 'en-US-Chirp3-HD-Aoede',
            voiceName: selectedRosterAgent?.chirp3Voice || fallbackVoiceAgent?.chirp3Voice || 'en-US-Chirp3-HD-Aoede',
          }
        : (selectedRosterAgent?.voiceProfile || {})
      const rawVoiceProvider = selectedVoiceProfile.provider || selectedRosterAgent?.voiceProvider || 'elevenlabs'
      const selectedVoiceProvider = selectedRosterAgent?.agentId && selectedVoiceProfile.locked === true && rawVoiceProvider !== 'elevenlabs'
        ? 'elevenlabs'
        : rawVoiceProvider
      const useOpenAiVoice = selectedVoiceProvider === 'openai'
      const useElevenLabsVoice = selectedVoiceProvider === 'elevenlabs'
      const useLabLiveVoice = selectedVoiceProvider === 'gemini'
      const useChirpTurnVoice = selectedVoiceProvider === 'chirp3'
      const labRun = {
        runId: `voice-${Date.now().toString(36)}`,
        agentId: agentIdOpt || selectedAgentId,
        agentName: selectedRosterAgent?.firstName || selectedRosterAgent?.name || agentIdOpt || selectedAgentId,
        provider: selectedVoiceProvider,
        model: selectedVoiceProvider === 'openai'
          ? (selectedVoiceProfile.openaiModel || selectedRosterAgent?.openaiModel || 'gpt-realtime')
          : selectedVoiceProvider === 'gemini'
            ? (selectedVoiceProfile.model || selectedVoiceProfile.geminiModel || selectedRosterAgent?.model || selectedRosterAgent?.geminiModel || '')
            : selectedVoiceProvider === 'chirp3'
              ? (selectedVoiceProfile.model || selectedVoiceProfile.chirp3Model || selectedRosterAgent?.model || selectedRosterAgent?.chirp3Model || 'chirp3-hd')
            : 'ElevenLabs ConvAI',
        voiceName: selectedVoiceProvider === 'openai'
          ? (selectedVoiceProfile.openaiVoice || selectedRosterAgent?.openaiVoice || selectedRosterAgent?.voiceName || 'marin')
          : selectedVoiceProvider === 'gemini'
            ? (selectedVoiceProfile.voiceName || selectedVoiceProfile.geminiVoice || selectedRosterAgent?.voiceName || selectedRosterAgent?.geminiVoice || '')
            : selectedVoiceProvider === 'chirp3'
              ? (selectedVoiceProfile.voiceName || selectedVoiceProfile.chirp3Voice || selectedRosterAgent?.voiceName || selectedRosterAgent?.chirp3Voice || '')
            : (selectedRosterAgent?.voiceName || selectedVoiceProfile.voiceName || ''),
        startedAt: Date.now(),
        clientId: activeContext?.accountId || activeContext?.clientId || '',
        productId: 'voice',
      }
      activeVoiceLabRunRef.current = labRun
      setActiveVoiceRuntime(labRun)
      emitVoiceLabTest({ ...labRun, stage: 'mic-granted', status: 'starting' })
      logVoiceTransferEvent({
        stage: 'mic-granted',
        to: selectedRosterAgent?.firstName || selectedRosterAgent?.name || agentIdOpt || selectedAgentId,
        agentId: agentIdOpt || selectedAgentId,
        provider: selectedVoiceProvider,
        elapsedMs: Date.now() - voiceStartAt,
      })
      if (useLabLiveVoice) {
        const labAgent = selectedRosterAgent || roster.find(a => a.id === (agentIdOpt || selectedAgentId)) || { id: agentIdOpt || selectedAgentId, firstName: agentIdOpt || selectedAgentId, name: agentIdOpt || selectedAgentId }
        await startLabLiveSession({
          agent: labAgent,
          provider: selectedVoiceProvider,
          model: selectedVoiceProfile.model || selectedVoiceProfile.geminiModel || selectedRosterAgent?.model || selectedRosterAgent?.geminiModel || '',
          voiceName: selectedVoiceProfile.voiceName || selectedVoiceProfile.geminiVoice || selectedRosterAgent?.voiceName || selectedRosterAgent?.geminiVoice || '',
          micStream,
          silent,
          runId: labRun.runId,
          context: {
            sectionId: activeSection || '',
            sectionLabel: activeSection ? (labelForCommandCenterTab(activeSection) || activeSection) : '',
            record: compactContext(activeContext),
          },
        })
        logVoiceTransferEvent({
          stage: 'lab-live-started',
          to: labAgent?.firstName || labAgent?.name || agentIdOpt || selectedAgentId,
          agentId: agentIdOpt || selectedAgentId,
          provider: selectedVoiceProvider,
          elapsedMs: Date.now() - voiceStartAt,
        })
        return true
      }
      if (useChirpTurnVoice) {
        const chirpAgent = selectedRosterAgent || fallbackVoiceAgent || roster.find(a => a.id === (agentIdOpt || selectedAgentId)) || { id: agentIdOpt || selectedAgentId, firstName: agentIdOpt || selectedAgentId, name: agentIdOpt || selectedAgentId }
        await startChirpTurnSession({
          agent: chirpAgent,
          model: selectedVoiceProfile.model || selectedVoiceProfile.chirp3Model || selectedRosterAgent?.model || selectedRosterAgent?.chirp3Model || 'chirp3-hd',
          voiceName: selectedVoiceProfile.voiceName || selectedVoiceProfile.chirp3Voice || selectedRosterAgent?.voiceName || selectedRosterAgent?.chirp3Voice || '',
          micStream,
          initialText: startOpts.initialText || '',
          runId: labRun.runId,
        })
        logVoiceTransferEvent({
          stage: 'chirp-turn-started',
          to: chirpAgent?.firstName || chirpAgent?.name || agentIdOpt || selectedAgentId,
          agentId: agentIdOpt || selectedAgentId,
          provider: selectedVoiceProvider,
          elapsedMs: Date.now() - voiceStartAt,
        })
        return true
      }
      if (!useOpenAiVoice && !useElevenLabsVoice) {
        try { micStream.getTracks().forEach(t => t.stop()) } catch {}
        const message = `${selectedVoiceProvider} is saved for this agent, but the live router does not support that provider yet.`
        setError(message)
        logVoiceTransferEvent({
          stage: 'unsupported-live-provider',
          to: selectedRosterAgent?.firstName || selectedRosterAgent?.name || agentIdOpt || selectedAgentId,
          agentId: agentIdOpt || selectedAgentId,
          provider: selectedVoiceProvider,
          reason: message,
          elapsedMs: Date.now() - voiceStartAt,
        })
        return false
      }
      setLastEvent(useOpenAiVoice ? 'got mic; preparing OpenAI Realtime' : 'got mic; fetching signed URL')
      let res
      if (useOpenAiVoice) {
        res = {
          agentId: null,
          voiceName: selectedVoiceProfile.openaiVoice || selectedRosterAgent.openaiVoice || selectedRosterAgent.voiceName || 'marin',
          agentName: selectedRosterAgent.name,
          firstName: selectedRosterAgent.firstName,
          snapshot: {},
        }
      } else {
        const signedUrlStartedAt = Date.now()
        const cacheKey = agentIdOpt || 'matilda'
        const cached = signedUrlCacheRef.current.get(cacheKey)
        if (cached?.data?.signedUrl && Date.now() - cached.at < 4 * 60 * 1000) {
          res = cached.data
          signedUrlCacheRef.current.delete(cacheKey)
        } else {
          res = await warmSignedUrl(agentIdOpt || '')
        }
        if (!res) res = { error: 'Could not prepare voice session.' }
        if (res.error) {
          try { micStream.getTracks().forEach(t => t.stop()) } catch {}
          setError(res.error)
          logVoiceTransferEvent({
            stage: 'signed-url-error',
            to: selectedRosterAgent?.firstName || selectedRosterAgent?.name || agentIdOpt || selectedAgentId,
            agentId: agentIdOpt || selectedAgentId,
            provider: selectedVoiceProvider,
            reason: res.error,
            elapsedMs: Date.now() - signedUrlStartedAt,
          })
          return false
        }
        void warmSignedUrl(agentIdOpt || '')
        logVoiceTransferEvent({
          stage: 'signed-url-ready',
          to: selectedRosterAgent?.firstName || selectedRosterAgent?.name || agentIdOpt || selectedAgentId,
          agentId: agentIdOpt || selectedAgentId,
          provider: selectedVoiceProvider,
          elapsedMs: Date.now() - signedUrlStartedAt,
        })
      }
      // Track which agent we're talking to
      const resolved = selectedRosterAgent || roster.find(a => a.agentId === res.agentId) || { firstName: res.firstName || res.agentName || 'Matilda', name: res.agentName || 'Matilda', id: agentIdOpt || 'matilda' }
      setActiveAgent(resolved)
      const resolvedLabRun = {
        ...labRun,
        agentId: resolved.id || labRun.agentId,
        agentName: resolved.firstName || resolved.name || labRun.agentName,
        voiceName: useOpenAiVoice ? labRun.voiceName : (res.voiceName || labRun.voiceName),
      }
      activeVoiceLabRunRef.current = resolvedLabRun
      setActiveVoiceRuntime(resolvedLabRun)
      const startHandoff = buildAgentHandoffPayload(resolved, 'Voice session started.')
      emitVoiceLabTest({ ...resolvedLabRun, stage: 'handoff', status: 'running', handoff: startHandoff })
      window.dispatchEvent(new CustomEvent('fcc:agent-handoff', { detail: startHandoff }))
      if (!suppressHandoffNavigation && startHandoff.tab) {
        window.dispatchEvent(new CustomEvent('fcc:navigate', {
          detail: {
            tab: startHandoff.tab,
            subtab: startHandoff.subtab,
          },
        }))
      }
      console.log('[voice] snapshot:', res.snapshot)
      setLastEvent('starting session')

      // Keep the voice override compact. Transfers are latency-sensitive, and
      // large prompt payloads make handoffs feel slow or fail on weak starts.
      const snap = res.snapshot || {}
      const factLines = [
        `CURRENT CRM STATE (always use these exact numbers — never guess):`,
        `- Clients: ${snap.clients ?? 0}`,
        `- Dev leads: ${snap.devLeads ?? 0}`,
        `- Sponsor CRM leads: ${snap.sponsorsTotal ?? 0} total`,
        `  · Sponsor prospects: ${snap.sponsorByCampaign?.sponsors ?? 0}`,
        `  · Newspaper outreach: ${snap.sponsorByCampaign?.newspaper ?? 0}`,
        `  · State TDAs: ${snap.sponsorByCampaign?.tda ?? 0}`,
        `  · Farrington Development: ${snap.sponsorByCampaign?.farrington_dev ?? 0}`,
        `- This month's revenue: $${(snap.monthRevenue ?? 0).toLocaleString()} across ${snap.monthPaymentCount ?? 0} payment(s)`,
        `- Domains managed: ${snap.domainsTotal ?? 0}${snap.domainsExpiringSoon ? ` (${snap.domainsExpiringSoon} expiring soon)` : ''}`,
      ]
      if (activeSection) {
        const activeSectionLabel = labelForCommandCenterTab(activeSection) || activeSection
        factLines.push('', `Carl is currently on the "${activeSectionLabel}" page of the CRM (section id "${activeSection}"). Treat requests as being about this page unless he names another. When he says "here", "this page", "this list", or "add one", act in the context of this page. You will get an update in the conversation if he moves to another page.`)
      }
      const contextSummary = compactContext(activeContext)
      if (contextSummary) factLines.push('', `Current visible record/context: ${contextSummary}. When Carl says "this", use that context.`)
      factLines.push('', OFFICE_AGENT_CONDUCT)
      factLines.push('', `If you do not know a specific detail, say "I don't have that in front of me" instead of making up a number.`)
      factLines.push('', `When Carl says he is done, goodbye, bye, have a good day, end the call, hang up, disconnect, stop listening, or anything similar, say one short natural goodbye and call end_session or end_call. Never say only Carl can end the call.`)
      factLines.push('', `COMMAND CENTER SECTIONS: ${COMPACT_COMMAND_CENTER_MAP}.`)
      factLines.push('', `For screen navigation, call navigate_to with the section id. For repository/repo/Gitea/Git/source control/source code, use "repository". For backup, restore, production health, CI/CD, deploy, or ops questions, use "ops".`)
      factLines.push('', `For telecom provisioning, Twilio numbers, leased-agent phone setup, area-code searches, or client voice-line setup, transfer to Craig if needed and use search_twilio_numbers. Buying or assigning a real number is a paid telecom action and requires explicit Carl approval.`)
      factLines.push('', `Every Farrington voice agent can transfer the active voice session. When Carl asks to transfer, hand off, connect, route, put him through, or let him speak to a named teammate or agent (Craig, Maggie, Frank, Sasha, Linda, Cameron, Mark, Doreen, Diane), call transfer_to_agent immediately. This is an owner command, not a request for justification. The reason field is optional; never ask Carl to provide a reason, availability, or extra context before transferring. Confirm with direct professional language such as "Connecting you with Sasha now" or "I am transferring you to Craig." Do not end with "let me know if I can help with anything else" after a transfer request.`)
      factLines.push('', `LIVE TOOL CONTRACT: Your active callable tools in this session are: ${CLIENT_TOOL_NAMES.join(', ')}. If Carl asks what tools you have, what you can do, or whether you can transfer, call, email, book, search, open, navigate, or send documents, answer from this list plainly. Do not say you lack a tool that appears in this list. If a tool call fails, say the tool failed and report the exact short error instead of pretending it succeeded.`)
      factLines.push('', `PERSISTENT MEMORY: Use recall_memory before answering questions about durable preferences, prior decisions, client-specific history, saved call summaries, or "what did we say before" context. Use remember_fact only for durable business facts, preferences, decisions, and instructions; never store passwords, API keys, tokens, private keys, or secrets. Use save_call_memory for call summaries and action items. Use list_agent_memory/forget_memory when Carl asks what is remembered or says to forget something. Use search_notes/read_note/write_note for Obsidian/Command Vault playbooks, SOPs, templates, and longer knowledge; CRM memory is for facts/events, Obsidian is for knowledge and procedures.`)
      if (resolved.id === 'legal') factLines.push('', `LINDA LEGAL BASICS: An NDA is a non-disclosure agreement. If Carl asks for an NDA, confidentiality agreement, mutual NDA, contract, or document for signature, explain briefly if asked, then use send_signature_document when he wants it sent.`)
      if (resolved.id === 'legal') factLines.push('', `LINDA DOCUMENT WORKFLOW: For a draft NDA, mutual NDA, reciprocal NDA, agreement, contract, or legal document, call draft_legal_document first so the draft is saved in Documents and linked to the account when possible. If Carl asks to file or attach a document to an account, call save_document_to_account. Only call send_signature_document when Carl clearly wants it sent for signature.`)
      if (resolved.id === 'coding') factLines.push('', `CRAIG OPENCLAW WORKFLOW: You can inspect repo/ops/backup state with repository_status, ops_status, and backup_status. You can create controlled OpenClaw/plugin specs with create_openclaw_plugin_spec, capture change requests with create_plugin_change_request, and delegate work to Jules with delegate_to_jules. You do not directly edit files, run shell commands, restart services, commit, push, or deploy from voice; stage the spec/change request and report the exact next engineering step.`)
      factLines.push('', `SIGNATURE DOCUMENT FLOW: When Carl asks to send an NDA, non-disclosure agreement, contract, agreement, or legal document for signature, use send_signature_document. If Carl confirms with yes, send it, do it, go ahead, correct, or similar, call send_signature_document immediately. This uses the Command Center's built-in signing utility: it creates the document, emails the secure /sign link, stores the request in Documents, and logs activity. After the tool returns, report the result in one short sentence. Do not call end_session after sending unless Carl explicitly says goodbye, stop, hang up, or end the call.`)
      factLines.push('', `When a wake phrase starts the session and Carl has not given the task yet, answer with one brief natural, professional pickup, then wait. Vary it. Good examples: "I am here, Carl.", "Ready when you are.", "Go ahead, Carl.", "I am listening.", "With you, Carl." Do not use a generic assistant greeting or repeat the same phrase every time.`)
      factLines.push('', `When Carl asks Maggie to create, add, or open a new account/client/prospect/vendor, use create_account. If he did not give a name, ask once for the name. After create_account returns, report the created account name and do not claim success unless the tool returned an id.`)
      factLines.push('', `HANDS-FREE API METER: When Carl says open, show, expand, close, collapse, minimize, hide, or unpin the API meter, spend meter, cost meter, usage meter, or provider balances, use command_center_action with the matching action open_api_meter, close_api_meter, or hide_api_meter. If he says "close" while the API meter is the active expanded control, use close_api_meter so the compact meter remains and he returns immediately to his work. If he asks for the full API spend control panel, use open_api_spend_panel.`)
      factLines.push(`When Carl asks Maggie to take a transcription, transcribe this call, or start meeting capture, use command_center_action with action arm_transcription. If he names the other speaker, client, prospect, lead, or account holder, pass that name as target. If he does not name them, ask once for the other speaker or account name, then use arm_transcription. After the transcription screen opens, ask "Would you like me to begin it?" If Carl says yes, use command_center_action with action start_transcription. When Carl says stop, finish, save, or end the transcription, use command_center_action with action save_transcription so it is saved to Documents and Activity.`)
      factLines.push('', `AUTOMATIONS AND CAMPAIGNS BY VOICE: Use command_center_action for automation and campaign work. Available actions (pass the action name in the action argument): list_automations; automation_status with target set to the automation name; run_automation with target set to the automation name — this only previews what the run will do and asks for confirmation, it never executes; run_automation_confirmed with the same target, only after Carl has clearly said yes, run it, or go ahead in this conversation after hearing the preview; create_automation_draft with target as the new automation's name and value as a short description or a template name — it creates a disabled draft for Carl to finish in the Automations screen; list_automation_templates; list_campaigns; campaign_status with target as the campaign name; create_campaign_draft with target as the campaign name and value as the audience — drafts only, it never publishes or spends. Never call run_automation_confirmed without a spoken confirmation from Carl in this conversation. Social Operator jobs, approving posts, publishing, and anything that spends credits stay in the Campaign Studio screen — say so if Carl asks for those by voice.`)
      factLines.push('', `BUILDING AN AUTOMATION BY VOICE (INTERVIEW): When Carl describes an automation he wants — "I need an automation that does X and sends it to Y" — build it with him through command_center_action. Start with action build_automation, target set to the automation's name, and value set to his description of what it should do if he already gave one. The tool returns the next interview question — ask Carl that question in your own natural words, wait for his answer, then call build_automation_answer with value set to his answer, and keep going until the tool says the build is done, then read him the closing summary. The interview covers: purpose, in-house or which client, on-demand or schedule, which agent runs it, the steps in order, and where results go. Use build_automation_status if Carl asks where you left off (the build survives interruptions and page changes), and cancel_automation_build if he says stop. Everything is saved as a DISABLED draft. To turn one on: enable_automation with the target name previews what enabling means and requires Carl's spoken confirmation, then enable_automation_confirmed flips it on; disable_automation turns it off. Never claim an automation is running unless the tool result said it is enabled or a run executed.`)
      factLines.push('', `DOCUMENTS BY VOICE: When Carl asks you to put together, write, draft, or create a document, list, report, or note and save it to Documents — for example "put a list of the top 10 tech press contacts in my Documents folder" — you CAN and SHOULD do this yourself, immediately. First compose the COMPLETE document content in this conversation (plain text; short headings and numbered lists are fine). Then call command_center_action with action create_document, target set to the exact title Carl asked for (ask once if he did not name it), and value set to the entire composed text. The tool saves it as a draft in the Documents screen and its result confirms the save. Use list_documents to hear what already exists. Be honest about sources: content like press contacts comes from your own knowledge and may be out of date — say so briefly, and never invent private email addresses. NEVER say "I'll do it", "I'll let you know when it's done", or that you are working in the background — you have no background work. Either call the tool now, or say exactly what is missing. If a tool result did not confirm a save, the document does not exist.`)

      /*
        `CRAIG JULES KNOWLEDGE BASE:`,
        `You are Craig, Carl's software engineering assistant. Jules is Google's asynchronous coding agent for repo tasks that can run while Carl moves on.`,
        `Use delegate_to_jules for background coding work, bug fixes, code reviews, documentation tasks, and repo changes. Do not pretend Jules is working unless the tool returns a session id or URL.`,
        `Use check_jules_status when Carl asks whether Jules is done, what Jules is doing, or asks for status on a Jules task.`,
        `Jules API concepts: base URL https://jules.googleapis.com/v1alpha; API keys authenticate requests; sources are connected repositories; sessions are units of coding work; activities show progress/events; artifacts/results come from completed sessions.`,
        `When delegating to Jules, include acceptance criteria, likely files/features, required tests/build checks, and whether production deployment is out of scope. If the repo is ambiguous, ask for the repo before delegation.`,
        `Source docs: https://jules.google/docs, https://jules.google/docs/api/reference/, https://jules.google/docs/api/reference/overview, https://jules.google/docs/api/reference/sessions, https://jules.google/docs/api/reference/sources, https://jules.google/docs/api/reference/activities, https://jules.google/docs/api/reference/types.`,
        ``,
        `CRAIG OPENCLAW / PLUGIN OPERATING BRIEF:`,
        `You know the Command Center OpenClaw/plugin wiring path: app/api/agent/execute/route.js is the CRM-side dispatcher, scripts/fcc-unified-plugin-index.ts exposes fcc_* OpenClaw wrappers, app/api/agents/available-tools/route.js powers discovery, and lib/agent-presets.js carries preset allowlists.`,
        `OpenClaw runtime config lives on Ubuntu at /home/carl/.openclaw/openclaw.json and is strict. Do not claim you can directly edit it, restart openclaw-gateway, commit, push, deploy, or modify files from voice unless a confirmed engineering tool result says it happened.`,
        `When Carl asks you to create, modify, or wire a plugin/tool/OpenClaw capability, first use create_openclaw_plugin_spec when he wants a concrete plugin build plan, or create_plugin_change_request for a smaller change request. Include a scoped title, target, likely files, acceptance criteria, and guardrails. Then tell Carl the request was captured for engineering execution.`,
        `For background coding work that should be handed to Jules, use delegate_to_jules only with clear acceptance criteria and production deployment explicitly out of scope unless Carl separately authorizes deployment.`,
        ``,
        `CRAIG AGENT-SKILLS OPERATING GUIDE:`,
        `Carl installed project agent skills as engineering playbooks. Treat them as workflow guidance and shared vocabulary, not as voice tools you can execute directly. Do not claim you have run a skill unless a tool or engineering executor actually did the work.`,
        `When Carl asks "use the skills" or names a skill, translate that into a practical operating mode: debugging-and-error-recovery for bugs, test-driven-development for fixes that need guardrails, frontend-ui-engineering for interface consistency, api-and-interface-design for contracts/tools, source-driven-development for official docs, code-review-and-quality for review, planning-and-task-breakdown for scope, incremental-implementation for small safe patches, ci-cd-and-automation for pipeline/build gates, documentation-and-adrs for durable notes, and shipping-and-launch for pre-demo readiness.`,
        `For any bug, follow stop-the-line order: reproduce, localize, reduce, fix root cause, add or run a guard, then verify. Do not suggest new features while Carl is in stabilization mode unless he explicitly changes priority.`,
        `Remember Farrington Command Center has CI/CD and automation in place. Treat tests, builds, smoke checks, and pipeline results as the normal proof path. Do not bypass a failing gate or talk Carl into trusting a manual demo when automation is reporting a problem.`,
        `Remember Gitea is Carl's active local source-control system on the Ubuntu box, integrated into the Command Center Repository area. When Carl says Gitea, repo, source control, or local repository, treat that as the active internal repository surface, not as a random external GitHub-only workflow. The repo integration is routed through the Repository section and the app/api/repository/gitea path.`,
        `When Carl gives you a repo task, capture the smallest useful task: problem, expected behavior, likely files, acceptance criteria, tests/build to run, and what is out of scope. If it can run asynchronously, delegate to Jules. If it is plugin/OpenClaw work, create a plugin change request. If it needs Codex or server access, say that engineering needs to run it and do not pretend you completed it from voice.`,
        `Current stabilization backlog to keep visible: voice transfers are working through a reload-based handoff and may still feel slow; true provider-native transfer is not finished; active voice sessions can cost usage, so stale sessions must be stopped; pre-demo proof should use smoke tests plus a direct AI Wizard start on the target agent.`,
      */
      const compactCraigContext = [
        `CRAIG ENGINEERING BRIEF: You are Craig, Carl's software engineering assistant.`,
        `For repo/Gitea/source-control requests, keep Carl in the Repository section and use repository_status for live repo facts.`,
        `For backup, restore, production health, CI/CD, deploy, or ops questions, open Ops Lab and use ops_status or backup_status before answering.`,
        `For administrative-assistant checks, treat recent repos, recent backups, CRM service health, Gitea status, and dirty working tree as one operating picture. Use ops_status first, then summarize what needs Carl's attention.`,
        `For Twilio/client phone-number setup, use search_twilio_numbers first. If Carl asks to set up a number, gather client or lease, area code, and preferred prefixes, then present candidates and require explicit approval before any purchase/provision step.`,
        `Use delegate_to_jules only for background coding work with clear acceptance criteria; use check_jules_status for Jules status.`,
        `For plugin/OpenClaw changes, create a plugin change request. Do not claim file edits, restarts, commits, pushes, or deploys unless a confirmed engineering tool result says so.`,
        `For bugs, use this order: reproduce, localize, fix root cause, verify with test/build/smoke check.`,
      ].join('\n')

      // Command Center voice sessions use the same clean opener every time.
      // Command Center voice: Carl is already on the line with this agent. Skip the
      // phone-receptionist greeting. Match the brevity of texting a colleague.
      // Listen mode: stay silent on connect — no greeting/announce. The agent
      // only speaks once Carl actually says something.
      const firstMessage = silent ? '' : pickVoicePickup()

      // Helper: hit the unified CRM tool router on the server
      const agentExec = async (tool, args = {}) => {
        const runArgs = tool === 'send_signature_document'
          ? { ...args, ...voiceExternalSendApproval(resolved) }
          : args
        const r = await fetch('/api/agent/execute', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, args: runArgs }),
        }).then(r => r.json())
        if (!r.ok) throw new Error(r.error || 'tool failed')
        return r.result
      }
      const fmtUSD = n => '$' + (Number(n) || 0).toLocaleString('en-US')
      const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'no date'
      const endVoiceSession = async ({ reason } = {}) => {
        setLastEvent(reason ? `ending voice session: ${reason}` : 'ending voice session')
        // Let the spoken goodbye finish, then stop only the Command Center voice
        // session so an unrelated screen-share or video demo stays alive.
        setTimeout(() => {
          // The agent hanging up returns Command Center to wake-listening; it
          // does not switch the ear off.
          hardStopVoiceSession({ reloadFallback: false, reason: reason || 'voice call ended by agent', aggressive: true, disarmListening: false })
        }, 900)
        return `All right, goodbye.`
      }
      const voiceAgentMemoryContext = () => ({
        agentName: activeAgent?.firstName || resolved?.firstName || resolved?.name || 'agent',
        agentId: resolved?.id || activeAgent?.id || '',
      })

      // --- Orchestration flow helpers (voice-driven flow runs) ---
      const flowGateText = (run) => {
        if (!run) return 'No active flow run.'
        if (run.status === 'awaiting_answer' && run.currentGate) {
          const opts = (run.currentGate.options || []).map(o => o.label).join(', ')
          return `Question: ${run.currentGate.question} Options: ${opts}.`
        }
        if (run.status === 'executing') return `Working on step ${(run.stepIndex || 0) + 1} of ${run.stepsTotal}. Ask me to check flow status in a moment.`
        if (run.status === 'completed') {
          const last = (run.transcript || []).filter(e => e.type === 'action_executed').map(e => e.detail).slice(-3).join(' ')
          return `Flow "${run.flowName}" completed. ${last || 'All steps finished.'}`
        }
        if (run.status === 'failed') {
          const fail = (run.transcript || []).find(e => e.type === 'action_failed' || e.type === 'run_failed')
          return `Flow "${run.flowName}" failed: ${fail?.detail || 'unknown error'}. The failure is recorded in the run transcript.`
        }
        return `Flow "${run.flowName}" is ${String(run.status).replace(/_/g, ' ')}.`
      }
      const flowPost = async (body) => {
        const r = await fetch('/api/orchestrations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(body),
        })
        return r.json()
      }

      const clientTools = {
        crm_capabilities: discoverCrmCapabilities,
        crm_action: runCrmAction,
        start_orchestration: async ({ flowName, clientContext } = {}) => {
          try {
            const list = await fetch('/api/orchestrations', { cache: 'no-store', credentials: 'include' }).then(r => r.json())
            const flows = (list.orchestrations || []).filter(f => (f.steps || []).length)
            if (!flowName || !String(flowName).trim()) {
              return flows.length ? `Available flows: ${flows.map(f => f.name).join(', ')}. Which one should I run?` : 'No runnable flows are saved yet. Build one in the AI Lab Orchestration tab first.'
            }
            const wanted = String(flowName).toLowerCase()
            const flow = flows.find(f => f.name.toLowerCase() === wanted)
              || flows.find(f => f.name.toLowerCase().includes(wanted) || wanted.includes(f.name.toLowerCase()))
            if (!flow) return `No flow matches "${flowName}". Available: ${flows.map(f => f.name).join(', ') || 'none'}.`
            const j = await flowPost({ action: 'start', id: flow.id, input: String(clientContext || '').trim() })
            if (!j.ok) return `Could not start the flow: ${j.error || 'unknown error'}.`
            window.__fccActiveFlowRunId = j.run.id
            return `Started "${flow.name}". ${flowGateText(j.run)}`
          } catch (e) { return `Flow start failed: ${e.message}` }
        },
        answer_flow_question: async ({ answer, detail } = {}) => {
          const runId = window.__fccActiveFlowRunId
          if (!runId) return 'There is no active flow run. Start one with start_orchestration first.'
          if (!answer) return 'I need the chosen option to answer the flow question.'
          try {
            const j = await flowPost({ action: 'answer', runId, choice: String(answer), capturedValue: detail ? String(detail) : undefined })
            if (!j.ok) return `Could not record that answer: ${j.error || 'unknown error'}.`
            return flowGateText(j.run)
          } catch (e) { return `Answer failed: ${e.message}` }
        },
        check_flow_status: async () => {
          const runId = window.__fccActiveFlowRunId
          if (!runId) return 'No active flow run.'
          try {
            const j = await flowPost({ action: 'run_status', runId })
            return j.ok ? flowGateText(j.run) : `Could not check the run: ${j.error || 'unknown error'}.`
          } catch (e) { return `Status check failed: ${e.message}` }
        },
        transfer_to_agent: async ({ agentName, agent_name, name, target, agentId, agent_id, reason } = {}) => {
          if (transferInFlightRef.current) return `Transferring now.`
          const requested = agentName || agent_name || name || target || agentId || agent_id || ''
          const match = findRosterAgent(roster, requested)
          if (!requested) return `Need the agent name to transfer.`
          if (!match) {
            const available = roster.map(a => a.firstName || a.name || a.id).filter(Boolean).join(', ')
            return `No voice agent named "${requested}" is available. Available agents: ${available || 'none loaded'}.`
          }
          if (resolved?.id === match.id) return `Already connected to ${match.firstName || match.name}.`
          transferInFlightRef.current = true
          const transferStartedAt = Date.now()
          const targetName = match.firstName || match.name || match.id
          const sourceName = resolved?.firstName || resolved?.name || 'current agent'
          const handoff = buildAgentHandoffPayload(match, reason)
          logVoiceTransferEvent({
            stage: 'requested',
            from: sourceName,
            to: targetName,
            agentId: match.id,
            provider: match.voiceProvider,
            reason,
          })
          setSelectedAgentId(match.id)
          setError(null)
          setLastEvent(`transferring to ${targetName}`)
          window.dispatchEvent(new CustomEvent('fcc:agent-handoff', { detail: handoff }))
          if (handoff.tab) {
            window.dispatchEvent(new CustomEvent('fcc:navigate', {
              detail: {
                tab: handoff.tab,
                subtab: handoff.subtab,
              },
            }))
          }
          pendingVoiceTransferRef.current = {
            agentId: match.id,
            agentName: targetName,
            handoff,
            provider: match.voiceProvider,
            at: transferStartedAt,
          }
          try { sessionStorage.removeItem(PENDING_VOICE_TRANSFER_KEY) } catch {}
          hardStopVoiceSession({ reloadFallback: false, reason: `releasing audio for ${targetName}`, aggressive: true, disarmListening: false })
          logVoiceTransferEvent({
            stage: 'audio-released',
            from: sourceName,
            to: targetName,
            agentId: match.id,
            provider: match.voiceProvider,
            elapsedMs: Date.now() - transferStartedAt,
          })
          setTimeout(() => {
            const pending = pendingVoiceTransferRef.current
            if (!pending?.agentId || pending.agentId !== match.id || startInFlightRef.current || window.__fccVoiceStarting) return
            pendingVoiceTransferRef.current = null
            setSelectedAgentId(pending.agentId)
            setLastEvent(`starting ${pending.agentName || 'agent'} after transfer`)
            logVoiceTransferEvent({
              stage: 'fast-start',
              from: sourceName,
              to: pending.agentName,
              agentId: pending.agentId,
              provider: pending.provider,
              elapsedMs: Date.now() - (pending.at || transferStartedAt),
            })
            try {
              const recoverStart = () => {
                if (typeof window === 'undefined' || window.__fccVoiceActive || window.__fccVoiceStarting) return
                try {
                  sessionStorage.setItem(PENDING_VOICE_TRANSFER_KEY, JSON.stringify(pending))
                  transferInFlightRef.current = false
                  logVoiceTransferEvent({
                    stage: 'start-recovery-reload',
                    from: sourceName,
                    to: pending.agentName,
                    agentId: pending.agentId,
                    provider: pending.provider,
                    elapsedMs: Date.now() - (pending.at || transferStartedAt),
                  })
                  window.location.reload()
                } catch {}
              }
              const recoveryTimer = typeof window !== 'undefined' ? window.setTimeout(recoverStart, 7000) : null
              const started = Promise.resolve(startRef.current?.(pending.agentId))
              setTimeout(() => { transferInFlightRef.current = false }, 1500)
              started.then(ok => {
                transferInFlightRef.current = false
                if (ok === false) {
                  if (recoveryTimer) window.clearTimeout(recoveryTimer)
                  recoverStart()
                  return
                }
                setTimeout(() => {
                  if (recoveryTimer) window.clearTimeout(recoveryTimer)
                  if (!window.__fccVoiceActive) {
                    recoverStart()
                    return
                  }
                  logVoiceTransferEvent({
                    stage: 'start-finished',
                    from: sourceName,
                    to: pending.agentName,
                    agentId: pending.agentId,
                    provider: pending.provider,
                    elapsedMs: Date.now() - (pending.at || transferStartedAt),
                  })
                }, 400)
              }).catch(() => {
                if (recoveryTimer) window.clearTimeout(recoveryTimer)
                transferInFlightRef.current = false
                recoverStart()
              })
            } catch {
              transferInFlightRef.current = false
            }
          }, 900)
          setTimeout(() => {
            const pending = pendingVoiceTransferRef.current
            if (pending?.agentId === match.id && typeof window !== 'undefined') {
              try {
                sessionStorage.setItem(PENDING_VOICE_TRANSFER_KEY, JSON.stringify(pending))
                pendingVoiceTransferRef.current = null
                transferInFlightRef.current = false
                window.__fccVoiceStarting = false
                logVoiceTransferEvent({
                  stage: 'reload-fallback',
                  from: sourceName,
                  to: pending.agentName,
                  agentId: pending.agentId,
                  provider: pending.provider,
                  elapsedMs: Date.now() - (pending.at || transferStartedAt),
                })
                window.location.reload()
              } catch {}
            }
          }, 4500)
          setTimeout(() => { transferInFlightRef.current = false }, 5000)
          return pickTransferConfirmation(targetName)
        },
        // ===== JULES STATUS — "is the task done? what's running?" =====
        check_jules_status: async ({ sessionId }) => {
          try {
            const r = await fetch('/api/jules/voice-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ sessionId: String(sessionId || '').trim() }),
            })
            const j = await r.json()
            if (!r.ok || !j.ok) return `Couldn't check Jules: ${j?.error || `HTTP ${r.status}`}`
            if (j.session) {
              const s = j.session
              return `${s.title} — status ${s.status}.${s.url ? ` Live at ${s.url}.` : ''}`
            }
            const list = (j.sessions || []).slice(0, 5)
            if (!list.length) return `No active Jules sessions.`
            const lines = list.map(s => `${s.title}: ${s.status}`)
            return `Latest ${list.length} Jules sessions — ${lines.join('. ')}.`
          } catch (e) {
            return `Couldn't reach the status endpoint: ${e.message}`
          }
        },
        ops_status: async ({ scope } = {}) => {
          try {
            const r = await fetch('/api/ops', { cache: 'no-store', credentials: 'include' })
            const j = await r.json().catch(() => ({}))
            if (!r.ok || !j?.ok) return `I couldn't read Ops status: ${j?.error || `HTTP ${r.status}`}.`
            const system = j.system || {}
            const repo = system.repo || {}
            const backup = system.backup || {}
            const latestSnapshot = Array.isArray(backup.snapshots) && backup.snapshots[0]
              ? `${backup.snapshots[0].name}${backup.snapshots[0].created ? ` created ${backup.snapshots[0].created}` : ''}`
              : 'no recent snapshot listed'
            const statusLines = String(repo.status || '').split('\n').filter(Boolean)
            const dirtyCount = statusLines.filter(line => !line.startsWith('##')).length
            const repoState = dirtyCount ? `${dirtyCount} changed file${dirtyCount === 1 ? '' : 's'}` : 'clean from this status check'
            const logTail = String(backup.log || '').split('\n').filter(Boolean).slice(-1)[0] || 'no backup log line returned'
            const normalizedScope = String(scope || '').toLowerCase()
            if (/repo|gitea|git|source/.test(normalizedScope)) {
              window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab: 'repository' } }))
            } else {
              window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab: 'ops' } }))
            }
            return [
              `Ops status: CRM service ${system.crm?.status || 'unknown'}, Gitea ${system.gitea?.status || 'unknown'}.`,
              `Repo ${repo.branch || 'unknown branch'} at ${repo.latestCommit || 'unknown commit'}; ${repoState}.`,
              `Backups: ${backup.status || 'unknown'}, scheduled ${backup.schedule || 'unknown'}; latest ${latestSnapshot}.`,
              `Backup log: ${logTail}.`,
            ].join(' ')
          } catch (e) {
            return `I couldn't reach Ops status: ${e.message}.`
          }
        },
        repository_status: async () => clientTools.ops_status({ scope: 'repository' }),
        backup_status: async () => clientTools.ops_status({ scope: 'backup' }),
        search_twilio_numbers: async ({ areaCode = '828', prefixes, prefix, limit = 8 } = {}) => {
          try {
            const cleanArea = String(areaCode || '828').replace(/\D/g, '').slice(0, 3) || '828'
            const prefixList = Array.isArray(prefixes)
              ? prefixes
              : String(prefixes || prefix || '').split(/[,\s]+/)
            const cleanPrefixes = prefixList.map(p => String(p || '').replace(/\D/g, '').slice(0, 3)).filter(p => p.length === 3)
            const qs = new URLSearchParams({
              areaCode: cleanArea,
              limit: String(Math.max(1, Math.min(Number(limit) || 8, 12))),
            })
            if (cleanPrefixes.length) qs.set('prefixes', cleanPrefixes.join(','))
            const r = await fetch(`/api/twilio/available-numbers?${qs.toString()}`, { cache: 'no-store', credentials: 'include' })
            const j = await r.json().catch(() => ({}))
            if (!r.ok || !j?.ok) return `I couldn't search Twilio numbers: ${j?.error || `HTTP ${r.status}`}.`
            window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab: 'ops' } }))
            const numbers = j.numbers || []
            if (!numbers.length) {
              const prefixText = cleanPrefixes.length ? ` beginning with ${cleanPrefixes.join(' or ')}` : ''
              return `I found no available ${cleanArea} numbers${prefixText}. I can try different prefixes or a wider search.`
            }
            const top = numbers.slice(0, 6).map(n => `${n.phoneNumber} (${n.localPrefix}, ${n.voice ? 'voice' : 'no voice'}, ${n.sms ? 'SMS' : 'no SMS'})`).join('; ')
            return `I found ${j.count} available ${cleanArea} Twilio number${j.count === 1 ? '' : 's'}${cleanPrefixes.length ? ` with prefix ${cleanPrefixes.join(' or ')}` : ''}: ${top}. Buying or assigning one needs explicit approval.`
          } catch (e) {
            return `I couldn't search Twilio inventory: ${e.message}.`
          }
        },
        prepare_twilio_number_setup: async ({ clientName, areaCode = '828', prefixes, prefix } = {}) => {
          const search = await clientTools.search_twilio_numbers({ areaCode, prefixes, prefix, limit: 6 })
          const client = clientName ? ` for ${clientName}` : ''
          return `${search} Next step${client}: confirm the client or lease record and explicitly approve the selected number before I provision it.`
        },
        // ===== DELEGATE CODING WORK TO JULES (Google's async coding agent) =====
        delegate_to_jules: async ({ prompt, repoName }) => {
          if (!prompt || !String(prompt).trim()) return "I need the task description before I can hand it off."
          try {
            const r = await fetch('/api/jules/voice-task', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ prompt: String(prompt).trim(), repoName: String(repoName || '').trim() }),
            })
            const j = await r.json()
            if (!r.ok || !j.ok) {
              if (j?.availableRepos?.length) {
                return `I couldn't find a repo named "${repoName || '?'}". Your Jules repos are: ${j.availableRepos.slice(0, 8).join(', ')}. Which one?`
              }
              return `Jules failed: ${j?.error || `HTTP ${r.status}`}`
            }
            return `Sent to Jules on ${j.repo}. Session ${j.sessionId}. Watch live at ${j.sessionUrl}.`
          } catch (e) {
            return `Network error sending to Jules: ${e.message}`
          }
        },
        create_plugin_change_request: async ({ title, scope, target, details, likelyFiles, acceptanceCriteria, risks, priority }) => {
          if (!title || !String(title).trim()) return "I need a short title before I can capture that plugin change request."
          try {
            const result = await agentExec('create_plugin_change_request', {
              title,
              scope,
              target,
              details,
              likelyFiles,
              acceptanceCriteria,
              risks,
              priority,
              requestedBy: 'Craig',
              source: 'voice-agent',
            })
            return result?.message || `Plugin change request captured as task ${result?.taskId || result?.requestId}.`
          } catch (e) {
            return `Couldn't capture the plugin change request: ${e.message}`
          }
        },
        create_openclaw_plugin_spec: async ({ name, pluginName, title, purpose, tools, endpoints, dataSources, guardrails, likelyFiles, acceptanceCriteria, priority }) => {
          const specName = name || pluginName || title
          if (!specName || !String(specName).trim()) return "I need the plugin name before I can stage the OpenClaw plugin spec."
          try {
            const result = await agentExec('create_openclaw_plugin_spec', {
              name: specName,
              purpose,
              tools,
              endpoints,
              dataSources,
              guardrails,
              likelyFiles,
              acceptanceCriteria,
              priority,
              requestedBy: 'Craig',
              source: 'voice-agent',
            })
            return result?.message || `OpenClaw plugin spec staged as document ${result?.documentId} and task ${result?.taskId}.`
          } catch (e) {
            return `Couldn't stage the OpenClaw plugin spec: ${e.message}`
          }
        },
        // ===== INFORMATION / DAILY FLOW =====
        daily_briefing: async () => {
          try {
            const [dash, eventsR, tasksR] = await Promise.all([
              agentExec('dashboard_summary'),
              fetch('/api/calendar/events').then(r => r.json()),
              agentExec('list_tasks', { status: 'todo' }),
            ])
            const todayStr = new Date().toISOString().slice(0, 10)
            const todayEvents = (eventsR.events || []).filter(e => (e.start || '').slice(0, 10) === todayStr).slice(0, 5)
            const overdue = (tasksR.tasks || []).filter(t => t.dueDate && t.dueDate < todayStr)
            const dueToday = (tasksR.tasks || []).filter(t => (t.dueDate || '').slice(0, 10) === todayStr)
            const parts = [`Today: ${todayEvents.length} meeting(s), ${dueToday.length} task(s) due, ${overdue.length} overdue.`]
            if (todayEvents.length) parts.push(`First up: ${todayEvents[0].summary} at ${new Date(todayEvents[0].start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`)
            parts.push(`Pipeline has ${dash.pipeline?.open || 0} open deals worth ${fmtUSD(dash.pipeline?.openValue)}.`)
            parts.push(`This month: ${fmtUSD(dash.payments?.monthRevenue || 0)} from ${dash.payments?.monthCount || 0} payments.`)
            return parts.join(' ')
          } catch (e) { return `Briefing failed: ${e.message}` }
        },
        whats_next: async () => {
          try {
            const r = await fetch('/api/calendar/events').then(r => r.json())
            const now = Date.now()
            const upcoming = (r.events || []).filter(e => new Date(e.start).getTime() >= now).sort((a, b) => new Date(a.start) - new Date(b.start))[0]
            if (!upcoming) return `Nothing on your calendar coming up.`
            const when = new Date(upcoming.start).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
            return `Next: ${upcoming.summary || 'untitled'} ${when}.`
          } catch (e) { return `Calendar lookup failed: ${e.message}` }
        },
        whats_overdue: async () => {
          try {
            const r = await agentExec('list_tasks', { status: 'todo' })
            const todayStr = new Date().toISOString().slice(0, 10)
            const overdue = (r.tasks || []).filter(t => t.dueDate && t.dueDate < todayStr)
            if (overdue.length === 0) return `Nothing overdue. You're caught up.`
            const top = overdue.slice(0, 5).map(t => `${t.title} (due ${fmtDate(t.dueDate)})`).join('; ')
            return `${overdue.length} overdue: ${top}${overdue.length > 5 ? ', and more' : ''}.`
          } catch (e) { return `Task lookup failed: ${e.message}` }
        },
        pipeline_status: async () => {
          try {
            const [opps, pipes] = await Promise.all([
              agentExec('list_opportunities'),
              agentExec('list_pipelines'),
            ])
            const open = (opps.opportunities || []).filter(o => !['won', 'lost', 'declined', 'signed'].includes(o.stageId))
            const total = open.reduce((s, o) => s + (Number(o.value) || 0), 0)
            const byPipeline = {}
            open.forEach(o => {
              const p = (pipes.pipelines || []).find(p => p.id === o.pipelineId)
              const name = p?.name || o.pipelineId
              byPipeline[name] = (byPipeline[name] || 0) + 1
            })
            const breakdown = Object.entries(byPipeline).map(([k, v]) => `${v} in ${k}`).join(', ')
            return `${open.length} open opportunities worth ${fmtUSD(total)}. ${breakdown}.`
          } catch (e) { return `Pipeline lookup failed: ${e.message}` }
        },
        account_summary: async ({ query }) => {
          try {
            const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(query)}&type=account`).then(r => r.json())
            const a = (sr.matches || [])[0]
            if (!a) return `No account found for "${query}".`
            const detail = await agentExec('get_account', { id: a.id })
            const opps = detail.opportunities || []
            const projects = detail.projects || []
            const tasks = (detail.tasks || []).filter(t => t.status !== 'done')
            const acts = detail.activities || []
            const lastAct = acts[0]
            const parts = [`${detail.name} — ${detail.type}.`]
            if (detail.email) parts.push(`Email: ${detail.email}.`)
            if (detail.phone) parts.push(`Phone: ${detail.phone}.`)
            parts.push(`${opps.length} opportunities, ${projects.length} projects, ${tasks.length} open tasks.`)
            if (lastAct) parts.push(`Last activity: ${lastAct.subject || lastAct.type} on ${fmtDate(lastAct.at)}.`)
            return parts.join(' ')
          } catch (e) { return `Lookup failed: ${e.message}` }
        },

        // ===== FINANCE QUERIES =====
        outstanding_invoices: async ({ clientQuery } = {}) => {
          try {
            const r = await fetch('/api/invoices').then(r => r.json())
            let unpaid = (r.invoices || []).filter(i => i.status !== 'paid')
            if (clientQuery) {
              const q = String(clientQuery).toLowerCase()
              unpaid = unpaid.filter(i => (i.clientName || '').toLowerCase().includes(q))
            }
            if (unpaid.length === 0) {
              return clientQuery ? `No unpaid invoices for "${clientQuery}".` : `No outstanding invoices. Everyone's current.`
            }
            const total = unpaid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
            const top = unpaid.slice(0, 5).map(i => `${i.clientName} ${fmtUSD(i.amount)}${i.dueDate ? ` due ${fmtDate(i.dueDate)}` : ''}`).join('; ')
            const scope = clientQuery ? ` for ${clientQuery}` : ''
            return `${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}${scope} totaling ${fmtUSD(total)}: ${top}${unpaid.length > 5 ? ', and more' : ''}.`
          } catch (e) { return `Invoice lookup failed: ${e.message}` }
        },
        invoice_command: async ({ request, clientName, amount, description, send } = {}) => {
          try {
            const cleanClient = String(clientName || '').trim()
            const cleanDescription = String(description || '').trim()
            const cleanAmount = Number(amount)
            const fallbackRequest = [
              send ? 'send invoice' : 'draft invoice',
              cleanClient ? `to ${cleanClient}` : '',
              Number.isFinite(cleanAmount) && cleanAmount > 0 ? `for $${cleanAmount}` : '',
              cleanDescription ? `for ${cleanDescription}` : '',
            ].filter(Boolean).join(' ')
            const message = String(request || fallbackRequest || '').trim()
            const body = { message, section: 'finance' }
            if (cleanClient) body.clientName = cleanClient
            if (Number.isFinite(cleanAmount) && cleanAmount > 0) body.amount = cleanAmount
            if (cleanDescription) body.description = cleanDescription
            if (typeof send === 'boolean') body.send = send
            const r = await fetch('/api/agent/invoice-command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(body),
            })
            const j = await r.json().catch(() => ({}))
            if (!r.ok || j.ok === false) return j.text || `Invoice command failed: ${j.error || `HTTP ${r.status}`}.`
            if (!j.handled) return 'I can do that. I need the client name, amount, what the charge is for, and whether to email it now or leave it as a draft.'
            return j.text || 'Invoice command finished.'
          } catch (e) {
            return `Invoice command failed: ${e.message}`
          }
        },
        client_balance: async ({ clientQuery }) => {
          try {
            if (!clientQuery) return `Need a client name to check a balance.`
            const r = await fetch('/api/invoices').then(r => r.json())
            const q = String(clientQuery).toLowerCase()
            const matches = (r.invoices || []).filter(i => (i.clientName || '').toLowerCase().includes(q) && i.status !== 'paid')
            if (matches.length === 0) return `${clientQuery} has no unpaid invoices.`
            const total = matches.reduce((s, i) => s + (Number(i.amount) || 0), 0)
            const name = matches[0].clientName
            const due = matches.map(m => m.dueDate).filter(Boolean).sort()[0]
            return `${name} owes ${fmtUSD(total)} across ${matches.length} unpaid invoice${matches.length === 1 ? '' : 's'}${due ? `. Oldest due ${fmtDate(due)}` : ''}.`
          } catch (e) { return `Balance lookup failed: ${e.message}` }
        },
        overdue_items: async () => {
          try {
            const [inv, oh] = await Promise.all([
              fetch('/api/invoices').then(r => r.json()).catch(() => null),
              fetch('/api/overhead/sources').then(r => r.json()).catch(() => null),
            ])
            const today = Date.now()
            const ovInv = (inv?.invoices || []).filter(i => i.status !== 'paid' && i.dueDate && new Date(i.dueDate).getTime() < today)
            const ovOh = (oh?.sources || []).filter(r => r.ok && r.nextDue && new Date(r.nextDue).getTime() < today)
            if (ovInv.length === 0 && ovOh.length === 0) return `Nothing overdue. You're in the clear.`
            const parts = []
            if (ovInv.length) {
              const total = ovInv.reduce((s, i) => s + (Number(i.amount) || 0), 0)
              const names = ovInv.slice(0, 4).map(i => `${i.clientName} ${fmtUSD(i.amount)}`).join('; ')
              parts.push(`${ovInv.length} overdue invoice${ovInv.length === 1 ? '' : 's'} owed to you totaling ${fmtUSD(total)}: ${names}${ovInv.length > 4 ? ', and more' : ''}`)
            }
            if (ovOh.length) {
              const names = ovOh.slice(0, 4).map(r => r.vendor).join(', ')
              parts.push(`${ovOh.length} overdue overhead bill${ovOh.length === 1 ? '' : 's'}: ${names}${ovOh.length > 4 ? ', and more' : ''}`)
            }
            return parts.join('. ') + '.'
          } catch (e) { return `Overdue lookup failed: ${e.message}` }
        },
        overhead_summary: async () => {
          try {
            const r = await fetch('/api/overhead/sources').then(r => r.json())
            const sources = (r.sources || []).filter(s => s.ok)
            const total = r.summary?.totalMonthlyCost ?? sources.reduce((s, x) => s + (Number(x.currentMonthCost) || 0), 0)
            const top = [...sources].sort((a, b) => (b.currentMonthCost || 0) - (a.currentMonthCost || 0)).slice(0, 3)
            const topStr = top.map(s => `${s.vendor} ${fmtUSD(s.currentMonthCost)}`).join(', ')
            const in30 = Date.now() + 30 * 86400000
            const upcoming = sources.filter(s => s.nextDue && new Date(s.nextDue).getTime() <= in30)
            const upStr = upcoming.length ? ` ${upcoming.length} renewal${upcoming.length === 1 ? '' : 's'} in the next 30 days: ${upcoming.slice(0, 3).map(s => `${s.vendor} on ${fmtDate(s.nextDue)}`).join(', ')}.` : ''
            return `Overhead this month is ${fmtUSD(total)} across ${sources.length} source${sources.length === 1 ? '' : 's'}. Top: ${topStr}.${upStr}`
          } catch (e) { return `Overhead lookup failed: ${e.message}` }
        },
        recent_payments: async ({ clientQuery, limit } = {}) => {
          try {
            const r = await fetch('/api/payments').then(r => r.json())
            let list = (r.payments || []).filter(p => p.status === 'succeeded')
            if (clientQuery) {
              const q = String(clientQuery).toLowerCase()
              list = list.filter(p => (p.clientName || '').toLowerCase().includes(q))
            }
            list = list.sort((a, b) => new Date(b.date) - new Date(a.date))
            const n = Math.min(Math.max(1, Number(limit) || 5), 25)
            const top = list.slice(0, n)
            if (top.length === 0) return clientQuery ? `No payments from "${clientQuery}".` : `No recent payments on record.`
            const total = top.reduce((s, p) => s + (Number(p.amount) || 0), 0)
            const lines = top.map(p => `${p.clientName} ${fmtUSD(p.amount)} on ${fmtDate(p.date)}`).join('; ')
            const scope = clientQuery ? ` from ${clientQuery}` : ''
            return `Last ${top.length} payment${top.length === 1 ? '' : 's'}${scope} totaling ${fmtUSD(total)}: ${lines}.`
          } catch (e) { return `Payment lookup failed: ${e.message}` }
        },

        // ===== VOICE-DRIVEN ACTIONS =====
        create_account: async ({ name, type, stage, priority, website, industry, address, notes, tags } = {}) => {
          try {
            const cleanName = String(name || '').trim()
            if (!cleanName) return `I need the account name.`
            const result = await agentExec('create_account', {
              name: cleanName,
              type,
              stage,
              priority,
              website,
              industry,
              address,
              notes,
              tags,
              agentName: activeAgent?.firstName || 'Maggie',
            })
            if (!result?.id) return `I tried to create ${cleanName}, but the CRM did not return a saved account id.`
            window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'accounts' }))
            window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: { ...result, type: 'account', tabId: 'accounts' } }))
            return `Created account: ${result.name || cleanName}.`
          } catch (e) {
            return `Account creation failed: ${e.message}.`
          }
        },
        create_task: async ({ title, dueDate, priority, linkedToQuery }) => {
          try {
            let linkedTo = {}
            if (linkedToQuery) {
              const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(linkedToQuery)}`).then(r => r.json())
              const m = (sr.matches || [])[0]
              if (m) {
                if (m.type === 'account') linkedTo.accountId = m.id
                else if (m.type === 'contact') linkedTo.contactId = m.id
                else if (m.type === 'lead') linkedTo.leadId = m.id
                else if (m.type === 'opportunity') linkedTo.opportunityId = m.id
                else if (m.type === 'project') linkedTo.projectId = m.id
              }
            }
            await agentExec('create_task', { title, dueDate, priority, linkedTo })
            const link = linkedToQuery ? ` linked to ${linkedToQuery}` : ''
            return `Task created: "${title}"${dueDate ? ' due ' + dueDate : ''}${link}.`
          } catch (e) { return `Failed to create task: ${e.message}` }
        },
        complete_task: async ({ titleQuery }) => {
          try {
            const r = await agentExec('list_tasks', { status: 'todo' })
            const q = (titleQuery || '').toLowerCase()
            const matches = (r.tasks || []).filter(t => t.title?.toLowerCase().includes(q))
            if (matches.length === 0) return `No open task matching "${titleQuery}".`
            if (matches.length > 1) return `Found ${matches.length} matching tasks. Be more specific: ${matches.slice(0, 3).map(t => t.title).join(', ')}.`
            await agentExec('complete_task', { id: matches[0].id })
            return `Marked done: "${matches[0].title}".`
          } catch (e) { return `Failed: ${e.message}` }
        },
        log_activity: async ({ type, subject, body, linkedToQuery }) => {
          try {
            let linkedTo = {}
            if (linkedToQuery) {
              const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(linkedToQuery)}`).then(r => r.json())
              const m = (sr.matches || [])[0]
              if (m?.type === 'account') linkedTo.accountId = m.id
              else if (m?.type === 'contact') linkedTo.contactId = m.id
              else if (m?.type === 'lead') linkedTo.leadId = m.id
            }
            await agentExec('log_activity', { type: type || 'note', subject: subject || '', body: body || '', linkedTo })
            return `Logged ${type || 'note'}${linkedToQuery ? ' on ' + linkedToQuery : ''}.`
          } catch (e) { return `Failed: ${e.message}` }
        },
        dictate_email: async ({ to, subject, body, recipientQuery, attachments }) => {
          try {
            if (wantsSignatureRequest(subject, body, recipientQuery, to)) {
              const r = await agentExec('send_signature_document', {
                clientName: recipientQuery || to,
                signerName: recipientQuery || to,
                signerEmail: looksLikeEmail(to) ? to : undefined,
                templateName: /nda|non[-\s]?disclosure/i.test(`${subject || ''} ${body || ''}`) ? 'standard NDA' : subject || 'standard NDA',
                agentName: activeAgent?.firstName || 'Maggie',
              })
              if (!r.sent) return `I created the signature request for ${r.signerName}, but the email did not send: ${r.email?.error || 'unknown error'}.`
              return `Done. ${r.voiceGuidance || ''} I sent ${r.title} to ${r.signerName} at ${r.signerEmail} for signature. You are carbon copied.`
            }
            let toAddr = to
            if (!toAddr && recipientQuery) {
              const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(recipientQuery)}`).then(r => r.json())
              const m = (sr.matches || []).find(x => x.email)
              if (!m) return `No email on file for "${recipientQuery}".`
              toAddr = m.email
            }
            if (!toAddr) return `I need either an email address or a name to look up.`
            const r = await fetch('/api/tools/send-email', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: toAddr, subject: subject || `Quick note from Carl`, body, attachments }),
            }).then(r => r.json())
            if (!r.ok) return `Email failed: ${r.error || 'unknown'}.`
            const attachNote = (attachments && attachments.length) ? ` with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''
            return `Email sent to ${toAddr}${attachNote}.`
          } catch (e) { return `Email failed: ${e.message}` }
        },
        move_pipeline_stage: async ({ opportunityQuery, stageName }) => {
          try {
            const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(opportunityQuery)}&type=opportunity`).then(r => r.json())
            const opp = (sr.matches || [])[0]
            if (!opp) return `No opportunity found matching "${opportunityQuery}".`
            const pipes = await agentExec('list_pipelines')
            const pipeline = (pipes.pipelines || []).find(p => p.id === opp.pipelineId)
            if (!pipeline) return `Couldn't find the pipeline for that opportunity.`
            const target = pipeline.stages?.find(s => s.name?.toLowerCase().includes((stageName || '').toLowerCase()) || s.id === stageName)
            if (!target) return `Stage "${stageName}" not found in ${pipeline.name}. Stages: ${(pipeline.stages || []).map(s => s.name).join(', ')}.`
            await agentExec('move_opportunity', { id: opp.id, stageId: target.id })
            return `Moved ${opp.name} to ${target.name}.`
          } catch (e) { return `Failed: ${e.message}` }
        },
        draft_legal_document: async ({ clientName, counterpartyName, accountId, documentType, templateId, templateName, mutual, reciprocal, purpose, fields, title, folder }) => {
          try {
            const r = await agentExec('draft_legal_document', {
              clientName: clientName || counterpartyName,
              counterpartyName,
              accountId,
              documentType: documentType || templateName || 'standard NDA',
              templateId,
              templateName,
              mutual,
              reciprocal,
              purpose,
              fields,
              title,
              folder,
              agentName: activeAgent?.firstName || 'Linda',
            })
            return `Drafted "${r.title}" and saved it in Documents${r.clientName ? ` for ${r.clientName}` : ''}. Source: ${r.source}. Next step: review it or tell me to send it for signature.`
          } catch (e) { return `Legal draft failed: ${e.message}` }
        },
        save_document_to_account: async ({ documentId, id, clientName, accountId, counterpartyName, body, title, folder }) => {
          try {
            const r = await agentExec('save_document_to_account', {
              documentId: documentId || id,
              clientName,
              accountId,
              counterpartyName,
              body,
              title,
              folder,
              agentName: activeAgent?.firstName || 'agent',
            })
            return `Filed "${r.title}" under ${r.clientName || 'the selected account'} in ${r.folder || 'Documents'}.`
          } catch (e) { return `Document filing failed: ${e.message}` }
        },
        send_document: async ({ id, clientName, templateName, signerName, signerEmail }) => {
          try {
            if (/nda|non[-\s]?disclosure|signature|sign/i.test(String(templateName || ''))) {
              const r = await agentExec('send_signature_document', {
                clientName: clientName || signerName,
                signerName,
                signerEmail,
                templateName: templateName || 'standard NDA',
                agentName: activeAgent?.firstName || 'Maggie',
              })
              if (!r.sent) return `I created the signature request for ${r.signerName}, but the email did not send: ${r.email?.error || 'unknown error'}.`
              return `Done. ${r.voiceGuidance || ''} I sent ${r.title} to ${r.signerName} at ${r.signerEmail} for signature. You are carbon copied.`
            }
            const r = await agentExec('send_document', { id, clientName, templateName })
            return `Sent "${r.title}" to ${r.to}.`
          } catch (e) { return `Send failed: ${e.message}` }
        },
        send_signature_document: async ({ clientName, counterpartyName, signerName, signerEmail, templateName, templateId, purpose, fields }) => {
          try {
            const r = await agentExec('send_signature_document', {
              clientName: clientName || counterpartyName || signerName,
              counterpartyName,
              signerName,
              signerEmail,
              templateName: templateName || templateId || 'standard NDA',
              templateId,
              purpose,
              fields,
              agentName: activeAgent?.firstName || 'Maggie',
            })
            if (!r.sent) return `I created the signature request for ${r.signerName}, but the email did not send: ${r.email?.error || 'unknown error'}.`
            return `Done. ${r.voiceGuidance || ''} I sent ${r.title} to ${r.signerName} at ${r.signerEmail} for signature. You are carbon copied.`
          } catch (e) { return `Signature request failed: ${e.message}` }
        },
        generate_and_send_document: async ({ clientQuery, templateQuery }) => {
          try {
            if (/nda|non[-\s]?disclosure|signature|sign/i.test(String(templateQuery || ''))) {
              const r = await agentExec('send_signature_document', {
                clientName: clientQuery,
                templateName: templateQuery || 'standard NDA',
                agentName: activeAgent?.firstName || 'Maggie',
              })
              if (!r.sent) return `I created the signature request for ${r.signerName}, but the email did not send: ${r.email?.error || 'unknown error'}.`
              return `Done. ${r.voiceGuidance || ''} I sent ${r.title} to ${r.signerName} at ${r.signerEmail} for signature. You are carbon copied.`
            }
            const docsRes = await fetch('/api/documents').then(r => r.json())
            const templates = docsRes.templates || []
            const tq = (templateQuery || '').toLowerCase()
            const tpl = templates.find(t => t.id.toLowerCase().includes(tq)) || templates.find(t => t.name.toLowerCase().includes(tq))
            if (!tpl) return `No template matching "${templateQuery}". Try NDA, MSA, retainer, hosting, etc.`
            const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(clientQuery)}&type=account`).then(r => r.json())
            const acct = (sr.matches || [])[0]
            if (!acct) return `No client found matching "${clientQuery}".`
            if (!acct.email) return `Found ${acct.name} but no email on file. Add an email first.`
            const gen = await fetch('/api/documents', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'generate', templateId: tpl.id, clientId: acct.id, fields: {}, dictation: '' }),
            }).then(r => r.json())
            if (gen.error) return `Generate failed: ${gen.error}`
            const saved = await fetch('/api/documents', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'save', templateId: tpl.id, templateName: tpl.name,
                title: `${tpl.name} — ${acct.name}`, clientId: acct.id, clientName: acct.name,
                body: gen.draft, values: gen.values || {}, status: 'draft',
              }),
            }).then(r => r.json())
            if (saved.error || !saved.document) return `Save failed: ${saved.error || 'no document returned'}`
            const sent = await agentExec('send_document', { id: saved.document.id })
            return `Generated and sent "${tpl.name}" to ${acct.name} at ${sent.to}.`
          } catch (e) { return `Failed: ${e.message}` }
        },

        end_session: endVoiceSession,
        end_call: endVoiceSession,
        hang_up: endVoiceSession,

        check_domain_availability: async ({ domain }) => {
          try {
            const r = await fetch(`/api/tools/domain-availability?domain=${encodeURIComponent(domain)}`).then(r => r.json())
            if (r.error) return `Error: ${r.error}`
            if (!r.available) {
              const parts = [`${r.domain} is registered`]
              if (r.registrar) parts.push(`through ${r.registrar}`)
              if (r.expires_at) parts.push(`expires ${r.expires_at.slice(0, 10)}`)
              return parts.join(', ') + '.'
            }
            // Availability and price are separate facts. Say the price only
            // when Cloudflare actually returned one — never estimate.
            if (r.registrable === false) {
              return `${r.domain} is unregistered, but I cannot buy it here — ${r.reason_text || 'Cloudflare declined the extension'}. Do not quote a price.`
            }
            if (r.price == null) {
              return `${r.domain} is available. I have NO price for it${r.pricing_error ? ` (${r.pricing_error})` : ''}. Tell Carl you do not have a price — do not guess one.`
            }
            return `${r.domain} is available at $${Number(r.price).toFixed(2)} ${r.currency || 'USD'} per year${r.premium ? ' (premium domain)' : ''}. Quote exactly that number.`
          } catch (e) { return `Lookup failed: ${e.message}` }
        },

        // Two calls, always. The first returns a real quote and a confirmToken;
        // say the price out loud, get a yes, then call again with that token.
        // The server binds the quoted price into the token, so this tool
        // cannot spend money on a number the model made up.
        register_domain: async ({ domain, period, years, privacy, confirm, confirmToken }) => {
          try {
            const payload = {
              domain,
              years: Number(years || period) || 1,
              privacy: privacy !== false,
            }
            if (confirmToken) payload.confirmToken = confirmToken
            const r = await fetch('/api/domains/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            })
            const j = await r.json().catch(() => null)
            if (!j) return `The purchase endpoint returned ${r.status} with no readable answer. Nothing was bought.`
            if (!j.ok) return j.spoken || j.error || 'Registration failed. Nothing was bought.'
            if (j.phase === 'quote') {
              if (confirm === true || String(confirm).toLowerCase() === 'yes') {
                // Carl already said yes in the same breath — close the loop now.
                return await clientToolsRef.current?.register_domain?.({ domain, years: payload.years, privacy: payload.privacy, confirmToken: j.confirmToken })
              }
              return `${j.spoken} [confirmToken=${j.confirmToken}] — say the price out loud, wait for a yes, then call register_domain again with that exact confirmToken.`
            }
            return j.spoken || `${j.domain} registered.`
          } catch (e) { return `Registration failed: ${e.message}. Nothing was bought.` }
        },
        open_record: async ({ query, type, subTab, itemQuery }) => {
          try {
            const normalizedType = String(type || '').toLowerCase().trim()
            if (!query && normalizedType) {
              const tabMap = {
                account: 'accounts',
                client: 'accounts',
                contact: 'contacts',
                lead: 'leads',
                opportunity: 'pipelines',
                deal: 'pipelines',
                project: 'projects',
                domain: 'domains',
              }
              const tabId = tabMap[normalizedType]
              if (tabId) {
                window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: tabId }))
                return `Opening ${tabId}.`
              }
            }
            if (!query) return `Tell me which ${type || 'record'} to open, or ask me to open the ${type || 'record'} list.`
            const url = `/api/agent/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ''}`
            const r = await fetch(url).then(r => r.json())
            if (r.error) return `Search failed: ${r.error}`
            const matches = r.matches || []
            if (matches.length === 0) return `I couldn't find anything matching "${query}".`
            const open = (m) => {
              window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: { ...m, subTab, itemQuery } }))
              const extras = []
              if (subTab) extras.push(`on the ${subTab} tab`)
              if (itemQuery) extras.push(`looking for "${itemQuery}"`)
              return extras.length ? `Opening ${m.name} ${extras.join(' ')}.` : `Opening ${m.name}.`
            }
            if (matches.length > 1) {
              const topTwo = matches.slice(0, 3).map(m => `${m.name} (${m.type})`).join(', ')
              const best = matches[0]
              const second = matches[1]
              if (best._score >= second._score + 20) return open(best)
              return `I found a few: ${topTwo}. Which one do you want?`
            }
            return open(matches[0])
          } catch (e) { return `Lookup failed: ${e.message}` }
        },
        send_email: async ({ to, subject, body, attachments }) => {
          try {
            if (wantsSignatureRequest(subject, body, to)) {
              const r = await agentExec('send_signature_document', {
                clientName: looksLikeEmail(to) ? undefined : to,
                signerName: to,
                signerEmail: looksLikeEmail(to) ? to : undefined,
                templateName: /nda|non[-\s]?disclosure/i.test(`${subject || ''} ${body || ''}`) ? 'standard NDA' : subject || 'standard NDA',
                agentName: activeAgent?.firstName || 'Maggie',
              })
              if (!r.sent) return `I created the signature request for ${r.signerName}, but the email did not send: ${r.email?.error || 'unknown error'}.`
              return `Done. ${r.voiceGuidance || ''} I sent ${r.title} to ${r.signerName} at ${r.signerEmail} for signature. You are carbon copied.`
            }
            const r = await fetch('/api/tools/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, subject, body, attachments }),
            }).then(r => r.json())
            if (!r.ok) return `Email failed: ${r.error || 'unknown error'}`
            const attachNote = (attachments && attachments.length) ? ` with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''
            return `Email sent to ${to}${attachNote}.`
          } catch (e) { return `Email failed: ${e.message}` }
        },
        create_contact: async ({ name, email, phone, title, notes }) => {
          if (!name) return `I need a name before I can create the contact.`
          try {
            const r = await fetch('/api/agent/execute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: 'create_contact', args: { name, email: email || '', phone: phone || '', title: title || '', notes: notes || '' } }),
            }).then(r => r.json())
            if (!r.ok) return `Couldn't create contact: ${r.error || 'unknown error'}`
            const c = r.result || {}
            const bits = [c.name]
            if (c.email) bits.push(c.email)
            if (c.phone) bits.push(c.phone)
            return `Added ${bits.filter(Boolean).join(' — ')} to contacts.`
          } catch (e) { return `Create contact failed: ${e.message}` }
        },
        find_contact: async ({ query }) => {
          try {
            const r = await fetch(`/api/agent/search?q=${encodeURIComponent(query)}`).then(r => r.json())
            const matches = r.matches || []
            if (matches.length === 0) return `No contact found for "${query}".`
            const top = matches.slice(0, 3).map(m => {
              const bits = [m.name, m.type]
              if (m.email) bits.push(m.email)
              if (m.phone) bits.push(m.phone)
              return bits.filter(Boolean).join(' — ')
            }).join('; ')
            return `Found: ${top}.`
          } catch (e) { return `Lookup failed: ${e.message}` }
        },
        create_calendar_event: async ({ name, phone, email, startIso, endIso, durationMinutes, summary, description, reminderMinutes } = {}) => {
          try {
            if (!name || !String(name).trim()) return 'Appointment was not scheduled: I need the person or appointment name.'
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?[+-]\d{2}:\d{2}$/.test(String(startIso || ''))) {
              return 'Appointment was not scheduled: I need an exact local start date and time with its UTC offset.'
            }
            if (!Number.isInteger(Number(reminderMinutes)) || Number(reminderMinutes) < 0) {
              return 'Appointment was not scheduled: I need an explicit reminder time in whole minutes.'
            }
            const clientRequestId = [
              'maggie-calendar',
              String(name).trim().toLowerCase(),
              String(startIso),
              String(endIso || durationMinutes || 30),
              String(summary || ''),
              String(reminderMinutes),
            ].join('|')
            const response = await fetch('/api/calendar/book', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                name: String(name).trim(),
                phone,
                email,
                startIso,
                endIso,
                durationMinutes,
                summary,
                description,
                reminderMinutes: Number(reminderMinutes),
                clientRequestId,
                allowReschedule: false,
                calendarKey: 'farrington-dev',
                source: 'maggie_voice',
                kind: 'client_call',
                isDemo: false,
                sendVideoLink: false,
              }),
            })
            const r = await response.json().catch(() => ({}))
            const verifiedSuccess = response.ok && r.ok === true && r.verified === true && Boolean(r.bookingId)
            if (!verifiedSuccess) {
              return `Appointment was not scheduled: ${r?.error || 'the calendar did not return verified booking proof'}.`
            }
            const reminder = Number.isInteger(Number(r.reminderMinutes))
              ? ` Reminder: ${Number(r.reminderMinutes)} minutes before.`
              : ''
            return `Verified calendar event created for ${r.displayTime || r.start} on ${r.calendarName || 'Farrington Development'}. Booking ID: ${r.bookingId}.${reminder}`
          } catch (e) {
            return `Appointment was not scheduled: ${e.message || 'calendar request failed'}.`
          }
        },
        book_demo: async ({ name, phone, email, dayOfWeek, preferredTime, startIso, durationMinutes, summary, description, isDemo, kind }) => {
          try {
            const requestedAsDemo = Boolean(isDemo) || /\bdemo\b/i.test(`${summary || ''} ${description || ''} ${kind || ''}`)
            const r = await fetch('/api/calendar/book', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                phone,
                email,
                dayOfWeek,
                preferredTime,
                startIso,
                durationMinutes,
                summary,
                description,
                isDemo: requestedAsDemo,
                kind: requestedAsDemo ? 'demo' : 'client_call',
                calendarKey: requestedAsDemo ? 'newsroomaios' : 'farrington-dev',
                source: requestedAsDemo ? 'newsroomaios_demos' : 'manual',
              }),
            }).then(r => r.json())
            if (r.ok) {
              if (r.rescheduled) return `Preferred time was taken - booked ${name || 'the appointment'} at ${r.displayTime} on ${r.calendarName || 'the calendar'}.`
              return `Booked ${name || 'the appointment'} for ${r.displayTime} on ${r.calendarName || 'the calendar'}.`
            }
            return `Couldn't book: ${r.error || 'no open slot that day'}.`
          } catch (e) { return `Booking failed: ${e.message}` }
        },
        start_video_call: async ({ query }) => {
          try {
            const sr = await fetch(`/api/agent/search?q=${encodeURIComponent(query)}&type=account`).then(r => r.json())
            const matches = sr.matches || []
            if (matches.length === 0) return `I couldn't find an account matching "${query}".`
            const account = matches[0]
            // Reuse a recent room (within 3 hours, leaves buffer before 4-hour Daily expiry)
            // so Carl and the recipient always end up in the same room across multiple calls
            const cacheKey = 'fcc-video-rooms'
            const cache = JSON.parse(typeof window !== 'undefined' ? (sessionStorage.getItem(cacheKey) || '{}') : '{}')
            const existing = cache[account.id]
            const fresh = existing && (Date.now() - existing.ts < 3 * 60 * 60 * 1000)
            let r
            if (fresh) {
              r = { ok: true, url: existing.url, sentTo: existing.sentTo || [], reused: true }
            } else {
              r = await fetch('/api/video/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: account.email || '',
                  name: account.name,
                  subject: `Video call with Farrington Development`,
                  persistent: false,
                  seed: account.name,
                  linkedTo: { accountId: account.id },
                }),
              }).then(res => res.json())
              if (r.url) {
                cache[account.id] = { url: r.url, sentTo: r.sentTo || [], ts: Date.now() }
                if (typeof window !== 'undefined') sessionStorage.setItem(cacheKey, JSON.stringify(cache))
              }
            }
            if (!r.url) return `Couldn't create the video room: ${r.error || 'unknown error'}`
            // Stash the pending call URL globally so AccountDetail can pick it up on mount
            // (handles the race where Carl wasn't already on the record yet)
            window.__fccPendingVideoCall = { url: r.url, accountId: account.id, ts: Date.now() }
            // Open the account so the inline video panel mounts
            window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: account }))
            // Also fire the event for the case where AccountDetail is already mounted
            setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:start-video-call', { detail: { url: r.url, accountId: account.id } })), 800)
            const emailNote = r.reused
              ? `Reusing the active room — ${account.name} already has the link from earlier.`
              : (account.email ? `Email invite sent to ${account.email}.` : `No email on file — share the link manually.`)
            // Auto-end Matilda's session so her audio doesn't fight the Daily.co video audio.
            // Wake-word listener resumes immediately — say "Hey Matilda" to summon her back.
            setTimeout(() => { try { conversation.endSession() } catch {} }, 3000)
            return `Video room opened for ${account.name}. ${emailNote} I'll step out so the audio is clear — say "Hey Matilda" if you need me.`
          } catch (e) {
            return `Video call failed: ${e.message}`
          }
        },
        filter_leads: async ({ campaign }) => {
          const map = {
            sponsors: 'sponsors', sponsor: 'sponsors',
            newspapers: 'newspaper_outreach', newspaper: 'newspaper_outreach', 'newspaper outreach': 'newspaper_outreach', np: 'newspaper_outreach',
            tdas: 'tda_outreach', tda: 'tda_outreach', 'tda outreach': 'tda_outreach', 'state tda': 'tda_outreach', 'state tdas': 'tda_outreach', tourism: 'tda_outreach',
            farrington: 'farrington_dev', 'farrington dev': 'farrington_dev', 'farrington development': 'farrington_dev', dev: 'farrington_dev',
          }
          const key = (campaign || '').toLowerCase().trim()
          const target = map[key]
          if (!target) return `I don't recognize the campaign "${campaign}". Try sponsors, newspapers, TDAs, or Farrington Development.`
          window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'leads' }))
          setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:set-leads-campaign', { detail: target })), 250)
          return `Showing ${target.replace('_outreach','').replace('_',' ')} leads.`
        },
        navigate_to: async ({ section }) => {
          const requested = String(section || '').toLowerCase().trim().replace(/^the\s+/, '')
          const target = resolveCommandCenterTab(requested)
          if (!target) return `I don't know a section called "${section}".`
          window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: target }))
          return `Taking you there now.`
        },
        command_center_action: async ({ action, target, value } = {}) => {
          const key = String(action || target || '').toLowerCase().trim().replace(/^the\s+/, '').replace(/\s+/g, '_')
          if (VOICE_AUTOMATION_ACTIONS.has(key)) return runVoiceAutomationAction(key, target, value)
          if (VOICE_CAMPAIGN_ACTIONS.has(key)) return runVoiceCampaignAction(key, target, value)
          if (VOICE_DOCUMENT_ACTIONS.has(key)) return runVoiceDocumentAction(key, target, value)
          const aliases = {
            ai: 'open_ai',
            assistant: 'open_ai',
            maggie: 'open_ai',
            chat: 'open_ai',
            switchboard: 'open_switchboard',
            repository: 'open_repository',
            repo: 'open_repository',
            gitea: 'open_repository',
            messages: 'open_messages',
            message: 'open_messages',
            transcription: 'arm_transcription',
            transcribe: 'arm_transcription',
            transcript: 'arm_transcription',
            meeting_capture: 'arm_transcription',
            meeting: 'arm_transcription',
            start_transcription: 'start_transcription',
            begin_transcription: 'start_transcription',
            start_meeting_capture: 'start_meeting_capture',
            begin_meeting_capture: 'start_meeting_capture',
            stop_transcription: 'save_transcription',
            save_transcription: 'save_transcription',
            finish_transcription: 'save_transcription',
            stop_meeting_capture: 'save_transcription',
            save_meeting_capture: 'save_transcription',
            notifications: 'open_notifications',
            notification: 'open_notifications',
            help: 'open_help',
            guide: 'open_help',
            settings: 'open_settings',
            solo: 'toggle_network_mode',
            multi: 'toggle_network_mode',
            network: 'toggle_network_mode',
            sidebar: 'toggle_sidebar',
            right_rail: 'toggle_right_rail',
            api_meter: 'open_api_meter',
            spend_meter: 'open_api_meter',
            usage_meter: 'open_api_meter',
            api_spend: 'open_api_spend_panel',
            api_control_panel: 'open_api_spend_panel',
          }
          const resolved = aliases[key] || key
          window.dispatchEvent(new CustomEvent('fcc:command-action', { detail: { action: resolved, target, value } }))
          if (resolved === 'arm_transcription') return `Opened transcription. Ask Carl: would you like me to begin it?`
          if (resolved === 'start_transcription' || resolved === 'start_meeting_capture') return `Starting transcription.`
          if (resolved === 'save_transcription') return `Stopping and saving the transcription to Documents and Activity.`
          if (resolved === 'transfer_to_agent') return `Use the transfer_to_agent tool with the target agent name.`
          return `Done.`
        },
        dial_phone: async ({ number, name }) => {
          const clean = (number || '').replace(/[^\d+]/g, '')
          if (!clean) return `No phone number to dial.`
          // Pre-fetch the token so we have it ready before we end Matilda's session
          let token
          try {
            const tokenRes = await fetch('/api/twilio/token').then(r => r.json())
            if (tokenRes.error) return `Couldn't start call: ${tokenRes.error}`
            token = tokenRes.token
          } catch (e) {
            return `Couldn't get Twilio token: ${e.message}`
          }
          // Stash the dial intent on window so a global listener can complete it after
          // Matilda's session ends and the mic is free
          window.__fccPendingDial = { token, clean, name, ts: Date.now() }
          // End Matilda's session so audio path frees up for Twilio
          setTimeout(() => { try { conversation.endSession() } catch {} }, 1500)
          // The actual Twilio device.connect happens in the global listener after session ends
          return `Dialing ${name || clean} — I'll step out so the call audio is clear. Say "Hey Matilda" if you need me back.`
        },
        list_upcoming_events: async ({ days } = {}) => {
          try {
            const r = await fetch('/api/calendar/events').then(r => r.json())
            const now = Date.now()
            const windowMs = (Number(days) || 7) * 86400000
            const upcoming = (r.events || [])
              .filter(e => {
                const t = new Date(e.start).getTime()
                return t >= now && t <= now + windowMs
              })
              .slice(0, 5)
            if (upcoming.length === 0) return `No events in the next ${Number(days) || 7} days.`
            const lines = upcoming.map(e => {
              const when = new Date(e.start).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              return `${when} — ${e.summary || 'untitled'}`
            })
            return `Upcoming: ${lines.join('; ')}.`
          } catch (e) { return `Calendar lookup failed: ${e.message}` }
        },
        // ── Media library — direct client tools (used by Sasha & Mark for images) ─
        create_content_draft: async ({ workflow, topic, title, audience, goal, tone, source, keywords, tags } = {}) => {
          try {
            if (!topic && !source) return `I need a topic or source material for the content draft.`
            const r = await fetch('/api/content-lab', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'generate',
                workflow: workflow || 'social-post',
                topic: topic || title || 'Untitled content draft',
                title,
                audience,
                goal,
                tone,
                source,
                keywords,
                tags,
                createdBy: agent || 'voice-agent',
              }),
            }).then(r => r.json())
            if (r.error) return `Content draft failed: ${r.error}`
            const job = r.job || {}
            return `Done. Created "${job.title || 'content draft'}" as a ${job.workflowLabel || job.workflow || 'content'} draft in Content Lab.`
          } catch (e) { return `Content draft failed: ${e.message}` }
        },
        generate_image: async ({ prompt, title, folder }) => {
          try {
            if (!prompt) return `I need a prompt — describe what to generate.`
            const r = await fetch('/api/media', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'generate', prompt, title: title || prompt.slice(0, 60), folder: folder || 'unsorted' }),
            }).then(r => r.json())
            if (r.error) return `Image gen failed: ${r.error}`
            const folderName = folder || 'unsorted'
            return `Done. Saved as "${r.item.title}" in the ${folderName} folder. Tell Carl it's ready in the media library.`
          } catch (e) { return `Image gen failed: ${e.message}` }
        },
        list_media: async ({ folder, clientName, q } = {}) => {
          try {
            // Resolve clientName to the folder server-side via the agent execute route
            if (!folder && clientName) {
              const r = await fetch('/api/agent/execute', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: 'list_media', args: { clientName, q } }),
              }).then(r => r.json())
              if (!r.ok) return `Lookup failed: ${r.error}`
              const items = r.result?.items || []
              if (!items.length) return `No images yet for ${clientName}.`
              const top = items.slice(0, 5).map(i => `"${i.title}"`).join(', ')
              return `${items.length} image${items.length === 1 ? '' : 's'} for ${clientName}: ${top}${items.length > 5 ? ', and more' : ''}. Latest id: ${items[0].id}`
            }
            const qs = new URLSearchParams()
            if (folder) qs.set('folder', folder)
            if (q) qs.set('q', q)
            const r = await fetch('/api/media?' + qs.toString()).then(r => r.json())
            const items = r.items || []
            if (!items.length) return `No images${folder ? ' in ' + folder : ''}${q ? ' matching "' + q + '"' : ''}.`
            const top = items.slice(0, 5).map(i => `"${i.title}" (${i.folder})`).join(', ')
            return `${items.length} image${items.length === 1 ? '' : 's'}: ${top}${items.length > 5 ? ', and more' : ''}. Latest id: ${items[0].id}`
          } catch (e) { return `Media lookup failed: ${e.message}` }
        },
        // High-level: capture a note linked to a client. One call.
        take_note_for_client: async ({ clientName, note, subject, agentName }) => {
          try {
            if (!clientName) return `Need a client name.`
            if (!note) return `Need the note text.`
            const r = await fetch('/api/agent/execute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: 'take_note_for_client', args: { clientName, note, subject, agentName } }),
            }).then(r => r.json())
            if (!r.ok) return `Couldn't save note: ${r.error}`
            return `Saved note on ${r.result.clientName || clientName}: "${r.result.subject}".`
          } catch (e) { return `Note save failed: ${e.message}` }
        },
        // High-level: find client → find their latest media → send email with it. One call, no chaining.
        remember_fact: async (args = {}) => {
          try {
            const fact = args.fact || args.content || args.memory || args.note || args.summary
            if (!fact || !String(fact).trim()) return `Need the fact or preference to remember.`
            const result = await agentExec('remember_fact', {
              ...args,
              fact,
              ...voiceAgentMemoryContext(),
              source: args.source || 'voice-agent',
            })
            const label = result?.memory?.topic ? ` about ${result.memory.topic}` : ''
            return `Remembered${label}. Memory id ${result?.memory?.id}.`
          } catch (e) {
            return `Memory save failed: ${e.message}`
          }
        },
        recall_memory: async (args = {}) => {
          try {
            const result = await agentExec('recall_memory', {
              ...args,
              ...voiceAgentMemoryContext(),
            })
            const memories = result?.memories || []
            if (!memories.length) return `No matching CRM memory found. I can search Obsidian or Command Vault notes if you want the playbook side.`
            const lines = memories.slice(0, 4).map(memory => {
              const topic = memory.topic ? `${memory.topic}: ` : ''
              return `${topic}${String(memory.fact || '').slice(0, 260)}`
            })
            return `I found ${result.count} CRM memor${result.count === 1 ? 'y' : 'ies'}: ${lines.join(' | ')}`
          } catch (e) {
            return `Memory recall failed: ${e.message}`
          }
        },
        list_agent_memory: async (args = {}) => {
          try {
            const result = await agentExec('list_agent_memory', {
              ...args,
              ...voiceAgentMemoryContext(),
            })
            const memories = result?.memories || []
            if (!memories.length) return `No CRM memories matched those filters.`
            const lines = memories.slice(0, 5).map(memory => {
              const topic = memory.topic || memory.scope || 'memory'
              return `${memory.id} ${topic}: ${String(memory.fact || '').slice(0, 180)}`
            })
            return `${result.count} CRM memor${result.count === 1 ? 'y' : 'ies'}: ${lines.join(' | ')}`
          } catch (e) {
            return `Memory list failed: ${e.message}`
          }
        },
        forget_memory: async (args = {}) => {
          try {
            if (!args.id && !args.memoryId && !args.ids && !args.memoryIds && !args.confirmed && !args.explicitApproval) {
              return `I need the memory id before I forget it.`
            }
            const result = await agentExec('forget_memory', {
              ...args,
              ...voiceAgentMemoryContext(),
            })
            return `Forgot ${result.forgotten || 0} CRM memor${result.forgotten === 1 ? 'y' : 'ies'}.`
          } catch (e) {
            return `Memory forget failed: ${e.message}`
          }
        },
        save_call_memory: async (args = {}) => {
          try {
            const result = await agentExec('save_call_memory', {
              ...args,
              ...voiceAgentMemoryContext(),
              source: args.source || 'voice-call-summary',
            })
            return `Saved the call memory. Memory id ${result?.memory?.id}. I stored the summary and action items, not the raw transcript.`
          } catch (e) {
            return `Call memory save failed: ${e.message}`
          }
        },
        send_media_to_client: async ({ clientName, subject, body, mediaId, mediaQuery, agent }) => {
          try {
            if (!clientName) return `clientName required.`
            // Find the meme to send
            let pickedMediaId = mediaId
            if (!pickedMediaId) {
              const lm = await fetch('/api/agent/execute', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: 'list_media', args: { clientName, q: mediaQuery } }),
              }).then(r => r.json())
              const items = lm.result?.items || []
              if (!items.length) return `No images in ${clientName}'s folder yet — generate one first.`
              pickedMediaId = items[0].id
            }
            // Send email with attachment
            const send = await fetch('/api/agent/execute', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tool: 'send_email',
                args: {
                  clientName,
                  subject: subject || 'A little something for you',
                  body: body || `Just sending this over — thought you'd like it.\n\nThanks,`,
                  attachments: [pickedMediaId],
                  agent: agent || 'social-media',
                },
              }),
            }).then(r => r.json())
            if (!send.ok) return `Send failed: ${send.error}`
            return `Sent to ${send.result.recipientName || clientName} at ${send.result.to} with the image attached.`
          } catch (e) { return `Send failed: ${e.message}` }
        },
      }
      clientTools.fcc_open_record = async ({ query, name, clientName, accountName, type, subTab, itemQuery } = {}) => (
        clientTools.open_record({
          query: query || name || clientName || accountName || '',
          type,
          subTab,
          itemQuery,
        })
      )
      clientTools.fcc_navigate_to = async ({ target, tabId, page, section, name } = {}) => (
        clientTools.navigate_to({ section: target || tabId || page || section || name || '' })
      )
      clientTools._voiceMeta = {
        agentId: resolved.id || agentIdOpt || '',
        agentName: resolved.firstName || resolved.name || '',
        provider: resolved.voiceProvider || 'elevenlabs',
      }
      // Wire the just-built handlers into the ref the hook-level stable proxy
      // dispatches through. Done before startSession so any tool the agent
      // calls in its very first turn finds a live implementation.
      clientToolsRef.current = clientTools
      // Every live voice session gets the current Command Center transfer rules.
      // This prevents stored provider prompts from asking Carl for a transfer reason.
      const isCraig = (resolved.id === 'coding') || String(resolved.firstName || resolved.name || '').toLowerCase() === 'craig'
      const identityLine = `VOICE SESSION IDENTITY: You are ${resolved.name || resolved.firstName || 'the active Farrington agent'}. Keep your normal specialty and persona, but obey the transfer, screen-control, and call-ending rules in this session context.`
      const baseAgentPrompt = String(resolved.jobDescription || res.jobDescription || '').trim()
      const personaBlock = baseAgentPrompt || `You are ${resolved.name || resolved.firstName || 'the active Farrington agent'} in Farrington Development's Command Center. Your visible role is ${resolved.role || 'voice agent'}.`
      const promptOverride = isCraig
        ? [personaBlock, '', identityLine, '', COMMAND_CENTER_LIVE_VOICE_RULES, ...factLines, '', compactCraigContext].join('\n')
        : [personaBlock, '', identityLine, '', COMMAND_CENTER_LIVE_VOICE_RULES, ...factLines].join('\n')
      const overridesPayload = { agent: { firstMessage, prompt: { prompt: promptOverride } } }
      let slowStartTimer = null
      if (typeof window !== 'undefined') {
        slowStartTimer = window.setTimeout(() => {
          logVoiceTransferEvent({
            stage: 'provider-start-slow',
            to: resolved.firstName || resolved.name,
            agentId: resolved.id || agentIdOpt || 'matilda',
            provider: selectedVoiceProvider,
            elapsedMs: Date.now() - voiceStartAt,
          })
        }, 6000)
      }
      if (useOpenAiVoice) {
        try { conversation.endSession() } catch {}
        await startOpenAiSession({ agentId: resolved.id || agentIdOpt || 'matilda', micStream, clientTools, firstMessage, silent, labRun: resolvedLabRun })
      } else {
        endOpenAiSession()
        try { conversation.setVolume({ volume: 1 }) } catch {}
        await conversation.startSession({
          signedUrl: res.signedUrl,
          clientTools,
          overrides: overridesPayload,
        })
      }
      if (slowStartTimer) window.clearTimeout(slowStartTimer)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fcc:voice-starting', { detail: { starting: false } }))
      }
      logVoiceTransferEvent({
        stage: 'provider-started',
        to: resolved.firstName || resolved.name,
        agentId: resolved.id || agentIdOpt || 'matilda',
        provider: selectedVoiceProvider,
        elapsedMs: Date.now() - voiceStartAt,
      })
      return true
    } catch (e) {
      console.log('[voice] start error', e)
      const message = e.message || 'Could not start voice session'
      setError(message)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fcc:voice-error', {
          detail: {
            message,
            agentId: agentIdOpt || selectedAgentId,
          },
        }))
      }
      logVoiceTransferEvent({
        stage: 'start-error',
        to: agentIdOpt || selectedAgentId,
        agentId: agentIdOpt || selectedAgentId,
        reason: e.message || String(e),
        elapsedMs: Date.now() - voiceStartAt,
      })
      return false
    } finally {
      startInFlightRef.current = false
      if (typeof window !== 'undefined') {
        window.__fccVoiceStarting = false
        window.dispatchEvent(new CustomEvent('fcc:voice-starting', { detail: { starting: false } }))
      }
    }
  }, [conversation, activeContext, activeSection, roster, selectedAgentId, startOpenAiSession, startLabLiveSession, startChirpTurnSession, endOpenAiSession, endLabLiveSession, hardStopVoiceSession, warmSignedUrl])

  const stop = useCallback(() => {
    hardStopVoiceSession({ reloadFallback: true, reason: 'voice hard-stopped', aggressive: true })
  }, [hardStopVoiceSession])

  const manualTransferTarget = useMemo(() => {
    const preferred = manualTransferTargetId && manualTransferTargetId !== activeAgent?.id
      ? roster.find(a => a.id === manualTransferTargetId)
      : null
    return preferred || roster.find(a => a.id !== activeAgent?.id) || null
  }, [activeAgent?.id, manualTransferTargetId, roster])

  const manualTransfer = useCallback(() => {
    const target = manualTransferTarget
    if (!target) return
    if (labLiveStatus !== 'idle') {
      endLabLiveSession({ reason: `transferring to ${target.firstName || target.name || target.id}` })
      setSelectedAgentId(target.id)
      setTimeout(() => startRef.current?.(target.id), 350)
      return
    }
    const fn = clientToolsRef.current?.transfer_to_agent
    if (typeof fn !== 'function') {
      setError('Transfer controls are not ready yet. Start a voice session first.')
      return
    }
    void fn({
      agentId: target.id,
      agentName: target.firstName || target.name || target.id,
      reason: 'Manual Command Center transfer control.',
    })
  }, [manualTransferTarget, labLiveStatus, endLabLiveSession])

  // Keep startRef pointing at latest start() so the wake-word listener can call it
  useEffect(() => { startRef.current = start }, [start])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e) => {
      const agentId = e?.detail?.agentId || e?.detail?.id || null
      if (!agentId) return
      const matched = roster.find(a => a.id === agentId)
      setSelectedAgentId(agentId)
      startRef.current?.(matched?.id || agentId, {
        silent: true,
        suppressHandoffNavigation: e?.detail?.suppressHandoffNavigation === true || e?.detail?.stayOnPage === true,
      })
    }
    window.addEventListener('fcc:start-voice-agent', handler)
    return () => window.removeEventListener('fcc:start-voice-agent', handler)
  }, [roster])

  // "Go Live" = arm listening: ear open, NO agent connected or talking. An agent only
  // comes on when summoned (wake word, or tapping the equalizer avatar) — and silently.
  useEffect(() => {
    const onListen = () => {
      setListenArmed(true)
      if (wakeSupported) {
        setError(null)
        setWakeOn(true)
      } else {
        setWakeOn(false)
        setError('Wake word is not available in this browser. Tap the live equalizer avatar and pick an agent.')
      }
    }
    const onStop = () => {
      hardStopVoiceSession({
        reloadFallback: true,
        reason: 'voice stopped from equalizer',
        aggressive: true,
      })
    }
    window.addEventListener('fcc:voice-listen', onListen)
    window.addEventListener('fcc:voice-stop', onStop)
    return () => {
      window.removeEventListener('fcc:voice-listen', onListen)
      window.removeEventListener('fcc:voice-stop', onStop)
    }
  }, [hardStopVoiceSession, wakeSupported])

  // Broadcast the armed-listening state so the header equalizer shows even before any
  // agent connects.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccVoiceListening = listenArmed
    window.dispatchEvent(new CustomEvent('fcc:voice-listening', { detail: listenArmed }))
  }, [listenArmed])

  // Persist wake toggle
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('fcc-wake-word-on', wakeOn ? '1' : '0')
    window.__fccWakeOn = wakeOn
    window.dispatchEvent(new CustomEvent('fcc:wake-on', { detail: wakeOn }))
  }, [wakeOn])

  useEffect(() => { return () => { try { conversation.endSession() } catch {}; try { endOpenAiSession() } catch {}; try { endLabLiveSession({ reason: 'voice session unmounted' }) } catch {} } }, []) // eslint-disable-line

  const showState = isActive || isConnecting
  const selectedLaunchAgent = useMemo(() => {
    return roster.find(a => a.id === selectedAgentId)
      || FALLBACK_VOICE_AGENTS.find(a => a.id === selectedAgentId)
      || null
  }, [roster, selectedAgentId])
  const agentInitials = (agent) => {
    const label = String(agent?.firstName || agent?.name || '').trim()
    if (!label) return ''
    const parts = label.split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : label.slice(0, 2)).toUpperCase()
  }
  const renderAgentBadge = (agent) => {
    if (agent?.avatar) {
      return <img src={agent.avatar} alt={agent.firstName || agent.name || 'agent'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    }
    if (agent?.emoji) {
      return <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>{agent.emoji}</span>
    }
    const initials = agentInitials(agent)
    if (initials) {
      return <span aria-hidden="true" style={{ color: '#8a6400', fontWeight: 900, fontSize: 12, letterSpacing: 0 }}>{initials}</span>
    }
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.3 6.2 20.8l1.6-6.6L2.6 9.8l6.8-.5z"/></svg>
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      {!showState ? (
        <div className="flex items-center gap-1.5">
          {roster.length > 0 && (
            <ThemedSelect
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              title="Pick which agent goes live"
              className="text-xs rounded-md px-1.5 h-8"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minWidth: 88, maxWidth: 160 }}
            >
              {roster.map(a => <option key={a.id} value={a.id}>{a.firstName || a.name}</option>)}
            </ThemedSelect>
          )}
          {/* Gold-star button + grayed equalizer. Click the star to go live (silent). */}
          <div className="inline-flex items-center gap-2" style={{ padding: '4px 10px 4px 4px', borderRadius: 9999, border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`, background: 'var(--surface2)' }}>
            <button onClick={() => start(selectedAgentId === 'matilda' ? null : selectedAgentId, { silent: true })}
              title={error ? 'Error: ' + error : `Go live with ${selectedLaunchAgent?.firstName || selectedLaunchAgent?.name || 'Matilda'} - silent listen`}
              className="shrink-0 inline-flex items-center justify-center rounded-full"
              style={{ width: 34, height: 34, background: '#fff7e0', border: '1px solid #f5b400', color: '#f5b400', overflow: 'hidden' }}>
              {renderAgentBadge(selectedLaunchAgent)}
            </button>
            <EqualizerMeter live={false} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Agent avatar button + live gold equalizer. Click the avatar to stop. */}
          <div className="inline-flex items-center gap-2" style={{ padding: '4px 10px 4px 4px', borderRadius: 9999, border: '1px solid #f5b400', background: 'rgba(245,180,0,0.10)' }}>
            <button onClick={stop}
              title={`Click ${activeAgent?.firstName || activeAgent?.name || 'the agent'} to end`}
              className="shrink-0 inline-flex items-center justify-center rounded-full overflow-hidden"
              style={{ width: 34, height: 34, background: '#fff7e0', border: '1px solid #f5b400' }}>
              {renderAgentBadge(activeAgent)}
            </button>
            <EqualizerMeter live={isActive} level={level} />
          </div>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {isConnecting ? 'connecting…' : ((activeAgent?.firstName || activeAgent?.name) ? `${activeAgent.firstName || activeAgent.name} live` : 'live')}
          </span>
          {roster.length > 1 && (
            <ThemedSelect
              value={manualTransferTarget?.id || ''}
              onChange={(e) => setManualTransferTargetId(e.target.value)}
              title="Force-transfer this live voice session to another agent"
              className="text-xs rounded-md px-1.5 h-8"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minWidth: 80, maxWidth: 120 }}
            >
              <option value="">Transfer…</option>
              {roster.filter(a => a.id !== activeAgent?.id).map(a => <option key={a.id} value={a.id}>{a.firstName || a.name}</option>)}
            </ThemedSelect>
          )}
          {manualTransferTarget?.id && (
            <button onClick={manualTransfer} title="Force-transfer this live voice session" className="shrink-0 inline-flex items-center justify-center px-2 rounded-md font-semibold" style={{ minHeight: 32, background: 'var(--surface2)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 12 }}>Transfer</button>
          )}
        </div>
      )}
      <VoiceTelemetryStrip
        active={isActive}
        connecting={isConnecting}
        speaking={isSpeaking}
        level={level}
        tick={tick}
        agent={activeAgent}
        runtime={activeVoiceRuntime}
        lastUserText={lastUserText}
        lastAgentText={lastAgentText}
      />
      {!showState && latestVoiceLabRun && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 360, padding: '6px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Voice result saved: {latestVoiceLabRun.agentName || latestVoiceLabRun.agentId} / {latestVoiceLabRun.provider}
          </span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab: 'agent-labs' } }))}
            style={{ flexShrink: 0, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--accent)', padding: '4px 7px', fontSize: 11, fontWeight: 800 }}
          >
            Lab
          </button>
        </div>
      )}
      {fullscreen && isActive && (
        <VoiceFullscreen
          isSpeaking={isSpeaking}
          isListening={!isSpeaking}
          getOutputByteFrequencyData={conversation.getOutputByteFrequencyData}
          getInputByteFrequencyData={conversation.getInputByteFrequencyData}
          lastUserTranscript={lastUserText}
          lastAgentTranscript={lastAgentText}
          onClose={() => setFullscreen(false)}
        />
      )}
      {(error || lastEvent) && (
        <div className="text-[9px] max-w-[220px] text-right truncate" style={{ color: error ? 'var(--red)' : 'var(--text-muted)' }} title={error || lastEvent}>
          {error ? '⚠ ' + error : lastEvent}
        </div>
      )}
      {wakeOn && lastHeard && !isActive && (
        <div className="text-[9px] max-w-[260px] text-right truncate" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }} title={'Last heard: ' + lastHeard}>
          heard: {lastHeard}
        </div>
      )}
    </div>
  )
}

export default function VoiceSession(props) {
  return (
    <ConversationProvider>
      <VoiceButton {...props} />
    </ConversationProvider>
  )
}
