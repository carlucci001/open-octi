import { describe, expect, it } from 'vitest'
import { createBearerMiddleware } from '../src/auth.js'
import { buildPlatformManifest } from '../src/manifest.js'
import {
  PLATFORM_ADMIN_CAPABILITIES,
  validateErrors,
  validateHealth,
  validateReleases,
  validateRevenue,
  validateUsage,
} from '../src/contract.js'
import { createPlatformAdminRouteStubs } from '../src/routes.js'

describe('platform-admin-sdk scaffold contract', () => {
  it('builds a v2 manifest with the canonical capabilities', () => {
    expect(buildPlatformManifest({
      id: 'new-product',
      name: 'New Product',
      version: '1.0.0',
      capabilities: PLATFORM_ADMIN_CAPABILITIES,
    })).toMatchObject({
      schemaVersion: '2.0',
      platform: { id: 'new-product', name: 'New Product', version: '1.0.0', adminApiBasePath: '/api/platform-admin/v1' },
      authentication: { methods: ['bearer'] },
      capabilities: PLATFORM_ADMIN_CAPABILITIES,
    })
  })

  it('authenticates bearer requests and leaves an explicit HMAC extension hook', async () => {
    const middleware = createBearerMiddleware({ getBearerKey: () => 'sdk-test-key' })
    expect(await middleware(new Request('https://example.com', { headers: { Authorization: 'Bearer sdk-test-key' } }))).toBeNull()
    expect(middleware.verifyHmac).toBeNull()
  })

  it('provides route stubs for all five v2 resources', () => {
    const routes = createPlatformAdminRouteStubs()
    expect(Object.keys(routes).sort()).toEqual(['errors', 'health', 'releases', 'revenue', 'usage'])
    for (const route of Object.values(routes)) expect(route).toHaveProperty('GET')
  })

  it('validates every v2 DTO shape', () => {
    expect(validateHealth({ status: 'ok', version: '1.0.0', checks: [], ts: new Date().toISOString() })).toBe(true)
    expect(validateReleases([])).toBe(true)
    expect(validateErrors([])).toBe(true)
    expect(validateUsage({})).toBe(true)
    expect(validateRevenue({ currency: 'USD', mrr: 0, newMrr: 0, churnedMrr: 0, failedPayments: 0, trials: { started: 0, converted: 0 } })).toBe(true)
    expect(validateHealth({ status: 'excellent' })).toBe(false)
  })
})
