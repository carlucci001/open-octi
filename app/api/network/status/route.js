import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { requireAdmin } from '@/lib/auth'

const run = promisify(exec)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function pingUrl(url, timeoutMs = 4000) {
  if (!url) return { ok: false, status: 0, ms: 0, error: 'no url' }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    return { ok: res.status < 500, status: res.status, ms: Date.now() - started }
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, status: 0, ms: Date.now() - started, error: e.message }
  }
}

async function serviceStatus(name, label) {
  try {
    const { stdout } = await run(`systemctl is-active ${name}`, { timeout: 2500 })
    const state = stdout.trim()
    return { ok: state === 'active', state, name: label || name }
  } catch (e) {
    return { ok: false, state: 'inactive', name: label || name, error: e.message }
  }
}

async function serviceWorkingDirectory(name) {
  try {
    const { stdout } = await run(`systemctl show ${name} -p WorkingDirectory --value`, { timeout: 2500 })
    return stdout.trim()
  } catch (e) {
    return ''
  }
}

function checkLocalCrm() {
  return pingUrl('http://127.0.0.1:3000/', 1500)
}

function checkPublicCrm() {
  return pingUrl('https://openocti.local/', 4000)
}

async function checkOpenClaw() {
  // OpenClaw is private to the server side; the CRM reaches it through local protected routes.
  try {
    const started = Date.now()
    const res = await fetch('http://127.0.0.1:3000/api/openclaw/clients', { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(3000) })
    return { ok: res.status < 500, status: res.status, ms: Date.now() - started }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function checkExternalApis() {
  const endpoints = [
    { name: 'Stripe', url: 'https://api.stripe.com/' },
    { name: 'Resend', url: 'https://api.resend.com/' },
    { name: 'ElevenLabs', url: 'https://api.elevenlabs.io/v1/voices' },
    { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/' },
    { name: 'GoDaddy', url: 'https://api.godaddy.com/' },
    { name: 'Google Calendar', url: 'https://www.googleapis.com/calendar/v3/users/me/settings' },
    { name: 'Perplexity', url: 'https://api.perplexity.ai/' },
  ]
  const results = await Promise.all(endpoints.map(async e => {
    const r = await pingUrl(e.url, 1500)
    return { name: e.name, ...r }
  }))
  return results
}

// Hard-cap any promise so the whole endpoint can't stall on a hanging subprocess.
function withTimeout(p, ms, fallback) {
  return Promise.race([
    p,
    new Promise(res => setTimeout(() => res(fallback), ms)),
  ])
}

// Stale-while-revalidate: requests always get the cached value instantly.
// When the cache is older than TTL_MS, a single background refresh fires.
// In-flight refreshes are deduped with a promise lock so we never run two at once.
let CACHE = null
let CACHE_AT = 0
let REFRESHING = null
const TTL_MS = 30000

async function computeStatus() {
  const [local, publicCrm, crmService, cloudflared, workingDirectory, openclaw, externals] = await Promise.all([
    withTimeout(checkLocalCrm(), 1500, { ok: false, error: 'timeout' }),
    withTimeout(checkPublicCrm(), 5000, { ok: false, error: 'timeout' }),
    withTimeout(serviceStatus('farrington-crm.service', 'Farrington CRM'), 3000, { ok: false, error: 'timeout' }),
    withTimeout(serviceStatus('cloudflared.service', 'Cloudflare tunnel'), 3000, { ok: false, error: 'timeout' }),
    withTimeout(serviceWorkingDirectory('farrington-crm.service'), 3000, ''),
    withTimeout(checkOpenClaw(), 6000, { ok: false, error: 'timeout' }),
    withTimeout(checkExternalApis(), 2500, []),
  ])
  return {
    fetchedAt: new Date().toISOString(),
    local,
    publicCrm,
    crmService: { ...crmService, workingDirectory },
    cloudflared,
    openclaw,
    externals,
  }
}

function kickRefresh() {
  if (REFRESHING) return REFRESHING
  REFRESHING = computeStatus()
    .then(result => { CACHE = result; CACHE_AT = Date.now() })
    .catch(() => {})
    .finally(() => { REFRESHING = null })
  return REFRESHING
}

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const now = Date.now()
  if (CACHE) {
    const age = now - CACHE_AT
    if (age >= TTL_MS && !REFRESHING) kickRefresh()
    return NextResponse.json({ ...CACHE, cached: true, ageMs: age })
  }
  // First-ever call: return a stub immediately and kick off the refresh.
  if (!REFRESHING) kickRefresh()
  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    loading: true,
    local: { ok: false, status: 0, ms: 0 },
    publicCrm: { ok: false },
    crmService: { ok: false },
    cloudflared: { ok: false },
    openclaw: { ok: false },
    externals: [],
  })
}
