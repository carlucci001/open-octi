import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { OPENAI_REALTIME_TOOLS, OPENAI_REALTIME_VOICES } from '@/lib/realtime-voice-tools'
import { getOpenAIKeyCandidates, redactedKeyMeta } from '@/lib/openai-key-candidates'
import { isOpenOcti } from '@/lib/edition'
// Persona helpers live in the shared lib (route files may only export handlers) so the
// GPT-Live route can reuse them. Behavior of this route is unchanged.
import { buildCrmSnapshot, buildInstructions, resolveAgent } from '@/lib/gpt-live-persona'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const keyCandidates = getOpenAIKeyCandidates()
  if (!keyCandidates.length) return NextResponse.json({ error: 'Add an OpenAI API key in Models & Keys to enable voice.' }, { status: 400 })

  const url = new URL(request.url)
  const agentId = url.searchParams.get('agent') || 'matilda'
  const agent = resolveAgent(agentId)
  if (!agent) return NextResponse.json({ error: `Unknown OpenAI voice agent: ${agentId}` }, { status: 404 })
  if (agent.error) return NextResponse.json({ error: agent.error }, { status: 409 })

  const offerSdp = await request.text()
  if (!offerSdp || !offerSdp.includes('v=0')) {
    return NextResponse.json({ error: 'Expected raw WebRTC SDP offer' }, { status: 400 })
  }

  const voice = OPENAI_REALTIME_VOICES.includes(agent.voice?.openaiVoice) ? agent.voice.openaiVoice : 'marin'
  const model = agent.voice?.openaiModel || 'gpt-realtime'
  const snapshot = buildCrmSnapshot()
  const requestId = Math.random().toString(36).slice(2, 9)
  console.log(`[openai-voice] start requestId=${requestId} agent=${agent.id || agentId} voice=${voice} model=${model}`)
  const sessionConfig = {
    type: 'realtime',
    model,
    instructions: buildInstructions(agent, snapshot),
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe' },
      },
      output: { voice },
    },
    tools: isOpenOcti() && agent.id === 'octi-guide' ? [] : OPENAI_REALTIME_TOOLS,
    tool_choice: 'auto',
  }

  const makeForm = () => {
    const form = new FormData()
    form.set('sdp', offerSdp)
    form.set('session', JSON.stringify(sessionConfig))
    return form
  }

  let lastFailure = null
  for (const candidate of keyCandidates) {
    const meta = redactedKeyMeta(candidate)
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.key}`,
        'OpenAI-Safety-Identifier': 'openocti',
      },
      body: makeForm(),
      signal: request.signal,
    })

    const text = await upstream.text()
    if (upstream.ok) {
      console.log(`[openai-voice] connected requestId=${requestId} agent=${agent.id || agentId} keySource=${meta.source} keySuffix=${meta.suffix}`)
      return new NextResponse(text, {
        status: 200,
        headers: { 'Content-Type': 'application/sdp' },
      })
    }

    lastFailure = { status: upstream.status, text, meta }
    console.warn(`[openai-voice] upstream failed requestId=${requestId} status=${upstream.status} keySource=${meta.source} keySuffix=${meta.suffix} body=${text.slice(0, 240)}`)
    if (upstream.status !== 401 && upstream.status !== 403) break
  }
  return NextResponse.json({ error: `OpenAI Realtime ${lastFailure?.status || 'failed'}: ${(lastFailure?.text || '').slice(0, 300)}` }, { status: 502 })
}
