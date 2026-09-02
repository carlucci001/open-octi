import { afterEach, describe, expect, it, vi } from 'vitest'
import { deepSeekHarnessChat } from '@/lib/deepseek-harness-client'

const messages = [{ role: 'user', content: 'Reply with DAX_OK' }]

describe('DeepSeek Harness bridge client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the prompt in a bounded local HTTP body with bearer authentication', async () => {
    const fetchMock = vi.fn(async (_url, options) => new Response(JSON.stringify({
      ok: true,
      requestId: 'req-1',
      text: 'DAX_OK',
      model: 'deepseek-v4-flash',
      profile: 'chat-only',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await deepSeekHarnessChat({ messages, agent: { label: 'Dax' }, bridgeToken: 'test-token' })

    expect(result.text).toBe('DAX_OK')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:3091/v1/chat')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(options.body).prompt).toContain('Reply with DAX_OK')
    expect(JSON.parse(options.body).prompt).toContain('no tools')
  })

  it('rejects non-loopback bridge URLs before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(deepSeekHarnessChat({
      messages,
      agent: { label: 'Dax' },
      bridgeToken: 'test-token',
      baseUrl: 'https://example.com',
    })).rejects.toThrow('must use local HTTP')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redacts sidecar error details while preserving a safe request reference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'secret internal path',
      requestId: 'req-safe',
    }), { status: 502, headers: { 'Content-Type': 'application/json' } })))

    await expect(deepSeekHarnessChat({ messages, agent: { label: 'Dax' }, bridgeToken: 'test-token' }))
      .rejects.toThrow('DeepSeek Harness is unavailable (request req-safe)')
  })
})
