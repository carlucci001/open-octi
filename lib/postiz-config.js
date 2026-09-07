export const POSTIZ_DEFAULT_TENANT = 'default'

export function getPostizConfig(env = process.env) {
  const base = String(env.POSTIZ_API_URL || '').trim().replace(/\/+$/, '')
  const key = String(env.POSTIZ_API_KEY || '').trim()
  if (!base || !key) return null
  let url
  try { url = new URL(base) } catch { return { error: 'Enter a valid Postiz Public API URL.' } }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || /(?:^|\.)example\.com$/.test(url.hostname) || !/\/(?:api\/)?public\/v1$/.test(url.pathname)) {
    return { error: 'POSTIZ_API_URL must be your Postiz Public API URL, ending in /api/public/v1 or /public/v1.' }
  }
  const dashboard = url.origin === 'https://api.postiz.com' ? 'https://platform.postiz.com' : base.replace(/\/(?:api\/)?public\/v1$/, '')
  const publicUrl = String(env.NEXT_PUBLIC_POSTIZ_URL || dashboard).trim().replace(/\/+$/, '')
  return { base, key, publicUrl }
}
