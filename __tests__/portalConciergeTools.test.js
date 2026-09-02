import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))
const mocks = vi.hoisted(() => ({ runAutomation: vi.fn(), pushNtfy: vi.fn(() => Promise.resolve({ ok: true })) }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(name => structuredClone(state.data[name] || null)),
  writeData: vi.fn((name, value) => { state.data[name] = structuredClone(value) }),
}))
vi.mock('../lib/portal-growth-profile', () => ({ getGrowthProfile: vi.fn(() => null) }))
vi.mock('../lib/automations-store', () => ({ runAutomation: mocks.runAutomation }))
vi.mock('../lib/ntfy', () => ({ pushNtfy: mocks.pushNtfy }))

import {
  createWorkOrder,
  getAccountContext,
  getWorkStatus,
  listServices,
  requestService,
} from '../lib/portal-concierge-tools'

const sessionA = { accountId: 'account-a', tenantId: 'tenant-a', leaseId: 'lease-a', email: 'redacted@example.invalid' }
const sessionB = { accountId: 'account-b', tenantId: 'tenant-b', leaseId: 'lease-b', email: 'redacted@example.invalid' }

function baseAutomation(overrides) {
  return {
    id: 'auto-shared-id',
    name: 'Weekly report',
    scope: 'client',
    enabled: true,
    status: 'active',
    verified: true,
    monthlyFee: 199,
    description: 'A weekly report',
    marketplace: { customerVisible: true, capabilityVerified: true },
    fulfillment: { handler: 'weekly_report', trackedRecord: 'documents' },
    runHistory: [],
    ...overrides,
  }
}

describe('portal concierge tools — tenant scoping', () => {
  beforeEach(() => {
    mocks.runAutomation.mockReset()
    state.data = {
      'accounts.json': { accounts: [
        { id: 'account-a', name: 'Account A', website: 'https://a.example' },
        { id: 'account-b', name: 'Account B', website: 'https://b.example' },
      ] },
      'automations.json': { automations: [] },
      'support-tickets.json': { supportTickets: [] },
      'activities.json': { activities: [] },
    }
  })

  it('get_account_context only reports automations linked to the caller account', () => {
    state.data['automations.json'].automations = [
      baseAutomation({ id: 'auto-a', tenantId: 'account-a' }),
      baseAutomation({ id: 'auto-b', tenantId: 'account-b' }),
    ]
    const contextA = getAccountContext(sessionA)
    expect(contextA.activeServices).toEqual(['auto-a'])
    expect(contextA.accountName).toBe('Account A')
    expect(contextA.website).toBe('https://a.example')

    const contextB = getAccountContext(sessionB)
    expect(contextB.activeServices).toEqual(['auto-b'])
  })

  it('list_services only returns proven, customer-visible automations regardless of caller', () => {
    state.data['automations.json'].automations = [
      baseAutomation({ id: 'proven', tenantId: 'account-a' }),
      baseAutomation({ id: 'unproven', tenantId: 'account-a', marketplace: { customerVisible: false, capabilityVerified: true } }),
    ]
    const { services } = listServices()
    expect(services.map(s => s.id)).toEqual(['proven'])
    expect(services[0]).toMatchObject({ name: 'Weekly report', monthlyFee: 199 })
  })

  it('request_service always files a tracked ticket scoped to the caller tenant', async () => {
    const result = await requestService(sessionA, { serviceId: 'no-such-service', domain: 'a.example', notes: 'Please help' })
    expect(result).toMatchObject({ ok: true, requested: true, runStarted: false, reason: 'unknown_service' })

    const tickets = state.data['support-tickets.json'].supportTickets
    expect(tickets).toHaveLength(1)
    expect(tickets[0]).toMatchObject({ accountId: 'account-a', tenantId: 'tenant-a' })
    expect(mocks.runAutomation).not.toHaveBeenCalled()
  })

  it('never runs another account automation even when the id is guessed and the automation is active', async () => {
    // account-b owns and is subscribed to this automation; account-a requests the same id.
    state.data['automations.json'].automations = [
      baseAutomation({ id: 'shared-id', tenantId: 'account-b', enabled: true, status: 'active' }),
    ]
    const result = await requestService(sessionA, { serviceId: 'shared-id' })
    expect(result).toMatchObject({ ok: true, requested: true, runStarted: false, reason: 'not_subscribed' })
    expect(mocks.runAutomation).not.toHaveBeenCalled()

    const tickets = state.data['support-tickets.json'].supportTickets
    expect(tickets[0].accountId).toBe('account-a')
  })

  it('starts the automation run only when the caller account is actually subscribed', async () => {
    state.data['automations.json'].automations = [
      baseAutomation({ id: 'shared-id', tenantId: 'account-a', enabled: true, status: 'active' }),
    ]
    mocks.runAutomation.mockResolvedValue({
      runHistory: [{ id: 'run-1', status: 'completed' }],
    })
    const result = await requestService(sessionA, { serviceId: 'shared-id' })
    expect(mocks.runAutomation).toHaveBeenCalledWith('shared-id', expect.objectContaining({ recipientEmail: 'redacted@example.invalid' }))
    expect(result).toMatchObject({ ok: true, requested: true, runStarted: true, runId: 'run-1', runStatus: 'completed' })
  })

  it('get_work_status only surfaces the caller tenant tickets and automation-run activity', () => {
    state.data['support-tickets.json'].supportTickets = [
      { id: 'st-a', ticketNumber: 'ST-1', subject: 'A ticket', status: 'new', category: 'other', accountId: 'account-a', tenantId: 'tenant-a', portalVisible: true },
      { id: 'st-b', ticketNumber: 'ST-2', subject: 'B ticket', status: 'new', category: 'other', accountId: 'account-b', tenantId: 'tenant-b', portalVisible: true },
    ]
    state.data['activities.json'].activities = [
      { id: 'av-a', type: 'automation_run', tenantId: 'tenant-a', subject: 'A run', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'av-b', type: 'automation_run', tenantId: 'tenant-b', subject: 'B run', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    const status = getWorkStatus(sessionA)
    expect(status.openRequests.map(t => t.id)).toEqual(['st-a'])
    expect(status.recentAutomationRuns.map(a => a.id)).toEqual(['av-a'])
  })
})

describe("create_work_order — Carl's never-say-no capture path", () => {
  beforeEach(() => {
    mocks.pushNtfy.mockClear()
    state.data = {
      'accounts.json': { accounts: [
        { id: 'account-a', name: 'Account A', website: 'https://a.example' },
        { id: 'account-wo', name: 'Work Order Co', website: 'https://wo.example' },
      ] },
      'automations.json': { automations: [] },
      'support-tickets.json': { supportTickets: [] },
      'activities.json': { activities: [] },
    }
  })

  it('files a portal-visible custom_work_order ticket scoped to the caller, notifies Carl, and never starts work', () => {
    const result = createWorkOrder(sessionA, { title: 'Custom booking app', details: 'Salon needs online booking with SMS reminders, ~200 clients, live by October.' })
    expect(result.ok).toBe(true)
    expect(result.requested).toBe(true)
    expect(result.runStarted).toBe(false)
    expect(result.message).toMatch(/Carl will get with you personally/)
    expect(result.message).not.toMatch(/\$|per month|started/i)

    const tickets = state.data['support-tickets.json'].supportTickets
    expect(tickets).toHaveLength(1)
    expect(tickets[0]).toMatchObject({
      accountId: 'account-a',
      tenantId: 'tenant-a',
      category: 'custom_work_order',
      portalVisible: true,
      source: 'portal',
      status: 'new',
    })
    expect(tickets[0].subject).toBe('Work order: Custom booking app')
    expect(mocks.pushNtfy).toHaveBeenCalledTimes(1)
    expect(mocks.pushNtfy.mock.calls[0][0].title).toContain('Account A')
  })

  it('requires title and details', () => {
    expect(createWorkOrder(sessionA, { title: '', details: 'x' }).ok).toBe(false)
    expect(createWorkOrder(sessionA, { title: 'x', details: '' }).ok).toBe(false)
    expect(state.data['support-tickets.json'].supportTickets).toHaveLength(0)
  })

  it('rate limits at 5 work orders per account per day, with a graceful message', () => {
    const session = { accountId: 'account-wo', tenantId: 'tenant-wo', email: 'wo@example.com' }
    for (let i = 0; i < 5; i += 1) {
      expect(createWorkOrder(session, { title: `Job ${i}`, details: 'details' }).ok).toBe(true)
    }
    const sixth = createWorkOrder(session, { title: 'Job 6', details: 'details' })
    expect(sixth.ok).toBe(false)
    expect(sixth.rateLimited).toBe(true)
    expect(sixth.message).toMatch(/Carl will be in touch/)
    expect(state.data['support-tickets.json'].supportTickets).toHaveLength(5)
  })
})
