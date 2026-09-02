import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const listAgents = vi.fn()
const deepSeekHarnessChat = vi.fn()
const openclawChat = vi.fn()

vi.mock('@/lib/auth', () => ({ requireAdmin }))
vi.mock('@/lib/agents-store', () => ({ listAgents }))
vi.mock('@/lib/deepseek-harness-client', () => ({ deepSeekHarnessChat }))
vi.mock('@/lib/openclaw-client', () => ({ openclawChat }))
vi.mock('@/lib/agent-creds', () => ({ getCred: vi.fn(() => null) }))

const owner = { username: 'carl', role: 'owner' }
const agent = {
  id: 'main',
  name: 'Main',
  role: 'Command Center operator',
  jobDescription: 'Help Carl operate the Command Center.',
  tools: [],
}

describe('DeepSeek Harness Lab integration', () => {
  beforeEach(() => {
    vi.resetModules()
    requireAdmin.mockReset()
    listAgents.mockReset()
    deepSeekHarnessChat.mockReset()
    openclawChat.mockReset()
    requireAdmin.mockResolvedValue({ user: owner, error: null })
    listAgents.mockResolvedValue({ ok: true, agents: [agent] })
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEEPSEEK_HARNESS_ENABLED', 'true')
    vi.stubEnv('DEEPSEEK_HARNESS_URL', 'http://127.0.0.1:3091')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shows DeepSeek as a first-class Harness Lab runtime with live health metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url) === 'http://127.0.0.1:3091/healthz') {
        return new Response(JSON.stringify({
          ok: true,
          runtime: 'deepseek-harness',
          version: '0.1.0-rc.7',
          model: 'deepseek-v4-flash',
          profile: 'chat-only',
          tools: [],
          busy: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })
    }))

    const { GET } = await import('@/app/api/harness/runtimes/route')
    const response = await GET(new Request('http://localhost/api/harness/runtimes'))
    const body = await response.json()
    const runtime = body.runtimes.find(item => item.id === 'deepseek-harness')

    expect(response.status).toBe(200)
    expect(runtime).toMatchObject({
      label: 'DeepSeek Harness',
      type: 'deepseek',
      ok: true,
      provider: 'DeepSeek official',
      model: 'deepseek-v4-flash',
      profile: 'chat-only',
      tools: [],
    })
  })

  it('runs a selected comparison through DeepSeek and never OpenClaw', async () => {
    deepSeekHarnessChat.mockResolvedValue({
      text: 'DEEPSEEK_COMPARE_OK',
      model: 'deepseek-v4-flash',
      profile: 'chat-only',
      requestId: 'dsh-test',
    })
    const { POST } = await import('@/app/api/harness/compare/route')
    const response = await POST(new Request('http://localhost/api/harness/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'main',
        task: 'Reply with exactly: DEEPSEEK_COMPARE_OK',
        mode: 'dry-run',
        harnesses: ['deepseek-harness'],
      }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toEqual([expect.objectContaining({
      id: 'deepseek-harness',
      label: 'DeepSeek Harness',
      ok: true,
      output: 'DEEPSEEK_COMPARE_OK',
    })])
    expect(deepSeekHarnessChat).toHaveBeenCalledOnce()
    expect(openclawChat).not.toHaveBeenCalled()
  })

  it('keeps DeepSeek comparisons opt-in when no harness list is supplied', async () => {
    const { POST } = await import('@/app/api/harness/compare/route')
    const response = await POST(new Request('http://localhost/api/harness/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'main', task: 'Run the standard comparison.' }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.some(result => result.id === 'deepseek-harness')).toBe(false)
    expect(deepSeekHarnessChat).not.toHaveBeenCalled()
  })

  it('keeps DeepSeek comparisons owner-only', async () => {
    requireAdmin.mockResolvedValue({ user: { username: 'staff', role: 'admin' }, error: null })
    const { POST } = await import('@/app/api/harness/compare/route')
    const response = await POST(new Request('http://localhost/api/harness/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'test', harnesses: ['deepseek-harness'] }),
    }))
    const body = await response.json()

    expect(body.results[0]).toMatchObject({ ok: false })
    expect(body.results[0].error).toMatch(/owner/i)
    expect(deepSeekHarnessChat).not.toHaveBeenCalled()
  })
})
