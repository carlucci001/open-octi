export const OPENCLAW_DASHBOARD_PATH = '/api/harness/dashboard/openclaw-hetzner'

export function openClawDashboardLocation(token = '') {
  return `${OPENCLAW_DASHBOARD_PATH}/${token ? `#token=${encodeURIComponent(token)}` : ''}`
}

export function resolveOpenClawDashboardBase(env = process.env) {
  const host = String(env.OPENCLAW_HOST || 'localhost').trim()
  const port = String(env.OPENCLAW_PORT || '18789').trim()
  const protocol = String(env.OPENCLAW_PROTOCOL || 'http').toLowerCase() === 'https' ? 'https' : 'http'
  const fallback = `${protocol}://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${port}`
  const url = new URL(env.OPENCLAW_DASHBOARD_INTERNAL_URL || env.OPENCLAW_DASHBOARD_URL || fallback)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid OpenClaw dashboard address')
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const configuredHost = host.replace(/^\[|\]$/g, '').toLowerCase()
  const privateHost = ['localhost', '127.0.0.1', '::1'].includes(hostname)
    || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(hostname)
  if (!privateHost && hostname !== configuredHost && env.HARNESS_ALLOW_PUBLIC_RUNTIME_URLS !== '1') {
    throw new Error('OpenClaw dashboard must use the configured gateway or a private address')
  }
  url.hash = ''; url.search = ''
  return url.toString().replace(/\/+$/, '')
}

export function isDashboardSocketPath(pathname) {
  return pathname === OPENCLAW_DASHBOARD_PATH || pathname === `${OPENCLAW_DASHBOARD_PATH}/`
}

export function isDashboardBrowserOrigin(origin, host, publicAppUrl = '') {
  try {
    const browser = new URL(origin)
    if (!['http:', 'https:'].includes(browser.protocol)) return false
    if (browser.host.toLowerCase() === String(host || '').toLowerCase()) return true
    return !!publicAppUrl && browser.origin === new URL(publicAppUrl).origin
  } catch { return false }
}
