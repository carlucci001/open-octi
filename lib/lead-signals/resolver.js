import zipcodes from 'zipcodes'
import { loadAll } from '@/lib/entityStore'
import { loadLeadSourceRegistry } from './registry'

export const LEAD_TYPE_TRIGGERS = {
  'home-services': ['new-homeowner', 'permit', 'new-license'],
  'real-estate': ['new-license', 'new-homeowner'],
  'med-spas-dental': ['new-practice', 'new-license'],
  'insurance-agencies': ['new-license', 'new-homeowner'],
  'auto-services': ['new-business', 'new-license', 'permit'],
  'law-firms': ['funded', 'won-contract', 'new-business'],
  'remodeling-specialty-trades': ['permit', 'new-homeowner', 'new-license'],
  'property-management': ['new-homeowner', 'permit', 'new-business'],
  'specialty-clinics': ['new-practice', 'new-license'],
  'restaurants-hospitality': ['new-restaurant', 'permit', 'new-brand'],
  'political-campaigns': ['campaign', 'candidate-filed', 'committee-registered', 'cash-on-hand', 'election-window'],
  'contractors-licensed': ['license-issued', 'insurance-expiring', 'license-expiring', 'newly-active'],
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function triggersForLeadType(leadType, manifests = []) {
  const key = slug(leadType)
  if (LEAD_TYPE_TRIGGERS[key]) return LEAD_TYPE_TRIGGERS[key]
  const words = new Set(key.split('-').filter(word => word.length > 2))
  const matched = manifests.filter(source => source.verticals?.some(vertical => slug(vertical).split('-').some(word => words.has(word))))
  return [...new Set(['new-business', ...matched.flatMap(source => source.triggers || [])])]
}

export function jurisdictionForLocation(location, supplied = {}) {
  if (supplied.zip) return { ...supplied, zip: String(supplied.zip).slice(0, 5), state: supplied.state || zipcodes.lookup(String(supplied.zip).slice(0, 5))?.state || '' }
  const zip = String(location || '').match(/\b\d{5}\b/)?.[0]
  const lookup = zip ? zipcodes.lookup(zip) : null
  const state = supplied.state || lookup?.state || String(location || '').match(/\b[A-Z]{2}\b/)?.[0] || ''
  return { ...supplied, zip: zip || '', city: supplied.city || lookup?.city || '', state }
}

function jurisdictionMatches(source, jurisdiction) {
  if (source.level === 'federal' || source.coverage?.includes('US')) return true
  if (source.discovered) {
    if (source.discovery?.zip && source.discovery.zip === jurisdiction.zip) return true
    if (source.discovery?.countyFips && source.discovery.countyFips === jurisdiction.countyFips) return true
  }
  return source.coverage?.some(coverage => {
    const upper = String(coverage).toUpperCase()
    return (jurisdiction.state && upper === jurisdiction.state.toUpperCase())
      || (jurisdiction.state && upper.startsWith(`${jurisdiction.state.toUpperCase()}-`) && (!jurisdiction.county || upper.includes(slug(jurisdiction.county).toUpperCase())))
  })
}

function provenFor(source, jurisdiction, validations) {
  if (source.proving?.status === 'excluded-from-build') return false
  return validations.some(validation => {
    if (validation.sourceId !== source.id || validation.status !== 'proven') return false
    const target = validation.jurisdiction || {}
    if (target.zip && jurisdiction.zip) return target.zip === jurisdiction.zip
    if (target.countyFips && jurisdiction.countyFips) return target.countyFips === jurisdiction.countyFips
    if (target.state && jurisdiction.state) return target.state === jurisdiction.state
    return source.level === 'federal'
  })
}

export function resolveLeadSources({ leadType, location, jurisdiction: supplied, manifests, validations, includeCandidates = false } = {}) {
  const registry = manifests || loadLeadSourceRegistry()
  const history = validations || loadAll('sourceValidations')
  const jurisdiction = jurisdictionForLocation(location, supplied)
  const triggers = triggersForLeadType(leadType, registry)
  const ranked = registry.filter(source => (source.tier === 'A' || source.platform === 'bulk-file') && jurisdictionMatches(source, jurisdiction)).map(source => {
    const triggerIndex = Math.min(...(source.triggers || []).map(trigger => {
      const index = triggers.indexOf(trigger)
      return index < 0 ? 99 : index
    }))
    const proven = provenFor(source, jurisdiction, history)
    const specificity = source.discovered ? 4 : source.level === 'city' ? 3 : source.level === 'county' ? 2 : source.level === 'state' ? 1 : 0
    const score = (proven ? 1000 : 0) + Math.max(0, 100 - triggerIndex * 20) + specificity * 10 + Number(source.proving?.score || 0)
    return { ...source, resolvedProven: proven, resolutionScore: score, reason: `${source.triggers?.find(trigger => triggers.includes(trigger)) || source.triggers?.[0]} · ${source.discovered ? 'your area' : source.level}` }
  }).filter(source => source.resolvedProven || includeCandidates)
    .sort((a, b) => b.resolutionScore - a.resolutionScore || a.name.localeCompare(b.name))
  return { leadType, triggers, jurisdiction, sources: ranked }
}

export function semanticSourceHook() {
  // Phase 2: searchFKL() semantic source proposal and model re-rank.
  return []
}
