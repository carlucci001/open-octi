import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { buildVoiceUsageEvent, logVoiceUsage } from '@/lib/voiceUsage'
import { generateVibeVoiceSpeech, hasVibeVoiceEndpoint, VIBEVOICE_DEMO_URL, VIBEVOICE_MODEL_URL, VIBEVOICE_MODELS, VIBEVOICE_REPO_URL } from '@/lib/vibevoice'
import { PRESET_BY_ID } from '@/lib/agent-presets'
import { CHIRP3_MODEL, CHIRP3_VOICES } from '@/lib/chirp3-tts'
import { isOpenOcti } from '@/lib/edition'
import { resolveProviderKey } from '@/lib/openocti-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GEMINI_MODELS = ['gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']
const GEMINI_CHIRP_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const GEMINI_VOICES = ['Kore', 'Leda', 'Charon', 'Puck', 'Orus', 'Algenib', 'Gacrux', 'Schedar', 'Sulafat', 'Achird', 'Vindemiatrix', 'Zephyr', 'Aoede', 'Algieba', 'Despina', 'Rasalgethi']
const ELEVEN_MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5']
const VIBEVOICE_VOICES = ['default', 'internal-test']

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

function getGeminiKey() {
  if (isOpenOcti()) return resolveProviderKey('gemini').key
  return getCred('gemini')?.key || getCred('google gemini')?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function geminiVoiceFromChirp3(voiceName) {
  const shortName = String(voiceName || '').split('-').pop()
  return GEMINI_VOICES.includes(shortName) ? shortName : 'Aoede'
}

function usageHeader(event) {
  return Buffer.from(JSON.stringify(buildVoiceUsageEvent(event))).toString('base64url')
}

function getElevenKey() {
  if (isOpenOcti()) return resolveProviderKey('elevenlabs').key
  return getCred('elevenlabs')?.key || getCred('eleven')?.key || process.env.ELEVENLABS_API_KEY || ''
}

function getAgentStyle(agentId) {
  if (!agentId) return ''
  const agentsFile = readData('agents.json') || { agents: {} }
  const agent = agentsFile.agents?.[agentId] || PRESET_BY_ID[agentId]
  if (!agent) return ''
  return [
    `Read as ${agent.name || agent.firstName || agentId}, ${agent.title || agent.role || 'a OpenOcti agent'}.`,
    agent.voiceProfile ? `Voice profile: ${agent.voiceProfile}.` : '',
    agent.description ? `Role context: ${agent.description}` : '',
    'Keep the delivery natural, clear, professional, and demo-ready.',
  ].filter(Boolean).join(' ')
}

function wavFromPcm(pcm, { channels = 1, sampleRate = 24000, bitsPerSample = 16 } = {}) {
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function pcmDurationSeconds(pcm, { channels = 1, sampleRate = 24000, bitsPerSample = 16 } = {}) {
  const bytesPerSecond = sampleRate * channels * bitsPerSample / 8
  return bytesPerSecond ? pcm.length / bytesPerSecond : 0
}

function resolveElevenVoice(agentId) {
  const roster = readData('voice-agent-roster.json') || {}
  const defaultCfg = readData('voice-agent.json') || {}
  if (!agentId || agentId === 'matilda') {
    return { voiceId: defaultCfg.voiceId, voiceName: defaultCfg.voiceName || 'Matilda' }
  }
  const binding = roster[agentId]
  return { voiceId: binding?.voiceId, voiceName: binding?.voiceName || binding?.firstName || binding?.name || agentId }
}

// A login greeting is one of three fixed sentences per person, and Gemini
// speech takes about three seconds to generate one. A greeting that has been
// generated once is served from disk; the key covers everything that shapes
// the audio, so a changed voice, model or agent profile produces a new clip.
const LOGIN_WELCOME_CACHE_DIR = path.join(process.cwd(), 'data', 'voice-sample-cache', 'login-welcome')
const LOGIN_WELCOME_CACHE_LIMIT = 300
const LOGIN_WELCOME_PATTERN = /^Good (morning|afternoon|evening) ([^\n]{1,120})$/
const LOGIN_WELCOME_WARM_DELAY_MS = 25000

function isLoginWelcomeText(text) {
  return LOGIN_WELCOME_PATTERN.test(text)
}

function loginWelcomeCacheFile({ text, model, voiceName, agentId }) {
  const key = createHash('sha256')
    .update(JSON.stringify([model, voiceName, agentId, getAgentStyle(agentId), text]))
    .digest('hex')
  return path.join(LOGIN_WELCOME_CACHE_DIR, `${key}.wav`)
}

function storeLoginWelcome(file, wav) {
  try {
    fs.mkdirSync(LOGIN_WELCOME_CACHE_DIR, { recursive: true })
    const partial = `${file}.${process.pid}.partial`
    fs.writeFileSync(partial, wav)
    fs.renameSync(partial, file)
    const clips = fs.readdirSync(LOGIN_WELCOME_CACHE_DIR).filter(name => name.endsWith('.wav'))
    if (clips.length <= LOGIN_WELCOME_CACHE_LIMIT) return
    clips
      .map(name => ({ name, at: fs.statSync(path.join(LOGIN_WELCOME_CACHE_DIR, name)).mtimeMs }))
      .sort((a, b) => a.at - b.at)
      .slice(0, clips.length - LOGIN_WELCOME_CACHE_LIMIT)
      .forEach(clip => fs.rmSync(path.join(LOGIN_WELCOME_CACHE_DIR, clip.name), { force: true }))
  } catch {
    // The cache is an optimisation. A full or read-only disk must not break the greeting.
  }
}

async function renderLoginWelcome(request, file) {
  const response = await generateGemini(request)
  if (response.status !== 200) return response
  const wav = Buffer.from(await response.arrayBuffer())
  storeLoginWelcome(file, wav)
  return new NextResponse(wav, { headers: response.headers })
}

// Once one time-of-day greeting exists for a person, quietly prepare the other
// two so the first morning or evening sign-in is not the slow one. Spaced out
// to stay inside the speech provider's per-minute limit.
function warmOtherLoginWelcomes(request) {
  const match = LOGIN_WELCOME_PATTERN.exec(request.text)
  if (!match) return
  const others = ['morning', 'afternoon', 'evening'].filter(part => part !== match[1])
  others.forEach((part, index) => {
    const sibling = { ...request, text: `Good ${part} ${match[2]}` }
    const timer = setTimeout(() => {
      const file = loginWelcomeCacheFile(sibling)
      if (fs.existsSync(file)) return
      renderLoginWelcome(sibling, file).catch(() => {})
    }, LOGIN_WELCOME_WARM_DELAY_MS * (index + 1))
    timer.unref?.()
  })
}

async function generateCachedLoginWelcome(request) {
  const file = loginWelcomeCacheFile(request)
  try {
    const wav = fs.readFileSync(file)
    if (wav.length > 44) {
      return new NextResponse(wav, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(wav.length),
          'Cache-Control': 'no-store',
          'X-Voice-Lab-Provider': 'gemini',
          'X-Voice-Lab-Model': request.model,
          'X-Voice-Lab-Voice': request.voiceName,
          'X-Voice-Lab-Cache': 'hit',
        },
      })
    }
  } catch {
    // Not generated yet.
  }
  const response = await renderLoginWelcome(request, file)
  if (response.status === 200) warmOtherLoginWelcomes(request)
  return response
}

async function generateGemini({ text, model, voiceName, agentId, usageProvider = 'gemini', displayVoiceName = voiceName }) {
  const apiKey = getGeminiKey()
  if (!apiKey) return jsonError('No Gemini API key in vault or environment', 400)
  const ttsText = `${getAgentStyle(agentId)}\n\nTranscript:\n${text}`.trim()
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: ttsText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
      model,
    }),
  })
  const raw = await upstream.text()
  let data
  try { data = JSON.parse(raw) } catch { data = null }
  if (!upstream.ok) return jsonError(`Gemini TTS failed: ${data?.error?.message || raw.slice(0, 240)}`, 502)
  const inline = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData || part.inline_data)
  const b64 = inline?.inlineData?.data || inline?.inline_data?.data
  if (!b64) return jsonError('Gemini TTS returned no audio data', 502)
  const pcm = Buffer.from(b64, 'base64')
  const wav = wavFromPcm(pcm)
  const usageEvent = {
    provider: usageProvider,
    model,
    voiceName: displayVoiceName,
    agentId,
    textChars: text.length,
    durationSeconds: pcmDurationSeconds(pcm),
    area: 'voice-lab',
  }
  logVoiceUsage(usageEvent)
  return new NextResponse(wav, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(wav.length),
      'Cache-Control': 'no-store',
      'X-Voice-Lab-Provider': usageProvider,
      'X-Voice-Lab-Model': model,
      'X-Voice-Lab-Voice': displayVoiceName,
      'X-Voice-Lab-Usage': usageHeader(usageEvent),
    },
  })
}

async function generateElevenLabs({ text, model, agentId }) {
  const apiKey = getElevenKey()
  if (!apiKey) return jsonError('No ElevenLabs API key in vault or environment', 400)
  const { voiceId, voiceName } = resolveElevenVoice(agentId)
  if (!voiceId) return jsonError('Selected agent does not have an ElevenLabs voice binding', 400, { agentId })
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  const audio = Buffer.from(await upstream.arrayBuffer())
  if (!upstream.ok) {
    let message = audio.toString('utf8').slice(0, 240)
    try { message = JSON.parse(message)?.detail?.message || message } catch {}
    return jsonError(`ElevenLabs TTS failed: ${message}`, 502)
  }
  const usageEvent = {
    provider: 'elevenlabs',
    model,
    voiceName,
    agentId,
    textChars: text.length,
    durationSeconds: Math.max(1, text.length / 15),
    area: 'voice-lab',
  }
  logVoiceUsage(usageEvent)
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.length),
      'Cache-Control': 'no-store',
      'X-Voice-Lab-Provider': 'elevenlabs',
      'X-Voice-Lab-Model': model,
      'X-Voice-Lab-Voice': voiceName,
      'X-Voice-Lab-Usage': usageHeader(usageEvent),
    },
  })
}

async function generateVibeVoice({ text, model, voiceName, agentId }) {
  const result = await generateVibeVoiceSpeech({ text, model, voiceName })
  const usageEvent = {
    provider: 'vibevoice',
    model: VIBEVOICE_MODELS.includes(model) ? model : VIBEVOICE_MODELS[0],
    voiceName: result.voiceName,
    agentId,
    textChars: text.length,
    durationSeconds: Math.max(1, text.length / 15),
    area: 'voice-lab',
  }
  logVoiceUsage(usageEvent)
  return new NextResponse(result.audio, {
    headers: {
      'Content-Type': result.contentType,
      'Content-Length': String(result.audio.length),
      'Cache-Control': 'no-store',
      'X-Voice-Lab-Provider': 'vibevoice',
      'X-Voice-Lab-Model': VIBEVOICE_MODELS.includes(model) ? model : VIBEVOICE_MODELS[0],
      'X-Voice-Lab-Voice': result.voiceName,
      'X-Voice-Lab-Usage': usageHeader(usageEvent),
    },
  })
}

async function generateChirp3({ text, voiceName, agentId }) {
  return generateGemini({
    text,
    model: GEMINI_CHIRP_TTS_MODEL,
    voiceName: geminiVoiceFromChirp3(voiceName),
    agentId,
    usageProvider: 'chirp3',
    displayVoiceName: voiceName,
  })
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  return NextResponse.json({
    ok: true,
    providers: [
      { id: 'gemini', label: 'Gemini TTS', models: GEMINI_MODELS, voices: GEMINI_VOICES, defaultModel: GEMINI_MODELS[0], defaultVoice: 'Kore', enabled: Boolean(getGeminiKey()), credential: 'Google Gemini API key', setupHref: '/settings/models#gemini', note: 'Uses Google Gemini speech generation. Provider access and quota are checked when you run a test.' },
      {
        id: 'chirp3',
        label: 'Chirp aliases (Gemini TTS)',
        models: [CHIRP3_MODEL],
        voices: CHIRP3_VOICES,
        defaultModel: CHIRP3_MODEL,
        defaultVoice: CHIRP3_VOICES[0],
        enabled: Boolean(getGeminiKey()),
        credential: 'Google Gemini API key',
        setupHref: '/settings/models#gemini',
        note: 'This lab maps Chirp voice names to Gemini TTS. It uses the Gemini API, not the Google Cloud Chirp 3 HD service.',
        orchestration: { callableRoute: '/api/voice/lab-tts', provider: 'chirp3', audioFormat: 'wav' },
      },
      { id: 'elevenlabs', label: 'ElevenLabs Real Audio', models: ELEVEN_MODELS, voices: [], defaultModel: ELEVEN_MODELS[0], enabled: Boolean(getElevenKey()), credential: 'ElevenLabs API key', setupHref: '/settings/models#elevenlabs', note: 'Speech tests also need an ElevenLabs voice available to your account. Live agents need a separate agent binding.' },
      { id: 'vibevoice', label: 'VibeVoice Internal', models: VIBEVOICE_MODELS, voices: VIBEVOICE_VOICES, defaultModel: VIBEVOICE_MODELS[0], defaultVoice: 'default', enabled: hasVibeVoiceEndpoint(), demoUrl: VIBEVOICE_DEMO_URL, modelUrl: VIBEVOICE_MODEL_URL, repoUrl: VIBEVOICE_REPO_URL, note: hasVibeVoiceEndpoint() ? 'Self-hosted VibeVoice endpoint is configured.' : 'Use the Hugging Face demo now; self-hosted CRM rendering needs VIBEVOICE_BASE_URL.' },
      { id: 'chatterbox', label: 'Chatterbox', models: ['ResembleAI/chatterbox'], voices: [], defaultModel: 'ResembleAI/chatterbox', enabled: false, note: 'Chatterbox server rendering is not installed on Ubuntu yet.' },
    ],
  })
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  let body
  try { body = await request.json() } catch { return jsonError('Bad JSON body', 400) }
  const provider = cleanText(body.provider || 'gemini', 30)
  const text = cleanText(body.text || body.prompt)
  if (!text) return jsonError('text is required', 400)
  const agentId = cleanText(body.agentId || '')
  if (provider === 'gemini') {
    const geminiRequest = {
      text,
      agentId,
      model: GEMINI_MODELS.includes(body.model) ? body.model : GEMINI_MODELS[0],
      voiceName: GEMINI_VOICES.includes(body.voiceName) ? body.voiceName : 'Kore',
    }
    return isLoginWelcomeText(text) ? generateCachedLoginWelcome(geminiRequest) : generateGemini(geminiRequest)
  }
  if (provider === 'elevenlabs') {
    return generateElevenLabs({
      text,
      agentId,
      model: ELEVEN_MODELS.includes(body.model) ? body.model : ELEVEN_MODELS[0],
    })
  }
  if (provider === 'chirp3') {
    return generateChirp3({
      text,
      agentId,
      voiceName: CHIRP3_VOICES.includes(body.voiceName) ? body.voiceName : CHIRP3_VOICES[0],
    })
  }
  if (provider === 'vibevoice') {
    return generateVibeVoice({
      text,
      agentId,
      model: VIBEVOICE_MODELS.includes(body.model) ? body.model : VIBEVOICE_MODELS[0],
      voiceName: VIBEVOICE_VOICES.includes(body.voiceName) ? body.voiceName : 'default',
    })
  }
  if (provider === 'chatterbox') return jsonError('Chatterbox server rendering is not installed on Ubuntu yet.', 501)
  return jsonError(`Unknown voice lab provider: ${provider}`, 400)
}
