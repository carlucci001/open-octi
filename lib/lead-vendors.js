// lib/lead-vendors.js
// Vendor abstraction for lead sourcing.
//
// The sweep pipeline outsources exactly two jobs:
//   1. findBusinesses  — "find businesses matching a query in a location"
//   2. extractContacts — "pull emails/phones off these business websites"
//
// Callers never know which vendor fulfils them. Swap actors or providers via
// env (or automation dataSource.vendor overrides) — downstream filtering,
// scoring, dedupe and CRM writes never change.
//
// Config precedence: overrides (automation) > env > defaults.
//   LEAD_VENDOR_PROVIDER        default 'apify'
//   LEAD_FINDER_ACTOR_ID        default 'compass~crawler-google-places'
//   LEAD_ENRICH_ACTOR_ID        default 'vdrmota~contact-info-scraper'
//   LEAD_ENRICH_ENABLED         'false' disables the email-enrichment pass
//   LEAD_ENRICH_MAX_SITES       default 15 per run (cost guardrail)
//   LEAD_ENRICH_PAGES_PER_SITE  default 3 (homepage / contact / about)
//   LEAD_PEOPLE_ACTOR_ID        default 'T1XDXWc1L92AfIJtd' (provider 'apollo')
//   LEAD_PEOPLE_TITLES          csv, default owner,CEO,CTO,President,Founder
//   LEAD_PEOPLE_SIZES           csv, default 0-9,10-19,20-49
//   LEAD_PEOPLE_MAX_PAID_SEARCHES default 2, clamped to 1-6
//   LEAD_ENFORCE_GEO            'false' accepts leads outside the requested area
//
// To leave Apify entirely: add an adapter object below implementing the same
// two methods against the new service, register it in ADAPTERS, and set
// LEAD_VENDOR_PROVIDER. Nothing else in the pipeline changes.

// Two providers, and the difference is not cosmetic:
//
//   'apify'  — Google Places finder + website contact scraper. Returns
//              BUSINESSES. There is no person, no job title, and no work
//              email anywhere in that data; the email you get is whatever
//              info@ address happens to be printed on a contact page.
//
//   'apollo' — an Apollo-backed people search. Returns PEOPLE: named
//              decision-makers with titles, work emails and LinkedIn, plus
//              their company. No website-crawling pass is needed or run.
//
// Pick by what the campaign actually needs. Owner-name outreach cannot be
// done from Places data no matter how much enrichment is layered on top.
import { resolveLocationToZips, suggest, STATE_NAMES } from './lead-geo'
import { mapIndustries } from './lead-industries'
import { DEFAULT_APOLLO_PAID_SEARCHES, normalizeApolloPaidSearches } from './lead-paid-search-limit'

const DEFAULTS = {
  provider: 'apify',
  finderActorId: 'compass~crawler-google-places',
  enrichActorId: 'vdrmota~contact-info-scraper',
  peopleActorId: 'T1XDXWc1L92AfIJtd', // peakydev/leads-scraper-ppe
  peopleTitles: ['owner', 'CEO', 'CTO', 'President', 'Founder'],
  peopleSizes: ['0-9', '10-19', '20-49'],
  maxPaidBatches: DEFAULT_APOLLO_PAID_SEARCHES,
  enforceGeo: true,
  enrichEnabled: true,
  maxEnrichSites: 15,
  enrichPagesPerSite: 3,
}

function explicitFalse(value) {
  return value === false || String(value || '').toLowerCase() === 'false'
}

function boundedInt(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(Math.max(Math.round(num), min), max)
}

export function domainOf(url = '') {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function csvList(value, fallback) {
  if (Array.isArray(value) && value.length) return value.map(v => String(v).trim()).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return fallback
  const parts = text.split(',').map(v => v.trim()).filter(Boolean)
  return parts.length ? parts : fallback
}

// "City, ST" / "City, STrth Carolina" / "City, ST" -> parts.
// STATE_NAMES comes from lib/lead-geo: all 50 states + DC + territories.
const STATE_ABBREV = Object.fromEntries(Object.entries(STATE_NAMES).map(([k, v]) => [v.toLowerCase(), k]))

export function parseLocation(location = '') {
  const parts = String(location || '').split(',').map(p => p.trim()).filter(Boolean)
  const city = parts[0] || ''
  let state = parts[1] || ''
  if (state.length === 2) state = STATE_NAMES[state.toUpperCase()] || state
  const postalCodes = parts.filter(p => /^\d{5}$/.test(p))
  return { city: /^\d{5}$/.test(city) ? '' : city, state, postalCodes }
}

export function stateAbbrev(state = '') {
  const text = String(state || '').trim()
  if (text.length === 2) return text.toUpperCase()
  return STATE_ABBREV[text.toLowerCase()] || ''
}

// The people actor's geo filter accepts ONE thing: postal codes. Verified
// against the live actor 2026-08-06 with three runs of 20 leads each —
//   companyState "North Carolina" + city "City, ST" -> 0 in NC
//   companyState "NC" alone, no postal codes         -> 0 in NC
//   companyCityPostalCode ["28801","28803",...]      -> 20/20 in City, ST
// It never errors on a value it cannot use; it just returns the whole country.
// So a location has to become postal codes before the request goes out.
// That conversion is lib/lead-geo's offline resolver — the old zippopotam.us
// network lookup was removed 2026-08-13 after it refused runs it had resolved
// before (run lsr_msrqawbkuhbcol). Do not reintroduce a network dependency here.

export function resolveLeadVendorConfig(overrides = {}) {
  const env = process.env
  return {
    provider: String(overrides.provider || env.LEAD_VENDOR_PROVIDER || DEFAULTS.provider).trim().toLowerCase(),
    finderActorId: String(overrides.finderActorId || env.LEAD_FINDER_ACTOR_ID || DEFAULTS.finderActorId).trim(),
    enrichActorId: String(overrides.enrichActorId || env.LEAD_ENRICH_ACTOR_ID || DEFAULTS.enrichActorId).trim(),
    peopleActorId: String(overrides.peopleActorId || env.LEAD_PEOPLE_ACTOR_ID || DEFAULTS.peopleActorId).trim(),
    peopleTitles: csvList(overrides.peopleTitles || env.LEAD_PEOPLE_TITLES, DEFAULTS.peopleTitles),
    peopleSizes: csvList(overrides.peopleSizes || env.LEAD_PEOPLE_SIZES, DEFAULTS.peopleSizes),
    postalCodes: csvList(overrides.postalCodes || env.LEAD_PEOPLE_POSTAL_CODES, []),
    maxPaidBatches: normalizeApolloPaidSearches(
      overrides.maxPaidBatches ?? env.LEAD_PEOPLE_MAX_PAID_SEARCHES,
      DEFAULTS.maxPaidBatches,
    ),
    // The people actor accepts a location filter and then quietly ignores it.
    // Verified 2026-08-06: a run scoped to City, STrth Carolina returned
    // 20 leads, 0 of them in NC. We re-check every row against the requested
    // location ourselves rather than trusting the vendor's filter.
    enforceGeo: !explicitFalse(overrides.enforceGeo) && !explicitFalse(env.LEAD_ENFORCE_GEO),
    enrichEnabled: !explicitFalse(overrides.enrichEnabled) && !explicitFalse(env.LEAD_ENRICH_ENABLED),
    maxEnrichSites: boundedInt(overrides.maxEnrichSites || env.LEAD_ENRICH_MAX_SITES, DEFAULTS.maxEnrichSites, 1, 50),
    enrichPagesPerSite: boundedInt(overrides.enrichPagesPerSite || env.LEAD_ENRICH_PAGES_PER_SITE, DEFAULTS.enrichPagesPerSite, 1, 10),
  }
}

async function apifyRunSync({ actorId, input, apiKey, timeoutSeconds = 120, memory = 4096 }) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?timeout=${timeoutSeconds}&memory=${memory}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSeconds + 30) * 1000),
  })
  const text = await response.text().catch(() => '')
  let items = null
  try { items = JSON.parse(text) } catch {}
  if (!response.ok || !Array.isArray(items)) {
    // Surface the actor's own error body — a bare "HTTP 400" cost a debugging
    // round trip on 2026-08-13 when the real message was a schema violation.
    const detail = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    throw new Error(`Lead vendor actor ${actorId} failed with HTTP ${response.status}${detail ? ` — ${detail}` : ''}`)
  }
  return items
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Async run: start the actor, poll until it finishes, fetch the dataset.
// The run-sync endpoint has a hard ~300s ceiling and ABORTS the run at the
// timeout — a statewide people search (100 ZIPs × 4 industries × 100 results)
// was killed TIMED-OUT at exactly 240s on 2026-08-14 (Apify run
// D0hR1MTCCJU7Twx9S). Same pattern as the async report runner.
async function apifyRunAsync({ actorId, input, apiKey, memory = 2048, runTimeoutSeconds = 900, maxWaitSeconds = 960, pollSeconds = 10 }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  const startResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?timeout=${runTimeoutSeconds}&memory=${memory}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60000),
  })
  const startText = await startResponse.text().catch(() => '')
  let started = null
  try { started = JSON.parse(startText) } catch {}
  const run = started?.data
  if (!startResponse.ok || !run?.id) {
    const detail = String(startText || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    throw new Error(`Lead vendor actor ${actorId} failed with HTTP ${startResponse.status}${detail ? ` — ${detail}` : ''}`)
  }

  const startedAt = Date.now()
  const deadline = startedAt + maxWaitSeconds * 1000
  let status = String(run.status || 'READY')
  let lastLog = startedAt
  while (status !== 'SUCCEEDED') {
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(
        `Lead vendor actor ${actorId} run ${run.id} ended ${status} after ${Math.round((Date.now() - startedAt) / 1000)}s. `
        + 'The vendor could not finish this job — narrow the location or category, or raise LEAD_PEOPLE_RUN_TIMEOUT.',
      )
    }
    if (Date.now() > deadline) {
      await fetch(`https://api.apify.com/v2/actor-runs/${run.id}/abort`, { method: 'POST', headers }).catch(() => {})
      throw new Error(`Lead vendor actor ${actorId} run ${run.id} exceeded ${maxWaitSeconds}s and was aborted — narrow the location or category, or raise LEAD_PEOPLE_RUN_TIMEOUT.`)
    }
    await sleep(pollSeconds * 1000)
    const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}`, {
      headers,
      signal: AbortSignal.timeout(30000),
    }).catch(() => null)
    const statusBody = statusResponse ? await statusResponse.json().catch(() => null) : null
    status = String(statusBody?.data?.status || status)
    if (Date.now() - lastLog >= 60000) {
      console.log(`[lead-vendors] actor ${actorId} run ${run.id}: ${status} (${Math.round((Date.now() - startedAt) / 1000)}s)`)
      lastLog = Date.now()
    }
  }

  const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true`, {
    headers,
    signal: AbortSignal.timeout(120000),
  })
  const items = await itemsResponse.json().catch(() => null)
  if (!itemsResponse.ok || !Array.isArray(items)) {
    throw new Error(`Lead vendor actor ${actorId} run ${run.id} succeeded but the dataset fetch failed with HTTP ${itemsResponse.status}`)
  }
  return items
}

const apifyAdapter = {
  id: 'apify',

  // Returns raw result items; the pipeline normalizes them generically.
  async findBusinesses({ query, location, maxItems, scrapeContacts }, config, apiKey) {
    return apifyRunSync({
      actorId: config.finderActorId,
      apiKey,
      // Small/slow markets can take the Places actor past 120s; 240s keeps
      // sync runs inside Apify's 300s cap with headroom for our callers.
      timeoutSeconds: 240,
      memory: 4096,
      input: {
        searchStringsArray: [query],
        locationQuery: location,
        maxCrawledPlacesPerSearch: maxItems,
        language: 'en',
        skipClosedPlaces: true,
        website: 'allPlaces',
        scrapeContacts,
      },
    })
  },

  // Returns Map<domain, { emails: string[], phones: string[] }>.
  async extractContacts(websites, config, apiKey) {
    const items = await apifyRunSync({
      actorId: config.enrichActorId,
      apiKey,
      timeoutSeconds: 150,
      memory: 2048,
      input: {
        startUrls: websites.map(url => ({ url })),
        maxRequestsPerStartUrl: config.enrichPagesPerSite,
        maxDepth: 1,
        maxRequests: websites.length * config.enrichPagesPerSite,
        mergeContacts: true,
        maximumLeadsEnrichmentRecords: 0,
      },
    })
    const byDomain = new Map()
    for (const item of items) {
      const source = item?.originalStartUrl || item?.startUrl || item?.url || ''
      const domain = domainOf(source) || String(item?.domain || '').replace(/^www\./, '').toLowerCase()
      if (!domain) continue
      const bucket = byDomain.get(domain) || { emails: [], phones: [] }
      for (const email of [].concat(item?.emails || [])) {
        const text = String(email || '').trim()
        if (text && !bucket.emails.includes(text)) bucket.emails.push(text)
      }
      for (const phone of [].concat(item?.phones || [], item?.phonesUncertain || [])) {
        const text = String(phone || '').trim()
        if (text && !bucket.phones.includes(text)) bucket.phones.push(text)
      }
      byDomain.set(domain, bucket)
    }
    return byDomain
  },
}

// --- Apollo people search -------------------------------------------------
//
// Emits rows shaped like the Places finder's output, so the sweep's generic
// normalizer (leadFromApifyResult) reads them without a single change: it
// looks for businessName / contactName / website / address / email / phone,
// and this adapter fills exactly those.

const FREEMAIL = /(?:@(gmail|hotmail|yahoo|aol|outlook|icloud|live|msn)\.|^personal@example\.invalid$)/i

// Hard limit from the people actor's input schema (companyCityPostalCode
// maxItems: 100) — exceeding it is a schema-level HTTP 400 before any run.
const APOLLO_MAX_POSTAL_CODES = 100

// Split a large geography into disjoint, evenly distributed ZIP batches. A
// statewide run used to sample the same 100 ZIPs every time, so retries found
// the same people and could never backfill a requested lead count.
export function apolloPostalCodeBatch(zips = [], cap = APOLLO_MAX_POSTAL_CODES, batchIndex = 0) {
  const values = [...new Set((Array.isArray(zips) ? zips : []).map(value => String(value || '').trim()).filter(Boolean))]
  const size = Math.max(1, Number(cap) || APOLLO_MAX_POSTAL_CODES)
  const index = Math.max(0, Math.floor(Number(batchIndex) || 0))
  if (values.length <= size) return index === 0 ? values : []

  const batchCount = Math.ceil(values.length / size)
  if (index >= batchCount) return []
  return values.filter((_, valueIndex) => valueIndex % batchCount === index).slice(0, size)
}

// The actor prefixes its dataset with status banners that have a fullName and
// nothing else. Left in, "Industry filter is now working properly" becomes a
// contact record with a phone-less, email-less draft behind it.
export function isApolloLeadRow(row) {
  return Boolean(row && typeof row === 'object' && row.employee_id && row.fullName)
}

export function apolloRowMatchesLocation(row, { city, state }) {
  if (!city && !state) return true
  const haystack = [
    row?.city, row?.state, row?.address,
    row?.organizationCity, row?.organizationState, row?.organizationAddress,
  ].filter(Boolean).join(' ').toLowerCase()
  if (state) {
    const abbrev = Object.keys(STATE_NAMES).find(k => STATE_NAMES[k].toLowerCase() === state.toLowerCase())
    const stateHit = haystack.includes(state.toLowerCase())
      || (abbrev ? new RegExp(`\\b${abbrev.toLowerCase()}\\b`).test(haystack) : false)
    if (!stateHit) return false
  }
  if (city && !haystack.includes(city.toLowerCase())) return false
  return true
}

export function apolloRowToPlace(row) {
  const phones = String(row.phone_numbers || '').split(',').map(p => p.trim()).filter(Boolean)
  const orgPhone = String(row.organizationPhone || '').trim()
  const address = [row.organizationAddress, row.organizationCity, row.organizationState, row.organizationZipcode]
    .map(v => String(v || '').trim())
    .filter(v => v && v !== 'N/A')
    .join(', ')
  const email = String(row.email || '').trim()
  return {
    businessName: String(row.organizationName || '').trim(),
    contactName: String(row.fullName || '').trim(),
    jobTitle: String(row.title || '').trim(),
    website: String(row.organizationWebsite || '').trim(),
    address,
    email,
    phone: phones[0] || (orgPhone && orgPhone !== 'N/A' ? orgPhone : ''),
    emails: [email, ...String(row.all_emails || '').split(',').map(e => e.trim())].filter(Boolean),
    phones,
    linkedinUrl: String(row.linkedinUrl || '').trim(),
    emailKind: email ? (FREEMAIL.test(email) ? 'personal' : 'corporate') : 'none',
    description: [row.title, row.organizationName, row.organizationIndustry, row.organizationRevenue]
      .map(v => String(v || '').trim()).filter(v => v && v !== 'N/A').join(' · '),
  }
}

const apolloAdapter = {
  id: 'apollo',

  async findBusinesses({ query, location, maxItems, batchIndex = 0 }, config, apiKey) {
    const requested = String(location || '').trim()
    const parsed = parseLocation(requested)
    const industryTerms = String(query || '').split(/\s*[,;]\s*/).map(s => s.trim()).filter(Boolean)

    // The actor's `industry` field is an enum of 318 exact strings — free text
    // like "computer stores" is an instant HTTP 400 (run lsr_mssdien1ehds9d,
    // 2026-08-13). Map our human phrasing onto allowed values; refuse loudly
    // if nothing maps rather than running unfiltered nationwide-by-industry.
    const { industries, unmatched, suggestions } = mapIndustries(industryTerms)
    if (industryTerms.length && !industries.length) {
      throw new Error(
        `None of the category terms (${industryTerms.join(', ')}) match this vendor's allowed industry list, so the run would not be filtered by industry at all. `
        + (suggestions.length ? `Closest allowed values: ${suggestions.join('; ')}. ` : '')
        + 'Adjust the category, or pick an industry from the vendor’s list.',
      )
    }
    if (unmatched.length) {
      console.warn(`[lead-vendors] apollo: dropped category terms with no allowed-industry match: ${unmatched.join(', ')}`)
    }
    if (industries.length) {
      console.warn(`[lead-vendors] apollo: industry filter mapped to: ${industries.join('; ')}`)
    }

    // Offline resolver (lib/lead-geo): ZIPs, "City", "City, ST", bare state —
    // zero network calls. Precedence unchanged: explicit ZIPs in the location,
    // then the LEAD_PEOPLE_POSTAL_CODES override, then the resolver.
    const geo = parsed.postalCodes.length || config.postalCodes.length
      ? null
      : resolveLocationToZips(requested)
    let zips = parsed.postalCodes.length
      ? parsed.postalCodes
      : (config.postalCodes.length ? config.postalCodes : (geo?.zips || []))
    // The actor's input schema caps companyCityPostalCode at 100 items
    // (verified against builds/default 2026-08-13 after "North Carolina" =
    // 1,091 ZIPs drew an HTTP 400). Partition evenly so successive paid runs
    // cover fresh ZIPs across the state instead of repeating one sample.
    const totalZipCount = zips.length
    const zipBatchCount = Math.max(1, Math.ceil(totalZipCount / APOLLO_MAX_POSTAL_CODES))
    zips = apolloPostalCodeBatch(zips, APOLLO_MAX_POSTAL_CODES, batchIndex)
    if (totalZipCount && !zips.length) return []
    if (totalZipCount > APOLLO_MAX_POSTAL_CODES) {
      console.warn(`[lead-vendors] apollo: ${geo?.scope || location} resolves to ${totalZipCount} ZIPs; actor accepts ${APOLLO_MAX_POSTAL_CODES} — using batch ${Number(batchIndex) + 1} of ${zipBatchCount}`)
    }
    // The per-row geo re-check below is unchanged; the resolver just feeds it
    // a correct city/state split ("North Carolina" is a state, not a city).
    const city = geo ? geo.city : parsed.city
    const state = geo ? geo.state : parsed.state
    if (geo?.note) console.warn(`[lead-vendors] apollo geo: ${geo.note}`)

    // Without postal codes the actor silently ignores the location and bills
    // for a nationwide pull. Refuse rather than hand back the wrong county.
    if (config.enforceGeo && requested && !zips.length) {
      const hint = suggest(requested)
      throw new Error(
        `Could not resolve "${location}" to postal codes, and this vendor's only working geo filter is postal codes — `
        + 'it would have returned nationwide results. Supply postal codes in the location, set LEAD_PEOPLE_POSTAL_CODES, or set LEAD_ENFORCE_GEO=false.'
        + (hint ? ` Did you mean ${hint}?` : ''),
      )
    }

    // Async start-and-poll, NOT run-sync: a statewide pull ran past run-sync's
    // ceiling and was killed TIMED-OUT at 240s (2026-08-14). Heavy people
    // searches get up to LEAD_PEOPLE_RUN_TIMEOUT (default 900s) here; the
    // sweep already runs as a background job, so the long wait is fine.
    const runTimeoutSeconds = boundedInt(process.env.LEAD_PEOPLE_RUN_TIMEOUT, 900, 120, 3600)
    const items = await apifyRunAsync({
      actorId: config.peopleActorId,
      apiKey,
      runTimeoutSeconds,
      maxWaitSeconds: runTimeoutSeconds + 60,
      memory: 2048,
      input: {
        companyCityPostalCode: zips.length ? zips : undefined,
        companyState: stateAbbrev(state) ? [stateAbbrev(state)] : undefined,
        companyEmployeeSize: config.peopleSizes,
        industry: industries.length ? industries : undefined,
        personTitle: config.peopleTitles,
        // The actor rejects anything under 100 outright ("must be >= 100").
        totalResults: Math.max(100, Number(maxItems) || 100),
      },
    })

    const leads = items.filter(isApolloLeadRow)
    // The actor reports its own outages as fake rows, not failed runs — seen
    // live 2026-08-14 (run QhNoLaUdsArAl2tUu): 9 minutes, then a dataset of
    // two banners ending "Actor could not process your request. Try again in
    // an hour…". Surface the vendor's words instead of reporting 0 leads.
    if (!leads.length) {
      const vendorNotice = items
        .map(row => String(row?.fullName || '').trim())
        .find(text => /could not process|try again|contact support|error/i.test(text))
      if (vendorNotice) {
        throw new Error(
          `Lead vendor reported a service problem instead of results: "${vendorNotice}". `
          + 'This is on the vendor\'s side — the request was valid. Retry later (the vendor suggests about an hour).',
        )
      }
    }
    const inGeo = config.enforceGeo
      ? leads.filter(row => apolloRowMatchesLocation(row, { city, state }))
      : leads
    // Loud, not silent: a vendor geo filter that does nothing is the single
    // most expensive failure here — the list looks right until someone dials.
    if (config.enforceGeo && leads.length && !inGeo.length) {
      throw new Error(
        `Apollo returned ${leads.length} leads but none are in ${[city, state].filter(Boolean).join(', ')} — `
        + 'its location filter did not apply. Nothing was imported. Widen the location or set LEAD_ENFORCE_GEO=false to accept out-of-area leads.',
      )
    }
    if (config.enforceGeo && inGeo.length < leads.length) {
      console.warn(`[lead-vendors] apollo: dropped ${leads.length - inGeo.length} of ${leads.length} leads outside ${[city, state].filter(Boolean).join(', ')}`)
    }
    return inGeo.map(apolloRowToPlace)
  },

  // Apollo already carries the work email. Crawling the company website to
  // rediscover an info@ address would cost money and downgrade the contact.
  async extractContacts() {
    return new Map()
  },
}

const ADAPTERS = {
  apify: apifyAdapter,
  apollo: apolloAdapter,
}

export function getLeadVendorAdapter(config) {
  const adapter = ADAPTERS[config.provider]
  if (!adapter) throw new Error(`No lead vendor adapter registered for provider "${config.provider}"`)
  return adapter
}

export async function findBusinesses(params, config, apiKey) {
  return getLeadVendorAdapter(config).findBusinesses(params, config, apiKey)
}

export async function extractContacts(websites = [], config, apiKey) {
  if (!websites.length) return new Map()
  return getLeadVendorAdapter(config).extractContacts(websites, config, apiKey)
}

// Public-record signals are a first finder. The deterministic resolver supplies
// only jurisdiction-proven manifests; Places/Apollo remain the shortfall lane.
export async function pullSignals({ leadType = '', location = '', resolvedSources, jurisdiction = {}, since, limit = 50, persist = true } = {}) {
  const [{ pullLeadSignals }, { create, loadAll }] = await Promise.all([
    import('./lead-signals/adapters/index.js'),
    import('./entityStore.js'),
  ])
  const resolution = resolvedSources
    ? { jurisdiction, sources: resolvedSources }
    : (await import('./lead-signals/resolver.js')).resolveLeadSources({ leadType, location, jurisdiction })
  const selectedSources = resolution.sources || []
  const existing = new Set(loadAll('leadSignals').map(row => `${row.sourceId}:${row.externalId}`))
  const returned = new Set()
  const rows = []
  const sources = []
  const errors = []
  for (const source of selectedSources) {
    if (rows.length >= limit) break
    try {
      const result = await pullLeadSignals({ manifest: source, jurisdiction: resolution.jurisdiction || jurisdiction, since, limit: limit - rows.length })
      sources.push({ id: source.id, name: source.name, returned: result.rows.length })
      for (const row of result.rows) {
        const key = `${row.sourceId}:${row.externalId}`
        if (returned.has(key)) continue
        returned.add(key)
        rows.push(row)
        if (persist && !existing.has(key)) {
          existing.add(key)
          create('leadSignals', row)
        }
      }
    } catch (error) {
      errors.push({ sourceId: source.id, code: error.code || 'unreachable', error: error.message })
    }
  }
  return { rows, sources, errors, resolution }
}
