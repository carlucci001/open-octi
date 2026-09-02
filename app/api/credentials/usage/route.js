import { readData } from '@/lib/dataStore'
import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { NextResponse } from 'next/server'

function fieldVal(cred, labelRx) {
  const f = (cred.fields || []).find(x => labelRx.test(x.label || ''))
  return f?.value?.trim() || ''
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) })
  const text = await res.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, ok: res.ok, body }
}

// Build date strings
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function isoSec(n) { return Math.floor((Date.now() - n * 86400000) / 1000) }

const FETCHERS = {
  'openai': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    // Try billing usage endpoint (works with org-level keys)
    const today = daysAgo(0), m30 = daysAgo(30), m7 = daysAgo(7), m1 = daysAgo(1)
    const headers = { Authorization: `Bearer ${key}` }

    // Get organization info
    const org = await jfetch('https://api.openai.com/v1/organization', { headers }).catch(() => null)

    // Try costs endpoint (newer API)
    const costs30 = await jfetch(`https://api.openai.com/v1/organization/costs?start_time=${isoSec(30)}&end_time=${isoSec(0)}&bucket_width=1d`, { headers }).catch(() => null)

    // Try subscription
    const sub = await jfetch('https://api.openai.com/v1/dashboard/billing/subscription', { headers }).catch(() => null)

    // Try usage (last 30 days)
    const usage30 = await jfetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${m30}&end_date=${today}`, { headers }).catch(() => null)
    const usage7 = await jfetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${m7}&end_date=${today}`, { headers }).catch(() => null)
    const usage1 = await jfetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${m1}&end_date=${today}`, { headers }).catch(() => null)

    const result = { provider: 'OpenAI', status: 'active', plan: null, usage: {}, limits: {} }

    if (costs30?.ok && costs30.body?.data) {
      const buckets = costs30.body.data
      const total = buckets.reduce((s, b) => s + (b.results || []).reduce((s2, r) => s2 + (r.amount?.value || 0), 0), 0)
      result.usage.cost30d = total / 100
    }

    if (sub?.ok) {
      result.plan = sub.body.plan?.title || sub.body.plan?.id || null
      result.limits.hardLimit = sub.body.hard_limit_usd
      result.limits.softLimit = sub.body.soft_limit_usd
    }

    if (usage30?.ok) result.usage.cost30d = result.usage.cost30d || (usage30.body.total_usage / 100)
    if (usage7?.ok) result.usage.cost7d = usage7.body.total_usage / 100
    if (usage1?.ok) result.usage.costToday = usage1.body.total_usage / 100

    // At minimum verify key works
    if (!costs30?.ok && !sub?.ok && !usage30?.ok) {
      const models = await jfetch('https://api.openai.com/v1/models', { headers })
      result.status = models.ok ? 'active' : 'error'
      if (!models.ok) result.error = models.body?.error?.message || `HTTP ${models.status}`
    }
    return result
  },

  'anthropic': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    const models = await jfetch('https://api.anthropic.com/v1/models', { headers })
    const result = { provider: 'Anthropic', status: models.ok ? 'active' : 'error' }
    if (models.ok) result.info = `${models.body.data?.length || 0} models available`
    else result.error = models.body?.error?.message || `HTTP ${models.status}`
    // Anthropic doesn't expose billing via API key — note this
    result.note = 'Billing available at console.anthropic.com'
    return result
  },

  'elevenlabs': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const r = await jfetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key } })
    if (!r.ok) return { provider: 'ElevenLabs', status: 'error', error: r.body?.detail?.message || `HTTP ${r.status}` }
    const sub = r.body.subscription || {}
    return {
      provider: 'ElevenLabs',
      status: 'active',
      plan: sub.tier || 'unknown',
      usage: {
        charactersUsed: sub.character_count || 0,
        characterLimit: sub.character_limit || 0,
        percentUsed: sub.character_limit ? Math.round((sub.character_count / sub.character_limit) * 100) : null,
      },
      limits: {
        characterLimit: sub.character_limit,
        nextReset: sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toISOString() : null,
      },
      billing: {
        nextInvoice: sub.next_invoice?.amount_due_cents ? (sub.next_invoice.amount_due_cents / 100) : null,
        currency: sub.currency || 'usd',
      },
    }
  },

  'openrouter': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const r = await jfetch('https://openrouter.ai/api/v1/auth/key', { headers: { Authorization: `Bearer ${key}` } })
    if (!r.ok) return { provider: 'OpenRouter', status: 'error', error: r.body?.error?.message || `HTTP ${r.status}` }
    const d = r.body.data || {}
    return {
      provider: 'OpenRouter',
      status: 'active',
      plan: d.is_free_tier ? 'Free' : 'Paid',
      usage: {
        totalSpent: d.usage || 0,
        creditsRemaining: d.limit != null ? (d.limit - (d.usage || 0)) : null,
      },
      limits: {
        creditLimit: d.limit,
        rateLimit: d.rate_limit,
      },
    }
  },

  'stripe': async (c) => {
    const key = fieldVal(c, /secret.*\(s\)|^secret key$|^secret$/i) || fieldVal(c, /secret/i)
    if (!key) return null
    const auth = { Authorization: `Basic ${Buffer.from(key + ':').toString('base64')}` }
    const bal = await jfetch('https://api.stripe.com/v1/balance', { headers: auth })
    if (!bal.ok) return { provider: 'Stripe', status: 'error', error: bal.body?.error?.message || `HTTP ${bal.status}` }
    const available = bal.body.available || []
    const pending = bal.body.pending || []
    // Recent charges (last 10)
    const charges = await jfetch('https://api.stripe.com/v1/charges?limit=10', { headers: auth }).catch(() => null)
    return {
      provider: 'Stripe',
      status: 'active',
      plan: key.startsWith('sk_live') ? 'Live' : 'Test',
      usage: {
        available: available.map(a => ({ amount: a.amount / 100, currency: a.currency })),
        pending: pending.map(p => ({ amount: p.amount / 100, currency: p.currency })),
        recentCharges: charges?.ok ? (charges.body.data || []).slice(0, 5).map(c => ({
          amount: c.amount / 100,
          currency: c.currency,
          status: c.status,
          created: new Date(c.created * 1000).toISOString(),
          description: c.description || c.metadata?.product || '',
        })) : [],
      },
    }
  },

  'godaddy': async (c) => {
    const key = fieldVal(c, /^api key$|^key$/i)
    const secret = fieldVal(c, /secret/i)
    if (!key || !secret) return null
    const headers = { Authorization: `sso-key ${key}:${secret}`, Accept: 'application/json' }
    const r = await jfetch('https://api.godaddy.com/v1/domains?limit=500', { headers })
    if (!r.ok) return { provider: 'GoDaddy', status: 'error', error: r.body?.message || `HTTP ${r.status}` }
    const domains = Array.isArray(r.body) ? r.body : []
    const active = domains.filter(d => d.status === 'ACTIVE')
    const expiring30 = active.filter(d => {
      if (!d.expires) return false
      const exp = new Date(d.expires)
      const in30 = new Date(); in30.setDate(in30.getDate() + 30)
      return exp <= in30
    })
    return {
      provider: 'GoDaddy',
      status: 'active',
      usage: {
        totalDomains: domains.length,
        activeDomains: active.length,
        expiringSoon: expiring30.map(d => ({ domain: d.domain, expires: d.expires?.slice(0, 10) })),
      },
    }
  },

  'vercel': async (c) => {
    const key = fieldVal(c, /token|key|api/i)
    if (!key) return null
    const headers = { Authorization: `Bearer ${key}` }
    const user = await jfetch('https://api.vercel.com/v2/user', { headers })
    if (!user.ok) return { provider: 'Vercel', status: 'error', error: user.body?.error?.message || `HTTP ${user.status}` }
    const u = user.body.user || {}
    return {
      provider: 'Vercel',
      status: 'active',
      plan: u.billing?.plan || u.softBlock?.blockedAt ? 'blocked' : 'active',
      info: u.username || u.email,
    }
  },

  'google gemini': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const r = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`)
    return {
      provider: 'Google Gemini',
      status: r.ok ? 'active' : 'error',
      info: r.ok ? `${r.body.models?.length || 0} models available` : (r.body?.error?.message || `HTTP ${r.status}`),
      note: 'Usage available at console.cloud.google.com/billing',
    }
  },

  'kimi': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const headers = { Authorization: `Bearer ${key}` }
    const models = await jfetch('https://api.moonshot.ai/v1/models', { headers })
    const balance = await jfetch('https://api.moonshot.ai/v1/users/me/balance', { headers }).catch(() => null)
    return {
      provider: 'Kimi',
      status: models.ok ? 'active' : 'error',
      info: models.ok ? `${models.body.data?.length || 0} models available` : undefined,
      error: models.ok ? undefined : (models.body?.error?.message || `HTTP ${models.status}`),
      usage: balance?.ok ? balance.body : undefined,
      note: balance?.ok ? undefined : 'Balance and usage available in the Kimi Open Platform console',
    }
  },

  'moonshot': async (c) => FETCHERS.kimi(c),

  'perplexity': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    // Perplexity has no usage/billing API — just verify auth
    const r = await jfetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    })
    return {
      provider: 'Perplexity',
      status: r.ok ? 'active' : 'error',
      error: r.ok ? undefined : (r.body?.error?.message || `HTTP ${r.status}`),
      note: 'Usage available at perplexity.ai/settings/api',
    }
  },

  'openweather': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const r = await jfetch(`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${encodeURIComponent(key)}`)
    return {
      provider: 'OpenWeather',
      status: r.ok ? 'active' : 'error',
      error: r.ok ? undefined : (r.body?.message || `HTTP ${r.status}`),
    }
  },

  'pexels': async (c) => {
    const key = fieldVal(c, /key|token|api/i)
    if (!key) return null
    const r = await jfetch('https://api.pexels.com/v1/search?query=cat&per_page=1', { headers: { Authorization: key } })
    return {
      provider: 'Pexels',
      status: r.ok ? 'active' : 'error',
      usage: r.ok ? { monthlyLimit: 'See headers (200/hr free tier)' } : undefined,
    }
  },
}

function matchFetcher(name) {
  const n = (name || '').toLowerCase().trim()
  for (const k of Object.keys(FETCHERS)) if (n.includes(k)) return FETCHERS[k]
  return null
}

export async function POST(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error
  logAuditEvent({ request, user, action: 'credential_usage_checked', area: 'credentials', severity: 'info' })
  const data = readData('credentials.json') || { credentials: [] }
  const results = []

  await Promise.allSettled(data.credentials.map(async cred => {
    const fetcher = matchFetcher(cred.name)
    if (!fetcher) {
      results.push({ id: cred.id, name: cred.name, category: cred.category, provider: cred.name, status: 'no_api', note: 'No usage API available' })
      return
    }
    try {
      const r = await fetcher(cred)
      if (r) results.push({ id: cred.id, name: cred.name, category: cred.category, ...r })
      else results.push({ id: cred.id, name: cred.name, category: cred.category, provider: cred.name, status: 'no_key' })
    } catch (e) {
      results.push({ id: cred.id, name: cred.name, category: cred.category, provider: cred.name, status: 'error', error: e.message })
    }
  }))

  return NextResponse.json({ results, fetchedAt: new Date().toISOString() })
}
