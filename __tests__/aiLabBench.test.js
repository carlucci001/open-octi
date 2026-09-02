import { describe, expect, it } from 'vitest'
import { listBenchEntries, mutateBenchState } from '../lib/ai-lab-bench'

const catalog = [
  { id: 'openai/gpt-test', name: 'GPT Test', providerLabel: 'OpenAI', tier: 'standard', configured: true },
  { id: 'deepseek/test', name: 'DeepSeek Test', providerLabel: 'DeepSeek', tier: 'fast', configured: true },
]

describe('AI Lab Bench registry', () => {
  it('keeps catalog facts immutable while CRUD manages local Bench profiles', () => {
    let state = mutateBenchState({}, catalog, 'create', {
      modelId: catalog[0].id,
      displayName: 'CRM quality profile',
      notes: 'Use for contract review.',
    }, { id: 'bench_quality', now: '2026-08-23T12:00:00.000Z' })

    let entries = listBenchEntries(catalog, state)
    expect(entries).toHaveLength(3)
    expect(entries.find(entry => entry.id === 'bench_quality')).toMatchObject({
      modelId: catalog[0].id,
      displayName: 'CRM quality profile',
      providerLabel: 'OpenAI',
      custom: true,
    })

    state = mutateBenchState(state, catalog, 'update', {
      id: 'bench_quality',
      displayName: 'CRM daily profile',
      notes: 'Updated local note.',
      enabled: false,
    }, { now: '2026-08-23T12:05:00.000Z' })
    expect(listBenchEntries(catalog, state).find(entry => entry.id === 'bench_quality')).toMatchObject({
      displayName: 'CRM daily profile',
      benchNotes: 'Updated local note.',
      enabled: false,
      providerLabel: 'OpenAI',
    })

    state = mutateBenchState(state, catalog, 'delete', { id: 'bench_quality' })
    expect(listBenchEntries(catalog, state).some(entry => entry.id === 'bench_quality')).toBe(false)
  })

  it('hides a default Bench entry without deleting the catalog model', () => {
    const state = mutateBenchState({}, catalog, 'delete', { id: catalog[0].id })
    expect(listBenchEntries(catalog, state).map(entry => entry.modelId)).toEqual([catalog[1].id])
    expect(catalog).toHaveLength(2)
  })
})
