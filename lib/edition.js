export const EDITION = String(process.env.FCC_EDITION || process.env.NEXT_PUBLIC_FCC_EDITION || 'commandcenter')
  .trim()
  .toLowerCase() || 'commandcenter'

export const OPENOCTI_CLOSED_PREFIXES = Object.freeze([
  '/portal',
  '/billing',
  '/research',
  '/platforms',
  '/SearchSuite3',
  '/api/portal',
  '/api/stripe',
  '/api/research-dossiers',
  '/api/concierge',
  '/api/platforms',
  '/api/SearchSuite3',
  '/api/integrations/VideoHub',
  '/api/accounts/enable-portal',
  '/api/accounts/disable-portal',
  '/api/automations/approvals',
  '/api/agents/deerflow-tools',
  '/api/agents/deep-research',
  '/api/admin/subscription-plans',
  '/api/admin/stripe-catalog-sync',
  '/api/products/checkout',
  '/api/products/orders',
])

export function editionFor(env) {
  const source = env || {
    FCC_EDITION: process.env.FCC_EDITION,
    NEXT_PUBLIC_FCC_EDITION: process.env.NEXT_PUBLIC_FCC_EDITION,
  }
  return String(source.FCC_EDITION || source.NEXT_PUBLIC_FCC_EDITION || 'commandcenter')
    .trim()
    .toLowerCase() || 'commandcenter'
}

export function isOpenOcti(env) {
  return editionFor(env) === 'openocti'
}

export function openclawRuntimeLogLabel(runtimeProvider, env) {
  const label = String(runtimeProvider || 'openclaw-hetzner').trim() || 'openclaw-hetzner'
  return isOpenOcti(env) && label === 'openclaw-hetzner' ? 'openclaw-gateway' : label
}

export function isClosedSurface(pathname, env) {
  if (!isOpenOcti(env)) return false
  const path = String(pathname || '').split('?')[0]
  return OPENOCTI_CLOSED_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}
