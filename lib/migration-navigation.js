const IMPORT_OBJECTS = new Set(['contacts', 'accounts', 'leads', 'opportunities', 'projects', 'tasks'])

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

export function migrationTabHref(searchParams = {}, { quick = false } = {}) {
  const params = new URLSearchParams({ tab: 'migrate' })
  const objectType = String(firstQueryValue(searchParams?.object ?? searchParams?.type) || '').toLowerCase()
  if (IMPORT_OBJECTS.has(objectType)) params.set('object', objectType)
  if (quick) params.set('mode', 'quick')
  return `/?${params.toString()}`
}
