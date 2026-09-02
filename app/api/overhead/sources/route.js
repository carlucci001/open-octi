// Aggregator: fans out to each per-provider source route in parallel and merges results.
// Per-provider routes live at /api/overhead/sources/{provider}/route.js
//
// CONTRACT — every per-provider route must GET and return JSON in this shape:
//
// SUCCESS:
// {
//   ok: true,
//   source: 'anthropic',           // unique provider id (matches dir name)
//   vendor: 'Anthropic',           // display name
//   category: 'ai',                // ai | hosting | telephony | productivity | domains | media | finance | other
//   currentMonthCost: 12.34,       // USD this month so far (number)
//   lastMonthCost: 45.67,          // USD last month (number, optional)
//   currency: 'USD',
//   nextDue: '2026-05-01',         // YYYY-MM-DD (optional)
//   frequency: 'monthly',          // monthly | yearly | usage-based
//   details: [                     // optional breakdown items
//     { label: 'claude-opus-4-6', amount: 8.20 },
//     { label: 'claude-sonnet-4-6', amount: 4.14 }
//   ],
//   loginUrl: 'https://console.anthropic.com',  // optional
//   fetchedAt: '2026-04-23T22:30:00.000Z'
// }
//
// FAILURE:
// {
//   ok: false,
//   source: 'anthropic',
//   vendor: 'Anthropic',
//   error: 'human-readable error',
//   needsCredential: true,         // optional; true if the cause is a missing/invalid key
//   credentialHint: 'Set ANTHROPIC_ADMIN_KEY in env or add an Anthropic admin key to the credentials vault.',
//   fetchedAt: '2026-04-23T22:30:00.000Z'
// }
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOURCES = ['anthropic', 'openai', 'openrouter', 'twilio', 'godaddy', 'elevenlabs', 'vercel', 'daily']

async function fetchSource(req, source) {
  // Build absolute URL from the incoming request (works in dev and behind tunnels)
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  const host = req.headers.get('host') || 'localhost:3000'
  const url = `${proto}://${host}/api/overhead/sources/${source}`
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (r.status === 404) {
      return { ok: false, source, vendor: source, error: 'Source not implemented yet', notImplemented: true, fetchedAt: new Date().toISOString() }
    }
    const data = await r.json()
    return data
  } catch (e) {
    return { ok: false, source, vendor: source, error: e.message, fetchedAt: new Date().toISOString() }
  }
}

// Stale-while-revalidate: vendor billing data changes slowly, so we serve the
// cached aggregate instantly and refresh in the background after TTL.
// Stashed on globalThis so the cache survives Next.js dev-mode hot reloads.
const G = globalThis.__overheadSourcesCache ||= { CACHE: null, CACHE_AT: 0, REFRESHING: null }
const TTL_MS = 5 * 60 * 1000

async function computeAggregate(request) {
  const results = await Promise.all(SOURCES.map(s => fetchSource(request, s)))
  const ok = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  const totalMonthly = ok.reduce((s, r) => s + (Number(r.currentMonthCost) || 0), 0)
  return {
    ok: true,
    sources: results,
    summary: { successCount: ok.length, failCount: failed.length, totalMonthlyCost: totalMonthly },
    fetchedAt: new Date().toISOString(),
  }
}

function kickRefresh(request) {
  if (G.REFRESHING) return G.REFRESHING
  G.REFRESHING = computeAggregate(request)
    .then(result => { G.CACHE = result; G.CACHE_AT = Date.now() })
    .catch(() => {})
    .finally(() => { G.REFRESHING = null })
  return G.REFRESHING
}

export async function GET(request) {
  const now = Date.now()
  if (G.CACHE) {
    const age = now - G.CACHE_AT
    if (age >= TTL_MS) kickRefresh(request)
    return NextResponse.json({ ...G.CACHE, cached: true, ageMs: age })
  }
  // First-ever call: dedupe concurrent cold-start requests so we only compute once.
  if (!G.REFRESHING) kickRefresh(request)
  await G.REFRESHING
  return NextResponse.json(G.CACHE || { ok: false, error: 'cold start failed' })
}
