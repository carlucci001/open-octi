import { describe, expect, it, vi } from 'vitest'
import {
  SocialContentGenerationError,
  buildSocialGenerationContext,
  generateSocialContent,
  selectSocialGenerationModels,
  validateSocialVariants,
} from '../lib/social-content-generation'

function variant(platform, overrides = {}) {
  return {
    platform,
    hook: `${platform} hook`,
    body: `${platform} body grounded in the supplied source.`,
    cta: 'Learn more.',
    assetBrief: `Create a clean ${platform} campaign image.`,
    altText: `${platform} campaign visual`,
    ...overrides,
  }
}

describe('social content generation boundary', () => {
  it('builds bounded client, agent, and source context and uses the assigned brain model first', async () => {
    const calls = []
    const runModel = vi.fn(async input => {
      calls.push(input)
      return {
        provider: 'openai',
        model: 'gpt-5',
        text: JSON.stringify({ variants: [variant('Instagram'), variant('Facebook')] }),
        usage: { prompt_tokens: 420, completion_tokens: 180, total_tokens: 600 },
        cost: { estimatedUsd: 0.0042 },
      }
    })

    const result = await generateSocialContent({
      client: {
        id: 'cl_farrington',
        name: 'Farrington Development',
        website: 'https://farringtondevelopment.com',
        industry: 'AI business systems',
        notes: `Private Command Center operator. ${'n'.repeat(2_100)}CLIENT_TAIL_SHOULD_NOT_APPEAR`,
        tags: ['automation', 'social operations'],
      },
      agent: {
        id: 'sasha',
        name: 'Sasha',
        role: 'Social media operator',
        jobDescription: 'Create credible client-specific campaigns without inventing claims.',
        brain: {
          modelId: 'openai/gpt-5',
          fallbacks: ['openai/gpt-5-mini', 'openai/gpt-5'],
        },
      },
      topic: 'Launch the Social Operator',
      source: {
        type: 'content',
        title: 'Product announcement',
        content: `The operator turns one approved idea into channel-ready content. ${'s'.repeat(8_100)}SOURCE_TAIL_SHOULD_NOT_APPEAR`,
      },
      platforms: ['Facebook', 'Instagram'],
      runModel,
    })

    expect(selectSocialGenerationModels({ brain: { modelId: 'openai/gpt-5', fallbacks: ['openai/gpt-5-mini', 'openai/gpt-5'] } }))
      .toEqual(['openai/gpt-5', 'openai/gpt-5-mini'])
    expect(calls).toHaveLength(1)
    expect(calls[0].modelId).toBe('openai/gpt-5')
    expect(calls[0].context).toContain('Farrington Development')
    expect(calls[0].context).toContain('Create credible client-specific campaigns')
    expect(calls[0].context).toContain('The operator turns one approved idea')
    expect(calls[0].context).not.toContain('CLIENT_TAIL_SHOULD_NOT_APPEAR')
    expect(calls[0].context).not.toContain('SOURCE_TAIL_SHOULD_NOT_APPEAR')
    expect(result.variants.map(item => item.platform)).toEqual(['Facebook', 'Instagram'])
    expect(result.variants[0].characterLimit).toBe(5_000)
    expect(result.generation).toMatchObject({
      requestedModel: 'openai/gpt-5',
      provider: 'openai',
      model: 'gpt-5',
      repaired: false,
      usage: { total_tokens: 600 },
      cost: { estimatedUsd: 0.0042 },
    })
  })

  it('falls back through the assigned agent model chain and preserves every attempt', async () => {
    const runModel = vi.fn(async ({ modelId }) => {
      if (modelId === 'anthropic/claude-opus-4-8') throw new Error('primary unavailable')
      return {
        provider: 'openai',
        model: 'gpt-5',
        text: JSON.stringify({ variants: [variant('Facebook')] }),
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
        cost: { estimatedUsd: 0.002 },
      }
    })

    const result = await generateSocialContent({
      client: { id: 'cl_1', name: 'Acme' },
      agent: {
        id: 'agent_1',
        name: 'Sasha',
        brain: {
          modelId: 'anthropic/claude-opus-4-8',
          fallbacks: ['openai/gpt-5'],
        },
      },
      topic: 'A grounded update',
      source: 'Only use this supplied fact.',
      platforms: ['Facebook'],
      runModel,
    })

    expect(runModel.mock.calls.map(([input]) => input.modelId)).toEqual([
      'anthropic/claude-opus-4-8',
      'openai/gpt-5',
    ])
    expect(result.generation.model).toBe('gpt-5')
    expect(result.generation.attempts).toMatchObject([
      { requestedModel: 'anthropic/claude-opus-4-8', stage: 'generate', ok: false },
      { requestedModel: 'openai/gpt-5', stage: 'generate', ok: true },
    ])
  })

  it('allows one repair attempt when the model output is not valid strict JSON', async () => {
    const runModel = vi.fn(async ({ repair }) => repair
      ? {
          provider: 'openai',
          model: 'gpt-5',
          text: JSON.stringify({ variants: [variant('X')] }),
          usage: { prompt_tokens: 90, completion_tokens: 40, total_tokens: 130 },
          cost: { estimatedUsd: 0.0013 },
        }
      : {
          provider: 'openai',
          model: 'gpt-5',
          text: '```json\n{"variants": []}\n```',
          usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
          cost: { estimatedUsd: 0.0011 },
        })

    const result = await generateSocialContent({
      client: { id: 'cl_1', name: 'Acme' },
      agent: { id: 'agent_1', name: 'Sasha', brain: { modelId: 'openai/gpt-5', fallbacks: ['openai/gpt-5-mini'] } },
      topic: 'A concise update',
      source: 'A verified product update.',
      platforms: ['X'],
      runModel,
    })

    expect(runModel).toHaveBeenCalledTimes(2)
    expect(runModel.mock.calls[1][0]).toMatchObject({ modelId: 'openai/gpt-5', repair: true })
    expect(runModel.mock.calls[1][0].prompt).toContain('Return corrected strict JSON only')
    expect(result.generation.repaired).toBe(true)
    expect(result.generation.attempts.map(item => item.stage)).toEqual(['generate', 'repair'])
  })

  it('enforces the exact requested platform set and the combined platform character limit', () => {
    expect(() => validateSocialVariants({
      variants: [variant('X', { hook: '', body: 'x'.repeat(281), cta: '' })],
    }, ['X'])).toThrow(/280-character limit/i)

    expect(() => validateSocialVariants({
      variants: [variant('Facebook'), variant('Instagram')],
    }, ['Facebook'])).toThrow(/exact requested platform set/i)
  })

  it('never returns template copy and never performs more than one repair attempt', async () => {
    const runModel = vi.fn(async ({ repair }) => ({
      provider: 'openai',
      model: repair ? 'gpt-5-repair' : 'gpt-5',
      text: repair ? JSON.stringify({ variants: [] }) : 'not json',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      cost: { estimatedUsd: 0.0001 },
    }))

    const request = generateSocialContent({
      client: { id: 'cl_1', name: 'Acme' },
      agent: {
        id: 'agent_1',
        name: 'Sasha',
        brain: { modelId: 'openai/gpt-5', fallbacks: ['openai/gpt-5-mini'] },
      },
      topic: 'A grounded update',
      source: 'One verified fact.',
      platforms: ['Facebook'],
      runModel,
    })

    await expect(request).rejects.toMatchObject({
      name: 'SocialContentGenerationError',
      code: 'social_generation_failed',
    })
    expect(runModel).toHaveBeenCalledTimes(3)
    expect(runModel.mock.calls.filter(([input]) => input.repair)).toHaveLength(1)
  })

  it('requires an assigned model and injected runner instead of inventing a fallback', async () => {
    expect(() => buildSocialGenerationContext({ client: {}, agent: {}, source: '' })).not.toThrow()
    await expect(generateSocialContent({
      client: { id: 'cl_1', name: 'Acme' },
      agent: { id: 'agent_1', name: 'Sasha', brain: { modelId: '' } },
      topic: 'Update',
      platforms: ['Facebook'],
      runModel: vi.fn(),
    })).rejects.toBeInstanceOf(SocialContentGenerationError)
  })
})
