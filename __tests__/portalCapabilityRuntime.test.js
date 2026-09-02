import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, credentials: {} }))

vi.mock('../lib/dataStore', () => ({ readData: vi.fn(name => structuredClone(state.data[name])) }))
vi.mock('../lib/agent-creds', () => ({ getCred: vi.fn(name => state.credentials[name] || null) }))

import { getPortalCapabilityRuntime, portalCapabilityTruthLines } from '../lib/portal-capability-runtime'

describe('portal capability runtime truth', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('RESEND_API_KEY', '')
    state.credentials = { gemini: { key: 'configured' }, 'deerflow admin': { key: 'configured' } }
    state.data = {
      'automations.json': { automations: [{ verified: false }] },
      'postiz-channel-tenants.json': { accounts: {} },
    }
  })

  it('does not advertise publishing, AI generation, e-sign delivery, or automations without production proof', () => {
    const runtime = getPortalCapabilityRuntime({ accountId: 'acct-one' })

    expect(runtime.voiceConversation).toMatchObject({ state: 'available', canExecuteTools: true, businessExecution: false })
    expect(runtime.campaignDrafts).toMatchObject({ state: 'pilot', aiGenerated: false })
    expect(runtime.campaignPublishing.state).toBe('setup_required')
    expect(runtime.signatureDelivery.state).toBe('setup_required')
    expect(runtime.automations).toMatchObject({ state: 'unavailable', verifiedCustomerVisible: 0 })
    expect(portalCapabilityTruthLines(runtime).join('\n')).toContain('AI-generated: no')
  })

  it('requires both Postiz configuration and an account mapping before publishing is available', () => {
    vi.stubEnv('POSTIZ_API_URL', 'http://postiz.test/api/public/v1')
    vi.stubEnv('POSTIZ_API_KEY', 'configured')
    state.data['postiz-channel-tenants.json'] = { accounts: { 'acct-one': { facebook: 'channel-one' } } }

    expect(getPortalCapabilityRuntime({ accountId: 'acct-one' }).campaignPublishing).toMatchObject({
      state: 'available',
      postizConfigured: true,
      facebookConnected: true,
    })
  })
})
