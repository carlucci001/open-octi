import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { PRESET_BY_ID } from '@/lib/agent-presets'
import { normalizeVoiceProfile } from '@/lib/voiceProfile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCTION_VOICE_LOCKED_IDS = new Set(['main', 'coding'])
const OPENAI_VOICE_FALLBACK_IDS = new Set(['finance-manager'])

function resolveVoiceProfile(crmId, local = {}, rosterBinding = null) {
  const explicitVoice = local?.voice || {}
  const hasExplicitProvider = Boolean(explicitVoice.provider || explicitVoice.voiceProvider)
  const preset = PRESET_BY_ID[crmId] || {}
  if (preset?.runtimeProvider === 'deerflow-hetzner') {
    const deerFlowVoice = preset.voice || {}
    return normalizeVoiceProfile({
      ...deerFlowVoice,
      provider: 'chirp3',
      chirp3Model: explicitVoice.chirp3Model || deerFlowVoice.chirp3Model || 'chirp3-hd',
      chirp3Voice: explicitVoice.chirp3Voice || explicitVoice.voiceName || deerFlowVoice.chirp3Voice,
      voiceName: explicitVoice.chirp3Voice || explicitVoice.voiceName || deerFlowVoice.chirp3Voice,
    })
  }
  const base = rosterBinding
    ? {
        agentId: rosterBinding.agentId,
        voiceName: rosterBinding.voiceName,
        firstName: rosterBinding.firstName,
        name: rosterBinding.name,
      }
    : {}

  if (rosterBinding && explicitVoice.locked === true && explicitVoice.provider !== 'elevenlabs') {
    return normalizeVoiceProfile({ ...base, provider: 'elevenlabs', locked: true })
  }

  if (hasExplicitProvider) {
    return normalizeVoiceProfile({ ...base, ...explicitVoice })
  }

  if (PRODUCTION_VOICE_LOCKED_IDS.has(crmId) || rosterBinding) {
    return normalizeVoiceProfile({ ...base, provider: 'elevenlabs' })
  }

  if (local?.draft === true && explicitVoice.provider === 'openai') {
    return normalizeVoiceProfile(explicitVoice)
  }

  if (OPENAI_VOICE_FALLBACK_IDS.has(crmId)) {
    return normalizeVoiceProfile({ provider: 'openai', openaiVoice: 'ash', openaiModel: 'gpt-realtime' })
  }

  return normalizeVoiceProfile({ provider: 'elevenlabs' })
}

function profileFields(profile) {
  return {
    voiceProfile: profile,
    voiceProvider: profile.provider,
    voiceName: profile.voiceName,
    openaiVoice: profile.openaiVoice || null,
    openaiModel: profile.openaiModel || null,
    geminiVoice: profile.geminiVoice || null,
    geminiModel: profile.geminiModel || null,
    chirp3Voice: profile.chirp3Voice || null,
    chirp3Model: profile.chirp3Model || null,
    liveMode: profile.liveMode,
    liveReady: profile.liveReady,
    providerReady: profile.providerReady,
    fallbackProvider: profile.fallbackProvider,
  }
}

function avatarFields(local = {}, preset = {}) {
  return {
    avatar: local.avatar || local.avatarUrl || preset.avatar || preset.avatarUrl || null,
    avatarPrompt: local.avatarPrompt || preset.avatarPrompt || null,
    emoji: local.emoji || preset.emoji || null,
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  const defaultCfg = readData('voice-agent.json') || {}
  const roster = readData('voice-agent-roster.json') || {}
  const agentsFile = readData('agents.json') || { agents: {} }

  const out = []

  // Matilda's primary and wake-word runtime is Gemini Live. Keep the historical
  // ElevenLabs binding in storage for rollback only; do not expose it as the
  // active Matilda roster entry or allow the roster binding to overwrite this.
  {
    const matildaLocal = agentsFile.agents?.matilda || {}
    const geminiProfile = normalizeVoiceProfile({
      provider: 'gemini',
      // Do not inherit the saved TTS model/voice here. Primary Matilda is the
      // full-duplex Gemini Live operator, not the Voice Lab TTS preview.
      geminiModel: 'gemini-3.1-flash-live-preview',
      geminiVoice: 'Kore',
      voiceName: 'Kore',
    })
    out.push({
      id: 'matilda',
      firstName: 'Matilda',
      name: matildaLocal.name || defaultCfg.name || 'Matilda',
      ...profileFields(geminiProfile),
      agentId: null,
      role: matildaLocal.title || matildaLocal.role || 'Default voice assistant — Gemini Live',
      jobDescription: matildaLocal.jobDescription || '',
      avatar: matildaLocal.avatar || matildaLocal.avatarUrl || null,
      avatarPrompt: matildaLocal.avatarPrompt || null,
      emoji: matildaLocal.emoji || null,
      category: matildaLocal.category || null,
      // Never inherit a non-voice runtime here; Matilda must stay on Gemini Live.
      runtimeProvider: null,
    })
  }

  const seen = new Set(out.map(a => a.id))
  for (const [crmId, r] of Object.entries(roster)) {
    // Skip metadata keys (e.g. 'lastUpdated') that live alongside the agent
    // bindings in voice-agent-roster.json — they are not agents and were
    // leaking into the roster as a junk 'lastUpdated' entry.
    if (!r || typeof r !== 'object' || Array.isArray(r) || !r.agentId) continue
    if (seen.has(crmId)) continue
    const local = agentsFile.agents?.[crmId] || {}
    const preset = PRESET_BY_ID[crmId] || {}
    const profile = resolveVoiceProfile(crmId, local, r)
    seen.add(crmId)
    out.push({
      id: crmId,
      firstName: r.firstName,
      name: r.name,
      ...profileFields(profile),
      agentId: r.agentId,
      role: local.title || local.role || '',
      jobDescription: local.jobDescription || '',
      ...avatarFields(local, preset),
      category: local.category || null,
      runtimeProvider: preset.runtimeProvider || local.runtimeProvider || null,
    })
  }

  for (const [crmId, local] of Object.entries(agentsFile.agents || {})) {
    const openAiFallback = OPENAI_VOICE_FALLBACK_IDS.has(crmId)
    const browserLiveVoice = ['openai', 'gemini', 'chirp3', 'vibevoice'].includes(local.voice?.provider)
    if (seen.has(crmId) || (!openAiFallback && (local.draft !== true || !browserLiveVoice))) continue
    const preset = PRESET_BY_ID[crmId] || {}
    const name = local.name || crmId
    const profile = resolveVoiceProfile(crmId, local, null)
    out.push({
      id: crmId,
      firstName: local.firstName || preset.name || name.split(/\s+/)[0],
      name,
      ...profileFields(profile),
      agentId: null,
      role: local.title || local.role || preset.role || '',
      jobDescription: local.jobDescription || preset.jobDescription || '',
      ...avatarFields(local, preset),
      category: local.category || null,
      runtimeProvider: preset.runtimeProvider || local.runtimeProvider || null,
    })
    seen.add(crmId)
  }

  for (const [crmId, preset] of Object.entries(PRESET_BY_ID)) {
    const localOnlyRuntime = preset?.runtimeProvider && preset.runtimeProvider !== 'openclaw-hetzner'
    const browserLiveVoice = ['openai', 'gemini', 'chirp3', 'vibevoice'].includes(preset?.voice?.provider)
    if (seen.has(crmId) || !localOnlyRuntime || !browserLiveVoice) continue
    const profile = resolveVoiceProfile(crmId, preset, null)
    out.push({
      id: crmId,
      firstName: preset.firstName || String(preset.name || crmId).split(/\s+/)[0],
      name: preset.name || crmId,
      ...profileFields(profile),
      agentId: null,
      role: preset.role || preset.title || '',
      jobDescription: preset.jobDescription || '',
      ...avatarFields({}, preset),
      category: preset.category || null,
      runtimeProvider: preset.runtimeProvider,
    })
    seen.add(crmId)
  }

  for (const crmId of OPENAI_VOICE_FALLBACK_IDS) {
    if (seen.has(crmId)) continue
    const preset = PRESET_BY_ID[crmId]
    if (!preset) continue
    const profile = normalizeVoiceProfile({ provider: 'openai', openaiVoice: 'ash', openaiModel: 'gpt-realtime' })
    out.push({
      id: crmId,
      firstName: preset.name.split(/\s+/)[0],
      name: preset.name,
      ...profileFields(profile),
      agentId: null,
      role: preset.role || '',
      jobDescription: preset.jobDescription || '',
      ...avatarFields({}, preset),
      category: preset.category || null,
    })
  }

  return NextResponse.json({ ok: true, agents: out, count: out.length })
}
