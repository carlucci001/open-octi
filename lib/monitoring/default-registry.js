import { MonitorRegistry } from './engine.js'
import { cloudflareZoneMonitor } from './adapters/cloudflare.js'
import { httpMonitor } from './adapters/http.js'
import { nylasGrantMonitor } from './adapters/nylas.js'

export function createDefaultMonitorRegistry() {
  return new MonitorRegistry()
    .register('http', httpMonitor)
    .register('cloudflare-zone', cloudflareZoneMonitor)
    .register('nylas-grant', nylasGrantMonitor)
}
