import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PUBLIC_WIDGET_VOICE_BINDINGS = {
  'wnctimes-doreen': {
    agentId: 'agent_4101kw8e8576ea88k8k0bbrd3gaw',
    voiceName: 'Cassidy',
    name: 'Jessica',
    firstName: 'Jessica',
  },
  'newsroomaios-web': {
    agentId: 'agent_4801kwavtfgcepgbfnqncqbtw7tk',
    voiceName: 'Bruce',
    name: 'Bruce',
    firstName: 'Bruce',
  },
}

function json(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request) {
  const url = new URL(request.url)
  const agentId = String(url.searchParams.get('agent') || '').trim()
  const profile = await resolvePublicWidgetAgent(agentId, { baseUrl: url.origin })

  if (!profile.voiceEnabled) {
    return json({ ok: false, error: 'Voice is not enabled for this public widget.' }, { status: 403 })
  }

  const roster = readData('voice-agent-roster.json') || {}
  const binding = roster[profile.id] || PUBLIC_WIDGET_VOICE_BINDINGS[profile.id]
  if (!binding?.agentId) {
    return json({ ok: false, error: 'This public agent is not bound to ElevenLabs yet.' }, { status: 404 })
  }

  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) return json({ ok: false, error: 'ElevenLabs is not configured.' }, { status: 503 })

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(binding.agentId)}`, {
      headers: { 'xi-api-key': cred.key },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text()
      return json({ ok: false, error: `ElevenLabs ${res.status}: ${text.slice(0, 200)}` }, { status: 502 })
    }
    const data = await res.json()
    return json({
      ok: true,
      signedUrl: data.signed_url,
      agentName: profile.name,
      agentId: binding.agentId,
    })
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 })
  }
}
