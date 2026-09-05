import { MONITOR_STATUS } from '../status.js'

export async function cloudflareZoneMonitor({ config, credentials, fetch }) {
  if (!config.zoneId) throw new Error('Cloudflare monitor requires config.zoneId')
  const baseUrl = config.apiBaseUrl || 'https://api.cloudflare.com/client/v4'
  if (baseUrl !== 'https://api.cloudflare.com/client/v4') throw new Error('Unsupported Cloudflare API origin')
  const response = await fetch(`${baseUrl}/zones/${encodeURIComponent(config.zoneId)}`, {
    headers: { Authorization: `Bearer ${credentials.apiToken}` },
    signal: AbortSignal.timeout(Math.min(30000, Math.max(1000, Number(config.timeoutMs) || 10000))),
  })
  if (!response.ok) throw new Error(`Cloudflare returned HTTP ${response.status}`)
  const body = await response.json()
  if (!body.success) throw new Error('Cloudflare did not confirm the zone')
  const zoneStatus = String(body.result?.status || 'unknown')
  return {
    status: zoneStatus === 'active' ? MONITOR_STATUS.HEALTHY : MONITOR_STATUS.DEGRADED,
    summary: `Zone ${zoneStatus}`,
    details: { zoneId: config.zoneId, status: zoneStatus },
  }
}
