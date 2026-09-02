// Assign a Postiz channel to a tenant in the FCC-side mapping.
// POST { channelId, tenantId } — admin only.
//
// Stored in kv_store as postiz-channel-tenants.json:
//   { map: { <postizChannelId>: <tenantId> }, defaultTenantId: '...' }

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { readData, writeData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAP_FILE = 'postiz-channel-tenants.json'
const DEFAULT_TENANT = 'farrington-development'

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  let body = null
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const channelId = String(body?.channelId || '').trim()
  const tenantId = String(body?.tenantId || '').trim() || DEFAULT_TENANT
  const accountId = String(body?.accountId || '').trim()
  if (!channelId) return NextResponse.json({ ok: false, error: 'channelId is required' }, { status: 400 })
  const cur = readData(MAP_FILE) || {}
  const map = cur.map && typeof cur.map === 'object' ? { ...cur.map } : {}
  const accountMap = cur.accountMap && typeof cur.accountMap === 'object' ? { ...cur.accountMap } : {}
  const priorTenantId = map[channelId] || ''
  map[channelId] = tenantId
  if (accountId) accountMap[channelId] = accountId
  else if (priorTenantId && priorTenantId !== tenantId) delete accountMap[channelId]
  writeData(MAP_FILE, { ...cur, map, accountMap, defaultTenantId: cur.defaultTenantId || DEFAULT_TENANT })
  return NextResponse.json({ ok: true, channelId, tenantId, accountId: accountMap[channelId] || '' })
}
