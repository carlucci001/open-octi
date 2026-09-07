// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ user: { id: 'owner-a', displayName: 'Demo Owner' }, denied: false }))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => true }))
vi.mock('@/lib/auth', () => ({ SESSION_COOKIE: 'fcc_session' }))
vi.mock('@/lib/permissions', () => ({ requireCapability: async () => state.denied ? { error: new Response('Unauthorized', { status: 401 }) } : { user: state.user } }))
import { GET, POST } from '@/app/api/repository/gitea/[[...path]]/route'
import { giteaIdentity } from '@/lib/openocti-gitea'

beforeEach(() => { state.denied = false; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok'))) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('maps distinct app users to distinct stable repository identities', () => {
  expect(giteaIdentity(state.user).name).not.toBe(giteaIdentity({ id: 'owner-b' }).name)
  expect(giteaIdentity(state.user).name).toBe(giteaIdentity({ ...state.user, displayName: 'Renamed' }).name)
  expect(() => giteaIdentity({})).toThrow()
})

it('forwards only verified identity, excludes the app session and accepts async route params', async () => {
  await GET(new Request('http://localhost:3305/api/repository/gitea/explore', { headers: { cookie: 'fcc_session=secret; i_like_gitea=test', 'x-webauth-user': 'spoofed' } }), { params: Promise.resolve({ path: ['explore'] }) })
  const [url, options] = fetch.mock.calls[0]
  expect(url.pathname).toBe('/explore')
  expect(options.headers.get('x-webauth-user')).toBe(giteaIdentity(state.user).name)
  expect(options.headers.get('x-webauth-fullname')).toBe('Demo Owner')
  expect(options.headers.get('cookie')).toBe('i_like_gitea=test')
  expect(options.headers.get('x-forwarded-proto')).toBe('http')
})

it('blocks unauthenticated access and cross-origin changes before reaching Gitea', async () => {
  state.denied = true
  expect((await GET(new Request('http://localhost/api/repository/gitea/'))).status).toBe(401)
  state.denied = false
  expect((await POST(new Request('http://localhost/api/repository/gitea/repo/create', { method: 'POST', headers: { origin: 'https://other.invalid' } }))).status).toBe(403)
  expect(fetch).not.toHaveBeenCalled()
})

it('returns an explicit unavailable response when the service is down', async () => {
  fetch.mockRejectedValue(new Error('connect refused'))
  const response = await GET(new Request('http://localhost/api/repository/gitea/'))
  expect(response.status).toBe(503)
  expect(await response.text()).toContain('Repository is unavailable')
})
