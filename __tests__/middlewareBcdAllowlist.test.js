import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { middleware } from '../middleware'
import { GET as getPlatformHealth } from '../app/api/platform-admin/v1/health/route'

function request(path, headers) {
  return new NextRequest(`https://openocti.local${path}`, { headers })
}

describe('Entries B, C, D, E, F, G, and H middleware caller boundaries', () => {
  beforeEach(() => {
    process.env.FCC_PLATFORM_ADMIN_API_KEY = 'platform-admin-test-key'
  })

  afterEach(() => {
    delete process.env.FCC_PLATFORM_ADMIN_API_KEY
  })

  it.each([
    '/api/releases/report',
    '/api/builder/handoff',
    '/api/platform-admin/v1/health',
    '/api/platform-admin/v1/releases',
    '/api/platform-admin/v1/errors',
    '/api/platform-admin/v1/usage',
    '/api/platform-admin/v1/revenue',
    '/api/platform-admin/v1/future-resource',
    '/.well-known/farrington-platform.json',
    '/api/ops/incidents/poll',
    '/api/integrations/myvtc/webhook',
    '/status',
  ])('allows the server-to-server or public route %s to reach its route handler', async (path) => {
    const response = await middleware(request(path))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it.each([
    '/api/usage?groupBy=agent',
    '/api/build/ship',
    '/api/build/ship/summaries',
    '/api/build/board',
    '/api/builder/launch',
    '/api/builder/status',
    '/api/ops/incidents',
    '/api/ops/money',
    '/api/orchestrations',
    '/api/integrations/myvtc/webhook/',
    '/api/integrations/myvtc/webhook/extra',
    '/api/integrations/myvtc/webhook-registration',
    '/api/integrations/myvtc/sync',
  ])('keeps the CRM-session route %s protected from unauthenticated callers', async (path) => {
    const response = await middleware(request(path))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('keeps the Incident Inbox page behind the CRM login redirect', async () => {
    const response = await middleware(request('/ops/incidents'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=%2Fops%2Fincidents')
  })

  it('keeps the Build Board page behind the CRM login redirect', async () => {
    const response = await middleware(request('/build/board'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=%2Fbuild%2Fboard')
  })

  it('keeps the Money Console page behind the CRM login redirect', async () => {
    const response = await middleware(request('/ops/money'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login?next=%2Fops%2Fmoney')
  })

  it('lets an unauthenticated platform health request reach the route bearer check', async () => {
    const incoming = request('/api/platform-admin/v1/health')
    const middlewareResponse = await middleware(incoming)
    const response = middlewareResponse.headers.get('x-middleware-next') === '1'
      ? await getPlatformHealth(incoming)
      : middlewareResponse

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'A valid Platform Admin bearer credential is required.',
      },
    })
  })
})
