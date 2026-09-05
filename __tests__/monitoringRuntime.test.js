import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { openMonitoringHistory } from '../lib/monitoring/history'
import { loadMonitoringManifest, runScheduledMonitoring } from '../lib/monitoring/runtime'
import { MonitorRegistry } from '../lib/monitoring/engine'
import { nylasGrantMonitor } from '../lib/monitoring/adapters/nylas'

describe('persistent connection monitoring', () => {
  let history
  const manifest = { installation: { id: 'test', edition: 'community' }, monitors: [{ id: 'app', adapter: 'test', required: true }] }
  beforeEach(() => { history = openMonitoringHistory(':memory:') })
  afterEach(() => { history.close(); vi.unstubAllEnvs() })

  it('keeps private and public default manifests separate', async () => {
    vi.stubEnv('MONITORING_MANIFEST', '')
    vi.stubEnv('FCC_EDITION', 'commandcenter')
    const privateManifest = await loadMonitoringManifest()
    vi.stubEnv('FCC_EDITION', 'openocti')
    const publicManifest = await loadMonitoringManifest()
    expect(publicManifest.installation.id).toBe('my-openocti')
    if (fs.existsSync(`${process.cwd()}/config/monitoring/farrington.json`)) {
      expect(privateManifest.installation.id).not.toBe(publicManifest.installation.id)
      expect(privateManifest.monitors.some(monitor => monitor.config?.url?.includes('127.0.0.1:3000'))).toBe(true)
    } else {
      expect(privateManifest).toEqual(publicManifest)
    }
    expect(publicManifest.monitors.some(monitor => monitor.config?.url)).toBe(false)
  })

  it('prevents overlapping runs and rejects another worker releasing the lock', async () => {
    const token = history.claim()
    history.release('another-worker')
    expect(await runScheduledMonitoring({ manifest, history })).toEqual({ ok: false, busy: true })
    history.release(token)
    expect(history.claim()).toBeTruthy()
  })

  it('persists history, alerts once per transition, and sends recovery', async () => {
    let status = 'failed'
    const fetch = vi.fn(async () => ({ ok: true }))
    const registry = new MonitorRegistry().register('test', async () => ({ status, summary: 'Connection check' }))
    const options = { manifest, history, fetch, registry, env: { MONITORING_ALERTS_ENABLED: 'true', NTFY_TOPIC: 'test-topic' } }
    await runScheduledMonitoring(options)
    await runScheduledMonitoring(options)
    expect(fetch).toHaveBeenCalledTimes(1)
    status = 'healthy'
    await runScheduledMonitoring(options)
    await runScheduledMonitoring(options)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(history.list()).toHaveLength(4)
    expect(history.latest().status).toBe('healthy')
  })

  it('retries failed alerts and retains at most 288 reports', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
    const registry = new MonitorRegistry().register('test', async () => ({ status: 'failed' }))
    const options = { manifest, history, fetch, registry, env: { MONITORING_ALERTS_ENABLED: 'true', NTFY_TOPIC: 'test-topic' } }
    expect((await runScheduledMonitoring(options)).report.alert.status).toBe('failed')
    expect((await runScheduledMonitoring(options)).report.alert.status).toBe('sent')
    for (let i = 0; i < 300; i++) history.save({ checkedAt: new Date(i * 1000).toISOString(), status: 'healthy' })
    expect(history.list(1000)).toHaveLength(288)
  })

  it('does not treat a missing Nylas grant status as healthy', async () => {
    const report = await nylasGrantMonitor({ config: {}, credentials: { grantId: 'test-grant', apiKey: 'test-key' }, fetch: async () => ({ ok: true, json: async () => ({ data: {} }) }) })
    expect(report.status).toBe('degraded')
  })
})
