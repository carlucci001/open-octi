// Buying a domain is irreversible and non-refundable, so this route is a
// two-step gate rather than a single call.
//
//   1. POST { domain } with no confirmToken -> a real quote from the registry
//      plus a signed confirmToken with the price baked into the signature.
//   2. POST { domain, confirmToken } -> verify the signature, re-check that
//      the price has not moved, then register.
//
// The point of binding the price into the token: a voice agent cannot spend
// money on a number it invented. It has to have been handed the quote, and
// the quote is what it must say out loud before step 2 will be honoured.
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireCrmWrite } from '@/lib/permissions'
import { mutateData } from '@/lib/dataStore'
import {
  checkDomain,
  registerDomain,
  normalizeDomain,
  isDomainShaped,
  registrarConfigured,
  DomainRegistrarError,
} from '@/lib/domain-registrar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_TTL_MS = 5 * 60 * 1000
const FALLBACK_SECRET = crypto.randomBytes(32).toString('hex')

function secret() {
  return String(
    process.env.DOMAIN_CONFIRM_SECRET
    || process.env.CRM_SESSION_SECRET
    || process.env.AUTOMATION_BRIDGE_SECRET
    || FALLBACK_SECRET,
  )
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verify(token) {
  const [body, mac] = String(token || '').split('.')
  if (!body || !mac) return null
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload?.exp || Date.now() > payload.exp) return null
    return payload
  } catch { return null }
}

const money = (amount, currency) => `$${Number(amount).toFixed(2)}${currency && currency !== 'USD' ? ` ${currency}` : ''}`

function fileDomain(entry) {
  return mutateData('domains.json', store => {
    const data = store && typeof store === 'object' && !Array.isArray(store) ? { ...store } : { domains: [] }
    const domains = Array.isArray(data.domains) ? [...data.domains] : []
    const existing = domains.findIndex(item => normalizeDomain(item?.domain) === entry.domain)
    const nextNumber = domains.reduce((max, item) => {
      const n = Number(String(item?.id || '').replace(/\D/g, ''))
      return Number.isFinite(n) && n > max ? n : max
    }, 0) + 1
    const record = {
      id: existing >= 0 ? domains[existing].id : `dom_${String(nextNumber).padStart(3, '0')}`,
      domain: entry.domain,
      registrar: 'Cloudflare',
      hosting: existing >= 0 ? domains[existing].hosting || 'unknown' : 'unknown',
      hostingType: existing >= 0 ? domains[existing].hostingType || 'unknown' : 'unknown',
      dnsProvider: 'Cloudflare',
      sslStatus: 'pending',
      expirationDate: entry.expiresAt ? String(entry.expiresAt).slice(0, 10) : '',
      autoRenew: entry.autoRenew !== false,
      status: entry.status === 'active' ? 'active' : 'pending',
      notes: entry.notes || '',
      aRecords: existing >= 0 ? domains[existing].aRecords || [] : [],
      cnameRecords: existing >= 0 ? domains[existing].cnameRecords || [] : [],
    }
    if (existing >= 0) domains[existing] = { ...domains[existing], ...record }
    else domains.push(record)
    data.domains = domains
    data.lastUpdated = new Date().toISOString()
    return { data, result: record }
  })
}

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error

  if (!registrarConfigured()) {
    return NextResponse.json({
      ok: false,
      error: 'Cloudflare Registrar is not configured on this server, so no domain can be purchased.',
      spoken: 'I cannot buy that — Cloudflare Registrar is not configured on this server.',
    }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const domain = normalizeDomain(body.domain)
  const years = Math.max(1, Math.min(10, Number(body.years) || 1))
  const privacy = body.privacy !== false
  const autoRenew = body.autoRenew !== false

  if (!domain || !isDomainShaped(domain)) {
    return NextResponse.json({
      ok: false,
      error: `"${body.domain || ''}" is not a valid domain name.`,
      spoken: 'That does not look like a valid domain name. Say it again including the extension.',
    }, { status: 400 })
  }

  // ---- Step 1: quote ------------------------------------------------------
  if (!body.confirmToken) {
    try {
      const quote = await checkDomain(domain)
      if (quote.registrable === false || quote.available === false) {
        return NextResponse.json({
          ok: false,
          registrable: false,
          domain,
          reason: quote.reason,
          error: `${domain} cannot be registered here — ${quote.reasonText || 'the registry declined it'}.`,
          spoken: `I cannot buy ${domain} — ${quote.reasonText || 'the registry declined it'}.`,
        }, { status: 409 })
      }
      if (quote.price == null) {
        return NextResponse.json({
          ok: false,
          domain,
          error: 'Cloudflare returned no price for that domain, so I will not guess one.',
          spoken: `Cloudflare did not give me a price for ${domain}, and I am not going to guess. Buy it in the dashboard.`,
        }, { status: 502 })
      }
      const total = Math.round(quote.price * years * 100) / 100
      const confirmToken = sign({
        d: domain, p: quote.price, c: quote.currency, y: years, pr: privacy, ar: autoRenew,
        exp: Date.now() + TOKEN_TTL_MS,
      })
      return NextResponse.json({
        ok: true,
        phase: 'quote',
        domain,
        price: quote.price,
        total,
        currency: quote.currency,
        years,
        premium: quote.premium,
        confirmToken,
        expiresInSeconds: Math.round(TOKEN_TTL_MS / 1000),
        spoken: `${domain} is available. ${money(quote.price, quote.currency)} a year${years > 1 ? `, ${money(total, quote.currency)} for ${years} years` : ''}, privacy included, charged to the Cloudflare card on file. It is non-refundable. Say yes and I will buy it.`,
      })
    } catch (quoteError) {
      const status = quoteError instanceof DomainRegistrarError && quoteError.stage === 'input' ? 400 : 502
      console.error('[domain-quote]', quoteError?.message)
      return NextResponse.json({
        ok: false,
        error: quoteError?.message || 'Could not price that domain.',
        spoken: `I could not get a price for ${domain}. ${quoteError?.message || ''}`.trim(),
      }, { status })
    }
  }

  // ---- Step 2: confirmed purchase ----------------------------------------
  const claim = verify(body.confirmToken)
  if (!claim || claim.d !== domain) {
    return NextResponse.json({
      ok: false,
      error: 'That confirmation is invalid or expired. Get a fresh quote before buying.',
      spoken: 'That confirmation expired. Let me price it again before we buy.',
    }, { status: 400 })
  }

  try {
    // The registry can reprice between quote and confirm. If it moved, refuse
    // and make the operator hear the new number.
    const recheck = await checkDomain(domain)
    if (recheck.registrable === false || recheck.available === false) {
      return NextResponse.json({
        ok: false,
        error: `${domain} is no longer available — ${recheck.reasonText || 'the registry declined it'}.`,
        spoken: `${domain} just became unavailable. I did not charge anything.`,
      }, { status: 409 })
    }
    if (recheck.price != null && Math.abs(recheck.price - Number(claim.p)) > 0.01) {
      return NextResponse.json({
        ok: false,
        repriced: true,
        price: recheck.price,
        currency: recheck.currency,
        error: `Price changed from ${money(claim.p, claim.c)} to ${money(recheck.price, recheck.currency)}. Nothing was charged.`,
        spoken: `The price changed to ${money(recheck.price, recheck.currency)} a year. I did not buy it. Want it at the new price?`,
      }, { status: 409 })
    }

    const purchase = await registerDomain({
      domain,
      years: claim.y,
      privacy: claim.pr !== false,
      autoRenew: claim.ar !== false,
      idempotencyKey: crypto.createHash('sha256').update(String(body.confirmToken)).digest('hex').slice(0, 32),
    })

    const filed = fileDomain({
      domain,
      expiresAt: purchase.expiresAt,
      autoRenew: claim.ar !== false,
      status: purchase.status === 'active' ? 'active' : 'pending',
      notes: `Registered ${new Date().toISOString().slice(0, 10)} via Cloudflare Registrar by ${user?.email || user?.id || 'crm'}.`,
    })

    const charged = purchase.price != null ? purchase.price : Number(claim.p) * Number(claim.y)
    console.log('[domain-register]', domain, purchase.status, charged, claim.c)
    return NextResponse.json({
      ok: true,
      phase: 'registered',
      domain,
      status: purchase.status,
      years: claim.y,
      price: charged,
      currency: purchase.currency || claim.c,
      expiresAt: purchase.expiresAt,
      record: filed,
      spoken: `Done. ${domain} is registered for ${claim.y} year${claim.y > 1 ? 's' : ''} at ${money(charged, purchase.currency || claim.c)}, privacy on, and it is filed in your domains list.`,
    })
  } catch (purchaseError) {
    console.error('[domain-register]', domain, purchaseError?.message)
    return NextResponse.json({
      ok: false,
      error: purchaseError?.message || 'Registration failed.',
      spoken: `The purchase failed and I do not know whether it charged. Check Cloudflare before trying again. ${purchaseError?.message || ''}`.trim(),
    }, { status: 502 })
  }
}
