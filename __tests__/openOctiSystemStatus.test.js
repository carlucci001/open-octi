// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { openOctiSystemStatus } from '@/lib/openocti-system-status'

it('reports the serving app as active and checks actual bundled service health', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pass' }) })
  const status = await openOctiSystemStatus({ env: { GITEA_INTERNAL_URL: 'http://gitea:3000', OPENCLAW_HOST: 'openclaw' }, fetchImpl, checkGateway: async () => true })
  expect(status.crm.status).toBe('active')
  expect(status.gitea.status).toBe('active')
  expect(status.openclaw.status).toBe('active')
  expect(String(fetchImpl.mock.calls[0][0])).toBe('http://gitea:3000/api/healthz')
})

it('does not confuse missing configuration, a failed service, or HTML with health', async () => {
  const missing = await openOctiSystemStatus({ env: {} })
  expect(missing.gitea.status).toBe('not configured')
  for (const fetchImpl of [async () => { throw new Error('offline') }, async () => ({ ok: true, json: async () => { throw new Error('HTML') } })]) {
    const status = await openOctiSystemStatus({ env: { GITEA_INTERNAL_URL: 'http://gitea:3000' }, fetchImpl })
    expect(status.gitea.status).toBe('unavailable')
    expect(status.crm.status).toBe('active')
  }
})
