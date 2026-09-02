function clean(value) {
  return String(value || '').trim().toLowerCase()
}

function compact(value) {
  return clean(value).replace(/[^a-z0-9]+/g, '')
}

function phoneDigits(value) {
  return String(value || '').replace(/\D+/g, '')
}

function normalizeUrl(value) {
  const raw = clean(value)
  if (!raw) return ''
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
}

function candidateWeb(lead = {}) {
  return lead.web || lead.website || lead.url || lead.sourceUrl || lead.domain || ''
}

function displayName(lead = {}) {
  return lead.businessName || lead.company || lead.organization || lead.name || lead.email || lead.phone || lead.id || 'existing lead'
}

export function findExistingLeadMatch(candidate = {}, leads = [], options = {}) {
  const excludeId = options.excludeId || candidate.id || null
  const email = clean(candidate.email)
  const phone = phoneDigits(candidate.phone)
  const web = normalizeUrl(candidateWeb(candidate))
  const externalId = clean(candidate.externalId || candidate.bookingId)
  const business = compact(candidate.businessName || candidate.company || candidate.organization)
  const person = compact(candidate.name)

  for (const lead of leads || []) {
    if (!lead || (excludeId && lead.id === excludeId)) continue

    if (externalId && externalId === clean(lead.externalId || lead.bookingId)) {
      return { lead, reason: 'external reference already imported' }
    }

    if (email && email === clean(lead.email)) {
      return { lead, reason: 'email already exists' }
    }

    const existingPhone = phoneDigits(lead.phone)
    if (phone && phone.length >= 7 && phone === existingPhone) {
      return { lead, reason: 'phone already exists' }
    }

    const existingWeb = normalizeUrl(candidateWeb(lead))
    if (web && web === existingWeb) {
      return { lead, reason: 'website already exists' }
    }

    const existingBusiness = compact(lead.businessName || lead.company || lead.organization)
    const existingPerson = compact(lead.name)
    if (business && business === existingBusiness) {
      if (!person || !existingPerson || person === existingPerson) {
        return { lead, reason: 'business already exists' }
      }
    }

    if (!business && person && person === existingPerson && (email || phone || web)) {
      return { lead, reason: 'person already exists' }
    }
  }

  return null
}

export function duplicateLeadResponse(match) {
  if (!match?.lead) return null
  return {
    ok: false,
    skipped: true,
    reason: 'duplicate_lead',
    message: `${displayName(match.lead)} is already in Leads (${match.reason}).`,
    existingLead: {
      id: match.lead.id,
      name: match.lead.name || '',
      businessName: match.lead.businessName || '',
      email: match.lead.email || '',
      phone: match.lead.phone || '',
      status: match.lead.status || '',
      source: match.lead.source || '',
      createdAt: match.lead.createdAt || match.lead.receivedAt || null,
    },
  }
}
