import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeDomain(input) {
  if (!input) return ''
  let d = String(input).trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0]
  return d
}

function pickStatus(events) {
  if (!Array.isArray(events)) return {}
  const byAction = {}
  for (const e of events) {
    if (e?.eventAction && e?.eventDate) byAction[e.eventAction] = e.eventDate
  }
  return byAction
}

function pickRegistrar(entities) {
  if (!Array.isArray(entities)) return null
  for (const e of entities) {
    const roles = e.roles || []
    if (roles.includes('registrar')) {
      const vcard = e.vcardArray?.[1] || []
      const fn = vcard.find(x => x?.[0] === 'fn')
      return fn?.[3] || e.handle || null
    }
  }
  return null
}

function pickNameservers(nameservers) {
  if (!Array.isArray(nameservers)) return []
  return nameservers.map(n => (n?.ldhName || '').toLowerCase()).filter(Boolean)
}

async function rdapLookup(domain) {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    redirect: 'follow',
    headers: { Accept: 'application/rdap+json' },
  })
  if (res.status === 404) {
    return { registered: false }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`RDAP ${res.status}: ${text.slice(0, 200) || res.statusText}`)
  }
  const j = await res.json()
  const events = pickStatus(j.events)
  return {
    registered: true,
    handle: j.handle || j.ldhName || domain,
    registrar: pickRegistrar(j.entities),
    nameservers: pickNameservers(j.nameservers),
    status: Array.isArray(j.status) ? j.status : [],
    registered_at: events.registration || null,
    expires_at: events.expiration || null,
    last_changed: events['last changed'] || null,
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get('domain') || ''
  const domain = normalizeDomain(raw)
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ ok: false, error: 'Pass ?domain=example.com' }, { status: 400 })
  }
  try {
    const info = await rdapLookup(domain)
    return NextResponse.json({ ok: true, domain, available: !info.registered, ...info })
  } catch (e) {
    return NextResponse.json({ ok: false, domain, error: e.message }, { status: 502 })
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const domain = normalizeDomain(body?.domain)
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ ok: false, error: 'Pass { "domain": "example.com" }' }, { status: 400 })
  }
  try {
    const info = await rdapLookup(domain)
    return NextResponse.json({ ok: true, domain, available: !info.registered, ...info })
  } catch (e) {
    return NextResponse.json({ ok: false, domain, error: e.message }, { status: 502 })
  }
}
