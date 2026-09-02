// lib/lead-industries.js
//
// Maps free-text category terms onto the Apollo people actor's ALLOWED
// industry values. The actor's input schema declares `industry` as an enum of
// 318 exact strings (lib/apollo-industries.json, pulled from
// GET /v2/acts/T1XDXWc1L92AfIJtd/builds/default on 2026-08-13); anything else
// is an instant HTTP 400 ("Field input.industry.0 must be equal to one of the
// allowed values…", run lsr_mssdien1ehds9d). Leads Lab passes human phrases
// like "computer stores, computer repair" — this module translates them.
//
// Two layers:
//   1. ALIASES — curated phrase → enum values for the verticals we actually
//      sell into. Checked by containment in the normalized term.
//   2. Lexical fallback — token overlap against the enum list, best-effort.
// Terms that map to nothing are dropped (reported in `unmatched`); the caller
// decides whether an entirely-unmapped query is an error.

import INDUSTRIES from './apollo-industries.json'

export const APOLLO_INDUSTRIES = INDUSTRIES

// Words that carry no industry signal — Leads Lab queries embed contact-field
// wishes ("owner, phone, website, email") and locations right in the string.
const STOPWORDS = new Set([
  'and', 'of', 'the', 'for', 'with', 'near', 'me', 'best', 'top', 'local',
  'owner', 'owners', 'phone', 'website', 'websites', 'email', 'emails',
  'contact', 'appointment', 'appointments', 'estimate', 'quote', 'intake',
  'lead', 'leads', 'generation', 'reviews', 'ordering', 'reservations',
  'service', 'services', 'shop', 'shops', 'store', 'stores', 'company',
  'companies', 'business', 'businesses',
])

// Curated phrase → enum values. Keep phrases lowercase; longest match wins no
// special treatment — all containment hits contribute.
const ALIASES = [
  ['computer store', ['Retail Appliances, Electrical, and Electronic Equipment', 'Computer Hardware Manufacturing', 'IT Services and IT Consulting']],
  ['computer repair', ['IT Services and IT Consulting', 'Repair and Maintenance']],
  ['it support', ['IT Services and IT Consulting']],
  ['computer', ['IT Services and IT Consulting', 'Computer Hardware Manufacturing', 'Computers and Electronics Manufacturing']],
  ['hvac', ['Construction', 'Specialty Trade Contractors']],
  ['plumbing', ['Construction', 'Specialty Trade Contractors']],
  ['electrical', ['Construction', 'Specialty Trade Contractors']],
  ['roofing', ['Construction', 'Building Structure and Exterior Contractors']],
  ['garage door', ['Construction', 'Specialty Trade Contractors']],
  ['contractor', ['Construction', 'Specialty Trade Contractors']],
  ['remodeling', ['Construction', 'Building Finishing Contractors']],
  ['solar', ['Solar Electric Power Generation', 'Construction']],
  ['landscaping', ['Landscaping Services']],
  ['pool', ['Construction', 'Specialty Trade Contractors']],
  ['real estate', ['Real Estate', 'Real Estate Agents and Brokers']],
  ['brokerage', ['Real Estate Agents and Brokers']],
  ['property management', ['Real Estate', 'Leasing Residential Real Estate']],
  ['multifamily', ['Leasing Residential Real Estate']],
  ['apartment', ['Leasing Residential Real Estate']],
  ['med spa', ['Personal Care Services', 'Wellness and Fitness Services']],
  ['cosmetic', ['Personal Care Services']],
  ['dental', ['Dentists']],
  ['dentist', ['Dentists']],
  ['insurance', ['Insurance Agencies and Brokerages', 'Insurance']],
  ['auto repair', ['Vehicle Repair and Maintenance']],
  ['auto dealer', ['Retail Motor Vehicles']],
  ['detailer', ['Vehicle Repair and Maintenance']],
  ['detailing', ['Vehicle Repair and Maintenance']],
  ['law firm', ['Law Practice', 'Legal Services']],
  ['attorney', ['Law Practice', 'Legal Services']],
  ['lawyer', ['Law Practice', 'Legal Services']],
  ['chiropractor', ['Chiropractors']],
  ['physical therapy', ['Physical, Occupational and Speech Therapists']],
  ['veterinary', ['Veterinary Services']],
  ['urgent care', ['Outpatient Care Centers']],
  ['clinic', ['Medical Practices', 'Outpatient Care Centers']],
  ['restaurant', ['Restaurants']],
  ['catering', ['Caterers']],
  ['hospitality', ['Hospitality', 'Hotels and Motels']],
  ['web design', ['Design Services', 'IT Services and IT Consulting']],
  ['marketing', ['Marketing Services', 'Advertising Services']],
  ['newspaper', ['Newspaper Publishing']],
  ['news', ['Internet News', 'Newspaper Publishing']],
]

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
}

let enumIndex = null
function getEnumIndex() {
  if (enumIndex) return enumIndex
  enumIndex = INDUSTRIES.map(value => ({
    value,
    lower: value.toLowerCase(),
    tokens: new Set(tokens(value)),
  }))
  return enumIndex
}

// Lexical fallback: enum values sharing tokens with the term, best first.
function lexicalMatches(termTokens, max = 3) {
  const scored = []
  for (const entry of getEnumIndex()) {
    let shared = 0
    for (const t of termTokens) if (entry.tokens.has(t)) shared += 1
    if (shared > 0) scored.push({ value: entry.value, shared, coverage: shared / entry.tokens.size })
  }
  scored.sort((a, b) => b.shared - a.shared || b.coverage - a.coverage || a.value.localeCompare(b.value))
  return scored.slice(0, max).map(s => s.value)
}

// terms: array of free-text category phrases (already comma-split by caller).
// Returns { industries, unmatched, suggestions } — industries deduped, capped;
// unmatched lists terms that contributed nothing; suggestions are best lexical
// guesses for the whole input (for error messages when nothing maps).
export function mapIndustries(terms, { maxIndustries = 15 } = {}) {
  const industries = []
  const unmatched = []
  const add = v => { if (!industries.includes(v)) industries.push(v) }

  for (const rawTerm of terms || []) {
    const term = String(rawTerm || '').trim()
    if (!term) continue
    const lower = ` ${term.toLowerCase().replace(/[^a-z]+/g, ' ').trim()} `
    let hit = false

    // Exact enum value passes straight through (case-insensitive).
    const exact = getEnumIndex().find(e => e.lower === term.toLowerCase())
    if (exact) { add(exact.value); hit = true }

    if (!hit) {
      for (const [phrase, values] of ALIASES) {
        if (lower.includes(` ${phrase} `)) {
          values.forEach(add)
          hit = true
        }
      }
    }

    if (!hit) {
      const termTokens = tokens(term)
      if (termTokens.length) {
        const found = lexicalMatches(termTokens)
        if (found.length) { found.forEach(add); hit = true }
      }
    }

    if (!hit) unmatched.push(term)
  }

  const suggestions = industries.length
    ? []
    : lexicalMatches(tokens((terms || []).join(' ')), 5)

  return { industries: industries.slice(0, maxIndustries), unmatched, suggestions }
}
