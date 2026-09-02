import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null }))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => structuredClone(state.data[filename] || null)),
  mutateData: vi.fn((filename, mutator) => {
    const outcome = mutator(structuredClone(state.data[filename] || null))
    state.data[filename] = structuredClone(outcome.data)
    return structuredClone(outcome.result)
  }),
}))

import { GET, POST } from '../app/api/portal/profile/route'

const session = {
  sessionId: 'session-acme',
  email: 'redacted@example.invalid',
  accountId: 'account-acme',
  tenantId: 'tenant-acme',
}

function request(method = 'GET', body) {
  return new Request('http://localhost/api/portal/profile', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('portal growth profile API', () => {
  beforeEach(() => {
    state.session = session
    state.data = {
      'accounts.json': {
        accounts: [{
          id: 'account-acme',
          name: 'Acme Development',
          email: 'redacted@example.invalid',
          phone: '555-0100',
          website: 'https://acme.example',
        }],
      },
    }
  })

  it('requires a signed-in portal session', async () => {
    state.session = null
    const response = await GET(request())
    expect(response.status).toBe(401)
  })

  it('does not create or import a profile before explicit consent', async () => {
    const response = await GET(request())
    const json = await response.json()

    expect(json).toMatchObject({ ok: true, profile: null, consentRequired: true })
    expect(state.data['client-growth-profiles.json']).toBeUndefined()
  })

  it('starts a tenant-scoped profile with account suggestions marked unconfirmed', async () => {
    const response = await POST(request('POST', { action: 'start', consent: true }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.profile).toMatchObject({
      accountId: 'account-acme',
      tenantId: 'tenant-acme',
      consent: { granted: true, grantedBy: 'redacted@example.invalid' },
    })
    expect(json.profile.fields.businessName).toMatchObject({ value: 'Acme Development', status: 'unconfirmed' })
    expect(json.profile.fields.website.source.type).toBe('account_record')
    expect(json.profile.history[0].action).toBe('profile_started')
  })

  it('updates only allowed fields and records confirmed provenance and history', async () => {
    await POST(request('POST', { action: 'start', consent: true }))
    const response = await POST(request('POST', {
      action: 'update',
      fields: {
        businessName: 'Acme Web Development',
        businessSummary: 'We design and build conversion-focused websites.',
        internalSecret: 'must not persist',
      },
    }))
    const json = await response.json()

    expect(json.profile.fields.businessName).toMatchObject({
      value: 'Acme Web Development',
      status: 'confirmed',
      confirmedBy: 'redacted@example.invalid',
    })
    expect(json.profile.fields.internalSecret).toBeUndefined()
    expect(json.profile.history.at(-1)).toMatchObject({
      action: 'fields_updated',
      fields: ['businessName', 'businessSummary'],
    })
  })

  it('never returns another account profile', async () => {
    state.data['client-growth-profiles.json'] = {
      profiles: [{ id: 'growth-other', accountId: 'account-other', tenantId: 'tenant-other', fields: {} }],
    }
    const response = await GET(request())
    const json = await response.json()
    expect(json.profile).toBeNull()
  })
})
