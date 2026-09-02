import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deepSeekHarnessChat = vi.fn()
const openclawChat = vi.fn()
const requireCapability = vi.fn()

vi.mock('@/lib/deepseek-harness-client', () => ({ deepSeekHarnessChat }))
vi.mock('@/lib/hermes-client', () => ({ hermesChat: vi.fn() }))
vi.mock('@/lib/openclaw-client', () => ({ openclawChat }))
vi.mock('@/lib/agent-creds', () => ({ getCred: vi.fn(() => ({ key: 'openclaw-test-token' })) }))
vi.mock('@/lib/permissions', () => ({ requireCapability }))
vi.mock('@/lib/dataStore', () => ({ readData: vi.fn(() => null), writeData: vi.fn() }))
vi.mock('@/lib/entityStore', () => ({ loadAll: vi.fn(() => []) }))
vi.mock('@/lib/commandCenterNavigation', () => ({
  COMMAND_CENTER_MENU_GUIDE: '',
  isCommandCenterNavigationPhrase: vi.fn(() => false),
  resolveCommandCenterTab: vi.fn(() => null),
}))
vi.mock('@/lib/agentOfficeConduct', () => ({ OFFICE_AGENT_CONDUCT: '' }))
vi.mock('@/lib/section-agents', () => ({
  getSectionAgent: vi.fn(() => ({ agentId: 'main' })),
  resolveWizardAgentSection: vi.fn(value => value || 'agents'),
  sectionPersonaLine: vi.fn(() => ''),
}))
vi.mock('@/lib/deep-research', () => ({ runDeepResearchDossier: vi.fn() }))
vi.mock('@/lib/deerflow-tools', () => ({ DEERFLOW_READONLY_TOOL_DEFS: [] }))

const messages = [
  { role: 'user', content: 'Hello Dax' },
  { role: 'assistant', content: 'Hello Carl.' },
  { role: 'user', content: 'Reply with exactly: DAX_OK' },
]

function requestFor() {
  return new Request('http://localhost/api/agent/openclaw-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      section: 'agent-manager',
      operatorTool: {
        runtimeProvider: 'deepseek-harness-local',
        agentId: 'deepseek-lab-operator',
        label: 'Dax',
        role: 'Harness Lab Operator',
        jobDescription: 'Run local Harness experiments.',
        tools: ['read', 'grep'],
      },
    }),
  })
}

describe('DeepSeek Harness route dispatch', () => {
  beforeEach(() => {
    deepSeekHarnessChat.mockReset()
    openclawChat.mockReset()
    requireCapability.mockReset()
    requireCapability.mockResolvedValue({ user: { username: 'carl', role: 'owner' }, error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('routes the starter agent to DeepSeek Harness and never OpenClaw', async () => {
    deepSeekHarnessChat.mockResolvedValue({ text: 'DAX_OK', model: 'deepseek-harness/headless', profile: 'headless' })
    const { POST } = await import('@/app/api/agent/openclaw-chat/route')

    const response = await POST(requestFor())
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(deepSeekHarnessChat).toHaveBeenCalledWith({
      messages,
      agent: expect.objectContaining({
        runtimeProvider: 'deepseek-harness-local',
        agentId: 'deepseek-lab-operator',
        tools: ['read', 'grep'],
      }),
    })
    expect(openclawChat).not.toHaveBeenCalled()
    expect(body).toContain('DAX_OK')
    expect(body).toContain('"source":"deepseek-harness-runtime"')
  })

  it('returns a visible Harness error and never falls through to OpenClaw', async () => {
    deepSeekHarnessChat.mockRejectedValue(new Error('DeepSeek Harness timed out after 180000ms'))
    const { POST } = await import('@/app/api/agent/openclaw-chat/route')

    const response = await POST(requestFor())
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(openclawChat).not.toHaveBeenCalled()
    expect(body).toContain("Dax's experimental runtime is unavailable")
    expect(body).not.toContain('timed out after 180000ms')
    expect(body).toContain('"source":"deepseek-harness-runtime-error"')
  })

  it('is disabled by default in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEEPSEEK_HARNESS_ENABLED', '')
    const { POST } = await import('@/app/api/agent/openclaw-chat/route')

    const response = await POST(requestFor())
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(deepSeekHarnessChat).not.toHaveBeenCalled()
    expect(openclawChat).not.toHaveBeenCalled()
    expect(body).toContain('deepseek-harness-runtime-disabled')
  })

  it('rejects non-owner users even when the experiment is enabled', async () => {
    vi.stubEnv('DEEPSEEK_HARNESS_ENABLED', 'true')
    requireCapability.mockResolvedValue({ user: { username: 'member', role: 'member' }, error: null })
    const { POST } = await import('@/app/api/agent/openclaw-chat/route')

    const response = await POST(requestFor())
    const body = await response.text()

    expect(response.status).toBe(403)
    expect(deepSeekHarnessChat).not.toHaveBeenCalled()
    expect(openclawChat).not.toHaveBeenCalled()
    expect(body).toContain('deepseek-harness-runtime-forbidden')
  })
})
