import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/openocti-keys', () => ({ OPENOCTI_MODEL_PROVIDERS: [], validateOpenOctiProviderKey: vi.fn() }))
vi.mock('../lib/stripe-configuration', () => ({ stripeConfigurationEnv: env => env }))
vi.mock('../lib/dataStore', () => ({ readData: vi.fn(() => null) }))
vi.mock('../lib/permissions', () => ({ requireCapability: vi.fn(async () => ({})) }))
import { getPostizConfig } from '../lib/postiz-config'
import { testIntegrationConnection } from '../lib/integration-probes'
import { publishPostizPost } from '../lib/postiz-publish'
import { GET as listChannels } from '../app/api/postiz/channels/route'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const env = { POSTIZ_API_URL: 'http://postiz:4007/api/public/v1/', POSTIZ_API_KEY: 'test-connection-only' }
describe('Postiz Public API connection', () => {
  it('uses the configured full API base once and the raw authorization key', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [] }))
    vi.stubGlobal('fetch', fetch)
    expect(await testIntegrationConnection('postiz', env)).toMatchObject({ ok: true, message: expect.stringContaining('0 connected channel(s). Publishing has not been tested.') })
    expect(fetch).toHaveBeenCalledWith('http://postiz:4007/api/public/v1/integrations', expect.objectContaining({ headers: { Authorization: env.POSTIZ_API_KEY }, redirect: 'error' }))
  })
  it('supports the hosted API base without adding a second prefix', () => {
    expect(getPostizConfig({ ...env, POSTIZ_API_URL: 'https://api.postiz.com/public/v1' })).toMatchObject({ base: 'https://api.postiz.com/public/v1', publicUrl: 'https://platform.postiz.com' })
  })
  it.each(['https://postiz.company.example.com/api/public/v1', 'http://postiz:4007', 'http://user:secret@postiz/api/public/v1', 'file:///api/public/v1'])('rejects invalid or placeholder addresses: %s', url => {
    expect(getPostizConfig({ ...env, POSTIZ_API_URL: url })).toHaveProperty('error')
  })
  it('does not probe a fresh install without configuration', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await testIntegrationConnection('postiz', {})).toMatchObject({ ok: false, status: 'not_configured' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{}, '<html>Login</html>'])('does not report a login page or unexpected payload as connected', async payload => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { if (typeof payload === 'string') throw new Error('not JSON'); return payload } })))
    expect(await testIntegrationConnection('postiz', env)).toMatchObject({ ok: false })
  })
  it('reports rejected credentials without returning them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    const result = await testIntegrationConnection('postiz', env)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('401')
    expect(result.message).not.toContain(env.POSTIZ_API_KEY)
  })
  it('allows the fresh-install tenant returned by channel listing to publish to that same channel', async () => {
    vi.stubEnv('POSTIZ_API_URL', env.POSTIZ_API_URL)
    vi.stubEnv('POSTIZ_API_KEY', env.POSTIZ_API_KEY)
    const fetch = vi.fn(async (_url, init) => new Response(JSON.stringify(init.method === 'POST' ? [{ id: 'scheduled-test' }] : [{ id: 'channel-1', name: 'Test channel' }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const listed = await (await listChannels(new Request('http://localhost/api/postiz/channels'))).json()
    expect(listed.channels[0].tenantId).toBe('default')
    const result = await publishPostizPost({ content: 'Mocked test only', channels: ['channel-1'], tenantId: listed.channels[0].tenantId, brandId: 'default', tenantAssignments: {}, config: getPostizConfig(env) })
    expect(result).toMatchObject({ ok: true, postId: 'scheduled-test' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('still rejects a channel assigned to another tenant before a publishing request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(publishPostizPost({ content: 'Mocked test only', channels: ['channel-1'], tenantId: 'default', tenantAssignments: { map: { 'channel-1': 'another-tenant' } }, config: getPostizConfig(env) })).rejects.toMatchObject({ status: 403, code: 'channel_tenant_mismatch' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
