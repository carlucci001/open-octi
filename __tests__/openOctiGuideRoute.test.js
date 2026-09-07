// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ edition: true, error: null }))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => state.edition }))
vi.mock('@/lib/permissions', () => ({ requireCapability: async () => ({ error: state.error }) }))
vi.mock('@/lib/direct-provider-chat', () => ({ directProviderChat: vi.fn(async () => ({ text: 'Let us start with your workspace name.', provider: 'orcarouter' })) }))
import { POST } from '@/app/api/openocti/guide/route'
import { directProviderChat } from '@/lib/direct-provider-chat'
beforeEach(() => { state.edition = true; state.error = null; vi.clearAllMocks() })
const request = body => new Request('http://localhost/api/openocti/guide', { method: 'POST', body: JSON.stringify(body) })
it('answers setup questions through the saved model provider without requiring OpenClaw', async () => {
  const response = await POST(request({ messages: [{ role: 'user', content: 'How do I get started?' }] }))
  expect(response.status).toBe(200)
  expect((await response.json()).provider).toBe('orcarouter')
  expect(directProviderChat.mock.calls[0][0].system).toContain('English by default')
  expect(directProviderChat.mock.calls[0][0].system).toContain('cannot perform workspace actions')
})
it('requires agent access before using the key', async () => {
  state.error = new Response('Unauthorized', { status: 401 })
  expect((await POST(request({ messages: [] }))).status).toBe(401)
  expect(directProviderChat).not.toHaveBeenCalled()
})
it('does not enable this setup route in the private edition', async () => {
  state.edition = false
  expect((await POST(request({ messages: [] }))).status).toBe(404)
  expect(directProviderChat).not.toHaveBeenCalled()
})
