import { afterEach, describe, expect, it } from 'vitest'
import { authorizePlatformAdminRequest } from '../lib/platform-admin/auth'

afterEach(() => {
  delete process.env.FCC_PLATFORM_ADMIN_API_KEY
  delete process.env.PLATFORM_ADMIN_API_KEY
})

describe('FCC Platform Admin bearer middleware', () => {
  it('accepts the configured bearer key', async () => {
    process.env.FCC_PLATFORM_ADMIN_API_KEY = 'test-platform-admin-key'
    const request = new Request('https://crm.example.com/api/platform-admin/v1/health', {
      headers: { Authorization: 'Bearer test-platform-admin-key' },
    })
    expect(await authorizePlatformAdminRequest(request)).toBeNull()
  })

  it('returns structured 401 and 503 errors without exposing the configured key', async () => {
    process.env.FCC_PLATFORM_ADMIN_API_KEY = 'test-platform-admin-key'
    const denied = await authorizePlatformAdminRequest(new Request('https://crm.example.com/api/platform-admin/v1/health'))
    expect(denied.status).toBe(401)
    expect(await denied.text()).not.toContain('test-platform-admin-key')

    delete process.env.FCC_PLATFORM_ADMIN_API_KEY
    const unavailable = await authorizePlatformAdminRequest(new Request('https://crm.example.com/api/platform-admin/v1/health'))
    expect(unavailable.status).toBe(503)
    expect((await unavailable.json()).error.code).toBe('NOT_CONFIGURED')
  })
})
