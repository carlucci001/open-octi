// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const create = vi.hoisted(() => vi.fn(async () => ({ name: 'synthetic-ephemeral-token' })))
vi.mock('@google/genai', () => ({ GoogleGenAI: class { authTokens = { create } } }))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => true }))
vi.mock('@/lib/permissions', () => ({ requireCapability: async () => ({ error: null }) }))
vi.mock('@/lib/openocti-keys', () => ({ resolveProviderKey: () => ({ key: 'synthetic-test-key' }) }))
vi.mock('@/lib/dataStore', () => ({ readData: () => ({ agents: { 'octi-guide': { name: 'Octi' } } }) }))
import { POST } from '@/app/api/voice/gemini-live-token/route'
beforeEach(() => vi.clearAllMocks())
it('creates an English Gemini setup voice with no workspace tools', async () => {
  const response = await POST(new Request('http://localhost/api/voice/gemini-live-token', { method: 'POST', body: JSON.stringify({ agentId: 'octi-guide', enableTools: true }) }))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.setup.setup.systemInstruction.parts[0].text).toContain('English by default')
  expect(body.setup.setup.tools).toBeUndefined()
  expect(create.mock.calls[0][0].config.liveConnectConstraints.config.tools).toBeUndefined()
  expect(body.voiceName).toBe('Charon')
})
