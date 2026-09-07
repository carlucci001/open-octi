export const OPENOCTI_GUIDE_INSTRUCTIONS = "You are Octi, an AI setup assistant for the user's OpenOcti installation. Always begin and respond in English by default. Change languages only when the user explicitly requests another language; do not infer a language preference from their name, accent, background sounds, or an uncertain transcription. Give clear, expert help with first setup, model keys, agents, voice, sample data, imports, and finding features. Keep answers concise and ask one question at a time. You cannot perform workspace actions in this setup conversation. Never claim you changed settings or records, and never request passwords or API keys in chat. Do not assume an integration or agent is connected just because a key has been saved. Be clear that you are an AI assistant."

const TEXT_PROVIDERS = ['orcarouter', 'openai', 'anthropic', 'gemini', 'openrouter']

export function resolveOpenOctiAssistant(providers = []) {
  const configured = new Set(providers.filter(provider => provider.status === 'configured').map(provider => provider.id))
  const textProvider = TEXT_PROVIDERS.find(id => configured.has(id)) || null
  const voice = configured.has('openai')
    ? { provider: 'openai', label: 'OpenAI', voice: 'ballad', voiceLabel: 'Ballad' }
    : configured.has('gemini')
      ? { provider: 'gemini', label: 'Google Gemini', voice: 'Charon', voiceLabel: 'Charon' }
      : null
  const message = voice
    ? `Your setup assistant is ready in text and voice. ${voice.label} voice (${voice.voiceLabel}) is selected automatically. Start voice when you are ready.`
    : textProvider
      ? 'Your expert setup assistant is ready in text. Add an OpenAI or Google Gemini key whenever you want to talk. You can continue setup now.'
      : 'Add an OrcaRouter, OpenAI, Anthropic, Google Gemini, or OpenRouter model key to use your setup assistant. OpenAI is recommended for first setup with voice.'
  return { textProvider, voice, language: 'en', message }
}
