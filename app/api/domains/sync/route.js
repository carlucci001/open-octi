import { readData, writeData } from '@/lib/dataStore'
import { NextResponse } from 'next/server'

const GD_BASE = process.env.GODADDY_API_BASE || 'https://api.godaddy.com'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

async function fetchAllGoDaddy(key, secret) {
  const headers = { Authorization: `sso-key ${key}:${secret}`, Accept: 'application/json' }
  const all = []
  let marker = ''
  for (let i = 0; i < 50; i++) {
    const url = `${GD_BASE}/v1/domains?limit=1000${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GoDaddy ${res.status}: ${text.slice(0, 300)}`)
    }
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    all.push(...page)
    if (page.length < 1000) break
    marker = page[page.length - 1].domain
  }
  return all
}

export async function POST() {
  const key = process.env.GODADDY_API_KEY
  const secret = process.env.GODADDY_API_SECRET
  if (!key || !secret) {
    return NextResponse.json({ error: 'Missing GODADDY_API_KEY or GODADDY_API_SECRET in .env.local' }, { status: 400 })
  }

  let gdDomains
  try {
    gdDomains = await fetchAllGoDaddy(key, secret)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }

  const data = readData('domains.json') || { domains: [] }

  const activeGd = gdDomains.filter(gd => (gd.status || '').toUpperCase() === 'ACTIVE' && gd.domain)
  const skipped = gdDomains.length - activeGd.length
  const activeGdNames = new Set(activeGd.map(gd => gd.domain.toLowerCase()))

  const existingGodaddyNames = new Set(
    data.domains
      .filter(d => (d.registrar || '').toLowerCase() === 'godaddy')
      .map(d => d.domain.toLowerCase())
  )
  const before = data.domains.length
  data.domains = data.domains.filter(d => {
    const isGodaddy = (d.registrar || '').toLowerCase() === 'godaddy'
    if (!isGodaddy) return true
    return activeGdNames.has(d.domain.toLowerCase())
  })
  const removed = before - data.domains.length

  const byName = new Map(data.domains.map(d => [d.domain.toLowerCase(), d]))
  let added = 0, updated = 0
  for (const gd of activeGd) {
    const name = gd.domain.toLowerCase()
    const patch = {
      domain: gd.domain,
      registrar: 'GoDaddy',
      expirationDate: (gd.expires || '').slice(0, 10),
      autoRenew: gd.renewAuto !== undefined ? gd.renewAuto : true,
      status: 'active',
    }
    const existing = byName.get(name)
    if (existing) {
      Object.assign(existing, patch)
      updated++
    } else {
      const rec = { id: genId(), hosting: 'unknown', hostingType: 'unknown', dnsProvider: 'GoDaddy', sslStatus: 'unknown', notes: '', aRecords: [], cnameRecords: [], nsRecords: [], lastScanned: null, ...patch }
      data.domains.push(rec)
      byName.set(name, rec)
      added++
    }
  }

  data.lastUpdated = new Date().toISOString()
  writeData('domains.json', data)
  return NextResponse.json({ ok: true, fetched: gdDomains.length, added, updated, skipped, removed, total: data.domains.length })
}
