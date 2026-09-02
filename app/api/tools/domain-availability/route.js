import { NextResponse } from 'next/server'
import { checkDomain, registrarConfigured, DomainRegistrarError } from '@/lib/domain-registrar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeDomain(input) {
  if (!input) return ''
  let d = String(input).trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0]
  return d
}

function pickEvents(events) {
  const m = {}
  if (!Array.isArray(events)) return m
  for (const e of events) if (e?.eventAction && e?.eventDate) m[e.eventAction] = e.eventDate
  return m
}

function pickRegistrar(entities) {
  if (!Array.isArray(entities)) return null
  for (const e of entities) {
    if ((e.roles || []).includes('registrar')) {
      const fn = (e.vcardArray?.[1] || []).find(x => x?.[0] === 'fn')
      return fn?.[3] || e.handle || null
    }
  }
  return null
}

async function rdapLookup(domain) {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    redirect: 'follow',
    headers: { Accept: 'application/rdap+json' },
    signal: AbortSignal.timeout(9000),
  })
  if (res.status === 404) return { registered: false }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`RDAP ${res.status}: ${text.slice(0, 200) || res.statusText}`)
  }
  const j = await res.json()
  const events = pickEvents(j.events)
  const ns = Array.isArray(j.nameservers) ? j.nameservers.map(n => (n?.ldhName || '').toLowerCase()).filter(Boolean) : []
  return {
    registered: true,
    registrar: pickRegistrar(j.entities),
    nameservers: ns,
    registered_at: events.registration || null,
    expires_at: events.expiration || null,
    last_changed: events['last changed'] || null,
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const domain = normalizeDomain(url.searchParams.get('domain'))
  if (!domain || !/^[a-z0-9][a-z0-9-]*(\.[a-z]{2,})+$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain. Example: margefarrington.com' }, { status: 400 })
  }
  try {
    const info = await rdapLookup(domain)
    const payload = {
      domain,
      available: !info.registered,
      registrar: info.registrar || null,
      nameservers: info.nameservers || [],
      registered_at: info.registered_at || null,
      expires_at: info.expires_at || null,
      // Price is null unless Cloudflare actually quoted one. Callers — voice
      // agents especially — must never substitute a remembered or estimated
      // number for a null here.
      price: null,
      currency: null,
      registrable: null,
      reason: null,
      reason_text: null,
      premium: false,
      pricing_error: null,
    }

    if (!info.registered && registrarConfigured()) {
      try {
        const quote = await checkDomain(domain)
        payload.price = quote.price
        payload.currency = quote.price == null ? null : quote.currency
        payload.registrable = quote.registrable
        payload.reason = quote.reason
        payload.reason_text = quote.reasonText || null
        payload.premium = quote.premium
      } catch (priceError) {
        payload.pricing_error = priceError instanceof DomainRegistrarError
          ? priceError.message
          : 'Could not reach Cloudflare for pricing.'
      }
    }

    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
