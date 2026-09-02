// Voice-side status endpoint for Jules. Either gets one specific session by id,
// or returns a short list of the most recent sessions when no id is given so
// the agent can pick the right one to report on.
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getCred } from '@/lib/agent-creds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JULES_BASE = 'https://jules.googleapis.com/v1alpha'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}

function summarize(s) {
  const id = (s.name || s.id || '').replace(/^sessions\//, '')
  return {
    id,
    title: s.title || '(no title)',
    status: s.state || s.status || 'unknown',
    url: id ? `https://jules.google/task/${id}` : null,
    repo: s.sourceContext?.source?.replace(/^sources\/github\//, '') || null,
  }
}

export async function POST(request) {
  // Same dual auth as voice-task
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.CONCIERGE_TOOL_SECRET || ''
  const bearerOk = expected && authHeader === `Bearer ${expected}`
  if (!bearerOk) {
    const u = await getCurrentUser(request)
    if (!u) return unauthorized()
  }

  // Vault first (cred "Google Jules", verified live 2026-08-26), env fallback.
  const julesKey = getCred('jules')?.key || process.env.JULES_API_KEY
  if (!julesKey) return NextResponse.json({ ok: false, error: 'No Jules API key in the credentials vault (Google Jules) or JULES_API_KEY env' }, { status: 500 })

  let body = {}
  try { body = await request.json() } catch {}
  const sessionId = String(body?.sessionId || '').trim().replace(/^sessions\//, '')

  const headers = { 'X-Goog-Api-Key': julesKey }

  if (sessionId) {
    const r = await fetch(`${JULES_BASE}/sessions/${encodeURIComponent(sessionId)}`, { headers, signal: AbortSignal.timeout(10000) })
    const text = await r.text()
    if (!r.ok) return NextResponse.json({ ok: false, error: `Jules ${r.status}: ${text.slice(0, 250)}` }, { status: 502 })
    return NextResponse.json({ ok: true, session: summarize(JSON.parse(text)) })
  }

  const r = await fetch(`${JULES_BASE}/sessions?pageSize=5`, { headers, signal: AbortSignal.timeout(10000) })
  const text = await r.text()
  if (!r.ok) return NextResponse.json({ ok: false, error: `Jules ${r.status}: ${text.slice(0, 250)}` }, { status: 502 })
  const data = JSON.parse(text)
  const sessions = (data.sessions || []).map(summarize)
  return NextResponse.json({ ok: true, sessions })
}
