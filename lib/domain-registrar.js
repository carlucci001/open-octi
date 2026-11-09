// Cloudflare Registrar — the only path Command Center uses to buy a domain.
//
// Only API-supported, standard-priced domains are registrable here — others come
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
  domain_premium: 'premium domains cannot currently be purchased through the Cloudflare API',
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

// Registrar needs a token with Registrar write permission. The existing
// CLOUDFLARE_API_TOKEN is the zone-scoped fcc-dns-edit token and is still used
// by app/api/domains/sync-cloudflare — do not repoint it. A dedicated
// CLOUDFLARE_REGISTRAR_TOKEN wins when present so the two never collide.
export function registrarToken() {
  const dedicated = getCred('cloudflare registrar') || {}
  const general = getCred('cloudflare') || {}
  return String(
    process.env.CLOUDFLARE_REGISTRAR_TOKEN
    || dedicated.key || dedicated.token || dedicated.value
    || process.env.CLOUDFLARE_API_TOKEN
    || general.key || general.token || general.value
    || '',
  ).trim()
}

export function registrarConfigured() {
  return Boolean(registrarToken())
}

async function cf(path, { method = 'GET', body, includeStatus = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const token = registrarToken()
  if (!token) {
    throw new DomainRegistrarError('No Cloudflare API token is configured, so nothing can be registered.', { stage: 'config' })
  }
  let response
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1000, Math.min(REQUEST_TIMEOUT_MS, Number(timeoutMs) || REQUEST_TIMEOUT_MS))),
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
  if (!payload || payload.result == null) {
    throw new DomainRegistrarError('Cloudflare returned an unreadable response.', { stage: 'response', status: response.status })
  }
  return includeStatus ? { result: payload.result, httpStatus: response.status } : payload.result
}

export async function resolveAccountId({ timeoutMs } = {}) {
  const fromEnv = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  if (fromEnv) return fromEnv
  const accounts = await cf('/accounts?per_page=50', { timeoutMs })
  if (!Array.isArray(accounts) || accounts.length !== 1 || !accounts[0]?.id) {
    throw new DomainRegistrarError('Set CLOUDFLARE_ACCOUNT_ID for the intended account; this token does not identify exactly one Cloudflare account.', { stage: 'config' })
  }
  return accounts[0].id
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
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function rowsOf(result) {
  if (Array.isArray(result)) return result
  const rows = result?.domains || result?.results || result?.availability
  return Array.isArray(rows) ? rows : []
}

export function reasonInWords(reason) {
  if (!reason) return ''
  return REGISTRABLE_REASONS[reason] || String(reason).replace(/_/g, ' ')
}

// Availability AND real price, straight from the registry. Up to 20 domains
// per call, which is Cloudflare's documented limit.
export async function checkDomains(domains, { accountId, timeoutMs } = {}) {
  const startedAt = Date.now()
  const list = [...new Set((Array.isArray(domains) ? domains : [domains]).map(normalizeDomain).filter(Boolean))].slice(0, 20)
  if (!list.length) throw new DomainRegistrarError('No domain to check.', { stage: 'input' })
  for (const domain of list) {
    if (!isDomainShaped(domain)) throw new DomainRegistrarError(`"${domain}" is not a valid domain name.`, { stage: 'input' })
  }
  const account = accountId || await resolveAccountId({ timeoutMs })
  const remainingMs = timeoutMs == null ? undefined : Math.max(1000, Number(timeoutMs) - (Date.now() - startedAt))
  const rows = rowsOf(await cf(`/accounts/${account}/registrar/domain-check`, { method: 'POST', body: { domains: list }, timeoutMs: remainingMs }))
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
        return Number.isFinite(n) && n > 0 ? n : null
      })(),
      currency: row?.pricing?.currency || row.currency || null,
    }
  })
}

export async function checkDomain(domain, options) {
  const [row] = await checkDomains([domain], options)
  return row
}

// Spends money. Never call this without a verified confirmation token from
// app/api/domains/register — the price the operator heard is bound into it.
export async function registerDomain({ domain, years = 1, privacy = true, autoRenew = false, accountId } = {}) {
  const name = normalizeDomain(domain)
  if (!name || !isDomainShaped(name)) throw new DomainRegistrarError(`"${domain}" is not a valid domain name.`, { stage: 'input' })
  const term = Number(years)
  if (!Number.isInteger(term) || term < 1 || term > 10) throw new DomainRegistrarError('Registration term must be a whole number from 1 to 10 years.', { stage: 'input' })
  const account = accountId || await resolveAccountId()
  const { result, httpStatus } = await cf(`/accounts/${account}/registrar/registrations`, {
    method: 'POST',
    body: { domain_name: name, years: term, privacy_mode: privacy !== false ? 'redaction' : 'off', auto_renew: autoRenew === true },
    includeStatus: true,
  })
  return { ...workflowResult(name, result), years: term, httpStatus }
}

function workflowResult(domain, result) {
  const registration = result?.context?.registration
  const completed = result?.completed === true
  const registered = result?.state === 'succeeded' && completed && registration?.status === 'active' && normalizeDomain(registration?.domain_name) === domain
  return {
    domain,
    state: result?.state || 'unknown',
    completed,
    registered,
    status: registered ? 'active' : result?.state || 'unknown',
    expiresAt: registered ? registration.expires_at || null : null,
    action: result?.context?.action || null,
  }
}

export async function registrationStatus(domain, { accountId } = {}) {
  const name = normalizeDomain(domain)
  if (!isDomainShaped(name)) throw new DomainRegistrarError('Invalid domain name.', { stage: 'input' })
  const account = accountId || await resolveAccountId()
  const result = await cf(`/accounts/${account}/registrar/registrations/${encodeURIComponent(name)}/registration-status`)
  return workflowResult(name, result)
}
