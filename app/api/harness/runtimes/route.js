import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { listAgents } from '@/lib/agents-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HETZNER_HERMES_CANDIDATES = [
  process.env.HERMES_HETZNER_DASHBOARD_URL,
  process.env.HERMES_DASHBOARD_URL,
  'http://127.0.0.1:9119',
  'http://127.0.0.1:19119',
].filter(Boolean)
const HETZNER_HERMES_BROWSER_URL = process.env.HERMES_BROWSER_DASHBOARD_URL || ''
const OPENCLAW_BROWSER_URL = process.env.OPENCLAW_DASHBOARD_BROWSER_URL || process.env.OPENCLAW_DASHBOARD_URL || ''
const DEERFLOW_BROWSER_URL = process.env.DEERFLOW_BROWSER_DASHBOARD_URL || process.env.DEERFLOW_DASHBOARD_URL || ''
const DEEPSEEK_HARNESS_URL = process.env.DEEPSEEK_HARNESS_URL || 'http://127.0.0.1:3091'

function dashboardUrl(base) {
  return String(base || '').replace(/\/+$/, '')
}

async function timedFetch(url, options = {}, timeoutMs = 3500) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    return { ok: res.ok, status: res.status, ms: Date.now() - started, res }
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, status: 0, ms: Date.now() - started, error: e.message }
  }
}

function extractHermesToken(html) {
  return String(html || '').match(/__HERMES_SESSION_TOKEN__="([^"]+)"/)?.[1] || ''
}

function browserSafeUrl(url) {
  const value = dashboardUrl(url)
  if (!value) return ''
  return /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(value) ? '' : value
}

function proxiedDashboard(id) {
  return `/api/harness/dashboard/${id}/`
}

function openClawDashboard() {
  return '/api/harness/openclaw/open'
}

function deerFlowDashboard() {
  return '/api/harness/deerflow/open'
}

function privateHarnessBase(raw, label) {
  const base = dashboardUrl(raw)
  if (!base) return ''
  let url
  try { url = new URL(base) } catch { return '' }
  const host = url.hostname.toLowerCase()
  const privateHost = host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
  if (!privateHost && process.env.HARNESS_ALLOW_PUBLIC_RUNTIME_URLS !== '1') return ''
  return base
}

async function checkHermes({ id, label, lane, url }) {
  const base = dashboardUrl(url)
  if (!base) return { id, label, lane, type: 'hermes', ok: false, status: 0, error: 'not configured' }

  const page = await timedFetch(`${base}/config`, {}, 4000)
  const result = {
    id,
    label,
    lane,
    type: 'hermes',
    ok: page.ok,
    status: page.status,
    ms: page.ms,
    dashboardUrl: id === 'hermes-hetzner' ? (browserSafeUrl(HETZNER_HERMES_BROWSER_URL) || proxiedDashboard('hermes-hetzner')) : '',
    internalEndpoint: base,
    privateSurface: /127\.0\.0\.1|localhost/.test(base) ? 'loopback' : 'lan',
    model: '',
    provider: '',
    version: '',
    error: page.error || '',
  }
  if (!page.ok) return result

  const html = await page.res.text().catch(() => '')
  const token = extractHermesToken(html)
  const headers = token ? { 'X-Hermes-Session-Token': token } : {}
  const cfg = await timedFetch(`${base}/api/config`, { headers }, 3500)
  if (cfg.ok) {
    const data = await cfg.res.json().catch(() => ({}))
    result.model = data.model || ''
  }
  const aux = await timedFetch(`${base}/api/model/auxiliary`, { headers }, 3500)
  if (aux.ok) {
    const data = await aux.res.json().catch(() => ({}))
    result.provider = data.main?.provider || ''
    result.model = data.main?.model || result.model
  }
  return result
}

async function checkOpenClaw() {
  const started = Date.now()
  try {
    const data = await listAgents()
    return {
      id: 'openclaw-hetzner',
      label: 'OpenClaw',
      lane: 'Hetzner production',
      type: 'openclaw',
      ok: !!data.ok,
      status: data.ok ? 200 : 500,
      ms: Date.now() - started,
      dashboardUrl: browserSafeUrl(OPENCLAW_BROWSER_URL) || openClawDashboard(),
      privateSurface: 'loopback',
      dashboardUrl: browserSafeUrl(OPENCLAW_BROWSER_URL) || openClawDashboard(),
      agentCount: (data.agents || []).length,
      provider: 'runtime config',
      model: data.agents?.[0]?.brain?.modelId || '',
      error: data.error || '',
    }
  } catch (e) {
    return {
      id: 'openclaw-hetzner',
      label: 'OpenClaw',
      lane: 'Hetzner production',
      type: 'openclaw',
      ok: false,
      status: 0,
      ms: Date.now() - started,
      privateSurface: 'loopback',
      dashboardUrl: browserSafeUrl(OPENCLAW_BROWSER_URL) || openClawDashboard(),
      error: e.message,
    }
  }
}

async function checkHetznerHermes() {
  for (const url of HETZNER_HERMES_CANDIDATES) {
    const result = await checkHermes({ id: 'hermes-hetzner', label: 'Hermes', lane: 'Hetzner sidecar', url })
    if (result.ok) return result
  }
  return {
    id: 'hermes-hetzner',
    label: 'Hermes',
    lane: 'Hetzner sidecar',
    type: 'hermes',
    ok: false,
    status: 0,
    privateSurface: 'loopback',
    error: 'No Hetzner Hermes dashboard candidate responded',
  }
}

async function checkDeerFlow() {
  const started = Date.now()
  const configured = process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL || ''
  const base = privateHarnessBase(configured, 'DeerFlow')
  if (!base) {
    return {
      id: 'deerflow-hetzner',
      label: 'DeerFlow',
      lane: 'Hetzner sidecar',
      type: 'deerflow',
      ok: false,
      status: 0,
      privateSurface: 'loopback',
      dashboardUrl: '',
      provider: 'not configured',
      model: process.env.DEERFLOW_API_MODEL || process.env.DEER_FLOW_API_MODEL || '',
      error: configured ? 'DeerFlow API base must be localhost/private unless HARNESS_ALLOW_PUBLIC_RUNTIME_URLS=1 is set behind a separate auth gateway.' : 'Set DEERFLOW_API_BASE_URL to enable this runtime.',
    }
  }

  const healthUrls = [`${base}/health`, `${base}/api/health`, `${base}/models`]
  for (const url of healthUrls) {
    const probe = await timedFetch(url, {}, 3500)
    if (probe.ok) {
      return {
        id: 'deerflow-hetzner',
        label: 'DeerFlow',
        lane: 'Hetzner sidecar',
        type: 'deerflow',
        ok: true,
        status: probe.status,
        ms: Date.now() - started,
        privateSurface: /127\.0\.0\.1|localhost/.test(base) ? 'loopback' : 'lan',
        dashboardUrl: deerFlowDashboard(),
        provider: 'DeerFlow API',
        model: process.env.DEERFLOW_API_MODEL || process.env.DEER_FLOW_API_MODEL || 'deerflow-agent',
        internalEndpoint: base,
      }
    }
  }

  return {
    id: 'deerflow-hetzner',
    label: 'DeerFlow',
    lane: 'Hetzner sidecar',
    type: 'deerflow',
    ok: false,
    status: 0,
    ms: Date.now() - started,
    privateSurface: /127\.0\.0\.1|localhost/.test(base) ? 'loopback' : 'lan',
    dashboardUrl: '',
    provider: 'DeerFlow API',
    model: process.env.DEERFLOW_API_MODEL || process.env.DEER_FLOW_API_MODEL || 'deerflow-agent',
    internalEndpoint: base,
    error: 'No DeerFlow health endpoint responded.',
  }
}

function deepSeekHarnessEnabled() {
  const configured = String(process.env.DEEPSEEK_HARNESS_ENABLED || '').trim().toLowerCase()
  if (configured) return ['1', 'true', 'yes', 'on'].includes(configured)
  return process.env.NODE_ENV !== 'production'
}

async function checkDeepSeekHarness() {
  const started = Date.now()
  const base = privateHarnessBase(DEEPSEEK_HARNESS_URL, 'DeepSeek Harness')
  const baseResult = {
    id: 'deepseek-harness',
    label: 'DeepSeek Harness',
    lane: 'Hetzner isolated sidecar',
    type: 'deepseek',
    status: 0,
    privateSurface: 'loopback',
    dashboardUrl: '',
    provider: 'DeepSeek official',
    model: 'deepseek-v4-flash',
    profile: 'chat-only',
    tools: [],
  }

  if (!deepSeekHarnessEnabled()) {
    return { ...baseResult, ok: false, error: 'DeepSeek Harness is installed but disabled by its production feature flag.' }
  }
  if (!base) {
    return { ...baseResult, ok: false, error: 'DeepSeek Harness must use a localhost/private bridge URL.' }
  }

  const probe = await timedFetch(`${base}/healthz`, {}, 3500)
  if (!probe.ok) {
    return {
      ...baseResult,
      ok: false,
      status: probe.status,
      ms: Date.now() - started,
      internalEndpoint: base,
      error: probe.error || 'DeepSeek Harness health endpoint did not respond.',
    }
  }

  const data = await probe.res.json().catch(() => ({}))
  return {
    ...baseResult,
    ok: data.ok === true,
    status: probe.status,
    ms: Date.now() - started,
    internalEndpoint: base,
    provider: 'DeepSeek official',
    model: data.model || baseResult.model,
    profile: data.profile || baseResult.profile,
    version: data.version || '',
    tools: Array.isArray(data.tools) ? data.tools : [],
    busy: data.busy === true,
    error: data.ok === true ? '' : 'DeepSeek Harness returned an unhealthy response.',
  }
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  const [openclaw, hetznerHermes, deerflow, deepseek] = await Promise.all([
    checkOpenClaw(),
    checkHetznerHermes(),
    checkDeerFlow(),
    checkDeepSeekHarness(),
  ])

  return NextResponse.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    lanes: {
      hetzner: 'Command Center orchestrates Hetzner private runtimes without opening public harness ports.',
    },
    runtimes: [openclaw, hetznerHermes, deerflow, deepseek],
  })
}

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const runtimeId = String(body.runtimeId || '').trim()
  const action = String(body.action || 'check').trim()

  if (action !== 'check') {
    return NextResponse.json({ ok: false, error: 'Unsupported harness action' }, { status: 400 })
  }

  let runtime
  if (runtimeId === 'openclaw-hetzner') runtime = await checkOpenClaw()
  else if (runtimeId === 'hermes-hetzner') runtime = await checkHetznerHermes()
  else if (runtimeId === 'deerflow-hetzner') runtime = await checkDeerFlow()
  else if (runtimeId === 'deepseek-harness') runtime = await checkDeepSeekHarness()
  else return NextResponse.json({ ok: false, error: 'Unknown runtime' }, { status: 400 })

  return NextResponse.json({
    ok: true,
    action,
    runtimeId,
    checkedAt: new Date().toISOString(),
    runtime,
  })
}
