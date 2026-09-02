// Cloudflare Registrar — the only path Command Center uses to buy a domain.
//
// Cloudflare's registration API shipped as a BETA on 2026-04-15 and covers
// search / check / register only: no renewals, no transfers, no contact
// updates. Only a subset of TLDs are registrable through it — the rest come
// back `extension_not_supported_via_api` and have to be bought in the
// dashboard. Registrations charge the account's default payment method, are
// non-refundable, and cannot be undone, so every caller goes through the
// two-step quote/confirm gate in app/api/domains/register.
// Docs: https://developers.cloudflare.com/registrar/registrar-api/
import { getCred } from './agent-creds'

const API = 'https://api.cloudflare.com/client/v4'
const REQUEST_TIMEOUT_MS = 30000

export class DomainRegistrarError extends Error {
  constructor(message, meta = {}) {
    super(message)
    this.name = 'DomainRegistrarError'
    Object.assign(this, meta)
  }
}

// Reason codes the check endpoint returns when `registrable` is false, in
// words an agent can say out loud without inventing an explanation.
export const REGISTRABLE_REASONS = {
  domain_unavailable: 'it is already registered',
  extension_not_supported_via_api: 'Cloudflare cannot sell that extension through the API yet — it has to be bought in the Cloudflare dashboard',
  extension_not_supported: 'Cloudflare Registrar does not carry that extension',
  extension_disallows_registration: 'that extension does not allow new registrations',
}

export function normalizeDomain(input) {
  if (!input) return ''
  return String(input).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0]
}

export function isDomainShaped(domain) {
  return /^[a-z0-9][a-z0-9-]*(\.[a-z]{2,})+$/.test(domain)
}

// Registrar needs an account-scoped token with Registrar:Edit. The existing
// CLOUDFLARE_API_TOKEN is the zone-scoped fcc-dns-edit token and is still used
// by app/api/domains/sync-cloudflare — do not repoint it. A dedicated
// CLOUDFLARE_REGISTRAR_TOKEN wins when present so the two never collide.
export function registrarToken() {
  const cred = getCred('cloudflare registrar') || getCred('cloudflare') || {}
  return String(
    process.env.CLOUDFLARE_REGISTRAR_TOKEN
    || process.env.CLOUDFLARE_API_TOKEN
    || cred.key || cred.token || cred.value
    || '',
  ).trim()
}

export function registrarConfigured() {
  return Boolean(registrarToken())
}

let cachedAccountId = null

async function cf(path, { method = 'GET', body, headers } = {}) {
  const token = registrarToken()
  if (!token) {
    throw new DomainRegistrarError('No Cloudflare API token is configured, so nothing can be registered.', { stage: 'config' })
  }
  let response
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (networkError) {
    throw new DomainRegistrarError(`Could not reach Cloudflare: ${networkError?.message || 'network error'}`, { stage: 'network' })
  }

  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = null }

  if (!response.ok || payload?.success === false) {
    const detail = (payload?.errors || []).map(e => e?.message).filter(Boolean).join('; ')
    throw new DomainRegistrarError(detail || `Cloudflare returned ${response.status}.`, {
      stage: 'cloudflare',
      status: response.status,
      code: payload?.errors?.[0]?.code ?? null,
    })
  }
  return payload?.result ?? payload
}

export async function resolveAccountId() {
  if (cachedAccountId) return cachedAccountId
  const fromEnv = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  if (fromEnv) { cachedAccountId = fromEnv; return fromEnv }
  const accounts = await cf('/accounts')
  const first = Array.isArray(accounts) ? accounts[0] : null
  if (!first?.id) throw new DomainRegistrarError('The Cloudflare token does not resolve to an account.', { stage: 'config' })
  cachedAccountId = first.id
  return cachedAccountId
}

// Cloudflare has moved these field names around during the beta, so read
// every shape we have seen rather than trusting one.
function priceOf(row) {
  const candidates = [
    // The live beta shape, confirmed against the API 2026-08-06:
    // { name, registrable, tier, pricing: { currency, registration_cost } }
    // — costs are STRINGS, so parse rather than trust the type.
    row?.pricing?.registration_cost,
    row?.pricing?.registration,
    row?.price,
    row?.registration_price,
    row?.fees?.registration,
    row?.registration?.price,
  ]
  for (const value of candidates) {
    const n = Number(typeof value === 'object' && value ? value.amount : value)
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  return null
}

function rowsOf(result) {
  if (Array.isArray(result)) return result
  return result?.domains || result?.results || result?.availability || []
}

export function reasonInWords(reason) {
  if (!reason) return ''
  return REGISTRABLE_REASONS[reason] || String(reason).replace(/_/g, ' ')
}

// Availability AND real price, straight from the registry. Up to 20 domains
// per call, which is Cloudflare's documented limit.
export async function checkDomains(domains) {
  const list = [...new Set((Array.isArray(domains) ? domains : [domains]).map(normalizeDomain).filter(Boolean))].slice(0, 20)
  if (!list.length) throw new DomainRegistrarError('No domain to check.', { stage: 'input' })
  for (const domain of list) {
    if (!isDomainShaped(domain)) throw new DomainRegistrarError(`"${domain}" is not a valid domain name.`, { stage: 'input' })
  }
  const account = await resolveAccountId()
  const rows = rowsOf(await cf(`/accounts/${account}/registrar/domain-check`, { method: 'POST', body: { domains: list } }))
  return list.map(domain => {
    const row = rows.find(item => normalizeDomain(item?.name || item?.domain) === domain) || {}
    const reason = row.reason || row.registrable_reason || null
    // The beta returns no separate `available` flag — `registrable` is the
    // whole answer, and a taken domain comes back registrable:false with
    // reason domain_unavailable.
    const registrable = typeof row.registrable === 'boolean' ? row.registrable : null
    return {
      domain,
      available: typeof row.available === 'boolean' ? row.available : registrable,
      registrable,
      reason,
      reasonText: reasonInWords(reason),
      premium: Boolean(row.premium) || (row.tier ? String(row.tier).toLowerCase() !== 'standard' : false),
      tier: row.tier || null,
      price: priceOf(row),
      renewalPrice: (() => {
        const n = Number(row?.pricing?.renewal_cost)
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
      })(),
      currency: row?.pricing?.currency || row.currency || 'USD',
    }
  })
}

export async function checkDomain(domain) {
  const [row] = await checkDomains([domain])
  return row
}

// Spends money. Never call this without a verified confirmation token from
// app/api/domains/register — the price the operator heard is bound into it.
export async function registerDomain({ domain, years = 1, privacy = true, autoRenew = true, idempotencyKey } = {}) {
  const name = normalizeDomain(domain)
  if (!name || !isDomainShaped(name)) throw new DomainRegistrarError(`"${domain}" is not a valid domain name.`, { stage: 'input' })
  const term = Math.max(1, Math.min(10, Number(years) || 1))
  const account = await resolveAccountId()
  const result = await cf(`/accounts/${account}/registrar/registrations`, {
    method: 'POST',
    body: { domain: name, years: term, privacy: privacy !== false, auto_renew: autoRenew !== false },
    headers: idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey) } : undefined,
  })
  return {
    domain: name,
    years: term,
    status: result?.status || result?.registration_status || 'submitted',
    price: priceOf(result),
    currency: result?.currency || 'USD',
    expiresAt: result?.expires_at || result?.expiry || null,
    id: result?.id || null,
  }
}

export async function registrationStatus(domain) {
  const name = normalizeDomain(domain)
  const account = await resolveAccountId()
  const result = await cf(`/accounts/${account}/registrar/registrations/${encodeURIComponent(name)}/registration-status`)
  return { domain: name, status: result?.status || null, raw: result || null }
}
