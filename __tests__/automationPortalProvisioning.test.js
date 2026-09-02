import { beforeEach, describe, expect, it, vi } from 'vitest'

let data

async function loadAutomationsStore() {
  vi.resetModules()
  vi.doMock('../lib/dataStore', () => ({
    readData: (filename) => data[filename],
    writeData: (filename, value) => {
      data[filename] = JSON.parse(JSON.stringify(value))
    },
  }))
  vi.doMock('../lib/automation-runners', () => ({
    getAutomationRunner: () => null,
    runRegisteredAutomation: async () => ({ ok: true }),
  }))
  vi.doMock('../lib/automation-studio-templates', () => ({
    automationStudioTemplateList: () => [],
    getAutomationStudioTemplate: () => null,
  }))
  return import('../lib/automations-store.js')
}

beforeEach(() => {
  data = {
    'automations.json': { __version: 1, automations: [] },
    'accounts.json': {
      accounts: [
        { id: 'ac_chad', name: 'Chad Lamothe', email: 'redacted@example.invalid' },
      ],
    },
    'agents.json': {
      agents: {
        leo: { id: 'leo', name: 'Leo', tenantId: 'farrington-development' },
      },
    },
    'leases.json': { leases: [] },
    'activities.json': { activities: [] },
  }
})

describe('automation portal provisioning', () => {
  it('creates an active portal lease when an automation is created for a client account', async () => {
    const { createAutomation } = await loadAutomationsStore()

    const automation = createAutomation({
      name: 'Client deep dive',
      scope: 'client',
      tenantId: 'ac_chad',
      clientName: 'Chad Lamothe',
      assignedAgentId: 'leo',
      assignedAgentName: 'Leo',
    })

    const leases = data['leases.json'].leases
    expect(leases).toHaveLength(1)
    expect(automation.portalLeaseId).toBe(leases[0].id)
    expect(leases[0]).toMatchObject({
      agentId: 'leo',
      clientAccountId: 'ac_chad',
      status: 'active',
      tierId: 'automation-portal',
      monthlyFee: 0,
    })
    expect(data['agents.json'].agents.leo.tenantId).toBe('lease-ac_chad')
    expect(data['agents.json'].agents.leo.leaseId).toBe(leases[0].id)
  })

  it('provisions once when an existing automation is assigned to a client', async () => {
    data['automations.json'].automations.push({
      id: 'auto_existing',
      name: 'Research scan',
      scope: 'in-house',
      assignedAgentId: 'leo',
      assignedAgentName: 'Leo',
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    const { updateAutomation } = await loadAutomationsStore()

    const assigned = updateAutomation('auto_existing', {
      scope: 'client',
      tenantId: 'ac_chad',
      clientName: 'Chad Lamothe',
    })
    const leaseId = assigned.portalLeaseId

    const resaved = updateAutomation('auto_existing', { description: 'Updated notes' })

    expect(data['leases.json'].leases).toHaveLength(1)
    expect(resaved.portalLeaseId).toBe(leaseId)
  })

  it('marks unregistered automation runs as guarded preparation instead of executed work', async () => {
    data['automations.json'].automations.push({
      id: 'auto_guarded',
      name: 'Guarded workflow',
      scope: 'in-house',
      assignedAgentId: 'leo',
      assignedAgentName: 'Leo',
      dataSource: { provider: 'manual', query: '', fields: [] },
      delivery: { method: 'draft', channels: ['email'], recipients: [] },
      approval: { required: true, approver: 'Carl' },
      steps: [{ id: 'step_one', label: 'Prepare package', kind: 'action' }],
      runHistory: [],
      runCount: 0,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    const { runAutomation } = await loadAutomationsStore()

    const updated = await runAutomation('auto_guarded')

    expect(updated.runHistory[0]).toMatchObject({
      status: 'prepared',
      executionMode: 'guarded_preparation',
      approvalRequired: true,
    })
    expect(updated.runHistory[0].note).toContain('no external send, CRM write, scheduling, or spend action was executed')
  })

  it('writes a tenant-scoped activity receipt for a client-scoped automation run', async () => {
    data['automations.json'].automations.push({
      id: 'auto_client',
      name: 'Client research scan',
      scope: 'client',
      tenantId: 'lease-ac_chad',
      dataSource: { provider: 'manual', query: '', fields: [] },
      delivery: { method: 'draft', channels: ['email'], recipients: [] },
      approval: { required: true, approver: 'Carl' },
      steps: [],
      runHistory: [],
      runCount: 0,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    const { runAutomation } = await loadAutomationsStore()

    await runAutomation('auto_client')

    const activities = data['activities.json'].activities
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      tenantId: 'lease-ac_chad',
      type: 'automation_run',
      subject: 'Client research scan completed',
    })
    expect(activities[0].body).toBeTruthy()
  })

  it('skips the activity receipt when the automation has no tenantId', async () => {
    data['automations.json'].automations.push({
      id: 'auto_inhouse',
      name: 'In-house scan',
      scope: 'in-house',
      assignedAgentId: 'leo',
      dataSource: { provider: 'manual', query: '', fields: [] },
      delivery: { method: 'draft', channels: ['email'], recipients: [] },
      approval: { required: true, approver: 'Carl' },
      steps: [],
      runHistory: [],
      runCount: 0,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    const { runAutomation } = await loadAutomationsStore()

    await runAutomation('auto_inhouse')

    expect(data['activities.json'].activities).toHaveLength(0)
  })

  it('recordScheduledRun bounds run history to 20 entries and writes a receipt', async () => {
    data['automations.json'].automations.push({
      id: 'auto_scheduled',
      name: 'Scheduled digest',
      scope: 'client',
      tenantId: 'lease-ac_chad',
      trigger: { type: 'schedule', config: { cadence: 'Daily' } },
      enabled: true,
      status: 'active',
      runHistory: [],
      runCount: 0,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    const { recordScheduledRun } = await loadAutomationsStore()

    for (let i = 0; i < 25; i++) {
      recordScheduledRun('auto_scheduled', { startedAt: new Date().toISOString(), ok: true, summary: `Run ${i}` })
    }

    const automation = data['automations.json'].automations.find(a => a.id === 'auto_scheduled')
    expect(automation.runHistory).toHaveLength(20)
    expect(automation.runHistory[0]).toMatchObject({ ok: true, summary: 'Run 24', executionMode: 'scheduled_runner' })
    expect(automation.runCount).toBe(25)
    expect(data['activities.json'].activities).toHaveLength(25)
  })

  it('recordScheduledRun does not notify the client when notifyClient is false', async () => {
    data['automations.json'].automations.push({
      id: 'auto_no_runner',
      name: 'No runner automation',
      scope: 'client',
      tenantId: 'lease-ac_chad',
      trigger: { type: 'schedule', config: { cadence: 'Daily' } },
      enabled: true,
      status: 'active',
      runHistory: [],
      runCount: 0,
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    const { recordScheduledRun } = await loadAutomationsStore()

    recordScheduledRun('auto_no_runner', { ok: false, error: 'No registered runner', notifyClient: false })

    expect(data['activities.json'].activities).toHaveLength(0)
    const automation = data['automations.json'].automations.find(a => a.id === 'auto_no_runner')
    expect(automation.runHistory[0]).toMatchObject({ ok: false, error: 'No registered runner' })
  })
})
