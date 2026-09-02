import { readData, writeData } from '@/lib/dataStore'
import { NextResponse } from 'next/server'

const CF_BASE = 'https://api.cloudflare.com/client/v4'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

async function cf(path, token) {
  const res = await fetch(`${CF_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    const msg = json.errors?.[0]?.message || `${res.status} ${res.statusText}`
    throw new Error(`Cloudflare ${res.status}: ${msg}`)
  }
  return json
}

async function fetchAllZones(token) {
  const all = []
  for (let page = 1; page < 50; page++) {
    const j = await cf(`/zones?per_page=50&page=${page}`, token)
    const list = j.result || []
    all.push(...list)
    if (list.length < 50) break
  }
  return all
}

async function fetchRegistrarDomains(token, accountId) {
  if (!accountId) return []
  try {
    const j = await cf(`/accounts/${accountId}/registrar/domains?per_page=50`, token)
    return j.result || []
  } catch {
    return []
  }
}

export async function POST() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Missing CLOUDFLARE_API_TOKEN in .env.local' }, { status: 400 })
  }

  let zones
  try {
    zones = await fetchAllZones(token)
  } catch (e) {
    return NextResponse.json({ error: e.message + ' — token likely needs Zone:Read scope.' }, { status: 502 })
  }

  if (zones.length === 0) {
    return NextResponse.json({
      ok: false,
      fetched: 0,
      error: 'Cloudflare returned no zones. The current token may be too narrowly scoped (Access-only). Create a new token with Zone:Read and Account.Domains:Read at dash.cloudflare.com/profile/api-tokens, replace CLOUDFLARE_API_TOKEN in .env.local, and retry.',
    }, { status: 200 })
  }

  const accountId = zones[0]?.account?.id || null
  const registrarDomains = await fetchRegistrarDomains(token, accountId)
  const regByName = new Map(registrarDomains.map(d => [(d.name || '').toLowerCase(), d]))

  const data = readData('domains.json') || { domains: [] }

  const activeZones = zones.filter(z => z.name && z.status !== 'deactivated')
  const activeNames = new Set(activeZones.map(z => z.name.toLowerCase()))
  const skipped = zones.length - activeZones.length

  const before = data.domains.length
  data.domains = data.domains.filter(d => {
    const isCf = (d.registrar || '').toLowerCase() === 'cloudflare' || (d.dnsProvider || '').toLowerCase() === 'cloudflare'
    if (!isCf) return true
    return activeNames.has(d.domain.toLowerCase())
  })
  const removed = before - data.domains.length

  const byName = new Map(data.domains.map(d => [d.domain.toLowerCase(), d]))
  let added = 0, updated = 0
  for (const z of activeZones) {
    const name = z.name.toLowerCase()
    const reg = regByName.get(name)
    const isCloudflareRegistered = !!reg
    const patch = {
      domain: z.name,
      registrar: isCloudflareRegistered ? 'Cloudflare' : (z.original_registrar || 'Cloudflare DNS'),
      dnsProvider: 'Cloudflare',
      expirationDate: reg?.expires_at ? reg.expires_at.slice(0, 10) : '',
      autoRenew: reg?.auto_renew ?? true,
      nsRecords: Array.isArray(z.name_servers) ? z.name_servers : [],
      status: z.status === 'active' ? 'active' : (z.status || 'pending'),
    }
    const existing = byName.get(name)
    if (existing) {
      Object.assign(existing, patch)
      updated++
    } else {
      const rec = { id: genId(), hosting: 'unknown', hostingType: 'unknown', sslStatus: z.ssl?.status || 'unknown', notes: '', aRecords: [], cnameRecords: [], lastScanned: null, ...patch }
      data.domains.push(rec)
      byName.set(name, rec)
      added++
    }
  }

  data.lastUpdated = new Date().toISOString()
  writeData('domains.json', data)
  return NextResponse.json({ ok: true, fetched: zones.length, added, updated, skipped, removed, total: data.domains.length, registrarManaged: registrarDomains.length })
}
