import { readData } from '@/lib/dataStore'
import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { fetchTwilioUsage } from '@/lib/twilio-usage'
import { NextResponse } from 'next/server'

const CACHE_MS = 55_000
let cache = { expiresAt: 0, payload: null, pending: null }

function fieldValue(credential, matcher) {
  const field = (credential.fields || []).find(item => matcher.test(String(item.label || '')))
  return String(field?.value || '').trim()
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = {} }
  return { ok: response.ok, status: response.status, body }
}

function safeError(result) {
  return result.body?.error?.message || result.body?.detail?.message || `Provider returned HTTP ${result.status}`
}

async function openRouter(credential) {
  const key = fieldValue(credential, /^(?!.*management).*(?:key|token|api)/i)
  if (!key) return { status: 'no_key', note: 'No API key is stored' }
  const headers = { Authorization: `Bearer ${key}` }
  const managementKey = fieldValue(credential, /management/i)
  const [credits, keyInfo] = await Promise.all([
    jsonFetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${managementKey || key}` } }),
    jsonFetch('https://openrouter.ai/api/v1/key', { headers }).then(result => result.ok ? result : jsonFetch('https://openrouter.ai/api/v1/auth/key', { headers })),
  ])
  if (!credits.ok && !keyInfo.ok) return { status: 'error', error: safeError(credits) }
  const account = credits.body?.data || {}
  const info = keyInfo.body?.data || {}
  const totalCredits = Number(account.total_credits)
  const totalUsage = Number(account.total_usage)
  return {
    status: 'active',
    plan: info.is_free_tier ? 'Free' : 'Paid',
    metricKind: credits.ok ? 'money_balance_and_api_key_spend' : 'api_key_spend',
    scope: credits.ok ? 'account + API key' : 'API key',
    authoritative: true,
    attribution: { level: 'none', note: 'OpenRouter does not know the Command Center agent, process, or workflow behind a shared key.' },
    usage: {
      meterAvailable: true,
      totalCredits: Number.isFinite(totalCredits) ? totalCredits : null,
      totalSpent: Number.isFinite(totalUsage) ? totalUsage : Number(info.usage || 0),
      creditsRemaining: Number.isFinite(totalCredits) && Number.isFinite(totalUsage) ? Math.max(0, totalCredits - totalUsage) : null,
      costToday: Number(info.usage_daily || 0),
      cost7d: Number(info.usage_weekly || 0),
      cost30d: Number(info.usage_monthly || 0),
    },
    limits: { creditLimit: info.limit ?? null, rateLimit: info.rate_limit ?? null },
    note: credits.ok ? 'Account credits plus current API-key usage.' : 'Current API-key usage shown. Add a least-privilege management key to this credential for whole-account cash balance.',
    dashboardUrl: 'https://openrouter.ai/settings/credits',
  }
}

async function elevenLabs(credential) {
  const key = fieldValue(credential, /key|token|api/i)
  if (!key) return { status: 'no_key', note: 'No API key is stored' }
  const result = await jsonFetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
  if (!result.ok) return { status: 'error', error: safeError(result) }
  const subscription = result.body || {}
  const used = Number(subscription.character_count || 0)
  const limit = Number(subscription.character_limit || 0)
  return {
    status: 'active',
    plan: subscription.tier || 'Connected',
    metricKind: 'quota',
    scope: 'account',
    authoritative: true,
    attribution: { level: 'none', note: 'ElevenLabs reports account quota, not the originating Command Center agent or workflow.' },
    usage: { meterAvailable: true, charactersUsed: used, characterLimit: limit, percentUsed: limit > 0 ? Math.round((used / limit) * 100) : null },
    limits: { characterLimit: limit || null, resetsAt: subscription.next_character_count_reset_unix ? new Date(subscription.next_character_count_reset_unix * 1000).toISOString() : null },
    note: 'ElevenLabs reports character quota, not a cash balance.',
    dashboardUrl: 'https://elevenlabs.io/app/subscription',
  }
}

async function huggingFace(credential) {
  const key = fieldValue(credential, /key|token|api/i)
  if (!key) return { status: 'no_key', note: 'No API token is stored' }
  const result = await jsonFetch('https://huggingface.co/api/whoami-v2', { headers: { Authorization: `Bearer ${key}` } })
  if (!result.ok) return { status: 'error', error: safeError(result) }
  return {
    status: 'active',
    plan: result.body?.type || 'Connected',
    metricKind: 'unavailable',
    scope: 'token identity',
    authoritative: false,
    attribution: { level: 'none', note: 'Hugging Face does not expose a public cash-balance or agent-attribution API.' },
    usage: { meterAvailable: false },
    note: 'Authenticated. Hugging Face does not expose a public cash-balance API; use local task metering and its billing dashboard.',
    dashboardUrl: 'https://huggingface.co/settings/billing',
  }
}

async function deepSeek(credential) {
  const key = fieldValue(credential, /key|token|api/i)
  if (!key) return { status: 'no_key', note: 'No API key is stored' }
  const result = await jsonFetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } })
  if (!result.ok) return { status: 'error', error: safeError(result) }
  const balances = Array.isArray(result.body?.balance_infos) ? result.body.balance_infos : []
  const usd = balances.find(item => String(item.currency || '').toUpperCase() === 'USD') || balances[0]
  const remaining = Number(usd?.total_balance)
  return {
    status: result.body?.is_available === false ? 'attention' : 'active',
    metricKind: 'money_balance',
    scope: 'account',
    authoritative: true,
    attribution: { level: 'none', note: 'DeepSeek reports account balance without the local agent or workflow identity.' },
    usage: { meterAvailable: true, creditsRemaining: Number.isFinite(remaining) ? remaining : null },
    note: usd ? `${String(usd.currency || 'USD').toUpperCase()} provider balance` : 'Balance endpoint connected',
    dashboardUrl: 'https://platform.deepseek.com/usage',
  }
}

async function kimi(credential) {
  const key = fieldValue(credential, /key|token|api/i)
  if (!key) return { status: 'no_key', note: 'No API key is stored' }
  const result = await jsonFetch('https://api.moonshot.ai/v1/users/me/balance', { headers: { Authorization: `Bearer ${key}` } })
  if (!result.ok) return { status: 'error', error: safeError(result) }
  const data = result.body?.data || result.body || {}
  const remaining = Number(data.available_balance)
  return {
    status: 'active',
    metricKind: 'money_balance',
    scope: 'account',
    authoritative: true,
    attribution: { level: 'none', note: 'Kimi reports account balance without the local agent or workflow identity.' },
    usage: { meterAvailable: true, creditsRemaining: Number.isFinite(remaining) ? remaining : null },
    note: 'Available Moonshot/Kimi balance',
    dashboardUrl: 'https://platform.moonshot.ai/console/info',
  }
}

async function twilio(credential) {
  const usage = await fetchTwilioUsage({
    accountSid: fieldValue(credential, /account.*sid/i) || process.env.TWILIO_ACCOUNT_SID,
    keySid: fieldValue(credential, /(?:api.*key|key).*sid/i) || process.env.TWILIO_API_KEY_SID,
    keySecret: fieldValue(credential, /(?:api.*key|key).*secret|auth.*token/i) || process.env.TWILIO_API_KEY_SECRET,
  })
  if (!usage.configured) return { status: 'no_key', note: 'Twilio account credentials are not configured' }
  return {
    status: 'active',
    metricKind: 'provider_spend',
    scope: 'Twilio account',
    authoritative: true,
    attribution: { level: 'none', note: 'Twilio reports account usage without the Command Center workflow identity.' },
    usage: { meterAvailable: true, costToday: usage.costToday, costMonth: usage.costMonth },
    note: `${usage.currency} provider-reported usage`,
    dashboardUrl: 'https://console.twilio.com/us1/monitor/usage',
  }
}

const ADAPTERS = [
  { matches: name => /open\s*router/i.test(name), provider: 'OpenRouter', run: openRouter },
  { matches: name => /eleven\s*labs?/i.test(name), provider: 'ElevenLabs', run: elevenLabs },
  { matches: name => /hugging\s*face|huggingface|\bhf\b/i.test(name), provider: 'Hugging Face', run: huggingFace },
  { matches: name => /deep\s*seek/i.test(name), provider: 'DeepSeek', run: deepSeek },
  { matches: name => /\bkimi\b|moonshot/i.test(name), provider: 'Kimi', run: kimi },
  { matches: name => /twilio/i.test(name), provider: 'Twilio', run: twilio },
]

function isApiCredential(credential) {
  return (credential.fields || []).some(field => /api|key|token/i.test(String(field.label || ''))) || /api|openai|anthropic|gemini|deepseek|perplexity|router|eleven|hugging|twilio/i.test(String(credential.name || ''))
}

async function collect() {
  const stored = readData('credentials.json') || { credentials: [] }
  const credentials = (stored.credentials || []).filter(isApiCredential)
  if (!credentials.some(credential => /twilio/i.test(String(credential.name || ''))) && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) {
    credentials.push({ id: 'env_twilio', name: 'Twilio', category: 'Communications', fields: [] })
  }
  const results = await Promise.all(credentials.map(async credential => {
    const adapter = ADAPTERS.find(item => item.matches(String(credential.name || '')))
    if (!adapter) return { id: credential.id, name: credential.name, provider: credential.name, category: credential.category, status: 'configured', metricKind: 'unavailable', scope: 'configured credential', authoritative: false, attribution: { level: 'none', note: 'Exact agent/workflow attribution requires local per-call logging.' }, usage: { meterAvailable: false }, note: 'Credential configured; this provider has no safe balance adapter yet.' }
    try {
      return { id: credential.id, name: credential.name, provider: adapter.provider, category: credential.category, ...(await adapter.run(credential)) }
    } catch (error) {
      return { id: credential.id, name: credential.name, provider: adapter.provider, category: credential.category, status: 'error', error: error.message || 'Provider check failed' }
    }
  }))
  return { results, fetchedAt: new Date().toISOString(), cacheSeconds: CACHE_MS / 1000 }
}

async function handle(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error
  const force = new URL(request.url).searchParams.get('force') === '1'
  if (!force && cache.payload && cache.expiresAt > Date.now()) return NextResponse.json(cache.payload)
  if (!cache.pending) {
    cache.pending = collect().then(payload => {
      cache = { payload, expiresAt: Date.now() + CACHE_MS, pending: null }
      return payload
    }).catch(error => {
      cache.pending = null
      throw error
    })
  }
  const payload = await cache.pending
  logAuditEvent({ request, user, action: 'api_spend_checked', area: 'finance', severity: 'info', meta: { providerCount: payload.results.length } })
  return NextResponse.json(payload)
}

export async function GET(request) { return handle(request) }
export async function POST(request) { return handle(request) }
