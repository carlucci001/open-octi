import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null, profile: null, geminiCredential: null }))
const mocks = vi.hoisted(() => ({ createToken: vi.fn(), clientOptions: null }))
const fixtureValues = ['gemini-test-only', 'ephemeral-gemini-token']

vi.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    constructor(options) {
      mocks.clientOptions = options
      this.authTokens = { create: mocks.createToken }
    }
  },
}))
vi.mock('../lib/portal-auth', () => ({ getSessionFromRequest: vi.fn(() => state.session) }))
vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(name => structuredClone(state.data[name] || null)),
  mutateData: vi.fn((name, mutator) => {
    const outcome = mutator(structuredClone(state.data[name] || null))
    state.data[name] = structuredClone(outcome.data)
    return structuredClone(outcome.result)
  }),
}))
vi.mock('../lib/portal-growth-profile', () => ({ getGrowthProfile: vi.fn(() => structuredClone(state.profile)) }))
vi.mock('../lib/agent-creds', () => ({ getCred: vi.fn(() => structuredClone(state.geminiCredential)) }))

import { POST as createVoiceSession } from '../app/api/portal/voice/session/route'
import { POST as saveVoiceTranscript } from '../app/api/portal/voice/transcript/route'

const session = { sessionId: 's1', email: 'redacted@example.invalid', accountId: 'account-acme', leaseId: 'lease-acme', tenantId: 'tenant-acme' }
const voiceRequest = (body = {}) => new Request('http://localhost/api/portal/voice/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ clientKey: 'browser-one', ...body }),
})

describe('portal live voice API', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
    state.session = session
    state.geminiCredential = { key: fixtureValues[0] }
    state.profile = { fields: { businessSummary: { value: 'Acme builds accessible websites', status: 'confirmed' } } }
    state.data = {
      'accounts.json': { accounts: [{ id: 'account-acme', name: 'Acme Development' }, { id: 'account-rival', name: 'Rival Secret Account' }] },
      'leases.json': { leases: [{ id: 'lease-acme', clientAccountId: 'account-acme', agentId: 'concierge-acme', status: 'active' }] },
      'portal-conversations.json': { conversations: [] },
      'portal-cheryl-usage.json': { sessions: [], events: [] },
    }
    mocks.clientOptions = null
    mocks.createToken.mockReset().mockResolvedValue({ name: fixtureValues[1] })
  })

  it('requires a signed-in portal session', async () => {
    state.session = null
    const response = await createVoiceSession(voiceRequest())
    expect(response.status).toBe(401)
    expect(mocks.createToken).not.toHaveBeenCalled()
  })

  it('creates a tenant-grounded Gemini 3.1 Live session with Kore', async () => {
    const response = await createVoiceSession(voiceRequest({ clientKey: 'browser-one' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      provider: 'gemini',
      token: fixtureValues[1],
      model: 'gemini-3.1-flash-live-preview',
      voice: 'Kore',
      usage: {
        sessionId: expect.any(String),
        policy: expect.objectContaining({ dailySeconds: 900, maxSessionSeconds: 600, idleTimeoutSeconds: 90 }),
        allowance: expect.objectContaining({ sessionSeconds: 600, dailyRemainingSeconds: 900 }),
      },
    })
    expect(body.setup.model).toBe('models/gemini-3.1-flash-live-preview')
    expect(body.setup.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(body.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Acme Development')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Acme builds accessible websites')
    expect(body.setup.systemInstruction.parts[0].text).toContain('You are Cheryl')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Did you mean X, or Y?')
    expect(body.setup.systemInstruction.parts[0].text).toContain('ask the client to confirm')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Current seven-post drafts use reviewed portal templates')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Publishing is unavailable until Postiz')
    expect(body.setup.systemInstruction.parts[0].text).toContain('open_portal_section and start_service_request')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Never adopt another name, persona, client, tenant, or role')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Service readiness')
    expect(body.setup.systemInstruction.parts[0].text).toContain('Google Business Profile')
    expect(body.setup.systemInstruction.parts[0].text).toContain('setup_required')
    expect(body.setup.systemInstruction.parts[0].text).not.toContain('Rival Secret Account')
    expect(mocks.clientOptions).toMatchObject({ apiKey: fixtureValues[0], httpOptions: { apiVersion: 'v1alpha' } })

    const tokenConfig = mocks.createToken.mock.calls[0][0].config
    expect(tokenConfig.uses).toBe(1)
    expect(tokenConfig.liveConnectConstraints.model).toBe('gemini-3.1-flash-live-preview')
    expect(tokenConfig.liveConnectConstraints.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    const expectedTools = ['open_portal_section', 'start_service_request', 'get_account_context', 'list_services', 'request_service', 'surface_service_cards', 'create_work_order', 'get_work_status']
    expect(body.setup.tools[0].functionDeclarations.map(item => item.name)).toEqual(expectedTools)
    expect(tokenConfig.liveConnectConstraints.config.tools[0].functionDeclarations.map(item => item.name)).toEqual(expectedTools)
  })

  it('enforces owner-configured lease limits and one active premium session per account', async () => {
    state.data['leases.json'].leases[0].conciergeVoice = {
      enabled: true,
      dailySeconds: 300,
      maxSessionSeconds: 180,
      idleTimeoutSeconds: 60,
      warningThresholds: [0.5, 0.9],
    }
    const firstResponse = await createVoiceSession(voiceRequest({ clientKey: 'browser-one' }))
    const first = await firstResponse.json()
    expect(firstResponse.status).toBe(200)
    expect(first.usage).toMatchObject({
      policy: { dailySeconds: 300, maxSessionSeconds: 180, idleTimeoutSeconds: 60, warningThresholds: [0.5, 0.9] },
      allowance: { sessionSeconds: 180, dailyRemainingSeconds: 300 },
    })

    const secondResponse = await createVoiceSession(voiceRequest({ clientKey: 'browser-two' }))
    expect(secondResponse.status).toBe(409)
    await expect(secondResponse.json()).resolves.toMatchObject({ code: 'active_session' })
    expect(mocks.createToken).toHaveBeenCalledTimes(1)
  })

  it('accepts tenant-scoped heartbeat and graceful end events for the issued session', async () => {
    const started = await (await createVoiceSession(voiceRequest({ clientKey: 'browser-one' }))).json()
    const heartbeat = await createVoiceSession(voiceRequest({
      action: 'heartbeat',
      clientKey: 'browser-one',
      sessionId: started.usage.sessionId,
      elapsedSeconds: 2,
      eventCount: 3,
    }))
    expect(heartbeat.status).toBe(200)
    await expect(heartbeat.json()).resolves.toMatchObject({ ok: true, eventCount: 3 })

    const ended = await createVoiceSession(voiceRequest({
      action: 'end',
      clientKey: 'browser-one',
      sessionId: started.usage.sessionId,
      elapsedSeconds: 2,
      eventCount: 3,
      reason: 'client_ended',
    }))
    expect(ended.status).toBe(200)
    await expect(ended.json()).resolves.toMatchObject({ ok: true, reason: 'client_ended' })
    expect(state.data['portal-cheryl-usage.json'].events.some(event => event.type === 'session_ended')).toBe(true)
  })

  it('releases the reserved usage session when Gemini cannot issue a token', async () => {
    mocks.createToken.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValueOnce({ name: fixtureValues[1] })
    expect((await createVoiceSession(voiceRequest({ clientKey: 'browser-one' }))).status).toBe(502)
    expect((await createVoiceSession(voiceRequest({ clientKey: 'browser-two' }))).status).toBe(200)
  })

  it('uses Cheryl as the distinct portal concierge and never Doreen', async () => {
    state.data['leases.json'].leases[0].agentId = ''
    const response = await createVoiceSession(voiceRequest())
    const body = await response.json()
    const instructions = body.setup.systemInstruction.parts[0].text

    expect(response.status).toBe(200)
    expect(instructions).toContain('You are Cheryl')
    expect(instructions).not.toContain('Doreen')
  })

  it('greets by confirmed client first name and never by business name', async () => {
    state.profile.fields.primaryContactName = { value: 'Jordan Smith', status: 'confirmed' }
    const response = await createVoiceSession(voiceRequest())
    const body = await response.json()
    const instructions = body.setup.systemInstruction.parts[0].text

    expect(response.status).toBe(200)
    expect(instructions).toContain('Client first name: Jordan')
    expect(instructions).toContain('use their first name only')
    expect(instructions).toContain('Account: Acme Development')
  })

  it('returns a clear rate-limit error when Gemini exhausts capacity', async () => {
    mocks.createToken.mockRejectedValue(Object.assign(new Error('RESOURCE_EXHAUSTED quota'), { status: 429 }))
    const response = await createVoiceSession(voiceRequest())
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('Gemini Live') })
  })

  it('stores final voice transcripts in only the signed-in portal conversation', async () => {
    const response = await saveVoiceTranscript(new Request('http://localhost/api/portal/voice/transcript', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: 'Help me plan a website refresh.' }),
    }))
    expect(response.status).toBe(200)
    expect(state.data['portal-conversations.json'].conversations).toHaveLength(1)
    expect(state.data['portal-conversations.json'].conversations[0]).toMatchObject({ accountId: 'account-acme', tenantId: 'tenant-acme' })
    expect(state.data['portal-conversations.json'].conversations[0].messages[0].content).toContain('website refresh')
  })
})
