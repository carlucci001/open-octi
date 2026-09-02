import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  loadAll: vi.fn(),
  logActivity: vi.fn(),
  readData: vi.fn(),
}))

vi.mock('../lib/entityStore', () => ({
  create: mocks.create,
  loadAll: mocks.loadAll,
  logActivity: mocks.logActivity,
}))

vi.mock('../lib/dataStore', () => ({
  readData: mocks.readData,
}))

import { POST } from '../app/api/portal/demo-request/route'
import { POST as legacySignupPOST } from '../app/api/portal/signup/route'

function demoRequest(body) {
  return new Request('https://openocti.local/api/portal/demo-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('public Command Center demo request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('RESEND_API_KEY', '')
    mocks.readData.mockReturnValue({ credentials: [] })
    mocks.create.mockImplementation((entity, data) => ({ id: 'lead_demo_1', ...data }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('creates one normal Farrington Development lead and nothing else', async () => {
    const response = await POST(demoRequest({
      name: 'Jordan Smith',
      company: 'Acme Heating',
      email: 'JORDAN@EXAMPLE.COM',
      phone: '555-0100',
      preferredTime: 'Tuesday at 2 PM Eastern',
      message: 'Show me the receptionist and campaign workflow.',
      accountId: 'forged-account',
      tenantId: 'forged-tenant',
      leaseId: 'forged-lease',
      credits: 1000000,
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      message: 'Demo request received. Farrington Development will contact you to schedule it.',
    })
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith('leads', expect.objectContaining({
      name: 'Jordan Smith',
      businessName: 'Acme Heating',
      email: 'jordan@example.com',
      phone: '555-0100',
      source: 'portal-demo-request',
      brandContext: 'farrington_dev',
      serviceLine: 'Farrington Development - Command Center',
      productOpportunity: 'Farrington Command Center Demo',
      status: 'new',
      preferredTime: 'Tuesday at 2 PM Eastern',
      tags: expect.arrayContaining(['inbound', 'farrington-development', 'demo-request']),
    }))
    const lead = mocks.create.mock.calls[0][1]
    expect(lead.notes).toContain('Show me the receptionist and campaign workflow.')
    expect(lead).not.toHaveProperty('accountId')
    expect(lead).not.toHaveProperty('tenantId')
    expect(lead).not.toHaveProperty('leaseId')
    expect(lead).not.toHaveProperty('credits')
    expect(mocks.loadAll).not.toHaveBeenCalled()
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      type: 'note',
      linkedTo: { leadId: 'lead_demo_1' },
    }))
  })

  it('rejects an invalid email without creating any CRM record', async () => {
    const response = await POST(demoRequest({
      name: 'Jordan Smith',
      email: 'not-an-email',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Valid email required' })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.readData).not.toHaveBeenCalled()
  })

  it('keeps the old signup endpoint as a lead-only compatibility alias', async () => {
    const response = await legacySignupPOST(demoRequest({
      name: 'Legacy Client',
      email: 'legacy-client@example.com',
    }))

    expect(response.status).toBe(200)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith('leads', expect.objectContaining({
      source: 'portal-demo-request',
      email: 'legacy-client@example.com',
    }))
  })

  it('states explicitly in the admin email that no demo portal was created', async () => {
    vi.stubEnv('RESEND_API_KEY', 'configured')
    const send = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', send)

    const response = await POST(demoRequest({ name: 'Jordan Smith', email: 'jordan@example.com' }))

    expect(response.status).toBe(200)
    const payload = JSON.parse(send.mock.calls[0][1].body)
    expect(payload.subject).toMatch(/no portal created/i)
    expect(payload.html).toMatch(/No portal was created/i)
    expect(payload.html).toMatch(/No account, lease, billing, credits, portal access, or service was provisioned/i)
  })
})
