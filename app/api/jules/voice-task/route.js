// Webhook for ElevenLabs voice agents (Craig) to delegate coding tasks to
// Google's Jules. Auth: Bearer CONCIERGE_TOOL_SECRET (same pattern as the
// rest of /api/concierge/*). Looks up the right Jules sourceId from a repo
// name when given, then creates a Jules session and returns the URL.
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getCred } from '@/lib/agent-creds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JULES_BASE = 'https://jules.googleapis.com/v1alpha'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}

async function listJulesSources(julesKey) {
  const r = await fetch(`${JULES_BASE}/sources?pageSize=50`, {
    headers: { 'X-Goog-Api-Key': julesKey },
    signal: AbortSignal.timeout(10000),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Jules sources ${r.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text).sources || []
}

function matchSource(sources, query) {
  if (!query) return null
  const q = String(query).toLowerCase().trim()
  // exact id match
  const byId = sources.find(s => (s.id || '').toLowerCase() === q)
  if (byId) return byId
  // exact repo match
  const byRepo = sources.find(s => (s.githubRepo?.repo || '').toLowerCase() === q)
  if (byRepo) return byRepo
  // contains in id or repo (case-insensitive substring)
  const byContains = sources.find(s =>
    (s.id || '').toLowerCase().includes(q)
    || (s.githubRepo?.repo || '').toLowerCase().includes(q)
  )
  return byContains || null
}

export async function POST(request) {
  // Auth: accept EITHER (a) Bearer CONCIERGE_TOOL_SECRET (server-side EL platform
  // callbacks) OR (b) a logged-in session cookie (browser-side voice client tool
  // dispatched from VoiceSession.js).
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.CONCIERGE_TOOL_SECRET || ''
  const bearerOk = expected && authHeader === `Bearer ${expected}`
  let user = null
  if (!bearerOk) {
    user = await getCurrentUser(request)
    if (!user) return unauthorized()
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }

  const prompt = String(body?.prompt || '').trim()
  const repoName = String(body?.repoName || body?.repo || body?.sourceId || '').trim()
  const title = String(body?.title || '').trim() || null

  if (!prompt) return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 })

  // Vault first (cred "Google Jules", verified live 2026-08-26), env fallback.
  const julesKey = getCred('jules')?.key || process.env.JULES_API_KEY
  if (!julesKey) {
    return NextResponse.json({ ok: false, error: 'No Jules API key in the credentials vault (Google Jules) or JULES_API_KEY env' }, { status: 500 })
  }

  // Resolve the source
  let sources
  try { sources = await listJulesSources(julesKey) } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 })
  }

  let source = matchSource(sources, repoName)
  if (!source && sources.length === 1) source = sources[0]
  if (!source) {
    return NextResponse.json({
      ok: false,
      error: `Couldn't find a matching Jules source for "${repoName || '(none given)'}". Available: ${sources.map(s => s.githubRepo?.repo).filter(Boolean).join(', ') || '(none)'}`,
      availableRepos: sources.map(s => s.githubRepo?.repo).filter(Boolean),
    }, { status: 400 })
  }

  // Standing rule (2026-08-26): the FCC repo's GitHub copy is a publish-only
  // mirror of Gitea, so Jules must never work it — Codex owns FCC execution.
  const repoSlug = (source.githubRepo?.repo || source.id || '').toLowerCase()
  if (repoSlug.includes('farrington-command-center')) {
    return NextResponse.json({
      ok: false,
      error: 'The farrington-command-center repo is off-limits to Jules — its GitHub copy is a publish-only mirror and Codex owns FCC execution. Pick a different repo.',
    }, { status: 403 })
  }

  // Create the Jules session.
  // Required body shape (per https://jules.google/docs/api/reference/):
  //   { prompt, sourceContext: { source: "sources/<id>", githubRepoContext: { startingBranch } } }
  const startingBranch = source.githubRepo?.defaultBranch?.displayName || 'main'
  const sessionBody = {
    prompt,
    sourceContext: {
      source: source.name || `sources/${source.id}`,
      githubRepoContext: { startingBranch },
    },
  }
  if (title) sessionBody.title = title

  const r = await fetch(`${JULES_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': julesKey,
    },
    body: JSON.stringify(sessionBody),
    signal: AbortSignal.timeout(15000),
  })
  const text = await r.text()
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: `Jules ${r.status}: ${text.slice(0, 300)}` }, { status: 502 })
  }
  const data = JSON.parse(text)
  const fullName = data.name || data.id || ''
  const sessionId = fullName.replace(/^sessions\//, '')

  return NextResponse.json({
    ok: true,
    sessionId,
    sessionUrl: sessionId ? `https://jules.google/task/${sessionId}` : null,
    repo: source.githubRepo?.repo || source.id,
    title: data.title || prompt.slice(0, 80),
  })
}
