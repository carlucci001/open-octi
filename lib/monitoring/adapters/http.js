import { MONITOR_STATUS } from '../status.js'

export async function httpMonitor({ config, fetch }) {
  if (!config.url) throw new Error('HTTP monitor requires config.url')
  if (typeof fetch !== 'function') throw new Error('Fetch is unavailable')
  const target = new URL(config.url)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('HTTP monitor requires an HTTP URL without credentials')

  const response = await fetch(config.url, {
    method: config.method || 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(Math.min(30000, Math.max(1000, Number(config.timeoutMs) || 10000))),
  })
  const accepted = Array.isArray(config.acceptStatus)
    ? config.acceptStatus.map(Number)
    : [200, 201, 202, 204, 301, 302, 307, 308]
  if (!accepted.includes(response.status)) throw new Error(`Unexpected HTTP status ${response.status}`)
  return { status: MONITOR_STATUS.HEALTHY, summary: `HTTP ${response.status}` }
}
