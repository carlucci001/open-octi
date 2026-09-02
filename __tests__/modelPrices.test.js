import { describe, expect, it } from 'vitest'
import { estimateModelCost } from '../lib/model-prices'

describe('model price estimates', () => {
  it('prices known input and output tokens from the maintained per-million map', () => {
    expect(estimateModelCost({ model: 'openai/gpt-4.1', promptTokens: 1_000_000, completionTokens: 500_000 })).toEqual({ estCostUsd: 6, unknown: false })
  })

  it('flags unknown pricing instead of presenting a zero-cost estimate', () => {
    expect(estimateModelCost({ model: 'vendor/not-in-registry', promptTokens: 1000, completionTokens: 1000 })).toEqual({ estCostUsd: 0, unknown: true })
  })

  it('uses exact provider cost when one is returned', () => {
    expect(estimateModelCost({ model: 'orcarouter/resolved-model', promptTokens: 10, completionTokens: 5, exactCostUsd: 0.0027 })).toEqual({ estCostUsd: 0.0027, unknown: false })
  })
})
