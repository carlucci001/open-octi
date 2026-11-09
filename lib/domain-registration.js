// Shared quote/confirm workflow for authenticated CRM and agent callers.
// The SQLite-backed reservation prevents a timeout or replay from buying again.
import crypto from 'crypto'
import { readData, mutateData } from './dataStore'
import {
  checkDomain, registerDomain, registrationStatus, resolveAccountId,
  normalizeDomain, isDomainShaped, registrarConfigured,
} from './domain-registrar'

const ATTEMPTS = 'domain-registration-attempts.json'
const TOKEN_TTL_MS = 5 * 60 * 1000
const FALLBACK_SECRET = crypto.randomBytes(32).toString('hex')
const secret = () => process.env.DOMAIN_CONFIRM_SECRET || process.env.CRM_SESSION_SECRET || process.env.AUTOMATION_BRIDGE_SECRET || FALLBACK_SECRET
const hash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex')
const money = (minor, currency) => `${currency} ${(minor / 100).toFixed(2)}`
const response = (status, body) => ({ status, body })
const failure = (status, error, extra = {}) => response(status, { ok: false, error, spoken: error, ...extra })

function sign(claim) {
  const body = Buffer.from(JSON.stringify(claim)).toString('base64url')
  return `${body}.${crypto.createHmac('sha256', secret()).update(body).digest('base64url')}`
}

function verify(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 2) return null
  const [body, mac] = parts
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  const a = Buffer.from(mac), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return claim.v === 1 && claim.exp > Date.now() ? claim : null
  } catch { return null }
}

function cents(value) {
  if (value == null || value === '') return null
  const n = Number(value), minor = Math.round(n * 100)
  return Number.isFinite(n) && n > 0 && Number.isSafeInteger(minor) && Math.abs(n * 100 - minor) < 0.000001 ? minor : null
}

function checkedPrice(quote, years, autoRenew) {
  if (quote?.registrable !== true || quote?.available !== true || quote?.premium === true || quote?.tier === 'premium') {
    throw new Error(quote?.reasonText || 'Cloudflare has not confirmed that this domain is eligible for registration. Nothing was purchased.')
  }
  const p = cents(quote.price), r = cents(quote.renewalPrice)
  const c = quote.currency
  if (p == null || typeof c !== 'string' || !/^[A-Z]{3}$/.test(c) || ((years > 1 || autoRenew) && r == null)) {
    throw new Error('Cloudflare did not provide complete, exact pricing and currency. Nothing was purchased.')
  }
  const t = p + (years - 1) * (r || 0)
  if (!Number.isSafeInteger(t)) throw new Error('The registration total is invalid. Nothing was purchased.')
  return { p, r, c, t }
}

function getAttempt(key) {
  return readData(ATTEMPTS)?.attempts?.[key] || null
}

function saveAttempt(key, attempt) {
  return mutateData(ATTEMPTS, store => {
    const data = store && typeof store === 'object' ? store : {}
    const current = data.attempts?.[key]
    if (current && (current.tokenHash !== attempt.tokenHash || (current.phase === 'registered' && attempt.phase !== 'registered'))) {
      return { data, result: current }
    }
    data.attempts = { ...data.attempts, [key]: { ...attempt, updatedAt: new Date().toISOString() } }
    return { data, result: data.attempts[key] }
  })
}

function reserveAttempt(key, attempt) {
  return mutateData(ATTEMPTS, store => {
    const data = store && typeof store === 'object' ? store : {}
    const previous = data.attempts?.[key]
    if (previous && (previous.phase !== 'failed' || previous.tokenHash === attempt.tokenHash)) {
      return { data, result: { reserved: false, attempt: previous } }
    }
    data.attempts = { ...data.attempts, [key]: attempt }
    return { data, result: { reserved: true, attempt } }
  })
}

function fileDomain(attempt, workflow) {
  return mutateData('domains.json', store => {
    const data = store && typeof store === 'object' && !Array.isArray(store) ? { ...store } : {}
    const domains = Array.isArray(data.domains) ? [...data.domains] : []
    const index = domains.findIndex(item => normalizeDomain(item?.domain) === attempt.domain)
    const previous = index >= 0 ? domains[index] : {}
    const record = {
      ...previous,
      id: previous.id || `dom_${crypto.randomUUID()}`,
      domain: attempt.domain, registrar: 'Cloudflare', dnsProvider: 'Cloudflare',
      hosting: previous.hosting || 'unknown', hostingType: previous.hostingType || 'unknown',
      sslStatus: previous.sslStatus || 'pending', status: 'active',
      expirationDate: workflow.expiresAt ? workflow.expiresAt.slice(0, 10) : previous.expirationDate || '',
      autoRenew: attempt.claim.ar,
      aRecords: previous.aRecords || [], cnameRecords: previous.cnameRecords || [],
      notes: previous.notes || `Registration confirmed by Cloudflare ${new Date().toISOString().slice(0, 10)}.`,
    }
    if (index >= 0) domains[index] = record
    else domains.push(record)
    return { data: { ...data, domains, lastUpdated: new Date().toISOString() }, result: record }
  })
}

function attemptResponse(attempt) {
  const { domain, claim, phase, workflow } = attempt
  const common = { domain, phase, state: workflow?.state || phase, years: claim.y, price: claim.t / 100, currency: claim.c, autoRenew: claim.ar }
  if (phase === 'registered') {
    return response(200, { ok: true, ...common, status: 'active', expiresAt: workflow.expiresAt, record: attempt.record,
      spoken: `${domain} is registered for ${claim.y} year${claim.y === 1 ? '' : 's'}. The approved registration total was ${money(claim.t, claim.c)}. Automatic renewal is ${claim.ar ? 'on' : 'off'}.` })
  }
  if (phase === 'failed') return failure(409, attempt.error || `Cloudflare reports that registration of ${domain} failed.`, common)
  const actionRequired = workflow?.state === 'action_required'
  return response(202, { ok: true, ...common, pending: true, completed: false,
    action: actionRequired ? workflow.action : null,
    nextAction: { action: 'status', domain },
    spoken: actionRequired ? `Cloudflare requires action to finish registering ${domain}. Registration is not complete. Review the Cloudflare registration status before continuing.`
      : phase === 'uncertain' ? `The registration outcome for ${domain} is not confirmed. I will check its existing request; I will not submit another purchase.`
        : `Cloudflare is still processing ${domain}. It is not confirmed registered yet. Check the existing request's status; do not purchase it again.` })
}

function recordWorkflow(key, attempt, workflow) {
  const current = getAttempt(key)
  if (current && (current.tokenHash !== attempt.tokenHash || current.phase === 'registered')) return attemptResponse(current)
  let phase = 'pending'
  if (workflow.registered) phase = 'registered'
  else if (workflow.completed && ['failed', 'cancelled', 'canceled'].includes(workflow.state)) phase = 'failed'
  else if (workflow.state === 'unknown' || workflow.completed) phase = 'uncertain'
  const record = phase === 'registered' ? fileDomain(attempt, workflow) : attempt.record
  const updated = saveAttempt(key, { ...attempt, phase, workflow, record,
    ...(phase === 'failed' ? { error: `Cloudflare reports that registration of ${attempt.domain} failed.` } : {}) })
  return attemptResponse(updated)
}

async function checkAttempt(key, attempt) {
  if (['registered', 'failed'].includes(attempt.phase)) return attemptResponse(attempt)
  // Let the single in-flight POST finish; after a process crash, status checks
  // become available once its bounded request deadline has elapsed.
  if (attempt.phase === 'submitting' && Date.now() - Date.parse(attempt.createdAt) < 31000) return attemptResponse(attempt)
  try {
    const workflow = await registrationStatus(attempt.domain, { accountId: attempt.accountId })
    return recordWorkflow(key, attempt, workflow)
  } catch {
    // A 404 or timeout does not prove that an earlier POST did not charge.
    return attemptResponse(saveAttempt(key, { ...attempt, phase: 'uncertain' }))
  }
}

export async function processDomainRegistration(input = {}, { user } = {}) {
  const body = input && typeof input === 'object' ? input : {}
  if (body.action && !['status', 'quote', 'confirm'].includes(body.action)) return failure(400, 'Unknown domain registration action.')
  if (body.action === 'quote' && body.confirmToken) return failure(400, 'Quote requests must not include a purchase confirmation token.')
  const domain = normalizeDomain(body.domain)
  if (!isDomainShaped(domain)) return failure(400, 'A valid domain name including its extension is required.')
  if (!registrarConfigured()) return failure(503, 'Cloudflare Registrar is not configured on this server, so no domain can be purchased.')
  let accountId
  try { accountId = await resolveAccountId() } catch (error) { return failure(503, error.message) }
  const key = `${accountId}:${domain}`
  const existing = getAttempt(key)
  // Status always takes precedence, including requests carrying a confirmation token.
  if (body.action === 'status') return existing ? checkAttempt(key, existing) : failure(404, 'There is no saved registration request for this domain.')
  if (existing && (existing.phase !== 'failed' || (body.confirmToken && existing.tokenHash === hash(body.confirmToken)))) return checkAttempt(key, existing)
  if (body.action === 'confirm' && !body.confirmToken) return failure(400, 'Get a fresh quote and confirm its price before purchasing.')

  if (!body.confirmToken) {
    const years = Number(body.years ?? body.period ?? 1)
    if (!Number.isInteger(years) || years < 1 || years > 10) return failure(400, 'Choose a whole registration term from 1 to 10 years.')
    const autoRenew = body.autoRenew === true, privacy = body.privacy !== false
    try {
      const quote = await checkDomain(domain, { accountId })
      const price = checkedPrice(quote, years, autoRenew)
      const claim = { v: 1, a: accountId, d: domain, ...price, y: years, ar: autoRenew, pr: privacy, nonce: crypto.randomUUID(), exp: Date.now() + TOKEN_TTL_MS }
      return response(200, { ok: true, phase: 'quote', domain, price: price.p / 100, renewalPrice: price.r == null ? null : price.r / 100,
        total: price.t / 100, currency: price.c, years, privacy, autoRenew, premium: false,
        confirmToken: sign(claim), expiresInSeconds: TOKEN_TTL_MS / 1000,
        spoken: `${domain} is available for ${money(price.t, price.c)} total for ${years} year${years === 1 ? '' : 's'}, charged to the Cloudflare payment method on file. Privacy is ${privacy ? 'requested where supported' : 'off'}. ${autoRenew ? `Automatic renewal is on and authorizes future charges; the current annual renewal price is ${money(price.r, price.c)} and may change.` : 'Automatic renewal is off.'} Registration is non-refundable. Confirm this domain and total before I purchase it.` })
    } catch (error) { return failure(502, error.message || 'Could not obtain a confirmed domain price.') }
  }

  const claim = verify(body.confirmToken)
  if (!claim || claim.d !== domain || claim.a !== accountId) return failure(400, 'This confirmation is invalid, expired, or belongs to a different account. Get a fresh quote.')
  try {
    const quote = await checkDomain(domain, { accountId })
    const fresh = checkedPrice(quote, claim.y, claim.ar)
    if (fresh.p !== claim.p || fresh.c !== claim.c || fresh.t !== claim.t || ((claim.y > 1 || claim.ar) && fresh.r !== claim.r)) {
      return failure(409, 'The domain price or currency changed. Nothing was purchased. Get and approve a fresh quote.', { repriced: true, price: fresh.p / 100, total: fresh.t / 100, currency: fresh.c })
    }
  } catch (error) { return failure(502, error.message || 'Could not recheck the domain price. Nothing was purchased.') }
  const reservation = reserveAttempt(key, { domain, accountId, claim, tokenHash: hash(body.confirmToken), phase: 'submitting', requestedBy: user?.id || user?.email || 'crm', createdAt: new Date().toISOString() })
  if (!reservation.reserved) return checkAttempt(key, reservation.attempt)
  const attempt = reservation.attempt
  try {
    const workflow = await registerDomain({ domain, accountId, years: claim.y, privacy: claim.pr, autoRenew: claim.ar })
    return recordWorkflow(key, attempt, workflow)
  } catch (error) {
    const rejected = error.stage === 'cloudflare' && [400, 401, 403, 404, 422, 429].includes(error.status)
    return attemptResponse(saveAttempt(key, { ...attempt, phase: rejected ? 'failed' : 'uncertain', error: rejected ? `Cloudflare rejected the registration: ${error.message}` : null }))
  }
}
