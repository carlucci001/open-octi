// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const memory = vi.hoisted(() => new Map())
vi.mock('../lib/dataStore', () => ({ readData: name => memory.get(name), writeData: (name, data) => memory.set(name, data) }))
vi.mock('../lib/permissions', () => ({ requireUserManagement: vi.fn(async () => ({ error: new Response('unauthorized', { status: 401 }) })) }))
import { requireUserManagement } from '../lib/permissions'
import { GET, POST, PATCH } from '../app/api/openocti/postiz/route'
import { publishPostizPost } from '../lib/postiz-publish'
import { postizSetupProgress, recordPostizSetupSchedule, confirmPostizSetupPublished } from '../lib/openocti-postiz-progress'
const config = { base: 'http://postiz:5000/api/public/v1', key: 'unit-test-only-key', publicUrl: 'http://localhost:4007' }
beforeEach(() => { memory.clear(); vi.stubEnv('FCC_EDITION', 'openocti'); requireUserManagement.mockResolvedValue({ error: new Response('unauthorized', { status: 401 }) }) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('does not probe, save, or confirm Postiz for an unauthenticated request', async () => {
  const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl)
  for (const handler of [GET, POST, PATCH]) expect((await handler(new Request('http://localhost/api/openocti/postiz'))).status).toBe(401)
  expect(fetchImpl).not.toHaveBeenCalled(); expect(memory.size).toBe(0)
})
it('keeps the setup API closed in the private edition', async () => {
  vi.stubEnv('FCC_EDITION', 'commandcenter')
  expect((await GET(new Request('http://localhost/api/openocti/postiz'))).status).toBe(404)
})
it('refuses publication confirmation without a scheduling receipt and invalidates progress for another key', () => {
  expect(() => confirmPostizSetupPublished(config)).toThrow('Schedule a test post')
  recordPostizSetupSchedule({ postId: 'test-post', scheduledFor: '2026-09-10T12:00:00Z' }, config)
  expect(postizSetupProgress(config).confirmedPublishedAt).toBeNull()
  confirmPostizSetupPublished(config)
  expect(postizSetupProgress(config).confirmedPublishedAt).toBeTruthy()
  expect(postizSetupProgress({ ...config, key: 'different-installation' })).toBeNull()
})
it.each([new Response('failed upload', { status: 500 }), new Response('{}', { headers: { 'content-type': 'application/json' } })])('does not silently schedule a text-only post when its image fails', async uploadResponse => {
  const fetchImpl = vi.fn(async url => url.endsWith('/integrations') ? Response.json([{ id: 'test-channel', identifier: 'facebook' }]) : uploadResponse); vi.stubGlobal('fetch', fetchImpl)
  await expect(publishPostizPost({ config, content: 'Unit test only', mediaUrl: 'https://media.test/image.png', channels: ['test-channel'], tenantId: 'default', tenantAssignments: { defaultTenantId: 'default' } })).rejects.toMatchObject({ stage: 'media-upload' })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/posts'))).toBe(false)
})

it.each([{ channels: [] }, { channels: [{ id: 'test-channel', identifier: 'facebook', disabled: true }] }, { channels: [{ id: 'test-channel' }] }])('stops before upload or scheduling when a selected channel cannot be resolved', async ({ channels }) => {
  const fetchImpl = vi.fn(async () => Response.json(channels)); vi.stubGlobal('fetch', fetchImpl)
  await expect(publishPostizPost({ config, content: 'Local test', mediaUrl: 'https://media.test/image.png', channels: ['test-channel'], tenantId: 'default', tenantAssignments: { defaultTenantId: 'default' } })).rejects.toMatchObject({ code: 'channel_unavailable' })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('does not report a partially malformed scheduling response as accepted', async () => {
  const fetchImpl = vi.fn(async url => Response.json(url.endsWith('/integrations') ? [{ id: 'test-channel', identifier: 'facebook' }] : [{ id: 'accepted' }, { error: 'invalid' }]))
  vi.stubGlobal('fetch', fetchImpl)
  await expect(publishPostizPost({ config, content: 'Local test', channels: ['test-channel'], tenantId: 'default', tenantAssignments: { defaultTenantId: 'default' } })).rejects.toMatchObject({ code: 'invalid_post_response' })
})
