import { describe, expect, it } from 'vitest'
import {
  canRunModelComparison,
  countSelectedProviders,
  selectReadyModelSlate,
  selectedModelEntries,
} from '../lib/ai-lab-selection'

const models = [
  { id: 'openai/a', provider: 'openai', providerLabel: 'OpenAI', configured: true },
  { id: 'openai/b', provider: 'openai', providerLabel: 'OpenAI', configured: true },
  { id: 'google/a', provider: 'google', providerLabel: 'Gemini', configured: true },
  { id: 'nvidia/a', provider: 'nvidia', providerLabel: 'NVIDIA', configured: true },
  { id: 'deepseek/a', provider: 'deepseek', providerLabel: 'DeepSeek', configured: false },
]

describe('AI Lab model selection', () => {
  it('maps selected IDs into route entries and ignores stale IDs', () => {
    expect(selectedModelEntries(['openai/a', 'missing', 'google/a'], models)).toEqual([
      models[0],
      models[2],
    ])
  })

  it('counts providers separately from selected model routes', () => {
    const entries = selectedModelEntries(['openai/a', 'openai/b', 'google/a', 'nvidia/a'], models)

    expect(entries).toHaveLength(4)
    expect(countSelectedProviders(entries)).toBe(3)
  })

  it('requires at least two selected routes and a prompt before running', () => {
    expect(canRunModelComparison(['openai/a'], 'Compare this')).toBe(false)
    expect(canRunModelComparison(['openai/a', 'google/a'], '   ')).toBe(false)
    expect(canRunModelComparison(['openai/a', 'google/a'], 'Compare this')).toBe(true)
  })

  it('prefers distinct ready providers for quick selections', () => {
    expect(selectReadyModelSlate(models, 2)).toEqual(['openai/a', 'google/a'])
    expect(selectReadyModelSlate(models, 4)).toEqual(['openai/a', 'google/a', 'nvidia/a'])
  })

  it('falls back to multiple ready models from the same provider when needed', () => {
    const sameProvider = models.slice(0, 2)

    expect(selectReadyModelSlate(sameProvider, 2)).toEqual(['openai/a', 'openai/b'])
  })
})
