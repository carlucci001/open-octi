import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {},
  session: null,
}))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
}))

vi.mock('../lib/avatar-gen', () => ({
  getAvatarMeta: vi.fn(() => null),
}))

import { GET } from '../app/api/portal/me/route'

function configurePortal({ tenantId, tenantName, phoneNumber = null, agentId = 'receptionist' }) {
  state.session = {
    email: 'owner@example.com',
    accountId: 'account-one',
    leaseId: 'lease-one',
    tenantId,
  }
  state.data = {
    'accounts.json': { accounts: [{ id: 'account-one', name: tenantName }] },
    'leases.json': { leases: [{
      id: 'lease-one',
      clientAccountId: 'account-one',
      tenantId,
      tenantName,
      agentId,
      agentName: 'Receptionist',
      twilioPhoneNumber: phoneNumber,
      tierId: null,
      status: 'active',
    }] },
    'agents.json': { agents: {
      [agentId]: {
        id: agentId,
        name: 'Receptionist',
        title: 'Receptionist',
        ...(agentId === 'newsroom-receptionist' ? { phoneNumber: '+18287709227' } : {}),
      },
    } },
    'pricing-tiers.json': { tiers: [] },
  }
}

beforeEach(() => {
  state.session = null
  state.data = {}
})

describe('GET /api/portal/me communication line fallback', () => {
  it.each([
    ['farrington-development', 'Farrington Development', 'receptionist', '+18287709428'],
    ['newsroomaios', 'NewsroomAIOS', 'newsroom-receptionist', '+18287709227'],
    ['wnc-times', 'WNC Times', 'wnc-jessica', '+18286242408'],
  ])('returns the provisioned number for %s when its lease field is empty', async (tenantId, tenantName, agentId, expectedPhone) => {
    configurePortal({ tenantId, tenantName, agentId })

    const response = await GET(new Request('https://openocti.local/api/portal/me'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lease.twilioPhoneNumber).toBe(expectedPhone)
    expect(body.lease.phoneAssignmentSource).toMatch(/agent|internal/)
  })

  it('prefers an external client lease recorded number over internal defaults', async () => {
    configurePortal({
      tenantId: 'lease-acme',
      tenantName: 'Acme Heating',
      phoneNumber: '+15551234567',
      agentId: 'acme-receptionist',
    })

    const response = await GET(new Request('https://openocti.local/api/portal/me'))
    const body = await response.json()

    expect(body.lease.twilioPhoneNumber).toBe('+15551234567')
    expect(body.lease.phoneAssignmentSource).toBe('lease')
  })

  it('does not borrow the receptionist identity when a portal lease has no agent id', async () => {
    configurePortal({
      tenantId: 'farrington-development',
      tenantName: 'Farrington Development',
      agentId: 'receptionist',
    })
    state.data['leases.json'].leases[0].agentId = ''
    state.data['leases.json'].leases[0].agentName = ''
    state.data['agents.json'].agents.receptionist.name = 'Doreen'

    const response = await GET(new Request('http://localhost:3002/api/portal/me'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.agent).toBeNull()
    expect(body.portalManager).toMatchObject({
      id: 'portal-manager-cheryl',
      name: 'Cheryl',
      title: 'Client Concierge',
      avatar: { url: '/avatars/cheryl-portal.png' },
    })
  })
})
