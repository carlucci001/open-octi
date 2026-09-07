import { expect, it, vi } from 'vitest'
vi.mock('@/lib/openocti-keys', () => ({ effectiveProviderEnv: env => env }))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => true }))
import { directProviderChat } from '@/lib/direct-provider-chat'
it.each([
  ['gemini', 'GEMINI_API_KEY', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
  ['openrouter', 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1/chat/completions'],
  ['orcarouter', 'ORCAROUTER_API_KEY', 'https://api.orcarouter.ai/v1/chat/completions'],
])('keeps text setup available through %s without a voice key', async (provider, envKey, endpoint) => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Setup help' } }] }) }))
  const result = await directProviderChat({ message: 'Help me set up', system: 'English by default', env: { [envKey]: 'synthetic-test-key' }, fetchImpl })
  expect(result).toMatchObject({ provider, text: 'Setup help' })
  expect(fetchImpl.mock.calls[0][0]).toBe(endpoint)
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-test-key')
})
