import { readData, writeData } from '@/lib/dataStore'
import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { NextResponse } from 'next/server'

function fieldVal(cred, labelRx) {
  const f = (cred.fields || []).find(x => labelRx.test(x.label || ''))
  if (f?.value?.trim()) return f.value.trim()
  const fallback = (cred.fields || []).find(x => String(x.value || '').trim())
  return fallback?.value?.trim() || ''
}

async function timed(fn) {
  const t = Date.now()
  try { const r = await fn(); return { ...r, latencyMs: Date.now() - t } }
  catch (e) { return { ok: false, message: e.message || String(e), latencyMs: Date.now() - t } }
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) })
  const text = await res.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

const TESTS = {
  'openai': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    return { ok: r.ok, message: r.ok ? `${r.body.data?.length || 0} models accessible` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'anthropic': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
    return { ok: r.ok, message: r.ok ? `${r.body.data?.length || 0} models accessible` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'google gemini': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`)
    return { ok: r.ok, message: r.ok ? `${r.body.models?.length || 0} models accessible` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'kimi': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.moonshot.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    const count = Array.isArray(r.body?.data) ? r.body.data.length : 0
    return { ok: r.ok, message: r.ok ? `${count} Kimi models accessible` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'moonshot': async c => TESTS.kimi(c),
  'elevenlabs': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key } })
    return { ok: r.ok, message: r.ok ? `User: ${r.body.first_name || r.body.xi_api_key || 'ok'} • ${r.body.subscription?.tier || ''}` : (r.body?.detail?.message || `HTTP ${r.status}`) }
  },
  'perplexity': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    })
    return { ok: r.ok, message: r.ok ? 'Auth valid' : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'openrouter': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://openrouter.ai/api/v1/auth/key', { headers: { Authorization: `Bearer ${key}` } })
    return { ok: r.ok, message: r.ok ? `Credits: $${(r.body.data?.limit_remaining ?? r.body.data?.usage ?? '?')}` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'orcarouter': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.orcarouter.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    const models = Array.isArray(r.body?.data) ? r.body.data : []
    const openWeightModels = models.filter(model => /open[- ]?weight|apache-2\.0/i.test(`${model.description || ''} ${model.license || ''}`)).length
    return {
      ok: r.ok,
      message: r.ok
        ? `${models.length} models accessible; ${openWeightModels} explicitly identify as open-weight in catalog metadata`
        : (r.body?.error?.message || r.body?.message || `HTTP ${r.status}`),
    }
  },
  'nvidia': async c => {
    const key = fieldVal(c, /key|token|ngc|nim/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    const count = Array.isArray(r.body?.data) ? new Set(r.body.data.map(m => m.id).filter(Boolean)).size : 0
    return { ok: r.ok, message: r.ok ? `${count} NIM models accessible` : (r.body?.error?.message || r.body?.message || `HTTP ${r.status}`) }
  },
  'stripe': async c => {
    const key = fieldVal(c, /secret.*\(s\)|^secret key$|^secret$/i) || fieldVal(c, /secret/i)
    if (!key) return { ok: false, message: 'No Secret Key field' }
    const r = await jfetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Basic ${Buffer.from(key + ':').toString('base64')}` } })
    return { ok: r.ok, message: r.ok ? `Mode: ${key.startsWith('sk_live') ? 'live' : 'test'} • available: ${r.body.available?.[0]?.amount ?? 0} ${r.body.available?.[0]?.currency ?? ''}` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'privacy': async c => {
    const key = fieldVal(c, /api\s*key|key|token/i)
    if (!key) return { ok: false, message: 'No API Key field' }
    const env = /sandbox|test/i.test(fieldVal(c, /environment|mode/i)) ? 'sandbox' : 'production'
    const base = fieldVal(c, /base\s*url|api\s*url/i) || (env === 'sandbox' ? 'https://sandbox.privacy.com/v1' : 'https://api.privacy.com/v1')
    const r = await jfetch(`${base.replace(/\/+$/, '')}/status`, { headers: { Authorization: `api-key ${key}`, Accept: 'application/json' } })
    return { ok: r.ok, message: r.ok ? `Privacy ${env} API reachable` : (r.body?.message || r.body?.error || `HTTP ${r.status}`) }
  },
  'godaddy': async c => {
    const key = fieldVal(c, /^api key$|^key$/i)
    const secret = fieldVal(c, /secret/i)
    if (!key || !secret) return { ok: false, message: 'Need API Key and API Secret fields' }
    const r = await jfetch('https://api.godaddy.com/v1/domains?limit=1', { headers: { Authorization: `sso-key ${key}:${secret}`, Accept: 'application/json' } })
    return { ok: r.ok, message: r.ok ? 'Auth valid' : (r.body?.message || `HTTP ${r.status}`) }
  },
  'vercel': async c => {
    const key = fieldVal(c, /token|key/i); if (!key) return { ok: false, message: 'No token field' }
    const r = await jfetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${key}` } })
    return { ok: r.ok, message: r.ok ? `User: ${r.body.user?.username || r.body.user?.email || 'ok'}` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'openweather': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch(`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${encodeURIComponent(key)}`)
    return { ok: r.ok, message: r.ok ? 'Auth valid' : (r.body?.message || `HTTP ${r.status}`) }
  },
  'pexels': async c => {
    const key = fieldVal(c, /key|token/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.pexels.com/v1/search?query=cat&per_page=1', { headers: { Authorization: key } })
    return { ok: r.ok, message: r.ok ? 'Auth valid' : (r.body?.error || `HTTP ${r.status}`) }
  },
  'apify': async c => {
    const key = fieldVal(c, /key|token|api/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.apify.com/v2/users/me', { headers: { Authorization: `Bearer ${key}` } })
    return { ok: r.ok, message: r.ok ? `User: ${r.body.data?.username || r.body.data?.email || 'ok'}` : (r.body?.error?.message || `HTTP ${r.status}`) }
  },
  'mindstudio': async c => {
    const key = fieldVal(c, /key|token|api/i); if (!key) return { ok: false, message: 'No API key field' }
    const r = await jfetch('https://api.mindstudio.ai/developer/v2/apps/load', { headers: { Authorization: `Bearer ${key}` } })
    return { ok: r.ok, message: r.ok ? `Auth valid${r.body.orgName ? ` for ${r.body.orgName}` : ''}` : (r.body?.error || r.body?.message || `HTTP ${r.status}`) }
  },
}

function matchTest(name) {
  const n = (name || '').toLowerCase().trim()
  for (const k of Object.keys(TESTS)) if (n.includes(k)) return TESTS[k]
  return null
}

export async function POST(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error
  const { id } = await request.json()
  const data = readData('credentials.json') || { credentials: [] }
  const cred = data.credentials.find(c => c.id === id)
  if (!cred) {
    logAuditEvent({ request, user, action: 'credential_test_missing', area: 'credentials', severity: 'warn', targetId: id })
    return NextResponse.json({ ok: false, message: 'Credential not found' }, { status: 404 })
  }
  logAuditEvent({ request, user, action: 'credential_test_started', area: 'credentials', severity: 'info', targetId: cred.id, targetName: cred.name })

  const runner = matchTest(cred.name)
  if (!runner) {
    const result = { ok: null, message: 'No automated test for this provider', at: new Date().toISOString() }
    cred.lastTest = result
    writeData('credentials.json', data)
    logAuditEvent({ request, user, action: 'credential_test_finished', area: 'credentials', severity: 'info', targetId: cred.id, targetName: cred.name, meta: { ok: result.ok, message: result.message } })
    return NextResponse.json(result)
  }

  const r = await timed(() => runner(cred))
  const result = { ok: r.ok, message: r.message, latencyMs: r.latencyMs, at: new Date().toISOString() }
  cred.lastTest = result
  writeData('credentials.json', data)
  logAuditEvent({ request, user, action: 'credential_test_finished', area: 'credentials', severity: r.ok ? 'info' : 'warn', targetId: cred.id, targetName: cred.name, meta: { ok: result.ok, message: result.message, latencyMs: result.latencyMs } })
  return NextResponse.json(result)
}
