export const FARRINGTON_LEAD_VERTICALS = [
  {
    id: 'home-services',
    rank: 1,
    label: 'Home services',
    serviceLine: 'ai-automation',
    offer: 'AI receptionist and missed-call text-back',
    caveat: 'Best fit when calls are urgent and missed calls lose high-ticket jobs.',
    leadWith: 'AI receptionist that never misses a call plus instant text-back.',
    query: '{location} HVAC plumbing electrical roofing garage door contractor owner phone website',
  },
  {
    id: 'real-estate',
    rank: 2,
    label: 'Real estate teams and brokerages',
    serviceLine: 'crm-command-center',
    offer: 'CRM and AI speed-to-lead follow-up',
    caveat: 'Lead quality matters; prioritize teams and brokerages with active listings and paid lead spend.',
    leadWith: 'CRM plus AI follow-up that calls or texts new leads within 60 seconds.',
    query: '{location} real estate team brokerage agents lead generation phone website',
  },
  {
    id: 'med-spas-dental',
    rank: 3,
    label: 'Med spas, cosmetic and dental practices',
    serviceLine: 'web-development',
    offer: 'Website redesign with AI booking and reactivation',
    caveat: 'Avoid medical claims; position around booking, reminders, and dead-lead reactivation.',
    leadWith: 'Website redesign plus AI booking and dead-lead reactivation.',
    query: '{location} med spa cosmetic dental practice appointments phone website',
  },
  {
    id: 'insurance-agencies',
    rank: 4,
    label: 'Independent insurance agencies',
    serviceLine: 'crm-command-center',
    offer: 'CRM and automated quote follow-up',
    caveat: 'Best for independent agencies with visible quote forms, multiple carriers, or active producers.',
    leadWith: 'CRM plus automated quote follow-up so prospects do not go cold.',
    query: '{location} independent insurance agency quote phone website',
  },
  {
    id: 'auto-services',
    rank: 5,
    label: 'Auto dealers, repair shops and detailers',
    serviceLine: 'workflow-integration',
    offer: 'AI scheduler and missed-call recovery',
    caveat: 'Prioritize shops with scheduling chaos, high review volume, or high-ticket services.',
    leadWith: 'AI scheduler plus missed-call recovery for service and sales inquiries.',
    query: '{location} auto repair dealer detailer service appointment phone website',
  },
  {
    id: 'law-firms',
    rank: 6,
    label: 'Law firms',
    serviceLine: 'ai-automation',
    offer: '24/7 AI intake',
    caveat: 'They pay well but adopt slowly; start with intake capture, not legal advice.',
    leadWith: '24/7 AI intake so new matters do not go to voicemail.',
    query: '{location} personal injury family immigration estate law firm intake phone website',
  },
  {
    id: 'remodeling-specialty-trades',
    rank: 7,
    label: 'Remodeling and specialty trades',
    serviceLine: 'web-development',
    offer: 'Website and pipeline CRM',
    caveat: 'Best when the site is weak and estimate follow-up is manual.',
    leadWith: 'New website plus project pipeline CRM for estimates and follow-up.',
    query: '{location} kitchen bath remodeling solar landscaping pool contractor estimate website phone',
  },
  {
    id: 'property-management',
    rank: 8,
    label: 'Property management and multifamily',
    serviceLine: 'ai-automation',
    offer: 'AI maintenance intake and tenant messaging',
    caveat: 'Good fit when call volume is high; avoid tiny landlords with no operating budget.',
    leadWith: 'AI voice for maintenance intake plus tenant messaging.',
    query: '{location} property management multifamily apartments maintenance phone website',
  },
  {
    id: 'specialty-clinics',
    rank: 9,
    label: 'Specialty clinics',
    serviceLine: 'ai-automation',
    offer: 'Reminders and patient reactivation',
    caveat: 'HIPAA adds friction; position around scheduling and reactivation until compliance is scoped.',
    leadWith: 'Appointment reminders and patient reactivation to reduce no-shows.',
    query: '{location} chiropractor physical therapy veterinary urgent care clinic appointments phone website',
  },
  {
    id: 'contractors-licensed',
    rank: 11,
    label: 'Contractors — licensed',
    serviceLine: 'web-development',
    offer: 'Website and lead-response systems for newly licensed contractors',
    caveat: 'Government records have no email. Manual business-line calls and mail only unless recorded consent authorizes automated voice.',
    leadWith: 'A new-license website audit or a timely insurance/license renewal workflow review.',
    query: '{location} licensed contractor business phone website',
  },
  {
    id: 'political-campaigns',
    rank: 12,
    label: 'Political campaigns',
    serviceLine: 'web-development',
    offer: 'Campaign web, video, rapid-response content, CRM and consent-based AI workflows',
    caveat: 'Committee outreach only. Never use contributor data, target by party, or use AI voice without recorded consent.',
    leadWith: 'A fast campaign digital audit focused on web, video, response time, and voter-contact operations.',
    query: '{location} political campaign committee candidate treasurer email phone cash on hand',
  },
  {
    id: 'restaurants-hospitality',
    rank: 10,
    label: 'Restaurants and multi-location hospitality',
    serviceLine: 'workflow-integration',
    offer: 'Ordering, reservations and review workflows',
    caveat: 'Price-sensitive vertical; treat as a volume test, not a premium-first target.',
    leadWith: 'Ordering, reservations, and reviews workflow cleanup.',
    query: '{location} restaurant catering hospitality reservations ordering reviews phone website',
  },
]

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getFarringtonLeadVertical(verticalId = 'home-services') {
  const input = String(verticalId || '').trim()
  const normalized = slugify(input)
  const known = FARRINGTON_LEAD_VERTICALS.find(v =>
    v.id === normalized ||
    slugify(v.label) === normalized ||
    v.id === input
  )
  if (known) return known

  const label = input || 'Custom category'
  const id = normalized || 'custom-category'
  return {
    id,
    rank: 99,
    label,
    serviceLine: 'ai-automation',
    offer: `${label} lead development`,
    caveat: 'Custom Farrington Development cold-call category.',
    leadWith: 'AI intake, CRM follow-up, website cleanup, and speed-to-lead automation.',
    query: `{location} ${label} owner phone website`,
  }
}

export function buildFarringtonLeadQuery(vertical, location = 'City, ST NC') {
  return String(vertical.query || '').replaceAll('{location}', location)
}
