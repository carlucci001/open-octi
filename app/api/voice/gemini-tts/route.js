import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { logVoiceUsage } from '@/lib/voiceUsage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODELS = [
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
]

const VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda',
  'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus',
  'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
  'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]

function getGeminiKey() {
  return getCred('gemini')?.key || getCred('google gemini')?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

function getAgentStyle(agentId) {
  if (!agentId) return ''
  const agentsFile = readData('agents.json') || { agents: {} }
  const agent = agentsFile.agents?.[agentId]
  if (!agent) return ''
  const lines = [
    `Read as ${agent.name || agent.firstName || agentId}, ${agent.title || agent.role || 'a Farrington Command Center agent'}.`,
    agent.voiceProfile ? `Voice profile: ${agent.voiceProfile}.` : '',
    agent.description ? `Role context: ${agent.description}` : '',
    'Keep the delivery natural, clear, professional, and demo-ready.',
  ]
  return lines.filter(Boolean).join(' ')
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

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  return NextResponse.json({
    ok: true,
    defaultModel: MODELS[0],
    models: MODELS,
    defaultVoice: 'Kore',
    voices: VOICES,
    output: {
      contentType: 'audio/wav',
      sourcePcm: { sampleRate: 24000, channels: 1, bitsPerSample: 16 },
    },
  })
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const apiKey = getGeminiKey()
  if (!apiKey) return jsonError('No Gemini API key in vault or environment', 400)

  let body
  try { body = await request.json() } catch { return jsonError('Bad JSON body', 400) }

  const text = cleanText(body.text || body.prompt)
  if (!text) return jsonError('text is required', 400)

  const model = MODELS.includes(body.model) ? body.model : MODELS[0]
  const voiceName = VOICES.includes(body.voiceName) ? body.voiceName : 'Kore'
  const agentStyle = getAgentStyle(cleanText(body.agentId || ''))
  const style = cleanText(body.style || agentStyle)
  const ttsText = style ? `${style}\n\nTranscript:\n${text}` : text
  const requestId = Math.random().toString(36).slice(2, 9)

  console.log(`[gemini-tts] start requestId=${requestId} model=${model} voice=${voiceName} chars=${text.length}`)

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: ttsText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
      model,
    }),
  })

  const raw = await upstream.text()
  let data
  try { data = JSON.parse(raw) } catch { data = null }
  if (!upstream.ok) {
    const message = data?.error?.message || raw.slice(0, 240) || `Gemini TTS HTTP ${upstream.status}`
    console.warn(`[gemini-tts] failed requestId=${requestId} status=${upstream.status} message=${message.slice(0, 180)}`)
    return jsonError(`Gemini TTS failed: ${message}`, 502, { status: upstream.status, model })
  }

  const inline = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData || part.inline_data)
  const b64 = inline?.inlineData?.data || inline?.inline_data?.data
  if (!b64) {
    console.warn(`[gemini-tts] no-audio requestId=${requestId}`)
    return jsonError('Gemini TTS returned no audio data', 502, { model })
  }

  const pcm = Buffer.from(b64, 'base64')
  const wav = wavFromPcm(pcm)
  logVoiceUsage({
    provider: 'gemini',
    model,
    voiceName,
    agentId: cleanText(body.agentId || ''),
    textChars: text.length,
    durationSeconds: pcmDurationSeconds(pcm),
    area: 'voice-lab',
  })
  console.log(`[gemini-tts] ok requestId=${requestId} model=${model} voice=${voiceName} bytes=${wav.length}`)

  return new NextResponse(wav, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(wav.length),
      'Cache-Control': 'no-store',
      'X-Gemini-TTS-Model': model,
      'X-Gemini-TTS-Voice': voiceName,
      'X-Gemini-TTS-Request': requestId,
    },
  })
}
