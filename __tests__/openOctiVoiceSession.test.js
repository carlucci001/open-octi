// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ openOcti: true, keys: [{ source: 'app', label: 'test', key: 'synthetic-voice-test-key' }], error: null }))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => state.openOcti }))
vi.mock('@/lib/dataStore', () => ({ readData: file => file === 'agents.json' ? { agents: { 'octi-guide': { name: 'Octi', draft: false }, main: { name: 'Maggie', draft: false }, coding: { name: 'Craig', draft: false } } } : null }))
vi.mock('@/lib/clients', () => ({ getClients: () => [] }))
vi.mock('@/lib/permissions', () => ({ requireCapability: async () => ({ error: state.error }) }))
vi.mock('@/lib/openai-key-candidates', () => ({ getOpenAIKeyCandidates: () => state.keys, redactedKeyMeta: () => ({ source: 'app', suffix: 'test' }) }))
import { POST } from '@/app/api/voice/openai/session/route'
beforeEach(() => {
  state.openOcti = true; state.error = null; state.keys = [{ source: 'app', label: 'test', key: 'synthetic-voice-test-key' }]
  global.fetch = vi.fn(async () => new Response('v=0\r\nanswer', { status: 200 }))
})
const request = () => new Request('http://localhost:3303/api/voice/openai/session?agent=octi-guide', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0\r\noffer' })
it('connects the public onboarding guide with Ballad and no workspace action tools', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('application/sdp')
  const sent = fetch.mock.calls[0][1]
  expect(sent.headers.Authorization).toBe('Bearer synthetic-voice-test-key')
  const configuration = JSON.parse(sent.body.get('session'))
  expect(configuration.audio.output.voice).toBe('ballad')
  expect(configuration.model).toBe('gpt-realtime-2.1')
  expect(configuration.tools).toEqual([])
  expect(configuration.instructions).toContain('cannot perform workspace actions')
  expect(configuration.instructions).toContain('Always begin and respond in English by default')
  expect(configuration.instructions).toContain('only when the user explicitly requests another language')
})
it('keeps the private edition production-agent restriction', async () => {
  state.openOcti = false
  expect((await POST(request())).status).toBe(409)
  expect(fetch).not.toHaveBeenCalled()
})
it.each(['main', 'coding', 'social-media', 'legal', 'matilda'])('loads the public %s specialist and its knowledge with the saved OpenAI voice key', async agentId => {
  const response = await POST(new Request(`http://localhost:3304/api/voice/openai/session?agent=${agentId}`, { method: 'POST', body: 'v=0\r\noffer' }))
  expect(response.status).toBe(200)
  const configuration = JSON.parse(fetch.mock.calls[0][1].body.get('session'))
  const voices = { main: 'marin', coding: 'cedar', 'social-media': 'coral', legal: 'sage', matilda: 'shimmer' }
  expect(configuration.audio.output.voice).toBe(voices[agentId])
  expect(configuration.model).toBe('gpt-realtime-2.1')
  expect(configuration.instructions).toContain('Always begin and respond in English')
  expect(configuration.instructions).not.toMatch(/\bCarl\b|Farrington|Hetzner/)
  const names = { main: 'Maggie', coding: 'Craig', 'social-media': 'Sasha', legal: 'Linda', matilda: 'Matilda' }
  expect(configuration.instructions).toContain(`Authoritative identity: You are ${names[agentId]}.`)
  expect(configuration.instructions).toContain(`Voice Brief - ${names[agentId]}`)
  if (agentId === 'coding') expect(configuration.instructions).toContain('OpenClaw knowledge Craig needs')
  if (agentId === 'legal') expect(configuration.instructions).toContain('Contract review (fast triage)')
})
it.each(['main', 'coding'])('retains the private %s ElevenLabs restriction', async agentId => {
  state.openOcti = false
  const response = await POST(new Request(`http://localhost:3304/api/voice/openai/session?agent=${agentId}`, { method: 'POST', body: 'v=0\r\noffer' }))
  expect(response.status).toBe(409)
  expect(fetch).not.toHaveBeenCalled()
})
it('explains a missing OpenAI key without contacting the provider', async () => {
  state.keys = []
  const response = await POST(request())
  expect(response.status).toBe(400)
  expect((await response.json()).error).toContain('Models & Keys')
  expect(fetch).not.toHaveBeenCalled()
})
it('requires voice permission before contacting the provider', async () => {
  state.error = new Response('Unauthorized', { status: 401 })
  expect((await POST(request())).status).toBe(401)
  expect(fetch).not.toHaveBeenCalled()
})
