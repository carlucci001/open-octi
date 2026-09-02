import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null,
  saved: null,
  data: { connections: [] },
}))

vi.mock('@/lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(() => state.data),
  writeData: vi.fn((_name, value) => {
    state.saved = value
    state.data = value
  }),
}))

vi.mock('@/lib/entityStore', () => ({ logActivity: vi.fn() }))

describe('portal website connections route', () => {
  beforeEach(() => {
    state.session = null
    state.saved = null
    state.data = { connections: [] }
    delete process.env.PORTAL_CONNECTION_ENCRYPTION_KEY
  })

  it('requires a portal session', async () => {
    const { GET } = await import('@/app/api/portal/website-connections/route')
    const response = await GET(new Request('http://localhost/api/portal/website-connections'))
    expect(response.status).toBe(401)
  })

  it('stores only an encrypted, tenant-scoped connection', async () => {
    process.env.PORTAL_CONNECTION_ENCRYPTION_KEY = 'test-only-route-key-that-is-long-enough-123456'
    state.session = { accountId: 'account-1', tenantId: 'tenant-1', email: 'client@example.com' }
    const { POST } = await import('@/app/api/portal/website-connections/route')
    const response = await POST(new Request('http://localhost/api/portal/website-connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'wordpress',
        siteUrl: 'https://example.com',
        credentials: { username: 'editor', applicationPassword: 'secret-value' },
        authorityConfirmed: true,
        backupResponsibilityConfirmed: true,
        pointInTimeAssessmentConfirmed: true,
        sharedAccessAcknowledged: true,
      }),
    }))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.connection.accountId).toBeUndefined()
    expect(body.connection.credentialStatus.applicationPassword).toBe(true)
    expect(JSON.stringify(state.saved)).not.toContain('secret-value')
    expect(state.saved.connections[0]).toMatchObject({ accountId: 'account-1', tenantId: 'tenant-1' })
  })

  it('returns only the signed-in account connections', async () => {
    state.session = { accountId: 'account-1', tenantId: 'tenant-1' }
    state.data = {
      connections: [
        { id: 'one', accountId: 'account-1', tenantId: 'tenant-1', provider: 'wordpress', credentialFieldIds: ['username'] },
        { id: 'two', accountId: 'account-2', tenantId: 'tenant-2', provider: 'drupal', credentialFieldIds: ['accessToken'] },
      ],
    }
    const { GET } = await import('@/app/api/portal/website-connections/route')
    const response = await GET(new Request('http://localhost/api/portal/website-connections'))
    const body = await response.json()
    expect(body.connections).toHaveLength(1)
    expect(body.connections[0].id).toBe('one')
  })

  it('rate limits repeated secret submissions per tenant account', async () => {
    process.env.PORTAL_CONNECTION_ENCRYPTION_KEY = 'test-only-route-key-that-is-long-enough-123456'
    state.session = { accountId: 'account-1', tenantId: 'tenant-1' }
    state.data = {
      connections: [],
      submissionLog: [1, 2, 3].map(index => ({ accountId: 'account-1', tenantId: 'tenant-1', at: Date.now() - index })),
    }
    const { POST } = await import('@/app/api/portal/website-connections/route')
    const response = await POST(new Request('http://localhost/api/portal/website-connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(response.status).toBe(429)
  })
})
