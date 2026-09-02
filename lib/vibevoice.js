import { getCred } from './agent-creds'

export const VIBEVOICE_MODELS = ['microsoft/VibeVoice-Realtime-0.5B', 'microsoft/VibeVoice-1.5B']
export const VIBEVOICE_DEMO_URL = 'https://huggingface.co/spaces/anycoderapps/VibeVoice-Realtime-0.5B'
export const VIBEVOICE_MODEL_URL = 'https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B'
export const VIBEVOICE_REPO_URL = 'https://github.com/microsoft/VibeVoice'

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

export function getVibeVoiceEndpoint() {
  return cleanBaseUrl(
    process.env.VIBEVOICE_BASE_URL
      || process.env.VIBEVOICE_ENDPOINT
      || getCred('vibevoice endpoint')?.key
      || getCred('vibevoice')?.key
      || ''
  )
}

export function hasVibeVoiceEndpoint() {
  return !!getVibeVoiceEndpoint()
}

function cleanMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9._-]{32,}/g, '[redacted]')
    .slice(0, 500)
}

export class VibeVoiceNotConfiguredError extends Error {
  constructor() {
    super('VibeVoice is added to Voice Labs, but no self-hosted endpoint is configured yet. Use the Hugging Face demo for a quick listen, or set VIBEVOICE_BASE_URL when the local service is ready.')
    this.name = 'VibeVoiceNotConfiguredError'
    this.status = 501
  }
}

export async function generateVibeVoiceSpeech({ text, model = VIBEVOICE_MODELS[0], voiceName = 'default' } = {}) {
  const endpoint = getVibeVoiceEndpoint()
  if (!endpoint) throw new VibeVoiceNotConfiguredError()
  const input = String(text || '').trim()
  if (!input) throw new Error('text required')

  const response = await fetch(`${endpoint}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/wav, audio/mpeg, application/octet-stream' },
    body: JSON.stringify({
      model: VIBEVOICE_MODELS.includes(model) ? model : VIBEVOICE_MODELS[0],
      input,
      voice: voiceName || 'default',
      response_format: 'wav',
    }),
  })
  const audio = Buffer.from(await response.arrayBuffer())
  if (!response.ok) {
    let message = audio.toString('utf8').slice(0, 240)
    try { message = JSON.parse(message)?.error?.message || JSON.parse(message)?.error || message } catch {}
    throw new Error(`VibeVoice TTS failed: ${cleanMessage(message || `HTTP ${response.status}`)}`)
  }
  return {
    audio,
    contentType: response.headers.get('content-type') || 'audio/wav',
    voiceName: voiceName || 'default',
  }
}
