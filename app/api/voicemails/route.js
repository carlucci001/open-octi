import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'

export async function DELETE(request) {
  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) return NextResponse.json({ error: 'No ElevenLabs API key' }, { status: 400 })
  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Provide an array of conversation ids' }, { status: 400 })
  }
  const results = await Promise.all(
    ids.map(id =>
      fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
        method: 'DELETE', headers: { 'xi-api-key': cred.key },
      })
        .then(r => ({ id, ok: r.ok, status: r.status }))
        .catch(e => ({ id, ok: false, error: e.message }))
    )
  )
  const deleted = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok)
  return NextResponse.json({ ok: true, deleted, failed: failed.length, errors: failed })
}

export async function GET() {
  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) return NextResponse.json({ error: 'No ElevenLabs API key in vault' }, { status: 400 })

  try {
    // Fetch active agents so we can filter out orphan conversations
    const agentsRes = await fetch('https://api.elevenlabs.io/v1/convai/agents', { headers: { 'xi-api-key': cred.key } })
    const agentsJson = agentsRes.ok ? await agentsRes.json() : { agents: [] }
    const activeAgentIds = new Set((agentsJson.agents || []).map(a => a.agent_id))

    // Grab recent conversations
    const listRes = await fetch('https://api.elevenlabs.io/v1/convai/conversations?page_size=100', {
      headers: { 'xi-api-key': cred.key },
    })
    if (!listRes.ok) {
      const t = await listRes.text()
      return NextResponse.json({ error: `ElevenLabs ${listRes.status}: ${t.slice(0, 200)}` }, { status: 502 })
    }
    const list = await listRes.json()
    const allConversations = list.conversations || []
    const conversations = allConversations.filter(c => activeAgentIds.has(c.agent_id)).slice(0, 30)
    const orphanCount = allConversations.length - conversations.length

    // For each, fetch full details in parallel (transcript + metadata)
    const details = await Promise.all(
      conversations.map(c =>
        fetch(`https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}`, {
          headers: { 'xi-api-key': cred.key },
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )

    const messages = conversations.map((c, i) => {
      const d = details[i]
      const transcript = (d?.transcript || []).map(t => ({ role: t.role, text: t.message || '' }))
      return {
        id: c.conversation_id,
        agentName: c.agent_name,
        startedAt: new Date(c.start_time_unix_secs * 1000).toISOString(),
        durationSec: c.call_duration_secs,
        direction: c.direction,
        status: c.status,
        title: c.call_summary_title || '(Untitled)',
        summary: d?.analysis?.transcript_summary || '',
        from: d?.metadata?.phone_call?.external_number || '(unknown)',
        to: d?.metadata?.phone_call?.agent_number || '',
        transcript,
        href: `https://elevenlabs.io/app/conversational-ai/history/${c.conversation_id}`,
      }
    })

    return NextResponse.json({ messages, fetchedAt: new Date().toISOString(), orphanCount })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
