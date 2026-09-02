import { beforeEach, describe, expect, it, vi } from 'vitest'

const hermesChat = vi.fn()
const openclawChat = vi.fn()

vi.mock('@/lib/hermes-client', () => ({ hermesChat }))
vi.mock('@/lib/openclaw-client', () => ({ openclawChat }))
vi.mock('@/lib/agent-creds', () => ({ getCred: vi.fn(() => ({ key: 'openclaw-test-token' })) }))
vi.mock('@/lib/permissions', () => ({ requireCapability: vi.fn(async () => ({ error: null })) }))
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

function requestFor(operatorTool) {
  return new Request('http://localhost/api/agent/openclaw-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'second' },
        { role: 'user', content: 'Reply with exactly: foreman wired.' },
      ],
      section: 'agents',
      operatorTool,
    }),
  })
}

describe('Hermes route dispatch', () => {
  beforeEach(() => {
    hermesChat.mockReset()
    openclawChat.mockReset()
  })

  it('routes hermes-hetzner chat to the selected named profile', async () => {
    hermesChat.mockResolvedValue({ text: 'foreman wired.', model: 'hermes-agent', profile: 'foreman' })
    const { POST } = await import('@/app/api/agent/openclaw-chat/route')

    const response = await POST(requestFor({
      runtimeProvider: 'hermes-hetzner',
      agentId: 'foreman',
      label: 'Foreman',
      role: 'Hermes crew orchestrator',
    }))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(hermesChat).toHaveBeenCalledWith({
      profile: 'foreman',
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'second' },
        { role: 'user', content: 'Reply with exactly: foreman wired.' },
      ],
    })
    expect(openclawChat).not.toHaveBeenCalled()
    expect(body).toContain('foreman wired.')
    expect(body).toContain('"source":"hermes-runtime"')
  })

  it('returns a visible Hermes error and never falls through to OpenClaw', async () => {
    hermesChat.mockRejectedValue(new Error('Hermes foreman request failed: connect ECONNREFUSED'))
    const { POST } = await import('@/app/api/agent/openclaw-chat/route')

    const response = await POST(requestFor({ runtimeProvider: 'hermes-hetzner', agentId: 'foreman', label: 'Foreman' }))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(openclawChat).not.toHaveBeenCalled()
    expect(body).toContain('Hermes foreman request failed: connect ECONNREFUSED')
    expect(body).toContain('"source":"hermes-runtime-error"')
  })
})
