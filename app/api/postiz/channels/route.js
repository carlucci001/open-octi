// List connected channels from the self-hosted Postiz instance.
//
// GET ?tenantId=<id> — returns only channels assigned to that tenant in the
// postiz-channel-tenants.json mapping. If tenantId is omitted, returns all
// channels with their tenantId annotation (used by the admin tagging UI).
//
// Mapping file (kv_store: postiz-channel-tenants.json):
//   { map: { <postizChannelId>: <tenantId> }, defaultTenantId: 'farrington-development' }
// Channels with no mapping fall back to defaultTenantId (in-house).

import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { readData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAP_FILE = 'postiz-channel-tenants.json'
const DEFAULT_TENANT = 'farrington-development'

function getPostizConfig() {
  let base = (process.env.POSTIZ_API_URL || '').trim().replace(/\/$/, '')
  if (base === 'https://postiz.farringtondevelopment.com/api/public/v1') {
    base = 'http://127.0.0.1:5005/api/public/v1'
  }
  const key = (process.env.POSTIZ_API_KEY || '').trim()
  if (!base || !key) return null
  if (!/\/api\/public\/v1$/.test(base) && !/\/public\/v1$/.test(base)) {
    return { error: 'POSTIZ_API_URL must point to the Postiz Public API, ending in /api/public/v1 or /public/v1' }
  }
  return { base, key }
}

function summarizePostizBody(text, contentType) {
  const raw = String(text || '')
  if (!raw) return null
  if (/html/i.test(contentType || '') || /^\s*<!doctype\s+html/i.test(raw) || /^\s*<html[\s>]/i.test(raw)) {
    return 'Postiz returned HTML instead of JSON. Check POSTIZ_API_URL; it should be the Public API URL, usually ending in /api/public/v1 on the self-hosted instance.'
  }
  return raw.slice(0, 400)
}

function loadMap() {
  const raw = readData(MAP_FILE) || {}
  const map = raw.map && typeof raw.map === 'object' ? raw.map : {}
  const accountMap = raw.accountMap && typeof raw.accountMap === 'object' ? raw.accountMap : {}
  const defaultTenantId = raw.defaultTenantId || DEFAULT_TENANT
  return { map, accountMap, defaultTenantId }
}

function emptyChannelResponse({ warning, detail = null, upstreamStatus = null, status = 200 } = {}) {
  const { defaultTenantId } = loadMap()
  return NextResponse.json({
    ok: true,
    channels: [],
    defaultTenantId,
    warning: warning || 'Postiz channels are not available right now.',
    detail,
    upstreamStatus,
  }, { status })
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  const cfg = getPostizConfig()
  if (cfg?.error) {
    return emptyChannelResponse({ warning: cfg.error })
  }
  if (!cfg) {
    return emptyChannelResponse({ warning: 'Postiz env not configured (POSTIZ_API_URL / POSTIZ_API_KEY)' })
  }

  const url = new URL(request.url)
  const wantTenant = (url.searchParams.get('tenantId') || '').trim()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    const r = await fetch(`${cfg.base}/integrations`, {
      headers: { Authorization: cfg.key, 'User-Agent': 'fcc-campaign-studio/1' },
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const text = await r.text()
    const contentType = r.headers.get('content-type') || ''
    let body = null
    try { body = JSON.parse(text) } catch {}
    if (!r.ok) {
      return emptyChannelResponse({
        warning: `Postiz integrations ${r.status}`,
        detail: body || summarizePostizBody(text, contentType),
        upstreamStatus: r.status,
      })
    }

    const { map, accountMap, defaultTenantId } = loadMap()
    const all = (Array.isArray(body) ? body : []).map(c => ({
      id: c.id,
      name: c.name,
      identifier: c.identifier,
      platform: c.platform || c.integration?.platform || '',
      provider: c.provider || c.integration?.provider || '',
      type: c.type || c.integration?.type || '',
      picture: c.picture,
      profile: c.profile,
      disabled: !!c.disabled,
      tenantId: map[c.id] || defaultTenantId,
      clientId: accountMap[c.id] || c.clientId || c.client?.id || '',
    }))

    const channels = wantTenant ? all.filter(c => c.tenantId === wantTenant) : all
    return NextResponse.json({ ok: true, channels, defaultTenantId })
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'Postiz channel check timed out' : String(e?.message || e)
    return emptyChannelResponse({ warning: message })
  }
}
