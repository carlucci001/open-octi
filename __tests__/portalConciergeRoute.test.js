import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null, geminiCredential: null }))
const mocks = vi.hoisted(() => ({ geminiGenerate: vi.fn() }))

vi.mock('../lib/portal-auth', () => ({ getSessionFromRequest: vi.fn(() => state.session) }))
vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(name => structuredClone(state.data[name] || null)),
  mutateData: vi.fn((name, mutator) => {
    const outcome = mutator(structuredClone(state.data[name] || null))
    state.data[name] = structuredClone(outcome.data)
    return structuredClone(outcome.result)
  }),
}))
vi.mock('../lib/agent-creds', () => ({ getCred: vi.fn(() => structuredClone(state.geminiCredential)) }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    constructor() {
      this.models = { generateContent: mocks.geminiGenerate }
    }
  },
}))

import { DELETE, GET, POST } from '../app/api/portal/concierge/route'
import { buildConciergeHandoffTicket } from '../lib/portal-concierge-shared'

const session = { sessionId: 's1', email: 'redacted@example.invalid', accountId: 'account-acme', tenantId: 'tenant-acme' }
const request = (method = 'GET', body) => new Request('http://localhost/api/portal/concierge', {
  method, headers: body ? { 'content-type': 'application/json' } : undefined,
  body: body ? JSON.stringify(body) : undefined,
})

describe('portal concierge API', () => {
  beforeEach(() => {
    state.session = session
    state.geminiCredential = { key: 'gemini-test-only' }
    state.data = {
      'accounts.json': { accounts: [{ id: 'account-acme', name: 'Acme Development' }] },
      'client-growth-profiles.json': { profiles: [{ accountId: 'account-acme', tenantId: 'tenant-acme', consent: { granted: true }, fields: { businessSummary: { value: 'Web development company', status: 'confirmed' } } }] },
      'automations.json': { automations: [] },
      'postiz-channel-tenants.json': { accounts: {} },
    }
    mocks.geminiGenerate.mockReset().mockResolvedValue({ text: 'I can help scope that. What result do you need first?' })
  })

  it('requires portal authentication', async () => {
    state.session = null
    expect((await GET(request())).status).toBe(401)
  })

  it('grounds the tool-less Gemini concierge in tenant context and persists only that conversation', async () => {
    const response = await POST(request('POST', { message: 'Can you help promote our web development services?' }))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.reply).toContain('help scope')
    expect(json.runtime).toBe('gemini')
    expect(mocks.geminiGenerate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash' }))
    expect(mocks.geminiGenerate.mock.calls[0][0].contents).toContain('Web development company')
    expect(mocks.geminiGenerate.mock.calls[0][0].contents).toContain('tenant-acme')
    expect(mocks.geminiGenerate.mock.calls[0][0].contents).toContain('Current seven-post drafts use reviewed portal templates')
    expect(state.data['portal-conversations.json'].conversations[0].messages).toHaveLength(2)
    expect(json.nextAction).toMatchObject({
      id: 'campaign-assistant',
      label: 'Request campaign pilot review',
    })
    expect(json.nextAction.href).toContain(encodeURIComponent('Can you help promote our web development services?'))
  })

  it('does not expose another account conversation', async () => {
    state.data['portal-conversations.json'] = { conversations: [{ accountId: 'other', tenantId: 'other', messages: [{ role: 'user', content: 'secret' }] }] }
    const json = await (await GET(request())).json()
    expect(json.messages).toEqual([])
  })

  it('uses Gemini directly for an in-lane research request', async () => {
    mocks.geminiGenerate.mockResolvedValue({ text: 'I can research that. What competitor and decision should the report support?' })
    const response = await POST(request('POST', { message: 'Research a competitor for me' }))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.runtime).toBe('gemini')
    expect(json.reply).toContain('What competitor')
    expect(mocks.geminiGenerate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash' }))
    expect(json.nextAction).toBeNull()
  })

  it('grounds a turn in the current portal page without polluting the saved client message', async () => {
    await POST(request('POST', {
      message: 'Where is the latest deliverable?',
      pageContext: { pathname: '/portal/documents', label: 'Files' },
    }))

    expect(mocks.geminiGenerate.mock.calls[0][0].contents).toContain('Current portal page: Files (/portal/documents)')
    const saved = state.data['portal-conversations.json'].conversations[0].messages[0].content
    expect(saved).toBe('Where is the latest deliverable?')
    expect(saved).not.toContain('Current portal page')
  })

  it('returns profile questions and a deep link before claiming an unready website service can run', async () => {
    const response = await POST(request('POST', { message: 'Please administer our WordPress website and publish a new blog.' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.runtime).toBe('readiness')
    expect(json.readiness).toMatchObject({
      service: 'blog_publishing',
      ready: false,
      profileHref: expect.stringContaining('/portal/profile?section='),
      missingFieldKeys: expect.arrayContaining(['brandVoice', 'website']),
    })
    expect(json.readiness.questionPrompts.length).toBeGreaterThan(0)
    expect(json.nextAction).toMatchObject({ type: 'profile-readiness', href: json.readiness.profileHref })
    expect(json.reply).toContain('business profile')
    expect(mocks.geminiGenerate).not.toHaveBeenCalled()
  })

  it('preserves a tracked handoff when Gemini is unavailable', async () => {
    mocks.geminiGenerate.mockRejectedValue(new Error('quota'))
    const response = await POST(request('POST', { message: 'I need help with 500 PDF files' }))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.runtime).toBe('handoff')
    expect(json.reply).toContain('tracked request')
    expect(json.reply).not.toContain('not connected')
  })

  it('blocks clearly personal travel requests before any model or internal tool runtime is called', async () => {
    const response = await POST(request('POST', { message: 'How can I get to New York from here?' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.runtime).toBe('policy')
    expect(json.reply).toContain('focused on your Farrington services')
    expect(json.nextAction).toBeNull()
    expect(mocks.geminiGenerate).not.toHaveBeenCalled()
  })

  it('requires portal authentication to clear a conversation', async () => {
    state.session = null
    const response = await DELETE(request('DELETE'))
    expect(response.status).toBe(401)
  })

  it('clears only the authenticated account conversation, leaving other accounts untouched', async () => {
    state.data['portal-conversations.json'] = {
      conversations: [
        { accountId: 'account-acme', tenantId: 'tenant-acme', messages: [{ role: 'user', content: 'mine', at: '2026-01-01T00:00:00.000Z' }] },
        { accountId: 'other', tenantId: 'other', messages: [{ role: 'user', content: 'secret' }] },
      ],
    }
    const response = await DELETE(request('DELETE'))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.messages).toEqual([])

    const conversations = state.data['portal-conversations.json'].conversations
    const mine = conversations.find(item => item.accountId === 'account-acme')
    const other = conversations.find(item => item.accountId === 'other')
    expect(mine.messages).toEqual([])
    expect(mine.clearedAt).toBeTruthy()
    expect(other.messages).toEqual([{ role: 'user', content: 'secret' }])
    expect(other.clearedAt).toBeUndefined()
  })

  it('builds a bounded tracked request from the tenant conversation', () => {
    const ticket = buildConciergeHandoffTicket([
      { role: 'user', content: 'I need 500 PDFs organized by Friday.' },
      { role: 'assistant', content: 'I can qualify that. Do the files contain sensitive data?' },
      { role: 'user', content: 'No sensitive data. Group them by client and year.' },
    ])
    expect(ticket).toMatchObject({ category: 'other', priority: 'normal', team: 'support' })
    expect(ticket.subject).toContain('Group them by client and year')
    expect(ticket.description).toContain('Client: I need 500 PDFs')
    expect(ticket.description).toContain('Concierge: I can qualify that')
  })
})
