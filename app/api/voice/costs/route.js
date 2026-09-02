import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { requireCapability } from '@/lib/permissions'
import { summarizeVoiceUsage } from '@/lib/voiceUsage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRICE_SOURCE_DATE = '2026-06-08'
const AUDIO_TOKENS_PER_MINUTE = 1920
const OPENAI_INPUT_AUDIO_TOKENS_PER_SECOND = 10
const OPENAI_OUTPUT_AUDIO_TOKENS_PER_SECOND = 20
const DEFAULT_CALLER_TALK_SHARE = 0.55
const DEFAULT_AGENT_TALK_SHARE = 0.45

const SCENARIOS = [100, 1000, 5000]

const SOURCES = [
  {
    label: 'Gemini API pricing',
    url: 'https://ai.google.dev/gemini-api/docs/pricing',
    note: 'Gemini 2.5 TTS prices are per 1M text input tokens and per 1M audio output tokens.',
  },
  {
    label: 'Gemini audio token guidance',
    url: 'https://ai.google.dev/gemini-api/docs/audio',
    note: 'Gemini represents one minute of audio as 1,920 tokens.',
  },
  {
    label: 'Google Cloud Text-to-Speech pricing',
    url: 'https://cloud.google.com/text-to-speech/pricing',
    note: 'Chirp 3 HD voices include 1M free characters, then charge per character.',
  },
  {
    label: 'Gemini Live API pricing',
    url: 'https://ai.google.dev/gemini-api/docs/pricing',
    note: 'Gemini native audio Live API prices are token based for audio input and output.',
  },
  {
    label: 'OpenAI API pricing',
    url: 'https://openai.com/api/pricing/',
    note: 'GPT-Realtime-2 audio input/output pricing is token based.',
  },
  {
    label: 'ElevenLabs pricing',
    url: 'https://elevenlabs.io/pricing',
    note: 'ElevenLabs TTS plan minutes and overage ranges vary by subscription tier.',
  },
]

const PROVIDER_PRICING = [
  {
    id: 'gemini-live-flash-native-audio',
    provider: 'Gemini',
    label: 'Gemini Live full-duplex',
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    type: 'realtime',
    quality: 'Full-duplex voice agent with barge-in',
    liveRoute: 'Live agent conversation route',
    perMinute: estimateGeminiLiveMinute({ inputPerMillion: 3, outputPerMillion: 12 }),
    pricingBasis: '$3 / 1M audio input tokens + $12 / 1M audio output tokens; assumes 55% caller / 45% agent talk split',
  },
  {
    id: 'gemini-flash',
    provider: 'Gemini',
    label: 'Gemini Flash TTS',
    model: 'gemini-2.5-flash-preview-tts',
    type: 'tts',
    quality: 'Budget one-way narration and accessibility audio',
    liveRoute: 'Article listen buttons, previews, non-interactive narration',
    perMinute: estimateGeminiTtsPerMinute({ inputPerMillion: 0.5, outputPerMillion: 10 }),
    pricingBasis: '$0.50 / 1M text input tokens + $10 / 1M audio output tokens',
  },
  {
    id: 'gemini-pro',
    provider: 'Gemini',
    label: 'Gemini Pro TTS',
    model: 'gemini-2.5-pro-preview-tts',
    type: 'tts',
    quality: 'Higher-quality one-way narration and accessibility audio',
    liveRoute: 'Article listen buttons, previews, non-interactive narration',
    perMinute: estimateGeminiTtsPerMinute({ inputPerMillion: 1, outputPerMillion: 20 }),
    pricingBasis: '$1 / 1M text input tokens + $20 / 1M audio output tokens',
  },
  {
    id: 'google-chirp3-hd',
    provider: 'Google Cloud',
    label: 'Chirp 3 HD voices',
    model: 'chirp3-hd',
    type: 'tts',
    quality: 'High-definition one-way voice demos and narration',
    liveRoute: 'Voice Lab and OpenClaw-backed sandbox; production phone routing requires an explicit router switch',
    perMinute: estimateChirp3PerMinute(),
    pricingBasis: 'First 1M characters free, then $30 / 1M characters; estimate assumes 900 spoken characters per minute',
  },
  {
    id: 'eleven-business-low-latency',
    provider: 'ElevenLabs',
    label: 'ElevenLabs low-latency TTS',
    model: 'Business tier low-latency',
    type: 'tts',
    quality: 'Production-ready hosted voice',
    liveRoute: 'Live for ElevenLabs-bound agents',
    perMinute: 0.05,
    pricingBasis: 'As low as $0.05 / minute on Business tier',
  },
  {
    id: 'eleven-standard-overage',
    provider: 'ElevenLabs',
    label: 'ElevenLabs standard TTS',
    model: 'Plan overage estimate',
    type: 'tts',
    quality: 'Realistic non-Business overage planning',
    liveRoute: 'Live for ElevenLabs-bound agents',
    perMinute: 0.17,
    pricingBasis: 'Approximate extra-minute rate from paid plan table',
  },
  {
    id: 'openai-realtime-2',
    provider: 'OpenAI',
    label: 'OpenAI Realtime',
    model: 'gpt-realtime-2',
    type: 'realtime',
    quality: 'Highest capability, most expensive live conversation path',
    liveRoute: 'Live only where CRM/OpenAI Realtime is wired',
    perMinute: estimateOpenAiRealtimeMinute(),
    pricingBasis: '$32 / 1M audio input tokens + $64 / 1M audio output tokens; assumes 55% caller / 45% agent talk split',
  },
  {
    id: 'vibevoice-local',
    provider: 'VibeVoice',
    label: 'VibeVoice self-hosted',
    model: 'microsoft/VibeVoice-Realtime-0.5B',
    type: 'local',
    quality: 'Internal experimental TTS candidate',
    liveRoute: 'Voice Labs only until a self-hosted endpoint is configured',
    perMinute: 0,
    pricingBasis: 'No vendor API fee; GPU/server/ops cost only',
  },
  {
    id: 'chatterbox-local',
    provider: 'Chatterbox',
    label: 'Chatterbox local',
    model: 'ResembleAI/chatterbox',
    type: 'local',
    quality: 'Lowest vendor cost if local rendering is installed',
    liveRoute: 'Not installed on Ubuntu today',
    perMinute: 0,
    pricingBasis: 'No vendor API fee; local hardware/ops cost only',
  },
]

function estimateGeminiTtsPerMinute({ inputPerMillion, outputPerMillion }) {
  const textTokensPerSpokenMinute = 260
  const textCost = (textTokensPerSpokenMinute * inputPerMillion) / 1_000_000
  const audioCost = (AUDIO_TOKENS_PER_MINUTE * outputPerMillion) / 1_000_000
  return roundMoney(textCost + audioCost, 5)
}

function estimateOpenAiRealtimeMinute() {
  const callerAudioSeconds = 60 * DEFAULT_CALLER_TALK_SHARE
  const agentAudioSeconds = 60 * DEFAULT_AGENT_TALK_SHARE
  const inputTokens = callerAudioSeconds * OPENAI_INPUT_AUDIO_TOKENS_PER_SECOND
  const outputTokens = agentAudioSeconds * OPENAI_OUTPUT_AUDIO_TOKENS_PER_SECOND
  return roundMoney((inputTokens * 32 + outputTokens * 64) / 1_000_000, 5)
}

function estimateChirp3PerMinute() {
  const charsPerSpokenMinute = 900
  return roundMoney((charsPerSpokenMinute * 30) / 1_000_000, 5)
}

function estimateGeminiLiveMinute({ inputPerMillion, outputPerMillion }) {
  const inputAudioTokens = AUDIO_TOKENS_PER_MINUTE * DEFAULT_CALLER_TALK_SHARE
  const outputAudioTokens = AUDIO_TOKENS_PER_MINUTE * DEFAULT_AGENT_TALK_SHARE
  return roundMoney((inputAudioTokens * inputPerMillion + outputAudioTokens * outputPerMillion) / 1_000_000, 5)
}

function roundMoney(value, places = 4) {
  const factor = 10 ** places
  return Math.round(Number(value || 0) * factor) / factor
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000), cache: 'no-store' })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

function daysThisMonth() {
  const now = new Date()
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  return Math.max(1, Math.ceil((Date.now() - start) / 86400000))
}

function getKey(...names) {
  for (const name of names) {
    const key = getCred(name)?.key
    if (key) return key
  }
  return ''
}

async function getOpenAiCurrent() {
  const key = getKey('openai')
  const base = {
    id: 'openai',
    provider: 'OpenAI',
    status: key ? 'configured' : 'missing_key',
    currentMonthCost: null,
    note: key ? 'Billing endpoint may require an organization-admin key.' : 'No OpenAI key found in the vault.',
  }
  if (!key) return base
  const now = Math.floor(Date.now() / 1000)
  const d = new Date()
  const startOfMonth = Math.floor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getTime() / 1000)
  const result = await jfetch(`https://api.openai.com/v1/organization/costs?start_time=${startOfMonth}&end_time=${now}&bucket_width=1d`, {
    headers: { Authorization: `Bearer ${key}` },
  }).catch(e => ({ ok: false, status: 0, body: { error: { message: e.message } } }))
  if (!result.ok) return { ...base, status: 'configured_no_billing_access', error: result.body?.error?.message || `HTTP ${result.status}` }
  const buckets = result.body?.data || []
  const currentMonthCost = buckets.reduce((sum, bucket) => {
    return sum + (bucket.results || []).reduce((inner, item) => inner + Number(item.amount?.value || 0), 0)
  }, 0)
  return {
    ...base,
    status: 'active',
    currentMonthCost: roundMoney(currentMonthCost),
    projectedMonthCost: roundMoney((currentMonthCost / daysThisMonth()) * 30),
    note: 'Current month cost from OpenAI organization costs API.',
  }
}

async function getElevenLabsCurrent() {
  const key = getKey('elevenlabs', 'eleven')
  const base = {
    id: 'elevenlabs',
    provider: 'ElevenLabs',
    status: key ? 'configured' : 'missing_key',
    currentMonthCost: null,
    note: key ? 'Subscription usage is read from ElevenLabs.' : 'No ElevenLabs key found in the vault.',
  }
  if (!key) return base
  const result = await jfetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': key },
  }).catch(e => ({ ok: false, status: 0, body: { detail: { message: e.message } } }))
  if (!result.ok) return { ...base, status: 'error', error: result.body?.detail?.message || `HTTP ${result.status}` }
  const sub = result.body?.subscription || {}
  return {
    ...base,
    status: 'active',
    plan: sub.tier || 'unknown',
    charactersUsed: sub.character_count ?? null,
    characterLimit: sub.character_limit ?? null,
    percentUsed: sub.character_limit ? Math.round((sub.character_count / sub.character_limit) * 100) : null,
    nextReset: sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toISOString() : null,
    note: 'Plan usage from ElevenLabs. Per-call agent LLM pass-through cost still needs vendor-side detailed costs.',
  }
}

async function getGeminiCurrent() {
  const key = getKey('gemini', 'google gemini')
  const base = {
    id: 'gemini',
    provider: 'Gemini',
    status: key ? 'configured' : 'missing_key',
    currentMonthCost: null,
    note: key ? 'Gemini billing totals are not exposed through this API key; use Google Cloud Billing for exact spend.' : 'No Gemini key found in the vault.',
  }
  if (!key) return base
  const result = await jfetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': key },
  }).catch(e => ({ ok: false, status: 0, body: { error: { message: e.message } } }))
  if (!result.ok) return { ...base, status: 'error', error: result.body?.error?.message || `HTTP ${result.status}` }
  return { ...base, status: 'active', modelsAvailable: result.body?.models?.length || 0 }
}

async function getChirp3Current() {
  const key = getKey('google cloud text to speech', 'google text to speech', 'google cloud tts', 'google tts', 'google cloud', 'google gemini', 'gemini')
  return {
    id: 'chirp3',
    provider: 'Google Chirp 3 HD',
    status: key ? 'configured' : 'missing_key',
    currentMonthCost: null,
    freeCharacters: 1_000_000,
    note: key
      ? 'Google Cloud Text-to-Speech key is present. Exact usage comes from Google Cloud Billing; CRM samples are metered locally.'
      : 'Add a Google Cloud Text-to-Speech API key to enable Chirp 3 HD samples.',
  }
}

function buildScenarios() {
  return SCENARIOS.map(minutes => ({
    minutes,
    providers: PROVIDER_PRICING.map(item => ({
      id: item.id,
      label: item.label,
      provider: item.provider,
      cost: roundMoney(item.perMinute * minutes, 2),
      perMinute: item.perMinute,
    })).sort((a, b) => a.cost - b.cost),
  }))
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  const [openai, elevenlabs, gemini, chirp3] = await Promise.all([
    getOpenAiCurrent(),
    getElevenLabsCurrent(),
    getGeminiCurrent(),
    getChirp3Current(),
  ])
  const crmTracked = summarizeVoiceUsage()

  return NextResponse.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    priceSourceDate: PRICE_SOURCE_DATE,
    audioTokensPerMinute: AUDIO_TOKENS_PER_MINUTE,
    current: [openai, elevenlabs, gemini, chirp3],
    crmTracked,
    pricing: PROVIDER_PRICING,
    scenarios: buildScenarios(),
    recommendation: {
      demo: 'Expose the high-quality live audio lane as a selectable business option; demo volume is low enough that quality can drive the choice.',
      highTraffic: 'Show per-minute cost and latency side by side instead of blocking premium realtime providers. The owner decides when quality is worth the spend.',
      financeAgent: 'Frank can use any configured live provider after the route is wired and measured against latency, barge-in, tool delay, and voice quality.',
    },
    sources: SOURCES,
  })
}
