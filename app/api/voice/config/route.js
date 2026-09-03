import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData, writeData } from '@/lib/dataStore'
import { requireAdmin } from '@/lib/auth'
import { isOpenOcti } from '@/lib/edition'
import { resolveProviderKey } from '@/lib/openocti-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getKey() {
  if (isOpenOcti()) return resolveProviderKey('elevenlabs').key || null
  const cred = getCred('elevenlabs') || getCred('eleven')
  return cred?.key || process.env.ELEVENLABS_API_KEY || null
}

async function elevenFetch(path, key, init = {}) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const body = await r.text()
  let json
  try { json = JSON.parse(body) } catch { json = { raw: body } }
  return { ok: r.ok, status: r.status, data: json }
}

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const key = getKey()
  if (!key) return NextResponse.json({ error: 'No ElevenLabs API key configured' }, { status: 400 })

  const cfg = readData('voice-agent.json') || {}
  const agentId = cfg.agentId
  if (!agentId) return NextResponse.json({ error: 'No agent configured' }, { status: 400 })

  const [voices, agent] = await Promise.all([
    elevenFetch('/v1/voices', key),
    elevenFetch('/v1/convai/agents/' + agentId, key),
  ])

  if (!voices.ok) return NextResponse.json({ error: `Voices fetch failed: ${voices.status}` }, { status: 502 })
  if (!agent.ok) return NextResponse.json({ error: `Agent fetch failed: ${agent.status}` }, { status: 502 })

  const currentVoiceId = agent.data?.conversation_config?.tts?.voice_id || null
  const currentVoice = (voices.data?.voices || []).find(v => v.voice_id === currentVoiceId) || null

  return NextResponse.json({
    agentId,
    agentName: cfg.name || agent.data?.name || 'Matilda',
    currentVoice: currentVoice ? {
      voice_id: currentVoice.voice_id,
      name: currentVoice.name,
      preview_url: currentVoice.preview_url,
      labels: currentVoice.labels,
    } : { voice_id: currentVoiceId, name: cfg.voiceName || 'Unknown' },
    voices: (voices.data?.voices || []).map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      preview_url: v.preview_url,
      labels: v.labels || {},
      category: v.category,
    })),
  })
}

export async function POST(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const key = getKey()
  if (!key) return NextResponse.json({ error: 'No ElevenLabs API key configured' }, { status: 400 })

  const body = await request.json()
  const { voiceId, voiceName } = body
  if (!voiceId) return NextResponse.json({ error: 'voiceId required' }, { status: 400 })

  const cfg = readData('voice-agent.json') || {}
  const agentId = cfg.agentId
  if (!agentId) return NextResponse.json({ error: 'No agent configured' }, { status: 400 })

  const patch = await elevenFetch('/v1/convai/agents/' + agentId, key, {
    method: 'PATCH',
    body: JSON.stringify({
      conversation_config: { tts: { voice_id: voiceId } },
    }),
  })
  if (!patch.ok) return NextResponse.json({ error: `Agent patch failed: ${patch.status}`, detail: patch.data }, { status: 502 })

  writeData('voice-agent.json', { ...cfg, voiceId, voiceName: voiceName || cfg.voiceName })
  return NextResponse.json({ ok: true, voiceId, voiceName })
}
