import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/auth', () => ({
  requireAdmin: vi.fn(async () => ({ error: null, user: { role: 'admin' } })),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
}))

import { GET } from '../app/api/tenants/route'

beforeEach(() => {
  state.data = {
    'tenants.json': {
      tenants: {
        'farrington-development': { id: 'farrington-development', name: 'Farrington Development' },
        newsroomaios: { id: 'newsroomaios', name: 'NewsroomAIOS' },
      },
    },
    'agents.json': { agents: {} },
    'leases.json': { leases: [] },
    'accounts.json': { accounts: [] },
  }
})

describe('GET /api/tenants communication lines', () => {
  it('returns the local provisioned-line registry without requiring live Twilio access', async () => {
    const response = await GET(new Request('https://openocti.local/api/tenants'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.communicationLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ company: 'Farrington Development', phoneNumber: '+18287709428' }),
      expect.objectContaining({ company: 'NewsroomAIOS', phoneNumber: '+18287709227' }),
      expect.objectContaining({ company: 'WNC Times', phoneNumber: '+18286242408' }),
    ]))
  })
})
