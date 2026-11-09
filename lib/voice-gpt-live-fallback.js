
// GPT-Live is the primary voice for every non-phone agent; Gemini Live is the
// one-shot fallback. These helpers hold the pure decisions so they can be tested
// without mounting VoiceSession.

export const GPT_LIVE_MODEL_ID = 'gpt-live-1'
export const GEMINI_DEFAULT_FALLBACK_VOICE = 'Kore'

// Phone-bound agents answer a Twilio line through ElevenLabs. They never move.
const PHONE_BOUND_AGENT_IDS = new Set(['receptionist', 'wnctimes-doreen'])

export function isGptLiveAgent(agent) {
  if (!agent || typeof agent !== 'object') return false
  const profile = agent.voiceProfile || {}
  const provider = profile.provider || agent.voiceProvider
  const model = profile.openaiModel || agent.openaiModel
  return provider === 'openai' && model === GPT_LIVE_MODEL_ID
}

export function gptLiveAgentName(agent, agentId = '') {
  return String(agent?.firstName || agent?.name || agentId || '').trim() || 'the agent'
}

export function geminiFallbackVoiceFor(agent) {
  const voice = agent?.geminiFallbackVoice || agent?.voiceProfile?.geminiVoice || agent?.geminiVoice
  return String(voice || '').trim() || GEMINI_DEFAULT_FALLBACK_VOICE
}

// A failed GPT-Live start may retry exactly once on Gemini Live, and only for an
// agent that is really on GPT-Live, is not phone-bound, and declares a Gemini
// fallback voice. `fallbackFrom` marks the retry so it can never loop.
export function shouldFallbackToGemini(agent, startOpts = {}) {
  if (!isGptLiveAgent(agent)) return false
  if (startOpts?.fallbackFrom || startOpts?.forceProvider) return false
  if (PHONE_BOUND_AGENT_IDS.has(agent.id) || agent.voiceProfile?.locked === true) return false
  return typeof agent.geminiFallbackVoice === 'string' && agent.geminiFallbackVoice.trim() !== ''
}

// `forceProvider: 'gemini'` is only honoured for an agent that is not locked to a
// phone line. Any other forced provider is ignored (the fallback is Gemini only).
export function wantsForcedGemini(agent, startOpts = {}) {
  return startOpts?.forceProvider === 'gemini' && Boolean(agent) && agent.voiceProfile?.locked !== true
    && !PHONE_BOUND_AGENT_IDS.has(agent.id)
}

// The roster entry as the Gemini branch should see it: the agent's Gemini voice,
// no OpenAI voice or model leaking into the Gemini token request.
export function withGeminiFallbackVoice(agent) {
  if (!agent) return agent
  const voice = geminiFallbackVoiceFor(agent)
  const geminiModel = agent.geminiModel || agent.voiceProfile?.geminiModel || ''
  const rest = { ...agent }
  const profileRest = { ...(agent.voiceProfile || {}) }
  for (const key of ['openaiModel', 'openaiVoice']) { delete rest[key]; delete profileRest[key] }
  return {
    ...rest,
    voiceProvider: 'gemini',
    voiceName: voice,
    geminiVoice: voice,
    geminiModel,
    model: geminiModel,
    voiceProfile: { ...profileRest, provider: 'gemini', voiceName: voice, geminiVoice: voice, geminiModel, model: geminiModel, locked: false },
  }
}
