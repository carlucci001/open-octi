import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  webhookFields: [],
  upserts: [],
}))

const registerWebhook = vi.hoisted(() => vi.fn(async () => ({
  id: 'endpoint_1',
  url: 'https://openocti.local/api/integrations/myvtc/webhook',
  events: ['contact.received'],
  status: 'active',
  createdAt: '2026-08-30T12:00:00.000Z',
  secret: 'fake_returned_once_secret',
})))

vi.mock('../lib/auth', () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: 'owner', role: 'owner' }, error: null })),
}))

vi.mock('../lib/agent-creds', () => ({
  getCred: vi.fn(name => name === 'MyVTC Platform Admin'
    ? { key: 'fake_platform_key', fields: [{ label: 'API Key', value: 'fake_platform_key' }] }
    : (state.webhookFields.length ? { key: state.webhookFields[0]?.value || '', fields: state.webhookFields } : null)),
  upsertCredential: vi.fn(input => {
    state.upserts.push(input)
    if (input.name === 'MyVTC Webhook') state.webhookFields = input.fields
    return { id: 'cred_1', name: input.name, category: input.category, fieldCount: input.fields.length }
  }),
}))

vi.mock('../lib/auditLog', () => ({ logAuditEvent: vi.fn() }))

vi.mock('../lib/myvtc/client', () => ({
  myvtcCredential: vi.fn(() => ({ key: 'fake_platform_key' })),
  registerWebhook,
  listWebhooks: vi.fn(async () => []),
  deleteWebhook: vi.fn(async () => ({ deleted: true })),
}))

vi.mock('../lib/myvtc/webhook', () => ({ listMyvtcEvents: vi.fn(() => []) }))
vi.mock('../lib/myvtc/sync', () => ({ getMyvtcSyncState: vi.fn(() => ({ lastRunAt: null, lastResult: null })) }))

import { POST } from '../app/api/integrations/myvtc/webhook-registration/route'

function request(body = {}) {
  return new NextRequest('https://openocti.local/api/integrations/myvtc/webhook-registration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.webhookFields = []
  state.upserts = []
  registerWebhook.mockClear()
})

describe('MyVTC webhook registration route', () => {
  it('stores the one-time secret in the vault and never includes it in the response', async () => {
    const response = await POST(request())
    const responseText = await response.text()

    expect(response.status).toBe(201)
    expect(state.upserts[0]).toMatchObject({ name: 'MyVTC Webhook', category: 'Platforms' })
    expect(state.upserts[0].fields).toEqual(expect.arrayContaining([
      { label: 'Signing Secret', value: 'fake_returned_once_secret' },
      { label: 'Endpoint ID', value: 'endpoint_1' },
    ]))
    expect(responseText).not.toContain('fake_returned_once_secret')
    expect(responseText.toLowerCase()).not.toContain('signing secret')
  })

  it('refuses a second registration while one is recorded', async () => {
    expect((await POST(request())).status).toBe(201)
    const second = await POST(request())
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'ALREADY_REGISTERED' })
    expect(registerWebhook).toHaveBeenCalledTimes(1)
  })
})
