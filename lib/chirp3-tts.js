import { getCred } from '@/lib/agent-creds'

export const CHIRP3_MODEL = 'chirp3-hd'
export const CHIRP3_VOICES = [
  'en-US-Chirp3-HD-Achernar',
  'en-US-Chirp3-HD-Achird',
  'en-US-Chirp3-HD-Algenib',
  'en-US-Chirp3-HD-Algieba',
  'en-US-Chirp3-HD-Alnilam',
  'en-US-Chirp3-HD-Aoede',
  'en-US-Chirp3-HD-Autonoe',
  'en-US-Chirp3-HD-Callirrhoe',
  'en-US-Chirp3-HD-Charon',
  'en-US-Chirp3-HD-Despina',
  'en-US-Chirp3-HD-Enceladus',
  'en-US-Chirp3-HD-Erinome',
  'en-US-Chirp3-HD-Fenrir',
  'en-US-Chirp3-HD-Gacrux',
  'en-US-Chirp3-HD-Iapetus',
  'en-US-Chirp3-HD-Kore',
  'en-US-Chirp3-HD-Laomedeia',
  'en-US-Chirp3-HD-Leda',
  'en-US-Chirp3-HD-Orus',
  'en-US-Chirp3-HD-Puck',
  'en-US-Chirp3-HD-Pulcherrima',
  'en-US-Chirp3-HD-Rasalgethi',
  'en-US-Chirp3-HD-Sadachbia',
  'en-US-Chirp3-HD-Sadaltager',
  'en-US-Chirp3-HD-Schedar',
  'en-US-Chirp3-HD-Sulafat',
  'en-US-Chirp3-HD-Umbriel',
  'en-US-Chirp3-HD-Vindemiatrix',
  'en-US-Chirp3-HD-Zephyr',
  'en-US-Chirp3-HD-Zubenelgenubi',
]

export const CHIRP3_PRICING_BASIS = 'Google Cloud Chirp 3 HD: first 1M characters free, then $30 / 1M characters.'

export function getChirp3Key() {
  return (
    getCred('google cloud text to speech')?.key ||
    getCred('google text to speech')?.key ||
    getCred('google cloud tts')?.key ||
    getCred('google tts')?.key ||
    getCred('google cloud')?.key ||
    getCred('google gemini')?.key ||
    getCred('gemini')?.key ||
    process.env.GOOGLE_CLOUD_TTS_API_KEY ||
    process.env.GOOGLE_TTS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  )
}

export function resolveChirp3Voice(voiceName) {
  return CHIRP3_VOICES.includes(voiceName) ? voiceName : CHIRP3_VOICES[0]
}

export function estimateChirp3DurationSeconds(text) {
  return Math.max(1, String(text || '').length / 15)
}

export async function synthesizeChirp3({ text, voiceName }) {
  const apiKey = getChirp3Key()
  if (!apiKey) {
    throw new Error('No Google Cloud Text-to-Speech key found. Add GOOGLE_CLOUD_TTS_API_KEY or a Google Cloud TTS credential.')
  }
  const resolvedVoice = resolveChirp3Voice(voiceName)
  const upstream = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'en-US', name: resolvedVoice },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  const raw = await upstream.text()
  let data
  try { data = JSON.parse(raw) } catch { data = null }
  if (!upstream.ok) {
    throw new Error(data?.error?.message || raw.slice(0, 240) || `Google Cloud TTS HTTP ${upstream.status}`)
  }
  if (!data?.audioContent) throw new Error('Google Cloud TTS returned no audio content')
  return {
    audio: Buffer.from(data.audioContent, 'base64'),
    contentType: 'audio/mpeg',
    voiceName: resolvedVoice,
    model: CHIRP3_MODEL,
    durationSeconds: estimateChirp3DurationSeconds(text),
  }
}
