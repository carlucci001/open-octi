const DESTINATION_LABELS = Object.freeze({
  farrington_dev: 'Farrington Development',
  ContentStudio: 'ContentStudio',
  sample_business: 'WNC Times',
  client_automation: 'Client automation product',
  client_command_center: 'Client Command Center',
})

function normalized(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function leadListBelongsToDestination(list = {}, destination = '') {
  const target = String(destination || '').trim()
  if (!target || target === 'review_only') return false
  if (list.brandContext) return String(list.brandContext).trim() === target
  if (String(list.id || '').trim() === target) return true
  const label = DESTINATION_LABELS[target] || target
  const haystack = normalized(`${list.id || ''} ${list.name || ''}`)
  return Boolean(haystack && normalized(label) && haystack.includes(normalized(label)))
}

export function leadListsForDestination(leadLists = [], destination = '') {
  return (Array.isArray(leadLists) ? leadLists : []).filter(list => leadListBelongsToDestination(list, destination))
}

export function defaultLeadListForDestination(leadLists = [], destination = '') {
  const matches = leadListsForDestination(leadLists, destination)
  return matches.find(list => String(list.id || '').trim() === String(destination || '').trim())
    || matches.find(list => Boolean(list.system))
    || matches[0]
    || null
}

export function resolveLeadListForDestination({ leadLists = [], requestedId = '', destination = '', allowAnyRequested = false } = {}) {
  if (destination === 'review_only') return null
  const requested = (Array.isArray(leadLists) ? leadLists : []).find(list => String(list.id || '') === String(requestedId || ''))
  if (requested && (allowAnyRequested || leadListBelongsToDestination(requested, destination))) return requested
  return defaultLeadListForDestination(leadLists, destination)
}
