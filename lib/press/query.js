import { loadAll } from '@/lib/entityStore'

const EU_COUNTRY_CODES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
  'PL','PT','RO','SK','SI','ES','SE',
])

function normalizedList(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(list.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))]
}

export function normalizePressQuery(input = {}) {
  const geo = input.geo || {}
  const scope = String(geo.scope || input.scope || 'national').toLowerCase()
  return {
    beats: normalizedList(input.beats),
    geo: {
      scope: ['national', 'state', 'metro'].includes(scope) ? scope : 'national',
      state: String(geo.state || input.state || '').trim().toUpperCase(),
      metro: String(geo.metro || input.metro || '').trim(),
    },
    outletTypes: normalizedList(input.outletTypes),
    limit: Math.min(100, Math.max(1, Number(input.limit || 20))),
    minScore: Math.min(100, Math.max(0, Number(input.minScore || 0))),
  }
}

function emailValue(contact) {
  return contact?.email?.value || contact?.legacyEmail || ''
}

function isEu(contact, outlet) {
  const country = String(contact?.geo?.country || outlet?.geo?.country || '').toUpperCase()
  return EU_COUNTRY_CODES.has(country) || contact?.geo?.region === 'EU' || outlet?.geo?.region === 'EU'
}

function matchesBeat(contact, beats) {
  if (!beats.length) return true
  const contactBeats = normalizedList(contact.beats?.length ? contact.beats : contact.beat)
  return beats.some(beat => contactBeats.includes(beat))
}

function matchesGeo(contact, outlet, geo, level) {
  if (level === 'national') return true
  const value = contact.geo || outlet?.geo || {}
  if (level === 'state') return Boolean(geo.state) && String(value.state || '').toUpperCase() === geo.state
  return Boolean(geo.metro) && String(value.metro || '').toLowerCase() === geo.metro.toLowerCase()
}

function geoLevels(geo) {
  if (geo.scope === 'metro') return ['metro', 'state', 'national']
  if (geo.scope === 'state') return ['state', 'national']
  return ['national']
}

function reasonFor(contact, outlet, matchedLevel, query) {
  const beat = query.beats.find(item => normalizedList(contact.beats).includes(item))
  const parts = []
  if (beat) parts.push('Matches ' + beat)
  if (matchedLevel === 'metro') parts.push('covers ' + query.geo.metro)
  else if (matchedLevel === 'state') parts.push('covers ' + query.geo.state)
  else parts.push('available at national scope')
  const explain = Array.isArray(contact.scoreExplain) ? contact.scoreExplain.slice(0, 3) : []
  parts.push(...explain)
  if (!explain.length) parts.push('score ' + Number(contact.score || 0) + ' pending additional byline evidence')
  return parts.join('; ')
}

export function queryPressContacts(input = {}, data = {}) {
  const query = normalizePressQuery(input)
  const contacts = data.contacts || loadAll('pressContacts')
  const outlets = data.outlets || loadAll('pressOutlets')
  const suppressions = data.suppressions || loadAll('pressSuppression')
  const outletMap = new Map(outlets.map(outlet => [outlet.id, outlet]))
  const suppressedEmails = new Set(suppressions.map(item => String(item.email || '').toLowerCase()).filter(Boolean))
  const suppressedDomains = new Set(suppressions.map(item => String(item.domain || '').toLowerCase()).filter(Boolean))
  const base = contacts.filter(contact => {
    const outlet = outletMap.get(contact.outletId)
    const email = emailValue(contact).toLowerCase()
    const domain = email.split('@')[1] || outlet?.domain || ''
    return !contact.doNotPitch
      && !contact.suppressedAt
      && !suppressedEmails.has(email)
      && !suppressedDomains.has(domain)
      && !isEu(contact, outlet)
      && Number(contact.score || 0) >= query.minScore
      && matchesBeat(contact, query.beats)
      && (!query.outletTypes.length || query.outletTypes.includes(String(outlet?.type || '').toLowerCase()))
  })

  const selected = []
  const used = new Set()
  const fallbackChain = []
  for (const level of geoLevels(query.geo)) {
    const matches = base
      .filter(contact => !used.has(contact.id) && matchesGeo(contact, outletMap.get(contact.outletId), query.geo, level))
      .sort((a, b) =>
        Number(b.score || 0) - Number(a.score || 0)
        || Number(b.bylineStats?.count90d || 0) - Number(a.bylineStats?.count90d || 0)
        || String(a.name || '').localeCompare(String(b.name || '')),
      )
    let added = 0
    for (const contact of matches) {
      if (selected.length >= query.limit) break
      const outlet = outletMap.get(contact.outletId) || null
      selected.push({
        ...contact,
        outletRecord: outlet,
        matchedGeoLevel: level,
        fallback: level !== query.geo.scope,
        reason: reasonFor(contact, outlet, level, query),
      })
      used.add(contact.id)
      added += 1
    }
    fallbackChain.push({ level, added, total: selected.length })
    if (selected.length >= query.limit) break
  }

  return {
    query,
    contacts: selected,
    count: selected.length,
    requested: query.limit,
    fallbackUsed: selected.some(contact => contact.fallback),
    fallbackChain,
    exhausted: selected.length < query.limit,
  }
}

export function explainPressContact(contactId, data = {}) {
  const contacts = data.contacts || loadAll('pressContacts')
  const outlets = data.outlets || loadAll('pressOutlets')
  const bylines = data.bylines || loadAll('pressBylines')
  const contact = contacts.find(item => item.id === contactId)
  if (!contact) return null
  const outlet = outlets.find(item => item.id === contact.outletId) || null
  const recentBylines = bylines.filter(item => item.contactId === contactId)
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, 3)
  return {
    contact,
    outlet,
    recentBylines,
    explanation: Array.isArray(contact.scoreExplain) ? contact.scoreExplain : [],
    emailStatus: contact.email?.status || 'unknown',
  }
}
