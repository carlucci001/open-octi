import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/auth', () => ({
  requireAdmin: vi.fn(async () => ({ error: null, user: { role: 'admin' } })),
}))

vi.mock('../lib/permissions', () => ({
  requireCapability: vi.fn(async () => ({ error: null, user: { role: 'admin' } })),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

import { POST as assignChannel } from '../app/api/postiz/channel-tenant/route'
import { GET as listChannels } from '../app/api/postiz/channels/route'

describe('Postiz tenant and account channel mapping', () => {
  beforeEach(() => {
    state.data = {
      'postiz-channel-tenants.json': {
        map: {},
        accountMap: {},
        defaultTenantId: 'farrington-development',
      },
    }
    process.env.POSTIZ_API_URL = 'https://postiz.example.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'postiz-test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.POSTIZ_API_URL
    delete process.env.POSTIZ_API_KEY
  })

  it('preserves the account assignment when the mapped channel is listed', async () => {
    const assignResponse = await assignChannel(new Request('https://openocti.local/api/postiz/channel-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: 'facebook_new', tenantId: 'tenant_one', accountId: 'acct_one' }),
    }))
    expect(assignResponse.status).toBe(200)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'facebook_new', identifier: 'facebook', name: 'Acme Heating', disabled: false },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const response = await listChannels(new Request('https://openocti.local/api/postiz/channels?tenantId=tenant_one'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.channels).toEqual([expect.objectContaining({
      id: 'facebook_new',
      tenantId: 'tenant_one',
      clientId: 'acct_one',
    })])
  })
})
