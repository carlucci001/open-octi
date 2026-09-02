import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ sessions: null, saved: null }))

vi.mock('../lib/portal-auth', () => ({
  loadSessions: vi.fn(() => structuredClone(state.sessions)),
  saveSessions: vi.fn(value => { state.saved = structuredClone(value) }),
}))

import { GET } from '../app/api/portal/auth/verify/route'

describe('portal auth verification redirect', () => {
  beforeEach(() => {
    state.saved = null
    state.sessions = {
      tokens: {
        localtoken: {
          email: 'redacted@example.invalid',
          accountId: 'account-acme',
          leaseId: 'lease-acme',
          tenantId: 'tenant-acme',
          issuedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          used: false,
        },
      },
      sessions: {},
      requestLog: [],
    }
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.farringtondevelopment.com')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('keeps a localhost magic-link login on the localhost portal', async () => {
    const response = await GET(new Request('http://localhost:3002/api/portal/auth/verify?token=localtoken'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3002/portal/dashboard')
    expect(response.headers.get('set-cookie')).toContain('fd_portal_session=')
    expect(response.headers.get('set-cookie')).not.toContain('Domain=.farringtondevelopment.com')
    expect(state.saved.tokens.localtoken.used).toBe(true)
  })
})
