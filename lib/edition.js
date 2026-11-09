export const EDITION = String(process.env.FCC_EDITION || process.env.NEXT_PUBLIC_FCC_EDITION || 'commandcenter')
  .trim()
  .toLowerCase() || 'commandcenter'

export const OPENOCTI_CLOSED_PREFIXES = Object.freeze([
  '/portal',
  '/billing',
  '/research',
  '/platforms',
  '/SearchTools3',
  '/api/portal',
  '/api/stripe',
  '/api/research-dossiers',
  '/api/concierge',
  '/api/platforms',
  '/api/SearchTools3',
  '/api/integrations/VideoHub',
  '/api/accounts/enable-portal',
  '/api/accounts/disable-portal',
  '/api/automations/approvals',
  '/api/agents/deerflow-tools',
  '/api/agents/deep-research',
  '/api/admin/subscription-plans',
  '/api/admin/stripe-catalog-sync',
  '/api/products/checkout',
  '/api/downloads/octi-cc',
  '/api/support-access',
  '/api/support-gateway',
  '/api/admin/portal-login-as',
  '/settings/support-access',
  '/api/products/orders',
])

export const OCTICC_CLOSED_PREFIXES = Object.freeze([
  '/research',
  '/platforms',
  '/SearchTools3',
  '/api/research-dossiers',
  '/api/concierge',
  '/api/platforms',
  '/api/SearchTools3',
  '/api/integrations/VideoHub',
  '/api/support-access',
  '/api/support-gateway',
  '/api/admin/portal-login-as',
  '/settings/support-access',
  '/api/agents/deerflow-tools',
  '/api/agents/deep-research',
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

export function isOctiCc(env) {
  return editionFor(env) === 'octicc'
}

export function openclawRuntimeLogLabel(runtimeProvider, env) {
  const label = String(runtimeProvider || 'openclaw-hetzner').trim() || 'openclaw-hetzner'
  return isOpenOcti(env) && label === 'openclaw-hetzner' ? 'openclaw-gateway' : label
}

export function isClosedSurface(pathname, env) {
  const prefixes = isOpenOcti(env) ? OPENOCTI_CLOSED_PREFIXES : isOctiCc(env) ? OCTICC_CLOSED_PREFIXES : []
  const path = String(pathname || '').split('?')[0]
  return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}
