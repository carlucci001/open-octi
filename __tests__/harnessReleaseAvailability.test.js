import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => ({ user: { role: 'owner' } })) }))
vi.mock('@/lib/agents-store', () => ({ listAgents: vi.fn(async () => ({ ok: true, agents: [{ id: 'main', name: 'Maggie' }] })) }))
vi.mock('@/lib/agent-creds', () => ({ getCred: vi.fn() }))
vi.mock('@/lib/openclaw-client', () => ({ openclawChat: vi.fn() }))
vi.mock('@/lib/deepseek-harness-client', () => ({ deepSeekHarnessChat: vi.fn() }))

beforeEach(() => {
  vi.stubEnv('FCC_EDITION', 'openocti')
  vi.stubEnv('NEXT_PUBLIC_FCC_EDITION', 'openocti')
  vi.stubEnv('DEERFLOW_API_BASE_URL', '')
  vi.stubEnv('DEER_FLOW_API_BASE_URL', '')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

async function check(runtimeId) {
  const { POST } = await import('../app/api/harness/runtimes/route')
  const response = await POST(new Request('http://localhost/api/harness/runtimes', {
    method: 'POST', body: JSON.stringify({ runtimeId }),
  }))
  return (await response.json()).runtime
}

describe('public harness availability', () => {
  it('reports Hermes as deferred without probing a dashboard', async () => {
    const runtime = await check('hermes-hetzner')
    expect(runtime).toMatchObject({ ok: false, configured: false, deferred: true, lane: 'Future release', dashboardUrl: '' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('distinguishes absent DeerFlow configuration from a configured connection failure', async () => {
    expect(await check('deerflow-hetzner')).toMatchObject({ ok: false, configured: false })
    expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('DEERFLOW_API_BASE_URL', 'http://127.0.0.1:8000')
    expect(await check('deerflow-hetzner')).toMatchObject({ ok: false, configured: true, status: 0 })
    expect(fetch).toHaveBeenCalled()
  })

  it('does not execute a deferred Hermes comparison', async () => {
    const { POST } = await import('../app/api/harness/compare/route')
    const response = await POST(new Request('http://localhost/api/harness/compare', {
      method: 'POST', body: JSON.stringify({ task: 'Explain the project', harnesses: ['hermes-hetzner'] }),
    }))
    const result = await response.json()
    expect(result.results).toEqual([expect.objectContaining({ id: 'hermes-hetzner', ok: false, deferred: true })])
    expect(fetch).not.toHaveBeenCalled()
  })
})
