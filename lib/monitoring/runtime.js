import fs from 'node:fs/promises'
import path from 'node:path'
import { runMonitoringManifest } from './engine.js'
import { createDefaultMonitorRegistry } from './default-registry.js'
import { openMonitoringHistory } from './history.js'
import { isOpenOcti } from '../edition.js'

export async function loadMonitoringManifest(filename = process.env.MONITORING_MANIFEST) {
  let target = filename
  if (!target) {
    const directory = path.join(process.cwd(), 'config/monitoring')
    const privateManifest = path.join(directory, 'farrington.json')
    const hasPrivateManifest = !isOpenOcti() && await fs.access(privateManifest).then(() => true, () => false)
    target = path.join(directory, hasPrivateManifest ? 'farrington.json' : 'community.example.json')
  }
  return JSON.parse(await fs.readFile(path.resolve(target), 'utf8'))
}

export async function runScheduledMonitoring({ manifest, history, env = process.env, fetch = globalThis.fetch, registry } = {}) {
  const store = history || openMonitoringHistory()
  const token = store.claim()
  if (!token) {
    if (!history) store.close()
    return { ok: false, busy: true }
  }
  try {
    const report = await runMonitoringManifest(manifest || await loadMonitoringManifest(), {
      env, fetch, registry: registry || createDefaultMonitorRegistry(),
    })
    report.alert = { status: 'disabled' }
    const previous = store.alertStatus()
    const failing = ['failed', 'degraded'].includes(report.status)
    const recovered = report.status === 'healthy' && ['failed', 'degraded'].includes(previous)
    if (env.MONITORING_ALERTS_ENABLED === 'true' && env.NTFY_TOPIC) {
      report.alert.status = 'unchanged'
      if ((failing && previous !== report.status) || recovered) {
        try {
          const response = await fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, {
            method: 'POST', signal: AbortSignal.timeout(10000),
            headers: { Title: `Connection monitoring: ${report.status}`, Priority: failing ? 'high' : 'default',
              ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}) },
            body: `${report.installation.name}: ${report.status}. ${report.summary.failed} failed, ${report.summary.degraded} degraded, ${report.summary.notConfigured} not configured.`,
          })
          if (!response.ok) throw new Error('Notification was not accepted')
          store.acknowledgeAlert(report.status)
          report.alert.status = 'sent'
        } catch { report.alert.status = 'failed' }
      }
    }
    store.save(report)
    return { ok: true, report }
  } finally {
    store.release(token)
    if (!history) store.close()
  }
}
