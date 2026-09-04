import { isDeniedPressDomain } from './fetch'

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/^www\./, '')
}

function domainsInText(value) {
  const found = String(value || '').match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s,;)]*)?/gi) || []
  return [...new Set(found.map(item => {
    try { return new URL(/^https?:\/\//i.test(item) ? item : 'https://' + item).hostname.toLowerCase().replace(/^www\./, '') }
    catch { return '' }
  }).filter(domain => domain && domain !== 'bsky.app' && domain !== 'bsky.social' && !isDeniedPressDomain(domain)))]
}

export function blueskyProfileDomains(profile = {}) {
  const domains = domainsInText(profile.description)
  const handle = normalizeDomain(profile.handle)
  if (handle.includes('.') && handle !== 'bsky.social' && !handle.endsWith('.bsky.social') && !isDeniedPressDomain(handle)) {
    domains.push(handle)
  }
  return [...new Set(domains)]
}

export function matchBlueskyOutletByDomain(profile, outlets = []) {
  const evidence = blueskyProfileDomains(profile)
  if (!evidence.length) return null
  const matches = outlets.filter(outlet => {
    const domain = normalizeDomain(outlet?.domain)
    return domain && evidence.some(value => value === domain || value.endsWith('.' + domain))
  })
  return matches.sort((a, b) => {
    const tier = Number(a.tier || 99) - Number(b.tier || 99)
    if (tier) return tier
    return String(a.name || '').localeCompare(String(b.name || ''))
  })[0] || null
}

export function auditBlueskyOutletLinks({ contacts = [], outlets = [], now = new Date() } = {}) {
  let relinked = 0
  let unlinked = 0
  let retained = 0
  const stamp = now.toISOString()
  const next = contacts.map(contact => {
    if (contact.source !== 'bluesky-starter-pack') return contact
    const outlet = matchBlueskyOutletByDomain({
      handle: contact.social?.bluesky,
      description: contact.bio,
    }, outlets)
    if (!outlet) {
      unlinked += 1
      return {
        ...contact,
        outlet: '',
        outletId: '',
        linkEvidence: 'unlinked-domain-mismatch',
        unlinkedReason: 'no-profile-domain-evidence',
        unlinkedAt: stamp,
        doNotPitch: true,
        updatedAt: stamp,
      }
    }
    if (outlet.id === contact.outletId) retained += 1
    else relinked += 1
    return {
      ...contact,
      outlet: outlet.name,
      outletId: outlet.id,
      geo: outlet.geo || contact.geo,
      linkEvidence: 'profile-domain',
      unlinkedReason: '',
      unlinkedAt: null,
      doNotPitch: contact.unlinkedReason === 'no-profile-domain-evidence' ? false : contact.doNotPitch,
      updatedAt: outlet.id === contact.outletId ? contact.updatedAt : stamp,
    }
  })
  return { contacts: next, stats: { total: contacts.filter(contact => contact.source === 'bluesky-starter-pack').length, retained, relinked, unlinked } }
}
