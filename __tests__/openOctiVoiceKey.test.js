// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ openOcti: true, key: 'synthetic-app-key' }))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => state.openOcti }))
vi.mock('@/lib/dataStore', () => ({ readData: () => ({ credentials: [] }) }))
vi.mock('@/lib/openocti-keys', () => ({ getStoredOpenOctiKey: () => state.key }))
import { getOpenAIKeyCandidates } from '@/lib/openai-key-candidates'
beforeEach(() => { state.openOcti = true; state.key = 'synthetic-app-key' })
it('uses the app-saved OpenAI key for voice without requiring an environment key', () => {
  expect(getOpenAIKeyCandidates({})).toEqual([{ source: 'app', label: 'OpenOcti Models & Keys', key: 'synthetic-app-key' }])
})
it('preserves the private edition key lookup', () => {
  state.openOcti = false
  expect(getOpenAIKeyCandidates({ OPENAI_API_KEY: 'synthetic-env-key' })).toEqual([{ source: 'env', label: 'OPENAI_API_KEY', key: 'synthetic-env-key' }])
})
