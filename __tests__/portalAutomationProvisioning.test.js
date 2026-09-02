// The concierge order path used to dead-end: a support ticket, then
// runStarted:false / not_subscribed forever, because nothing ever created the
// automation requestService was looking for. These tests pin the provisioning
// that closes it, and every guardrail on it — most importantly that a client
// can never cause an automation to go live or start billing.
import { describe, expect, it, beforeEach, vi } from 'vitest'

const store = { automations: [], accounts: [], activity: [], tickets: [] }

vi.mock('@/lib/dataStore', () => ({
  readData: file => {
    if (file === 'automations.json') return { automations: store.automations }
    if (file === 'accounts.json') return { accounts: store.accounts }
    return null
  },
  writeData: () => {},
  mutateData: () => {},
}))

vi.mock('@/lib/entityStore', () => ({
  logActivity: entry => { store.activity.push(entry) },
  create: () => ({}),
  loadAll: () => [],
}))

let autoSeq = 0
vi.mock('@/lib/automations-store', () => ({
  createAutomation: input => {
    const automation = { ...input, id: input.id || `auto_${++autoSeq}`, runHistory: [], createdAt: '2026-08-06T00:00:00Z' }
    store.automations.push(automation)
    return automation
  },
  getAutomation: id => store.automations.find(a => a.id === id) || null,
  updateAutomation: (id, patch) => {
    const idx = store.automations.findIndex(a => a.id === id)
    store.automations[idx] = { ...store.automations[idx], ...patch }
    return store.automations[idx]
  },
  runAutomation: vi.fn(async () => ({ runHistory: [{ id: 'run_1', status: 'completed' }] })),
}))

vi.mock('@/lib/supportTickets', () => ({
  createSupportTicket: input => {
    const ticket = { ...input, id: 'tkt_1', ticketNumber: 'T-100' }
    store.tickets.push(ticket)
    return ticket
  },
  listSupportTickets: () => store.tickets,
}))
vi.mock('@/lib/portal-growth-profile', () => ({ getGrowthProfile: () => ({}) }))
vi.mock('@/lib/portal-client-name', () => ({ portalClientFirstName: () => 'Dana' }))

// A template that the customer-facing catalog is genuinely willing to show.
const TEMPLATE = {
  id: 'tmpl-lead-sweep',
  name: 'Template: Monthly Lead Sweep',
  description: 'Monthly decision-maker sweep',
  scope: 'in-house',
  verified: true,
  monthlyFee: 750,
  setupFee: 250,
  cadence: 'monthly',
  marketplace: { customerVisible: true, capabilityVerified: true },
  fulfillment: { handler: 'lead-sweep', trackedRecord: 'lead' },
  dataSource: { provider: 'apify', query: 'construction' },
  trigger: { type: 'schedule', config: { cron: '0 9 1 * *' } },
}

const UNPROVEN = { ...TEMPLATE, id: 'tmpl-unproven', verified: false }
const SESSION = { accountId: 'acct_1', tenantId: 'acct_1', email: 'redacted@example.invalid' }

beforeEach(() => {
  store.automations = [structuredClone(TEMPLATE), structuredClone(UNPROVEN)]
  store.accounts = [{ id: 'acct_1', name: 'Blue Ridge Digital', website: 'blueridge.example' }]
  store.activity = []
  store.tickets = []
  autoSeq = 0
  vi.resetModules()
})

describe('concierge order provisions a client automation', () => {
  it('creates one, parked behind approval, instead of dead-ending', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const result = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })

    expect(result.reason).toBe('pending_approval')
    expect(result.runStarted).toBe(false)
    expect(result.ticketNumber).toBe('T-100')
    expect(result.message).toMatch(/waiting on approval/i)
    expect(result.message).toMatch(/nothing has been charged/i)

    const created = store.automations.find(a => a.id === result.automationId)
    expect(created.scope).toBe('client')
    expect(created.tenantId).toBe('acct_1')
    expect(created.templateId).toBe('tmpl-lead-sweep')
  })

  it('lands disabled, pending, and manual-triggered so no scheduler can fire it', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const result = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    const created = store.automations.find(a => a.id === result.automationId)

    expect(created.enabled).toBe(false)
    expect(created.status).toBe('pending_approval')
    // The template wanted a cron. It must NOT be armed before approval.
    expect(created.trigger).toEqual({ type: 'manual', config: {} })
    expect(created.provisionedFrom.intendedTrigger).toEqual({ type: 'schedule', config: { cron: '0 9 1 * *' } })
  })

  it('refuses to clone a service the catalog never offered', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const result = await requestService(SESSION, { serviceId: 'tmpl-unproven' })
    expect(result.reason).toBe('not_subscribed')
    expect(result.automationId).toBeUndefined()
    expect(store.automations.filter(a => a.scope === 'client')).toHaveLength(0)
  })

  it('never clones another client\'s configured automation', async () => {
    store.automations.push({
      ...structuredClone(TEMPLATE), id: 'other-client-auto', scope: 'client', tenantId: 'acct_999',
    })
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const result = await requestService(SESSION, { serviceId: 'other-client-auto' })
    expect(result.automationId).toBeUndefined()
    expect(store.automations.filter(a => a.tenantId === 'acct_1')).toHaveLength(0)
  })

  it('is idempotent — asking three times gives three tickets and one automation', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const first = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    const second = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    const third = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })

    expect(second.automationId).toBe(first.automationId)
    expect(third.automationId).toBe(first.automationId)
    expect(second.alreadyRequested).toBe(true)
    expect(store.automations.filter(a => a.scope === 'client')).toHaveLength(1)
    expect(store.tickets).toHaveLength(3)
  })

  it('takes the tenant from the session, never from the model\'s arguments', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const result = await requestService(SESSION, {
      serviceId: 'tmpl-lead-sweep', accountId: 'acct_999', tenantId: 'acct_999',
    })
    const created = store.automations.find(a => a.id === result.automationId)
    expect(created.tenantId).toBe('acct_1')
  })
})

describe('the approval gate', () => {
  it('arms the real trigger and goes live only on approval', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const { approveClientAutomation } = await import('@/lib/portal-automation-provisioning')
    const { automationId } = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })

    const approved = approveClientAutomation(automationId, { approvedBy: 'redacted@example.invalid' })
    expect(approved.enabled).toBe(true)
    expect(approved.status).toBe('active')
    expect(approved.trigger).toEqual({ type: 'schedule', config: { cron: '0 9 1 * *' } })
    expect(approved.provisionedFrom.approvedBy).toBe('redacted@example.invalid')
  })

  it('refuses to approve anything that is not a pending client automation', async () => {
    const { approveClientAutomation } = await import('@/lib/portal-automation-provisioning')
    expect(() => approveClientAutomation('tmpl-lead-sweep', {})).toThrow(/client automations/i)
    expect(() => approveClientAutomation('nope', {})).toThrow(/not found/i)
  })

  it('declining leaves it paused and never armed', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const { declineClientAutomation } = await import('@/lib/portal-automation-provisioning')
    const { automationId } = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })

    const declined = declineClientAutomation(automationId, { reason: 'Scope unclear', declinedBy: 'carl' })
    expect(declined.enabled).toBe(false)
    expect(declined.status).toBe('paused')
    expect(declined.trigger).toEqual({ type: 'manual', config: {} })
  })

  it('an approved client is then found by template id and the run actually starts', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const { approveClientAutomation } = await import('@/lib/portal-automation-provisioning')
    const { automationId } = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    approveClientAutomation(automationId, { approvedBy: 'carl' })

    // The clone has its own id; the client still asks by the template's id.
    // Without resolving through templateId, a paying subscriber looks
    // unsubscribed forever and the run never fires.
    const after = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    expect(after.runStarted).toBe(true)
    expect(after.reason).toBe('subscribed_run_started')
  })

  it('a pending automation still refuses to run', async () => {
    const { requestService } = await import('@/lib/portal-concierge-tools')
    const first = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    const second = await requestService(SESSION, { serviceId: 'tmpl-lead-sweep' })
    expect(first.runStarted).toBe(false)
    expect(second.runStarted).toBe(false)
    expect(second.reason).toBe('pending_approval')
  })
})
