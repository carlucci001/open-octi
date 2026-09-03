import { Resend } from 'resend'
import { getCred } from './agent-creds'
import { create, loadAll } from './entityStore'
import { buildFarringtonLeadQuery, FARRINGTON_LEAD_VERTICALS, getFarringtonLeadVertical } from './farrington-lead-verticals'
import { domainOf, extractContacts, findBusinesses, resolveLeadVendorConfig } from './lead-vendors'
import { resolveLocationToZips } from './lead-geo'
import { enrichDraftNames, resolveNameEnrichConfig } from './lead-name-enrichment'
import { formatLeadSkipReasons } from './lead-sweep-outcome'
import { DEFAULT_APOLLO_PAID_SEARCHES } from './lead-paid-search-limit'

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/
const EMAIL_JUNK_RE = /^(?:no-?reply|donotreply|do-not-reply|noreply)|@(?:example\.|sentry\.|wixpress\.|sentry-next\.)|\.(?:png|jpe?g|gif|webp|svg)$/i

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function flattenText(value, depth = 0) {
  if (value == null || depth > 4) return []
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    return text ? [text] : []
  }
  if (Array.isArray(value)) return value.flatMap(item => flattenText(item, depth + 1))
  if (typeof value === 'object') return Object.values(value).flatMap(item => flattenText(item, depth + 1))
  return []
}

function getPathValue(item, path) {
  return String(path || '').split('.').reduce((value, key) => value?.[key], item)
}

function firstText(item, paths = []) {
  for (const path of paths) {
    const text = flattenText(getPathValue(item, path))[0]
    if (text) return text
  }
  return ''
}

function normalizePhone(value = '') {
  const match = String(value).match(PHONE_RE)
  if (!match) return ''
  const digits = match[0].replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return match[0].trim()
}

function extractEmail(item) {
  const direct = firstText(item, ['email', 'emails', 'contactEmail', 'contact.email', 'ownerEmail', 'leadEmail'])
  const directMatch = direct.match(EMAIL_RE)
  if (directMatch) return directMatch[0]
  const textMatch = flattenText(item).join(' ').match(EMAIL_RE)
  return textMatch?.[0] || ''
}

function extractPhone(item) {
  const direct = firstText(item, ['phone', 'phones', 'phoneNumber', 'phoneNumbers', 'telephone', 'tel', 'contactPhone', 'contact.phone'])
  const directPhone = normalizePhone(direct)
  if (directPhone) return directPhone
  return normalizePhone(flattenText(item).join(' '))
}

// Crawled emails can arrive URL-encoded ("redacted@example.invalid"). Decode, then
// re-match with a strict pattern (no "%") so encoding artifacts never reach CRM.
const STRICT_EMAIL_RE = /[A-Z0-9._+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

function pickBestEmail(emails = [], websiteDomain = '') {
  const usable = emails
    .map(email => {
      let value = String(email || '').trim()
      try { value = decodeURIComponent(value) } catch {}
      return value.match(STRICT_EMAIL_RE)?.[0] || ''
    })
    .filter(email => email && !EMAIL_JUNK_RE.test(email))
  if (!usable.length) return ''
  if (websiteDomain) {
    const sameDomain = usable.find(email => email.toLowerCase().endsWith(`@${websiteDomain}`))
    if (sameDomain) return sameDomain
  }
  return usable[0]
}

function contactQuality(draft) {
  const status = draft.email && draft.phone ? 'phone_email' : draft.email ? 'email_only' : draft.phone ? 'phone_only' : 'missing_direct_contact'
  const score = (draft.email ? 50 : 0) + (draft.phone ? 50 : 0)
  return { status, score }
}

function resultIdentity(item) {
  const website = firstText(item, ['website', 'websiteUrl', 'url', 'link', 'sourceUrl', 'placeUrl'])
  const email = extractEmail(item)
  const phone = extractPhone(item)
  const name = firstText(item, ['businessName', 'companyName', 'placeName', 'name', 'title'])
  return [website, email, phone, name].filter(Boolean).join('|').toLowerCase()
}

function identityKey(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.includes('@')) return `email:${text.toLowerCase()}`
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 10) return `phone:${digits.slice(-10)}`
  return `url:${text.toLowerCase()}`
}

function leadIdentityKeys(lead) {
  const contactKeys = [lead.email, lead.phone].map(identityKey).filter(Boolean)
  if (contactKeys.length) return contactKeys
  return [lead.website, lead.sourceUrl].map(identityKey).filter(Boolean)
}

export function selectLeadDrafts({ drafts = [], existingLeads = [], limit = 10 } = {}) {
  const existingKeys = new Set((Array.isArray(existingLeads) ? existingLeads : []).flatMap(leadIdentityKeys))
  const toCreate = []
  const skipped = []
  const skipReasons = { duplicate: 0, missingContact: 0, missingIdentity: 0 }
  let reviewed = 0

  for (const draft of Array.isArray(drafts) ? drafts : []) {
    if (toCreate.length >= limit) break
    reviewed += 1
    const keys = leadIdentityKeys(draft)

    if (!keys.length) {
      skipReasons.missingIdentity += 1
      skipped.push({ businessName: draft.businessName, website: draft.website, reason: 'missing identity' })
      continue
    }
    if (keys.some(key => existingKeys.has(key))) {
      skipReasons.duplicate += 1
      skipped.push({ businessName: draft.businessName, website: draft.website, reason: 'duplicate' })
      continue
    }
    if (!draft.phone && !draft.email) {
      skipReasons.missingContact += 1
      skipped.push({ businessName: draft.businessName, website: draft.website, reason: 'missing phone and email' })
      continue
    }

    keys.forEach(key => existingKeys.add(key))
    toCreate.push(draft)
  }

  return {
    toCreate,
    skipped,
    skipReasons,
    reviewed,
    unprocessed: Math.max(0, (Array.isArray(drafts) ? drafts.length : 0) - reviewed),
  }
}

export function resolveLeadSourceBatchLimit({
  provider,
  configuredZips = [],
  resolvedZips = [],
  maxPaidBatches = DEFAULT_APOLLO_PAID_SEARCHES,
} = {}) {
  if (provider !== 'apollo') return 1
  const selectedZips = Array.isArray(configuredZips) && configuredZips.length
    ? configuredZips
    : (Array.isArray(resolvedZips) ? resolvedZips : [])
  const availableBatches = Math.max(1, Math.ceil(selectedZips.length / 100))
  return Math.min(Math.max(1, Number(maxPaidBatches) || 1), availableBatches)
}

export async function collectLeadSourceBatches({
  provider,
  limit,
  maxBatches = 1,
  fetchBatch,
  assess,
} = {}) {
  if (typeof fetchBatch !== 'function' || typeof assess !== 'function') {
    throw new Error('Lead source batch collector requires fetchBatch and assess functions')
  }

  const batchLimit = provider === 'apollo' ? Math.max(1, Number(maxBatches) || 1) : 1
  const items = []
  let assessment = assess(items)
  let batchesRun = 0

  for (let batchIndex = 0; batchIndex < batchLimit; batchIndex += 1) {
    const batch = await fetchBatch(batchIndex)
    batchesRun += 1
    if (Array.isArray(batch)) items.push(...batch)
    assessment = assess(items)
    if (assessment.toCreate.length >= limit) break
    if (!Array.isArray(batch)) break
    // One Apollo ZIP partition can legitimately have no matches while the
    // next disjoint partition does. Keep searching within the paid-call cap;
    // an empty non-Apollo result still means that single source is exhausted.
    if (batch.length === 0 && provider !== 'apollo') break
  }

  return { items, assessment, batchesRun }
}

function uniqueApifyResults(items = [], limit = 10) {
  const rows = items
    .flatMap(item => Array.isArray(item.organicResults) ? item.organicResults : Array.isArray(item.results) ? item.results : [item])
    .filter(item => item && resultIdentity(item))

  const seen = new Set()
  const out = []
  for (const item of rows) {
    const identity = resultIdentity(item)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mapsSearchTerm(query, location) {
  const locationText = String(location || '').trim()
  if (!locationText) return query
  const cleaned = String(query || '')
    .replace(new RegExp(`\\b${escapeRegExp(locationText)}\\b`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || query
}

function explicitTrue(value) {
  return value === true || String(value || '').toLowerCase() === 'true'
}

function explicitFalse(value) {
  return value === false || String(value || '').toLowerCase() === 'false'
}

function leadFromApifyResult(item, { now, campaign, leadListId = null, location, query, runId, spec, vendor, vertical }) {
  const link = firstText(item, ['website', 'websiteUrl', 'url', 'link', 'sourceUrl', 'placeUrl'])
  const snippet = firstText(item, ['description', 'snippet', 'text', 'summary'])
  const email = extractEmail(item)
  const phone = extractPhone(item)
  const businessName = firstText(item, ['businessName', 'companyName', 'placeName', 'name', 'title']) || `${vertical.label} lead source`
  const contactName = firstText(item, ['contactName', 'ownerName', 'personName', 'contact.name'])
  const address = firstText(item, ['address', 'fullAddress', 'streetAddress', 'location.address'])
  const category = firstText(item, ['category', 'categories', 'type'])
  const contactStatus = email && phone ? 'phone_email' : email ? 'email_only' : phone ? 'phone_only' : 'missing_direct_contact'
  const sourceLocation = location || 'United States'
  const sourceDateTag = `sourced-${now.slice(0, 10)}`
  const locationTag = `geo-${slugify(sourceLocation)}`
  return {
    name: contactName && contactName !== businessName ? contactName : '',
    email,
    phone,
    title: '',
    businessName,
    address,
    website: link,
    sourceUrl: link,
    source: vendor.provider === 'apify' ? 'apify_google_maps' : `${vendor.provider}_lead_finder`,
    leadSourceProvider: vendor.provider,
    leadSourceActor: vendor.finderActorId,
    leadSourceRunId: runId,
    leadSourceCategory: vertical.id,
    leadSourceLocation: sourceLocation,
    leadSourceQuery: query,
    leadSourceUrl: link,
    leadSourcedAt: now,
    leadQualitySpec: spec || null,
    leadQualityStatus: contactStatus,
    leadQualityScore: (email ? 50 : 0) + (phone ? 50 : 0),
    brandContext: 'farrington_dev',
    status: 'new',
    suggestedPipelineId: 'farrington_dev',
    // The operator's Leads Lab list choice. null = "No lead list" group;
    // before 2026-08-14 this was silently dropped and imports "vanished".
    leadListId,
    campaign,
    serviceLine: vertical.serviceLine,
    productOpportunity: vertical.offer,
    tags: ['farrington-development', 'cold-call', vendor.provider, campaign, vertical.id, locationTag, sourceDateTag],
    notes: [
      `Vertical: ${vertical.label}`,
      `Call angle: ${vertical.leadWith}`,
      `Caveat: ${vertical.caveat}`,
      phone ? `Phone: ${phone}` : '',
      email ? `Email: ${email}` : '',
      address ? `Address: ${address}` : '',
      category ? `Category: ${category}` : '',
      snippet ? `Search signal: ${snippet}` : '',
      `Query: ${query}`,
      spec?.notes ? `Spec notes: ${spec.notes}` : '',
    ].filter(Boolean).join('\n'),
    legacy: {
      source: vendor.provider === 'apify' ? 'apify-google-maps' : `${vendor.provider}-lead-finder`,
      campaign,
      originalStatus: 'prospect',
      lt: 'cold-call',
      mk: location,
      runId,
      leadSourcedAt: now,
      leadSourceLocation: sourceLocation,
      leadSourceQuery: query,
      leadQualitySpec: spec || null,
      leadQualityStatus: contactStatus,
      cat: vertical.id,
      bt: 'farrington-development-prospect',
      ts: now,
      originalNotes: [{ text: `${vendor.provider} source URL: ${link}`, at: now }],
    },
  }
}

function buildEmailHtml({ created, skipped, skipReasons, query, location, vertical }) {
  const skippedBreakdown = formatLeadSkipReasons(skipReasons)
  const rows = created.map((lead, index) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(lead.businessName)}</strong><br /><span style="color:#6b7280;">${escapeHtml(lead.phone || lead.email || '')}</span></td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><a href="${escapeHtml(lead.website)}">${escapeHtml(lead.website || 'source')}</a></td>
    </tr>
  `).join('')
  const skippedRows = skipped.slice(0, 8).map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(item.businessName || 'Untitled source')}</td>
      <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(item.reason)}</td>
    </tr>
  `).join('')

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:840px;margin:0 auto;padding:24px;">
      <h1 style="font-size:22px;margin:0 0 8px;">Farrington lead sweep: ${escapeHtml(vertical.label)}</h1>
      <p style="margin:0 0 16px;color:#4b5563;">The sweep imported ${created.length} contactable Farrington Development cold-call lead${created.length === 1 ? '' : 's'} and skipped ${skipped.length} source${skipped.length === 1 ? '' : 's'} after duplicate, contact, and identity checks${skippedBreakdown ? ` (${escapeHtml(skippedBreakdown)})` : ''}.</p>
      <p style="margin:0 0 8px;"><strong>Location:</strong> ${escapeHtml(location)}</p>
      <p style="margin:0 0 8px;"><strong>Query:</strong> ${escapeHtml(query)}</p>
      <p style="margin:0 0 16px;"><strong>Lead with:</strong> ${escapeHtml(vertical.leadWith)}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:10px;">#</th><th align="left" style="padding:10px;">Lead</th><th align="left" style="padding:10px;">Source</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="padding:10px;">No contactable leads were created. Website-only sources stayed out of CRM.</td></tr>'}</tbody>
      </table>
      ${skippedRows ? `<h2 style="font-size:16px;margin:24px 0 8px;">Skipped sources</h2><table style="border-collapse:collapse;width:100%;font-size:13px;"><tbody>${skippedRows}</tbody></table>` : ''}
    </div>
  `
}

export function buildLeadSweepEmailText({ created, skipped, skipReasons, query, location, vertical }) {
  const lines = created.map((lead, index) => `${index + 1}. ${lead.businessName}\n   ${lead.phone || lead.email || ''}\n   ${lead.website || ''}\n   ${lead.notes || ''}`)
  const skippedBreakdown = formatLeadSkipReasons(skipReasons)
  return [
    `Farrington lead sweep completed: ${vertical.label}`,
    `Location: ${location}`,
    `Query: ${query}`,
    `Lead with: ${vertical.leadWith}`,
    `Created contactable leads: ${created.length}`,
    `Skipped after duplicate/contact/identity checks: ${skipped.length}${skippedBreakdown ? ` (${skippedBreakdown})` : ''}`,
    '',
    ...(lines.length ? lines : ['No contactable leads were created. Website-only sources stayed out of CRM.']),
  ].join('\n')
}

// Rotation: cycle the sweep through a list of markets (and optionally service
// verticals) so repeat runs hit fresh pools instead of re-mining one town.
// Config (dataSource.rotation): { locations: ['City, ST NC', ...], verticals?: ['home-services', ...] }
// The location advances every run; the vertical advances each time the location
// list wraps. Uses the automation's runCount when available (advances per run),
// else the day number (advances daily) — deterministic either way, no new state.
function resolveRotation(automation = {}, dataSource = {}) {
  const rotation = dataSource.rotation || automation.rotation || null
  if (!rotation) return null
  const locations = (Array.isArray(rotation.locations) ? rotation.locations : []).map(v => String(v || '').trim()).filter(Boolean)
  if (!locations.length) return null
  const verticals = (Array.isArray(rotation.verticals) ? rotation.verticals : []).map(v => String(v || '').trim()).filter(Boolean)
  const runCount = Number(automation.runCount)
  const tick = Number.isFinite(runCount) && runCount >= 0 ? Math.floor(runCount) : Math.floor(Date.now() / 86400000)
  const locationIndex = tick % locations.length
  const verticalIndex = verticals.length ? Math.floor(tick / locations.length) % verticals.length : -1
  return {
    tick,
    location: locations[locationIndex],
    verticalId: verticalIndex >= 0 ? verticals[verticalIndex] : '',
    locationIndex,
    locationCount: locations.length,
    verticalIndex,
    verticalCount: verticals.length,
  }
}

function resolveRunConfig(automation = {}) {
  const dataSource = automation.dataSource || {}
  const rotation = resolveRotation(automation, dataSource)
  const vertical = getFarringtonLeadVertical(rotation?.verticalId || dataSource.verticalId || dataSource.category || automation.verticalId || automation.category)
  const location = String(rotation?.location || dataSource.location || automation.location || 'United States').trim()
  const limit = Math.min(Math.max(Number(dataSource.limit || automation.limit || 10), 1), 25)
  const query = String(dataSource.query || buildFarringtonLeadQuery(vertical, location)).trim()
  const campaignRaw = [dataSource.campaign, automation.campaign].find(value => typeof value === 'string' && value.trim())
  const campaign = String(campaignRaw || `fd-cold-${vertical.id}`).trim()
  const leadListId = String(dataSource.leadListId || automation.leadListId || '').trim() || null
  const spec = dataSource.spec || automation.spec || null
  const scrapeContacts = explicitTrue(dataSource.scrapeContacts) || explicitTrue(automation.scrapeContacts)
  const vendor = resolveLeadVendorConfig(dataSource.vendor || automation.vendor || {})
  const enrichContacts = vendor.enrichEnabled
    && !explicitFalse(dataSource.enrichContacts)
    && !explicitFalse(automation.enrichContacts)
  return { campaign, enrichContacts, leadListId, limit, location, query, rotation, scrapeContacts, spec, vendor, vertical }
}

async function sendSummaryEmail({ automation, created, skipped, skipReasons, query, location, recipientEmail, vertical }) {
  const to = String(recipientEmail || automation.delivery?.recipients?.[0] || '').trim()
  if (!to || !to.includes('@') || !process.env.RESEND_API_KEY) return { emailedTo: null, emailId: null }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const subject = `Farrington ${vertical.label} lead sweep: ${created.length} new`
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Farrington Development <redacted@example.invalid>',
    to,
    subject,
    html: buildEmailHtml({ created, skipped, skipReasons, query, location, vertical }),
    text: buildLeadSweepEmailText({ created, skipped, skipReasons, query, location, vertical }),
  })
  if (error) throw new Error(error.message || 'Resend email failed')
  return { emailedTo: to, emailId: data?.id || null }
}

export function listFarringtonLeadVerticals() {
  return FARRINGTON_LEAD_VERTICALS
}

async function enrichDraftContacts(drafts, { vendor, apifyKey }) {
  const summary = { requested: 0, sitesWithEmail: 0, phonesAdded: 0, actorId: vendor.enrichActorId, error: null }

  // Not real business sites — crawling them can never yield the business's email.
  const NON_BUSINESS_DOMAINS = /(^|\.)(google\.com|goo\.gl|facebook\.com|instagram\.com|yelp\.com)$/i

  const targets = []
  const seenDomains = new Set()
  for (const draft of drafts) {
    if (draft.email || !draft.website) continue
    const domain = domainOf(draft.website)
    if (!domain || seenDomains.has(domain) || NON_BUSINESS_DOMAINS.test(domain)) continue
    seenDomains.add(domain)
    targets.push(draft.website)
    if (targets.length >= vendor.maxEnrichSites) break
  }
  if (!targets.length) return summary
  summary.requested = targets.length

  let contactsByDomain
  try {
    contactsByDomain = await extractContacts(targets, vendor, apifyKey)
  } catch (error) {
    // Enrichment is best-effort: a failed crawl must never kill the sweep.
    summary.error = error.message || 'contact enrichment failed'
    return summary
  }

  for (const draft of drafts) {
    if (!draft.website) continue
    const domain = domainOf(draft.website)
    const found = contactsByDomain.get(domain)
    if (!found) continue

    if (!draft.email) {
      const email = pickBestEmail(found.emails, domain)
      if (email) {
        draft.email = email
        draft.leadEnrichActor = vendor.enrichActorId
        draft.tags = [...draft.tags, 'email-enriched']
        draft.notes = `${draft.notes}\nEmail (enriched from website): ${email}`
        summary.sitesWithEmail += 1
      }
    }
    if (!draft.phone && found.phones?.length) {
      const phone = normalizePhone(found.phones[0])
      if (phone) {
        draft.phone = phone
        draft.notes = `${draft.notes}\nPhone (enriched from website): ${phone}`
        summary.phonesAdded += 1
      }
    }
    const quality = contactQuality(draft)
    draft.leadQualityStatus = quality.status
    draft.leadQualityScore = quality.score
    draft.legacy = { ...draft.legacy, leadQualityStatus: quality.status }
  }
  return summary
}

export async function runFarringtonLeadSweep(automation, options = {}) {
  const apifyKey = getCred('apify')?.key
  if (!apifyKey) throw new Error('Apify credential is missing from Command Center vault')

  const { campaign, enrichContacts, leadListId, limit, location, query, rotation, scrapeContacts, spec, vendor, vertical } = resolveRunConfig(automation)
  const now = new Date().toISOString()
  const runId = `fd-lead-sweep-${vertical.id}-${now.replace(/[^0-9]/g, '').slice(0, 14)}`
  const searchTerm = mapsSearchTerm(query, location)

  // Operator-visible geo scope for the run record. Offline resolver — the same
  // one the apollo adapter uses — so the record shows exactly what was scoped
  // (e.g. `"Greenville" exists in 24 states — used NC`).
  const geoScope = vendor.provider === 'apollo' ? resolveLocationToZips(location) : null

  // Optional progress reporting for the async run record. Callers that omit it
  // (Leo's scheduled automation) behave exactly as before.
  const emit = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const STEPS = 5
  const existingLeads = loadAll('leads')
  const maxSourceBatches = resolveLeadSourceBatchLimit({
    provider: vendor.provider,
    configuredZips: vendor.postalCodes,
    resolvedZips: geoScope?.zips,
    maxPaidBatches: vendor.maxPaidBatches,
  })
  const sourceResultLimit = Math.min(Math.max(limit * maxSourceBatches * 4, 100), 600)
  const assessSourceItems = sourceItems => {
    const candidateResults = uniqueApifyResults(sourceItems, sourceResultLimit)
    const candidateDrafts = candidateResults.map(item => leadFromApifyResult(item, {
      now, campaign, leadListId, location, query, runId, spec, vendor, vertical,
    }))
    return selectLeadDrafts({ drafts: candidateDrafts, existingLeads, limit })
  }

  const source = await collectLeadSourceBatches({
    provider: vendor.provider,
    limit,
    maxBatches: maxSourceBatches,
    fetchBatch: async batchIndex => {
      emit({
        step: 1,
        stepsTotal: STEPS,
        phase: 'finding',
        phaseLabel: maxSourceBatches > 1
          ? `Searching ${location} for ${vertical.label || vertical.id} — source batch ${batchIndex + 1} of ${maxSourceBatches}`
          : `Searching ${location} for ${vertical.label || vertical.id}`,
      })
      return findBusinesses({
        query: searchTerm,
        location,
        maxItems: Math.min(limit * 4, 100),
        scrapeContacts,
        batchIndex,
      }, vendor, apifyKey)
    },
    assess: assessSourceItems,
  })

  const results = uniqueApifyResults(source.items, sourceResultLimit)
  const drafts = results.map(item => leadFromApifyResult(item, { now, campaign, leadListId, location, query, runId, spec, vendor, vertical }))

  emit({
    step: 2,
    stepsTotal: 5,
    phase: 'contacts',
    phaseLabel: `Found ${drafts.length} businesses — pulling emails and phones`,
  })

  const enrichment = enrichContacts
    ? await enrichDraftContacts(drafts, { vendor, apifyKey })
    : { requested: 0, sitesWithEmail: 0, phonesAdded: 0, actorId: null, error: null, disabled: true }

  // Select what will actually be created (dedupe + contactability + limit)
  // BEFORE name extraction, so model spend goes only to real new leads.
  const selection = selectLeadDrafts({ drafts, existingLeads, limit })
  const { toCreate, skipped } = selection

  emit({
    step: 3,
    stepsTotal: 5,
    phase: 'names',
    phaseLabel: `Finding decision-maker names for ${toCreate.length} leads`,
  })

  const nameConfig = resolveNameEnrichConfig(automation.dataSource?.nameEnrich || {})
  const names = nameConfig.enabled
    ? await enrichDraftNames(toCreate, {
      modelId: nameConfig.modelId,
      onProgress: ({ done, total }) => emit({
        step: 3,
        stepsTotal: 5,
        phase: 'names',
        phaseLabel: `Finding decision-maker names (${done} of ${total} sites read)`,
      }),
    })
    : { requested: 0, found: 0, modelId: null, error: null, disabled: true }

  emit({
    step: 4,
    stepsTotal: 5,
    phase: 'creating',
    phaseLabel: `Creating ${toCreate.length} leads`,
  })

  const created = toCreate.map(draft => create('leads', draft))

  emit({ step: 5, stepsTotal: 5, phase: 'summary', phaseLabel: 'Sending run summary' })

  const email = await sendSummaryEmail({
    automation,
    created,
    skipped,
    skipReasons: selection.skipReasons,
    query,
    location,
    recipientEmail: options.recipientEmail,
    vertical,
  })

  return {
    campaign,
    runId,
    providerId: vendor.provider,
    actorId: vendor.provider === 'apollo' ? vendor.peopleActorId : vendor.finderActorId,
    sourceBatches: source.batchesRun,
    enrichment,
    nameEnrichment: names,
    rotation: rotation ? {
      tick: rotation.tick,
      location: rotation.location,
      locationIndex: rotation.locationIndex,
      locationCount: rotation.locationCount,
      verticalId: vertical.id,
      verticalIndex: rotation.verticalIndex,
      verticalCount: rotation.verticalCount,
    } : null,
    verticalId: vertical.id,
    verticalLabel: vertical.label,
    location,
    geo: geoScope ? { scope: geoScope.scope, zipCount: geoScope.zips.length, note: geoScope.note || null } : null,
    query,
    scrapeContacts,
    requested: limit,
    returned: results.length,
    created: created.length,
    skipped: skipped.length,
    skipReasons: selection.skipReasons,
    reviewed: selection.reviewed,
    unprocessed: selection.unprocessed,
    shortfall: Math.max(0, limit - created.length),
    emailedTo: email.emailedTo,
    emailId: email.emailId,
    leads: created.map(lead => ({ id: lead.id, businessName: lead.businessName, name: lead.name, phone: lead.phone, email: lead.email, website: lead.website })),
  }
}
