const ROLE_MAILBOX_PARTS = new Set([
  'account', 'accounts', 'ad', 'ads', 'advertising', 'alert', 'alerts', 'billing',
  'calendar', 'career', 'careers', 'class', 'classified', 'classifieds', 'community',
  'contact', 'custservice', 'customer', 'customerservice', 'delivery', 'desk',
  'digital', 'donation', 'donations', 'donotreply', 'editor', 'editorial', 'editors',
  'event', 'events', 'feedback', 'general', 'hello', 'help', 'image', 'inbox', 'info',
  'job', 'jobs', 'legal', 'legals', 'letters', 'mail', 'marketing', 'media', 'membership',
  'nation', 'news', 'newsdesk', 'newsroom', 'noreply', 'notice', 'notices', 'obit',
  'obits', 'obituaries', 'office', 'opinion', 'photo', 'photos', 'press', 'privacy',
  'production', 'publisher', 'publishers', 'reception', 'sales', 'service', 'shop',
  'sports', 'staff', 'store', 'submission', 'submissions', 'submit', 'subscription',
  'subscriptions', 'support', 'team', 'tips', 'weather', 'webmaster', 'world',
])

const FALLBACK_PRIORITY = ['tips', 'news', 'newsdesk', 'newsroom', 'editor', 'press', 'media', 'contact', 'letters']

function cleanDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '')
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function titleCase(value) {
  return String(value || '').replace(/(^|[-'\s])([a-z])/g, (_match, lead, letter) => lead + letter.toUpperCase())
}

function localParts(email) {
  return cleanEmail(email).split('@')[0].replace(/[0-9]+/g, '').split(/[._+-]+/).filter(Boolean)
}

export function isGenericPressMailbox(email) {
  const local = cleanEmail(email).split('@')[0]
  if (!local) return true
  const parts = localParts(email)
  return parts.some(part => ROLE_MAILBOX_PARTS.has(part))
    || /(?:classified|custservice|advertis|subscription|circulation|obituar|publicnotice|breakingnews|newsdesk|newsroom|webmaster|legals?|donotreply|noreply)/i.test(local)
}

export function inferPersonFromPressEmail(email, explicitName = '') {
  const supplied = String(explicitName || '').replace(/\s+/g, ' ').trim()
  if (supplied && /^[A-Za-z][A-Za-z' -]+ [A-Za-z][A-Za-z' -]+$/.test(supplied)) return supplied
  if (isGenericPressMailbox(email)) return ''
  const parts = localParts(email)
  if (parts.length >= 2 && parts.length <= 3 && parts.every(part => /^[a-z]{2,}$/.test(part))) {
    return parts.map(titleCase).join(' ')
  }
  const compact = parts.length === 1 ? parts[0] : ''
  if (!/^[a-z]{4,24}$/.test(compact)) return ''
  if (/(?:daily|weekly|gazette|tribune|journal|record|eagle|times|media|online|paper|report|press)/i.test(compact)) return ''
  return compact[0].toUpperCase() + '. ' + titleCase(compact.slice(1))
}

function flattenApifyEmails(results = []) {
  const rows = []
  for (const result of results) {
    const sourceDomain = cleanDomain(result?.domain)
    const sourceUrl = String(result?.originalStartUrl || result?.scrapedUrls?.[0] || '')
    for (const item of result?.emails || []) {
      const structured = item && typeof item === 'object' ? item : {}
      const email = cleanEmail(typeof item === 'string' ? item : structured.email)
      if (email) rows.push({ email, sourceDomain, sourceUrl, name: structured.name || structured.fullName || '', title: structured.title || structured.jobTitle || '' })
    }
    for (const item of result?.leadsEnrichment || []) {
      const email = cleanEmail(item?.email)
      if (email) rows.push({ email, sourceDomain, sourceUrl, name: item.name || item.fullName || '', title: item.title || item.jobTitle || '' })
    }
  }
  return [...new Map(rows.map(row => [row.email, row])).values()]
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
}

function coverage(contacts) {
  const buckets = {}
  for (const contact of contacts) {
    const status = contact.email?.status || 'unknown'
    buckets[status] = (buckets[status] || 0) + 1
  }
  return { total: contacts.length, withEmail: contacts.filter(contact => contact.email?.value).length, buckets }
}

export function applyApifyEmailLift({ contacts = [], outlets = [], matches = [], results = [], now = new Date() } = {}) {
  const stamp = now.toISOString()
  const nextContacts = contacts.map(contact => ({ ...contact, email: { ...(contact.email || {}) } }))
  const nextOutlets = outlets.map(outlet => ({ ...outlet, fallbackEmail: outlet.fallbackEmail ? { ...outlet.fallbackEmail } : undefined }))
  const before = coverage(nextContacts)
  const contactById = new Map(nextContacts.map(contact => [contact.id, contact]))
  const outletByDomain = new Map(nextOutlets.filter(outlet => outlet.domain).map(outlet => [cleanDomain(outlet.domain), outlet]))
  const matchedEmails = new Set()
  let matched = 0

  for (const match of matches) {
    const contact = contactById.get(match?.contactId)
    const email = cleanEmail(match?.email)
    if (!contact || !email) continue
    const keepVerification = cleanEmail(contact.email?.value) === email
      && contact.email?.source === 'apify-staff-page'
      && contact.email?.status === 'verified'
    if (!keepVerification) {
      contact.email = { value: email, status: 'apify-found', source: 'apify-staff-page', verifiedAt: null }
    }
    contact.updatedAt = stamp
    matchedEmails.add(email)
    matched += 1
  }

  const existingEmails = new Set(nextContacts.map(contact => cleanEmail(contact.email?.value)).filter(Boolean))
  const rows = flattenApifyEmails(results)
  const fallbackByOutlet = new Map()
  let skippedNoOutlet = 0
  let skippedNonPerson = 0

  for (const row of rows) {
    const outlet = outletByDomain.get(row.sourceDomain)
    if (!outlet) { skippedNoOutlet += 1; continue }
    if (isGenericPressMailbox(row.email)) {
      const local = row.email.split('@')[0]
      const priority = FALLBACK_PRIORITY.findIndex(prefix => local === prefix || local.startsWith(prefix + '.'))
      if (priority >= 0 && (!fallbackByOutlet.has(outlet.id) || priority < fallbackByOutlet.get(outlet.id).priority)) {
        fallbackByOutlet.set(outlet.id, { ...row, priority })
      }
      continue
    }
    const name = inferPersonFromPressEmail(row.email, row.name)
    if (!name) { skippedNonPerson += 1; continue }
    if (matchedEmails.has(row.email) || existingEmails.has(row.email)) continue
    const id = `pc_apify-${slug(outlet.id)}-${slug(row.email)}`
    if (contactById.has(id)) continue
    const record = {
      id,
      createdAt: stamp,
      updatedAt: stamp,
      name,
      outlet: outlet.name,
      outletId: outlet.id,
      beats: ['national-news'],
      title: String(row.title || ''),
      geo: outlet.geo || { scope: 'national', state: '', metro: '', county: '', fips: '' },
      email: { value: row.email, status: 'apify-found', source: 'apify-staff-page', verifiedAt: null },
      social: { bluesky: '', x: '', site: '' },
      bylineStats: { count90d: 0, lastAt: null },
      score: 0,
      scoreExplain: ['Public person-shaped address found on the outlet staff or contact page.'],
      source: 'apify-staff-page',
      sourceUrl: row.sourceUrl,
      doNotPitch: false,
      suppressedAt: null,
    }
    nextContacts.push(record)
    contactById.set(id, record)
    existingEmails.add(row.email)
  }

  for (const outlet of nextOutlets) {
    const fallback = fallbackByOutlet.get(outlet.id)
    if (!fallback) continue
    outlet.fallbackEmail = { value: fallback.email, status: 'tips-fallback', source: 'apify-staff-page', verifiedAt: null }
    outlet.updatedAt = stamp
  }

  return {
    contacts: nextContacts,
    outlets: nextOutlets,
    stats: {
      before,
      after: coverage(nextContacts),
      matched,
      created: nextContacts.length - contacts.length,
      fallbacks: fallbackByOutlet.size,
      skippedNoOutlet,
      skippedNonPerson,
      sourceAddresses: rows.length,
    },
  }
}

export async function verifyApifyEmailLift({ contacts = [], outlets = [], verify } = {}) {
  if (typeof verify !== 'function') throw new TypeError('verify is required')
  const nextContacts = contacts.map(contact => ({ ...contact, email: { ...(contact.email || {}) } }))
  const nextOutlets = outlets.map(outlet => ({ ...outlet, fallbackEmail: outlet.fallbackEmail ? { ...outlet.fallbackEmail } : undefined }))
  for (const contact of nextContacts) {
    if (contact.email?.status !== 'apify-found' || !contact.email.value) continue
    contact.email = await verify(contact.email.value, 'apify-found', { source: 'apify-staff-page' })
  }
  for (const outlet of nextOutlets) {
    if (outlet.fallbackEmail?.source !== 'apify-staff-page' || !outlet.fallbackEmail.value) continue
    outlet.fallbackEmail = await verify(outlet.fallbackEmail.value, 'tips-fallback', { source: 'apify-staff-page' })
  }
  const statuses = {}
  for (const contact of nextContacts.filter(contact => contact.email?.source === 'apify-staff-page')) {
    statuses[contact.email.status] = (statuses[contact.email.status] || 0) + 1
  }
  return { contacts: nextContacts, outlets: nextOutlets, statuses }
}
