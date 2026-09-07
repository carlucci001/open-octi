// @vitest-environment node
import { expect, it, vi } from 'vitest'
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => true }))
vi.mock('@/lib/permissions', () => ({ requireCapability: async () => ({}) }))
vi.mock('@/lib/dataStore', () => ({ readData: file => file === 'agents.json' ? { agents: { main: { name: 'Maggie', voice: { provider: 'elevenlabs' } } } } : {} }))
vi.mock('@/lib/openocti-keys', () => ({ listOpenOctiKeyStatus: () => [{ id: 'openai', status: 'configured' }] }))
import { GET } from '@/app/api/voice/roster/route'

it('returns all six public voice starters without requiring ElevenLabs bindings', async () => {
  const response = await GET(new Request('http://localhost:3304/api/voice/roster'))
  const body = await response.json()
  expect(body.agents).toHaveLength(6)
  expect(body.agents.find(agent => agent.id === 'main')).toMatchObject({ name: 'Maggie', voiceProvider: 'openai', providerReady: true, agentId: null })
  expect(body.agents.every(agent => agent.voiceProfile.provider === 'openai')).toBe(true)
})
