import { describe, expect, it, vi } from 'vitest'

import { directProviderChat, resolveDirectProvider } from '../lib/direct-provider-chat'

describe('direct provider fallback chat', () => {
  it('prefers OpenAI, then Anthropic, without requiring OpenClaw', () => {
    expect(resolveDirectProvider({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' })).toMatchObject({ provider: 'openai' })
    expect(resolveDirectProvider({ ANTHROPIC_API_KEY: 'y' })).toMatchObject({ provider: 'anthropic' })
    expect(resolveDirectProvider({})).toBeNull()
  })

  it('completes an OpenAI turn through an injected fetch implementation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Direct provider response' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await directProviderChat({
      message: 'Hello',
      env: { OPENAI_API_KEY: 'test-key' },
      fetchImpl,
    })

    expect(result).toEqual(expect.objectContaining({
      text: 'Direct provider response',
      provider: 'openai',
    }))
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
