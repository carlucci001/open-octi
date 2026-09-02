import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODEL_CATALOG, PROVIDERS } from '@/lib/model-catalog'
import { runAiModel } from '@/lib/ai-lab'

const mocks = vi.hoisted(() => ({ recordUsageEvent: vi.fn() }))

vi.mock('../lib/agent-creds', () => ({
  getCred: name => ['orcarouter', 'openai'].includes(name) ? { key: `test-${name}-key` } : null,
}))
vi.mock('../lib/usage-events', () => ({ recordUsageEvent: mocks.recordUsageEvent }))

afterEach(() => {
  vi.restoreAllMocks()
  mocks.recordUsageEvent.mockClear()
})

describe('OrcaRouter catalog integration', () => {
  it('registers OrcaRouter as a distinct provider', () => {
    expect(PROVIDERS.orcarouter).toMatchObject({
      label: 'OrcaRouter',
      envKey: 'ORCAROUTER_API_KEY',
    })
  })

  it('keeps explicit open-weight selection separate from mixed routing', () => {
    const models = MODEL_CATALOG.filter(model => model.provider === 'orcarouter')
    const openWeight = models.find(model => model.id === 'orcarouter/qwen/qwen3.8-27b-free')
    const auto = models.find(model => model.id === 'orcarouter/orcarouter/auto')

    expect(openWeight).toMatchObject({ openWeights: true, license: 'Apache-2.0' })
    expect(auto).toMatchObject({ dynamicPricing: true, weightPolicy: 'mixed' })
  })

  it('dispatches OrcaRouter models through the OpenAI-compatible runtime', async () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"ORCA_OK"}}]}',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7,"cost_usd":0.00001}}',
      'data: [DONE]',
      '',
    ].join('\n\n')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-orca-request-id': 'req_test',
        'x-orca-resolved-model': 'qwen/qwen3.8-27b-free',
        'x-orca-router': 'auto',
      },
    }))

    const result = await runAiModel({
      modelId: 'orcarouter/orcarouter/auto',
      prompt: 'Reply with ORCA_OK',
    })

    expect(result).toMatchObject({
      provider: 'orcarouter',
      model: 'orcarouter/auto',
      text: 'ORCA_OK',
      route: {
        requestId: 'req_test',
        resolvedModel: 'qwen/qwen3.8-27b-free',
        router: 'auto',
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.orcarouter.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-OrcaRouter-Include-Cost': 'true' }),
      }),
    )
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ provider: 'orcarouter', model: 'qwen/qwen3.8-27b-free', estCostUsd: 0.00001, unknown: false, requestId: 'req_test', source: 'ai-lab' }))
  })

  it('estimates known-model cost when the provider omits exact cost', async () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"OK"}}]}',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}',
      'data: [DONE]',
      '',
    ].join('\n\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }))

    const result = await runAiModel({ modelId: 'openai/gpt-4.1', prompt: 'Reply OK' })

    expect(result.cost).toMatchObject({ estimatedUsd: 0.000026, promptTokens: 5, completionTokens: 2 })
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', model: 'gpt-4.1', estCostUsd: 0.000026, unknown: false }))
  })
})
