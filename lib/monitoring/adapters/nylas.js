import { MONITOR_STATUS } from '../status.js'

export async function nylasGrantMonitor({ config, credentials, fetch }) {
  if (!credentials.grantId) throw new Error('Nylas monitor requires a grant ID')
  const baseUrl = String(config.apiBaseUrl || 'https://api.us.nylas.com').replace(/\/$/, '')
  if (!['https://api.us.nylas.com', 'https://api.eu.nylas.com'].includes(baseUrl)) throw new Error('Unsupported Nylas API origin')
  const response = await fetch(`${baseUrl}/v3/grants/${encodeURIComponent(credentials.grantId)}`, {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
    signal: AbortSignal.timeout(Math.min(30000, Math.max(1000, Number(config.timeoutMs) || 10000))),
  })
  if (!response.ok) throw new Error(`Nylas returned HTTP ${response.status}`)
  const body = await response.json()
  const grant = body.data || body
  const status = String(grant.grant_status || grant.status || 'unknown').toLowerCase()
  const healthy = ['valid', 'active'].includes(status)
  return {
    status: healthy ? MONITOR_STATUS.HEALTHY : MONITOR_STATUS.DEGRADED,
    summary: `Grant ${status}`,
    details: { status },
  }
}
