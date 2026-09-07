import { resolveOpenOctiAssistant } from './openocti-assistant'

export const OPENOCTI_VOICE_STARTERS = [
  { id: 'main', name: 'Maggie', role: 'Operations assistant' },
  { id: 'coding', name: 'Craig', role: 'Coding assistant' },
  { id: 'social-media', name: 'Sasha', role: 'Social media assistant' },
  { id: 'legal', name: 'Linda', role: 'Legal information assistant' },
  { id: 'matilda', name: 'Matilda', role: 'Voice assistant' },
  { id: 'octi-guide', name: 'Octi', role: 'Setup assistant' },
]

export const OPENOCTI_REALTIME_MODEL = 'gpt-realtime-2.1'
export const OPENOCTI_AGENT_VOICES = {
  main: { openai: 'marin', gemini: 'Kore' },
  coding: { openai: 'cedar', gemini: 'Puck' },
  'social-media': { openai: 'coral', gemini: 'Aoede' },
  legal: { openai: 'sage', gemini: 'Leda' },
  matilda: { openai: 'shimmer', gemini: 'Zephyr' },
  'octi-guide': { openai: 'ballad', gemini: 'Charon' },
}

function agentVoices(id) {
  return OPENOCTI_AGENT_VOICES[id === 'octi' ? 'octi-guide' : id] || OPENOCTI_AGENT_VOICES['octi-guide']
}

export function openOctiVoiceProfile(providers = [], agentId = 'octi-guide') {
  const voice = resolveOpenOctiAssistant(providers).voice
  const assigned = agentVoices(agentId)
  if (!voice) return { provider: 'none', liveReady: false, providerReady: false, setupMessage: 'Add an OpenAI or Google Gemini key in Models & Keys to enable voice.' }
  return voice.provider === 'openai'
    ? { provider: 'openai', openaiVoice: assigned.openai, openaiModel: OPENOCTI_REALTIME_MODEL, voiceName: assigned.openai, liveReady: true, providerReady: true }
    : { provider: 'gemini', geminiVoice: assigned.gemini, geminiModel: 'gemini-3.1-flash-live-preview', voiceName: assigned.gemini, liveReady: true, providerReady: true }
}

export function openOctiVoiceAgent(id, local = {}, preset = {}) {
  const starter = OPENOCTI_VOICE_STARTERS.find(agent => agent.id === id || (id === 'octi' && agent.id === 'octi-guide'))
  if (!starter) return null
  const assigned = agentVoices(id)
  return {
    ...starter, ...preset, ...local, id,
    name: local.name || starter.name,
    firstName: starter.name,
    role: local.role || local.title || starter.role,
    voice: { provider: 'openai', openaiVoice: assigned.openai, openaiModel: OPENOCTI_REALTIME_MODEL, geminiVoice: assigned.gemini },
  }
}
