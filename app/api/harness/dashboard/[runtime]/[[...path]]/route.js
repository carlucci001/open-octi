import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { OPENCLAW_DASHBOARD_PATH, resolveOpenClawDashboardBase } from '@/lib/openclaw-dashboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function privateHarnessBase(raw, label) {
  const base = cleanBase(raw)
  if (!base) return ''
  let url
  try { url = new URL(base) } catch { throw new Error(`${label} dashboard URL is invalid`) }
  const host = url.hostname.toLowerCase()
  const privateHost = host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
  if (!privateHost && process.env.HARNESS_ALLOW_PUBLIC_RUNTIME_URLS !== '1') {
    throw new Error(`${label} dashboard must stay on localhost/private networking.`)
  }
  return base
}

function runtimeBase(id) {
  if (id === 'openclaw-hetzner') {
    return resolveOpenClawDashboardBase()
  }
  if (id === 'hermes-hetzner') {
    return privateHarnessBase(process.env.HERMES_DASHBOARD_INTERNAL_URL || process.env.HERMES_HETZNER_DASHBOARD_URL || process.env.HERMES_DASHBOARD_URL || 'http://127.0.0.1:9119', 'Hermes')
  }
  if (id === 'deerflow-hetzner') {
    return privateHarnessBase(process.env.DEERFLOW_DASHBOARD_INTERNAL_URL || process.env.DEERFLOW_DASHBOARD_URL || process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL || '', 'DeerFlow')
  }
  return ''
}

async function hermesSessionHeaders(base) {
  try {
    const configPage = await fetch(`${base}/config`, {
      headers: { 'User-Agent': 'OpenOcti-Command-Center/HarnessDashboardProxy' },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    const html = await configPage.text().catch(() => '')
    const token = html.match(/__HERMES_SESSION_TOKEN__="([^"]+)"/)?.[1] || ''
    return token ? { 'X-Hermes-Session-Token': token } : {}
  } catch {
    return {}
  }
}

async function proxy(request, { params }) {
  const { error } = await requireAdmin(request)
  if (error) return error

  params = await params
  const id = String(params.runtime || '')
  const base = runtimeBase(id)
  if (!base) return NextResponse.json({ ok: false, error: 'Unknown or unconfigured harness dashboard.' }, { status: 404 })

  const path = Array.isArray(params.path) ? params.path.join('/') : ''
  const source = new URL(request.url)
  const target = new URL(`${base}/${path}`)
  target.search = source.search
  const extraHeaders = id === 'hermes-hetzner' ? await hermesSessionHeaders(base) : {}

  const response = await fetch(target, {
    method: request.method,
    headers: {
      'User-Agent': 'OpenOcti-Command-Center/HarnessDashboardProxy',
      ...(id === 'openclaw-hetzner' && request.headers.get('authorization')
        ? { Authorization: request.headers.get('authorization') } : {}),
      ...extraHeaders,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  }).catch(e => ({ ok: false, status: 502, error: e.message }))

  if (!response.ok && !response.body) {
    return NextResponse.json({ ok: false, error: response.error || `Harness dashboard HTTP ${response.status}` }, { status: response.status || 502 })
  }

  const headers = new Headers()
  const contentType = response.headers?.get?.('content-type') || 'text/html; charset=utf-8'
  headers.set('content-type', contentType)
  headers.set('x-fcc-harness-dashboard-proxy', id)
  headers.set('cache-control', 'no-store')
  if (id === 'openclaw-hetzner' && contentType.includes('text/html')) {
    const html = await response.text()
    const baseScript = `<base href="${OPENCLAW_DASHBOARD_PATH}/"><script>window.__OPENCLAW_CONTROL_UI_BASE_PATH__=${JSON.stringify(OPENCLAW_DASHBOARD_PATH)};</script>`
    return new NextResponse(html.replace(/<head(?:\s[^>]*)?>/i, match => match + baseScript), { status: response.status || 200, headers })
  }
  return new NextResponse(response.body, { status: response.status || 200, headers })
}

export async function GET(request, ctx) {
  return proxy(request, ctx)
}
