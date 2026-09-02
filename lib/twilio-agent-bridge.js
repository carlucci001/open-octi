const DEFAULT_STREAM_PATH = '/twilio-agent-stream'
const DEFAULT_BRIDGE_PORT = '8788'
const SUPPORTED_PROVIDERS = ['openai', 'gemini']
const OPENAI_REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'marin', 'sage', 'shimmer', 'verse']
const GEMINI_LIVE_VOICES = ['Kore', 'Charon', 'Puck', 'Orus', 'Algenib', 'Gacrux', 'Schedar', 'Sulafat', 'Achird', 'Vindemiatrix', 'Zephyr', 'Aoede']

function clean(value, fallback = '', max = 160) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (text || fallback).slice(0, max)
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function providerFrom(value) {
  const provider = clean(value, 'openai', 40).toLowerCase()
  return SUPPORTED_PROVIDERS.includes(provider) ? provider : 'openai'
}

function defaultModel(provider) {
  return provider === 'gemini' ? 'gemini-2.5-flash-native-audio-preview-12-2025' : 'gpt-realtime'
}

function defaultVoice(provider) {
  return provider === 'gemini' ? 'Kore' : 'marin'
}

function normalizeVoice(provider, value) {
  const voice = clean(value, defaultVoice(provider), 80)
  if (provider === 'gemini') return GEMINI_LIVE_VOICES.includes(voice) ? voice : 'Kore'
  return OPENAI_REALTIME_VOICES.includes(voice) ? voice : 'marin'
}

function derivePublicStreamUrl(requestUrl, env = process.env) {
  const explicit = clean(env.TWILIO_AGENT_STREAM_URL || env.NEXT_PUBLIC_TWILIO_AGENT_STREAM_URL, '', 500)
  if (explicit) return explicit
  const url = new URL(requestUrl || env.NEXT_PUBLIC_APP_URL || 'https://openocti.local')
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.host)) {
    const publicUrl = new URL(env.NEXT_PUBLIC_APP_URL || 'https://openocti.local')
    return `wss://${publicUrl.host}${DEFAULT_STREAM_PATH}`
  }
  return `wss://${url.host}${DEFAULT_STREAM_PATH}`
}

function bridgeStatus(env = process.env) {
  const streamUrl = clean(env.TWILIO_AGENT_STREAM_URL || env.NEXT_PUBLIC_TWILIO_AGENT_STREAM_URL, '', 500)
  const publicBaseUrl = clean(env.TWILIO_AGENT_VOICE_BASE_URL || env.NEXT_PUBLIC_APP_URL || 'https://openocti.local', '', 500)
  return {
    ok: true,
    enabled: clean(env.TWILIO_AGENT_BRIDGE_ENABLED, 'false', 20).toLowerCase() === 'true',
    providerDefault: providerFrom(env.TWILIO_AGENT_PROVIDER || 'openai'),
    openaiConfigured: Boolean(env.OPENAI_API_KEY),
    geminiConfigured: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
    bridgeTokenConfigured: Boolean(env.TWILIO_AGENT_BRIDGE_TOKEN),
    streamUrlConfigured: Boolean(streamUrl),
    streamUrl: streamUrl || `wss://${new URL(publicBaseUrl).host}${DEFAULT_STREAM_PATH}`,
    webhookUrl: `${publicBaseUrl.replace(/\/$/, '')}/api/twilio/agent-voice`,
    localService: {
      port: clean(env.TWILIO_AGENT_BRIDGE_PORT, DEFAULT_BRIDGE_PORT, 12),
      path: DEFAULT_STREAM_PATH,
      script: 'server/twilio-agent-stream.mjs',
      serviceName: 'farrington-voice-bridge.service',
    },
    providers: [
      { id: 'openai', label: 'OpenAI Realtime', ready: Boolean(env.OPENAI_API_KEY), liveReady: true, audio: 'g711_ulaw passthrough' },
      { id: 'gemini', label: 'Gemini Live', ready: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY), liveReady: false, audio: 'adapter slot; requires mulaw/PCM conversion before phone use' },
    ],
  }
}

function buildTwilioAgentTwiML({
  requestUrl,
  streamUrl,
  env = process.env,
  agentId = 'matilda',
  provider = 'openai',
  model,
  voiceName,
  leaseId = '',
  clientId = '',
  prompt = '',
  greeting = '',
} = {}) {
  const cleanProvider = providerFrom(provider)
  const cleanAgent = clean(agentId, 'matilda', 80)
  const resolvedStreamUrl = clean(streamUrl, '', 500) || derivePublicStreamUrl(requestUrl)
  const resolvedModel = clean(model, defaultModel(cleanProvider), 120)
  const resolvedVoice = normalizeVoice(cleanProvider, voiceName)
  const params = [
    ['agentId', cleanAgent],
    ['provider', cleanProvider],
    ['model', resolvedModel],
    ['voiceName', resolvedVoice],
    ['leaseId', clean(leaseId, '', 80)],
    ['clientId', clean(clientId, '', 80)],
    ['prompt', clean(prompt, '', 1000)],
    ['greeting', clean(greeting, '', 300)],
    ['bridgeToken', clean(env.TWILIO_AGENT_BRIDGE_TOKEN, '', 500)],
  ].filter(([, value]) => value)

  const parameterXml = params
    .map(([name, value]) => `      <Parameter name="${xmlEscape(name)}" value="${xmlEscape(value)}" />`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream name="${xmlEscape(`fcc-${cleanAgent}-${Date.now().toString(36)}`)}" url="${xmlEscape(resolvedStreamUrl)}">
${parameterXml}
    </Stream>
  </Connect>
  <Say voice="alice">The Farrington agent bridge has ended. Goodbye.</Say>
</Response>`
}

module.exports = {
  DEFAULT_BRIDGE_PORT,
  DEFAULT_STREAM_PATH,
  SUPPORTED_PROVIDERS,
  OPENAI_REALTIME_VOICES,
  GEMINI_LIVE_VOICES,
  buildTwilioAgentTwiML,
  bridgeStatus,
  clean,
  defaultModel,
  defaultVoice,
  derivePublicStreamUrl,
  normalizeVoice,
  providerFrom,
  xmlEscape,
}
