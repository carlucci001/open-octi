import { NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getCred } from '@/lib/agent-creds'
import { readData, writeData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { buildVoiceUsageEvent, logVoiceUsage } from '@/lib/voiceUsage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'voice-aliases.json'
const CACHE_DIR = path.join(process.cwd(), 'data', 'voice-sample-cache')
const GEMINI_MODELS = ['gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']
const GEMINI_VOICES = ['Kore', 'Charon', 'Puck', 'Orus', 'Algenib', 'Gacrux', 'Schedar', 'Sulafat', 'Achird', 'Vindemiatrix', 'Zephyr', 'Aoede', 'Algieba', 'Despina', 'Rasalgethi']
const DEFAULT_PHRASE = 'Hello, I am ready to help with calm confidence today.'

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function jsonError(message, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function getGeminiKey() {
  return getCred('gemini')?.key || getCred('google gemini')?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
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

function cacheKey({ agentId, model, voiceName, phrase }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ agentId, model, voiceName, phrase }))
    .digest('hex')
    .slice(0, 24)
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.wav`)
}

function loadLibrary() {
  const data = readData(FILE) || {}
  return {
    lastUpdated: data.lastUpdated || null,
    aliases: data.aliases || {},
    favorites: data.favorites || {},
    samples: data.samples || {},
  }
}

function saveLibrary(data) {
  writeData(FILE, { ...data, lastUpdated: new Date().toISOString() })
}

async function synthGemini({ text, model, voiceName, agentId }) {
  const apiKey = getGeminiKey()
  if (!apiKey) throw new Error('No Gemini API key in vault or environment')
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
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
  if (!upstream.ok) throw new Error(data?.error?.message || raw.slice(0, 240) || `Gemini TTS HTTP ${upstream.status}`)
  const inline = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData || part.inline_data)
  const b64 = inline?.inlineData?.data || inline?.inline_data?.data
  if (!b64) throw new Error('Gemini TTS returned no audio data')
  const pcm = Buffer.from(b64, 'base64')
  const wav = wavFromPcm(pcm)
  const usage = buildVoiceUsageEvent({
    provider: 'gemini',
    model,
    voiceName,
    agentId,
    textChars: text.length,
    durationSeconds: pcmDurationSeconds(pcm),
    area: 'voice-alias-preview',
  })
  logVoiceUsage({
    provider: 'gemini',
    model,
    voiceName,
    agentId,
    textChars: text.length,
    durationSeconds: usage.durationSeconds,
    area: 'voice-alias-preview',
  })
  return { wav, usage }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  const url = new URL(request.url)
  const key = cleanText(url.searchParams.get('sampleKey'), 80)
  if (key) {
    const file = cachePath(key)
    if (!fs.existsSync(file)) return jsonError('Sample not found', 404)
    const audio = fs.readFileSync(file)
    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, max-age=86400',
        'X-Voice-Sample-Cache': 'hit',
      },
    })
  }
  const library = loadLibrary()
  return NextResponse.json({
    ok: true,
    voices: GEMINI_VOICES,
    defaultPhrase: DEFAULT_PHRASE,
    ...library,
  })
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  let body
  try { body = await request.json() } catch { return jsonError('Bad JSON body', 400) }

  const action = cleanText(body.action || 'sample', 40)
  const voiceName = GEMINI_VOICES.includes(body.voiceName) ? body.voiceName : 'Kore'
  const model = GEMINI_MODELS.includes(body.model) ? body.model : GEMINI_MODELS[0]
  const agentId = cleanText(body.agentId || 'finance-manager', 80)
  const library = loadLibrary()

  if (action === 'alias') {
    const label = cleanText(body.label || '', 80)
    const key = `gemini:${voiceName}`
    library.aliases[key] = { provider: 'gemini', voiceName, label, updatedAt: new Date().toISOString() }
    saveLibrary(library)
    return NextResponse.json({ ok: true, alias: library.aliases[key], aliases: library.aliases })
  }

  if (action === 'favorite') {
    const key = `gemini:${voiceName}`
    library.favorites[key] = !!body.favorite
    saveLibrary(library)
    return NextResponse.json({ ok: true, voiceName, favorite: library.favorites[key], favorites: library.favorites })
  }

  if (action === 'sample') {
    const phrase = cleanText(body.phrase || DEFAULT_PHRASE, 240)
    const key = cacheKey({ agentId, model, voiceName, phrase })
    const file = cachePath(key)
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
    let usage = library.samples[key]?.usage || null
    if (!fs.existsSync(file) || body.force === true) {
      const generated = await synthGemini({ text: phrase, model, voiceName, agentId })
      fs.writeFileSync(file, generated.wav)
      usage = generated.usage
    }
    library.samples[key] = {
      key,
      provider: 'gemini',
      voiceName,
      model,
      agentId,
      phrase,
      contentType: 'audio/wav',
      url: `/api/voice/aliases?sampleKey=${encodeURIComponent(key)}`,
      usage,
      generatedAt: new Date().toISOString(),
    }
    saveLibrary(library)
    return NextResponse.json({ ok: true, sample: library.samples[key], aliases: library.aliases, favorites: library.favorites })
  }

  return jsonError(`Unknown action: ${action}`, 400)
}
