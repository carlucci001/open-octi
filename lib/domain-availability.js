import { checkDomain, registrarConfigured, normalizeDomain, isDomainShaped } from './domain-registrar'

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json'
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000
const RDAP_TIMEOUT_MS = 2500
let bootstrapCache = null
let bootstrapExpiresAt = 0
let bootstrapRequest = null

async function bootstrapServices() {
  if (bootstrapCache && Date.now() < bootstrapExpiresAt) return bootstrapCache
  if (!bootstrapRequest) {
    bootstrapRequest = (async () => {
      const response = await fetch(BOOTSTRAP_URL, { signal: AbortSignal.timeout(RDAP_TIMEOUT_MS) })
      if (!response.ok) throw new Error('Registry directory unavailable.')
      const data = await response.json()
      if (!Array.isArray(data?.services)) throw new Error('Registry directory unavailable.')
      bootstrapCache = data.services
      bootstrapExpiresAt = Date.now() + BOOTSTRAP_TTL_MS
      return bootstrapCache
    })().finally(() => { bootstrapRequest = null })
  }
  return bootstrapRequest
}

async function registryDetails(domain) {
  const tld = domain.split('.').at(-1)
  const services = await bootstrapServices()
  const endpoints = services.find(entry => Array.isArray(entry?.[0]) && entry[0].includes(tld))?.[1]
  const endpoint = Array.isArray(endpoints) && endpoints.find(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch { return false }
  })
  if (!endpoint) throw new Error('No authoritative registry lookup is available for this extension.')
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`, {
    headers: { Accept: 'application/rdap+json' },
    signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
  })
  if (response.status === 404) return { registered: false }
  if (!response.ok) throw new Error('The registry lookup is unavailable.')
  const data = await response.json()
  if (String(data?.objectClassName || '').toLowerCase() !== 'domain'
      || normalizeDomain(data?.ldhName || '') !== domain) {
    throw new Error('The registry did not return a matching domain record.')
  }
  const events = Object.fromEntries((Array.isArray(data.events) ? data.events : [])
    .filter(event => event?.eventAction && event?.eventDate)
    .map(event => [event.eventAction, event.eventDate]))
  const entity = (Array.isArray(data.entities) ? data.entities : [])
    .find(item => Array.isArray(item.roles) && item.roles.includes('registrar'))
  const registrar = entity?.vcardArray?.[1]?.find?.(field => field?.[0] === 'fn')?.[3] || entity?.handle || null
  return {
    registered: true,
    registrar,
    nameservers: (Array.isArray(data.nameservers) ? data.nameservers : [])
      .map(item => String(item?.ldhName || '').toLowerCase()).filter(Boolean),
    registered_at: events.registration || null,
    expires_at: events.expiration || null,
  }
}

// Cloudflare supplies the actionable registration quote. Registry metadata is
// optional: a blocked RDAP service must never prevent a valid registrar check.
export async function lookupDomainAvailability(input) {
  const domain = normalizeDomain(input)
  if (!isDomainShaped(domain)) {
    throw Object.assign(new Error('Invalid domain. Include a full domain name and extension.'), { status: 400 })
  }
  const payload = {
    domain,
    available: null,
    registrar: null,
    nameservers: [],
    registered_at: null,
    expires_at: null,
    price: null,
    currency: null,
    registrable: null,
    reason: null,
    reason_text: null,
    premium: false,
    pricing_error: null,
  }
  let registrarAnswered = false
  if (registrarConfigured()) {
    try {
      const quote = await checkDomain(domain, { timeoutMs: 7000 })
      registrarAnswered = true
      payload.registrable = typeof quote.registrable === 'boolean' ? quote.registrable : null
      payload.reason = quote.reason || null
      payload.reason_text = quote.reasonText || null
      payload.premium = quote.premium === true
      // "Cannot register here" also covers unsupported extensions and premium
      // names. Only domain_unavailable proves a name is already registered.
      if (quote.registrable === true) payload.available = true
      else if (quote.reason === 'domain_unavailable') payload.available = false
      if (quote.registrable === true && Number.isFinite(quote.price) && quote.price > 0) {
        payload.price = quote.price
        payload.currency = quote.currency || null
      }
    } catch {
      payload.pricing_error = 'Cloudflare Registrar could not verify availability and pricing. No purchase was attempted.'
    }
  } else {
    payload.pricing_error = 'Cloudflare Registrar is not configured. No registration price is available.'
  }

  try {
    const details = await registryDetails(domain)
    if (payload.available === null) payload.available = !details.registered
    if (details.registered) {
      for (const field of ['registrar', 'nameservers', 'registered_at', 'expires_at']) {
        payload[field] = details[field]
      }
    }
  } catch {
    // An authoritative registrar answer survives optional enrichment failures.
    if (!registrarAnswered) {
      throw Object.assign(new Error('Domain availability could not be verified: Cloudflare Registrar and the registry lookup are unavailable. No purchase was attempted.'), { status: 503 })
    }
  }
  return payload
}
