import { describe, expect, it, vi } from 'vitest'
import { MonitorRegistry, runMonitoringManifest } from '../lib/monitoring/engine'
import { MONITOR_STATUS } from '../lib/monitoring/status'

function manifest(monitors) {
  return {
    schemaVersion: 1,
    installation: { id: 'test-install', name: 'Test', edition: 'community' },
    monitors,
  }
}

describe('monitoring engine', () => {
  it('does not treat disabled optional providers as failures', async () => {
    const report = await runMonitoringManifest(manifest([
      { id: 'cloudflare', adapter: 'cloudflare-zone', enabled: false },
    ]))
    expect(report.status).toBe(MONITOR_STATUS.NOT_APPLICABLE)
    expect(report.results[0].status).toBe(MONITOR_STATUS.NOT_APPLICABLE)
  })

  it('reports missing optional credentials without failing the installation', async () => {
    const registry = new MonitorRegistry().register('provider', vi.fn())
    const report = await runMonitoringManifest(manifest([
      { id: 'mail', adapter: 'provider', credentials: { apiKey: 'MAIL_API_KEY' } },
    ]), { registry, env: {} })
    expect(report.status).toBe(MONITOR_STATUS.NOT_APPLICABLE)
    expect(report.results[0].status).toBe(MONITOR_STATUS.NOT_CONFIGURED)
  })

  it('fails when a required configured check fails', async () => {
    const registry = new MonitorRegistry().register('http', async () => {
      throw new Error('Connection refused')
    })
    const report = await runMonitoringManifest(manifest([
      { id: 'app', adapter: 'http', required: true },
    ]), { registry })
    expect(report.status).toBe(MONITOR_STATUS.FAILED)
    expect(report.results[0].summary).toBe('Connection refused')
  })

  it('passes only resolved credential values to an adapter', async () => {
    const runner = vi.fn(async ({ credentials }) => ({
      status: MONITOR_STATUS.HEALTHY,
      summary: credentials.apiKey,
    }))
    const registry = new MonitorRegistry().register('provider', runner)
    const report = await runMonitoringManifest(manifest([
      { id: 'provider', adapter: 'provider', required: true, credentials: { apiKey: 'PROVIDER_KEY' } },
    ]), { registry, env: { PROVIDER_KEY: 'resolved-at-runtime' } })
    expect(report.status).toBe(MONITOR_STATUS.HEALTHY)
    expect(runner).toHaveBeenCalledOnce()
    expect(report.results[0].summary).toBe('[redacted]')
  })
})

describe('monitoring failures and disclosure boundaries', () => {
  it('fails required missing configuration without contacting the provider', async () => {
    const runner = vi.fn()
    const report = await runMonitoringManifest(manifest([{ id: 'app', adapter: 'http', required: true, configEnv: { url: 'PUBLIC_APP_URL' } }]), {
      registry: new MonitorRegistry().register('http', runner), env: {},
    })
    expect(report.status).toBe('failed')
    expect(report.results[0].status).toBe('not_configured')
    expect(runner).not.toHaveBeenCalled()
  })

  it('reports optional provider outages as degraded and strips secrets from errors', async () => {
    const registry = new MonitorRegistry().register('provider', async () => { throw new Error('Rejected secret-test-value') })
    const report = await runMonitoringManifest(manifest([{ id: 'mail', adapter: 'provider', credentials: { apiKey: 'MAIL_API_KEY' } }]), {
      registry, env: { MAIL_API_KEY: 'secret-test-value' },
    })
    expect(report.status).toBe('degraded')
    expect(JSON.stringify(report)).not.toContain('secret-test-value')
  })
})
