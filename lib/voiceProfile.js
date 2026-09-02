const DEFAULT_MODELS = {
  elevenlabs: 'eleven_multilingual_v2',
  openai: 'gpt-realtime',
  gemini: 'gemini-2.5-flash-native-audio-preview-12-2025',
  chirp3: 'chirp3-hd',
  vibevoice: 'microsoft/VibeVoice-Realtime-0.5B',
  chatterbox: 'ResembleAI/chatterbox',
}

const DEFAULT_VOICES = {
  openai: 'marin',
  gemini: 'Kore',
  chirp3: 'en-US-Chirp3-HD-Charon',
  vibevoice: 'default',
}

const PROVIDER_ALIASES = {
  eleven: 'elevenlabs',
  eleven_labs: 'elevenlabs',
  'eleven-labs': 'elevenlabs',
  elevenlabs: 'elevenlabs',
  openai: 'openai',
  realtime: 'openai',
  gemini: 'gemini',
  google: 'gemini',
  chirp3: 'chirp3',
  chirp: 'chirp3',
  'google-chirp': 'chirp3',
  'google-chirp3': 'chirp3',
  'google chirp': 'chirp3',
  'google chirp 3': 'chirp3',
  vibevoice: 'vibevoice',
  'vibe-voice': 'vibevoice',
  chatterbox: 'chatterbox',
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function normalizeProvider(value, profile) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw) return PROVIDER_ALIASES[raw] || raw

  if (profile.openaiModel || profile.openaiVoice) return 'openai'
  if (profile.geminiModel || profile.geminiVoice) return 'gemini'
  if (profile.chirp3Model || profile.chirp3Voice) return 'chirp3'
  if (profile.voiceId || profile.agentId || profile.elevenlabsAgentId) return 'elevenlabs'
  return 'elevenlabs'
}

function normalizeMargin(value) {
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function defaultFallbackProvider(provider) {
  if (provider === 'openai') return 'elevenlabs'
  return 'openai'
}

function resolveLiveMode(provider, profile, model, agentId) {
  const explicit = firstPresent(profile.liveMode, profile.live, profile.realtime)
  if (explicit !== undefined) return Boolean(explicit)
  if (provider === 'openai') return true
  if (provider === 'elevenlabs') return Boolean(agentId)
  if (provider === 'gemini') return true
  return false
}

function normalizeSource(input) {
  if (!isObject(input)) return {}
  if (!isObject(input.voice)) return { ...input }

  return {
    ...input,
    ...input.voice,
  }
}

export function normalizeVoiceProfile(input = {}) {
  const source = normalizeSource(input)
  const provider = normalizeProvider(firstPresent(source.provider, source.voiceProvider), source)
  const agentId = firstPresent(source.agentId, source.elevenlabsAgentId)
  const voiceId = firstPresent(source.voiceId, source.elevenlabsVoiceId)

  const openaiModel = firstPresent(
    source.openaiModel,
    provider === 'openai' ? source.model : undefined,
    provider === 'openai' ? DEFAULT_MODELS.openai : undefined
  )
  const openaiVoice = firstPresent(
    source.openaiVoice,
    provider === 'openai' ? source.voiceName : undefined,
    provider === 'openai' ? DEFAULT_VOICES.openai : undefined
  )
  const geminiModel = firstPresent(
    source.geminiModel,
    provider === 'gemini' ? source.model : undefined,
    provider === 'gemini' ? DEFAULT_MODELS.gemini : undefined
  )
  const geminiVoice = firstPresent(
    source.geminiVoice,
    provider === 'gemini' ? source.voiceName : undefined,
    provider === 'gemini' ? DEFAULT_VOICES.gemini : undefined
  )
  const chirp3Model = firstPresent(
    source.chirp3Model,
    provider === 'chirp3' ? source.model : undefined,
    provider === 'chirp3' ? DEFAULT_MODELS.chirp3 : undefined
  )
  const chirp3Voice = firstPresent(
    source.chirp3Voice,
    provider === 'chirp3' ? source.voiceName : undefined,
    provider === 'chirp3' ? DEFAULT_VOICES.chirp3 : undefined
  )

  const model = firstPresent(
    provider === 'openai' ? openaiModel : undefined,
    provider === 'gemini' ? geminiModel : undefined,
    provider === 'chirp3' ? chirp3Model : undefined,
    source.model,
    source.elevenModel,
    source.elevenlabsModel,
    DEFAULT_MODELS[provider]
  )

  const voiceName = firstPresent(
    source.voiceName,
    provider === 'openai' ? openaiVoice : undefined,
    provider === 'gemini' ? geminiVoice : undefined,
    provider === 'chirp3' ? chirp3Voice : undefined,
    source.firstName,
    source.name,
    DEFAULT_VOICES[provider]
  )

  const liveMode = resolveLiveMode(provider, source, model, agentId)
  const readiness = {
    hasProvider: Boolean(provider),
    hasModel: Boolean(model),
    hasVoiceName: Boolean(voiceName),
    hasVoiceId: Boolean(voiceId),
    hasAgentId: Boolean(agentId),
    elevenLabsReady: Boolean(agentId || voiceId),
    openAiReady: Boolean(openaiModel && openaiVoice),
    geminiReady: Boolean(geminiModel && geminiVoice),
    chirp3Ready: Boolean(chirp3Model && chirp3Voice),
  }

  readiness.providerReady = provider === 'openai'
    ? readiness.openAiReady
    : provider === 'gemini'
      ? readiness.geminiReady
      : provider === 'chirp3'
        ? readiness.chirp3Ready
      : provider === 'elevenlabs'
        ? readiness.elevenLabsReady
        : readiness.hasModel
  readiness.liveReady = Boolean(liveMode && readiness.providerReady)

  return {
    ...source,
    provider,
    voiceProvider: provider,
    model,
    voiceName,
    liveMode,
    tier: firstPresent(source.tier, null),
    marginPercent: normalizeMargin(source.marginPercent),
    fallbackProvider: normalizeProvider(firstPresent(source.fallbackProvider, defaultFallbackProvider(provider)), {}),
    agentId,
    voiceId,
    openaiModel,
    openaiVoice,
    geminiModel,
    geminiVoice,
    chirp3Model,
    chirp3Voice,
    readiness,
    isReady: readiness.providerReady,
    providerReady: readiness.providerReady,
    liveReady: readiness.liveReady,
    elevenLabsReady: readiness.elevenLabsReady,
    openAiReady: readiness.openAiReady,
    geminiReady: readiness.geminiReady,
    chirp3Ready: readiness.chirp3Ready,
    hasVoiceId: readiness.hasVoiceId,
    hasAgentId: readiness.hasAgentId,
  }
}

export default normalizeVoiceProfile
