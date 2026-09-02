import { beforeEach, describe, expect, it, vi } from 'vitest'

let data
let runnerMock

async function loadScheduler() {
  vi.resetModules()
  vi.doMock('../lib/dataStore', () => ({
    readData: (filename) => data[filename],
    writeData: (filename, value) => {
      data[filename] = JSON.parse(JSON.stringify(value))
    },
  }))
  vi.doMock('../lib/automation-studio-templates', () => ({
    automationStudioTemplateList: () => [],
    getAutomationStudioTemplate: () => null,
  }))
  vi.doMock('../lib/automation-runners', () => ({
    getAutomationRunner: () => null,
    runRegisteredAutomation: runnerMock,
  }))
  const store = await import('../lib/automations-store.js')
  const scheduler = await import('../lib/automation-scheduler.js')
  return { store, scheduler }
}

function baseAutomation(overrides = {}) {
  return {
    id: 'auto_1',
    name: 'Weekly digest',
    scope: 'client',
    tenantId: 'lease-ac_chad',
    enabled: true,
    status: 'active',
    trigger: { type: 'schedule', config: { cadence: 'Weekly' } },
    cadence: 'Weekly',
    runHistory: [],
    runCount: 0,
    lastRunAt: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  data = {
    'automations.json': { __version: 1, automations: [] },
    'accounts.json': { accounts: [] },
    'agents.json': { agents: {} },
    'leases.json': { leases: [] },
    'activities.json': { activities: [] },
  }
  runnerMock = vi.fn(async () => ({ runnerId: 'r1', runnerLabel: 'Runner', result: { summary: 'Ran fine.' } }))
})

describe('automation scheduler due-computation', () => {
  it('is due on the first run when never run before', async () => {
    const { scheduler } = await loadScheduler()
    expect(scheduler.isAutomationDue(baseAutomation({ lastRunAt: null }))).toBe(true)
  })

  it('daily cadence is due after 24h and not due before', async () => {
    const { scheduler } = await loadScheduler()
    const automation = baseAutomation({ trigger: { type: 'schedule', config: { cadence: 'Daily' } }, lastRunAt: '2026-07-17T00:00:00.000Z' })
    const almostADayLater = Date.parse('2026-07-17T23:59:00.000Z')
    const justOverADayLater = Date.parse('2026-07-18T00:01:00.000Z')
    expect(scheduler.isAutomationDue(automation, almostADayLater)).toBe(false)
    expect(scheduler.isAutomationDue(automation, justOverADayLater)).toBe(true)
  })

  it('weekly and monthly cadence compute correct interval windows', async () => {
    const { scheduler } = await loadScheduler()
    const weekly = baseAutomation({ trigger: { type: 'schedule', config: { cadence: 'Weekly' } }, lastRunAt: '2026-07-01T00:00:00.000Z' })
    expect(scheduler.isAutomationDue(weekly, Date.parse('2026-07-06T00:00:00.000Z'))).toBe(false)
    expect(scheduler.isAutomationDue(weekly, Date.parse('2026-07-08T00:01:00.000Z'))).toBe(true)

    const monthly = baseAutomation({ trigger: { type: 'schedule', config: { cadence: 'Monthly' } }, lastRunAt: '2026-06-01T00:00:00.000Z' })
    expect(scheduler.isAutomationDue(monthly, Date.parse('2026-06-20T00:00:00.000Z'))).toBe(false)
    expect(scheduler.isAutomationDue(monthly, Date.parse('2026-07-05T00:00:00.000Z'))).toBe(true)
  })

  it('honors a custom trigger.config.intervalMinutes cadence', async () => {
    const { scheduler } = await loadScheduler()
    const automation = baseAutomation({ trigger: { type: 'schedule', config: { intervalMinutes: 30 } }, lastRunAt: '2026-07-17T00:00:00.000Z' })
    expect(scheduler.isAutomationDue(automation, Date.parse('2026-07-17T00:20:00.000Z'))).toBe(false)
    expect(scheduler.isAutomationDue(automation, Date.parse('2026-07-17T00:31:00.000Z'))).toBe(true)
  })

  it('is never due for manual/webhook/event trigger types or unrecognized cadence', async () => {
    const { scheduler } = await loadScheduler()
    expect(scheduler.isAutomationDue(baseAutomation({ trigger: { type: 'manual', config: {} } }))).toBe(false)
    expect(scheduler.isAutomationDue(baseAutomation({ trigger: { type: 'schedule', config: { cadence: 'Whenever' } } }))).toBe(false)
  })
})

describe('automation scheduler tick', () => {
  it('runs due automations, updates lastRunAt, and skips not-due ones', async () => {
    const { scheduler } = await loadScheduler()
    data['automations.json'].automations.push(
      baseAutomation({ id: 'auto_due', name: 'Due automation', lastRunAt: '2020-01-01T00:00:00.000Z' }),
      baseAutomation({ id: 'auto_not_due', name: 'Not due automation', lastRunAt: new Date().toISOString() }),
    )

    const result = await scheduler.runSchedulerTick()

    expect(result.ranCount).toBe(1)
    expect(runnerMock).toHaveBeenCalledTimes(1)
    const automations = data['automations.json'].automations
    const due = automations.find(a => a.name === 'Due automation')
    const notDue = automations.find(a => a.name === 'Not due automation')
    expect(due.lastRunAt).not.toBe('2020-01-01T00:00:00.000Z')
    expect(due.runHistory[0]).toMatchObject({ ok: true, summary: 'Ran fine.' })
    expect(notDue.runCount).toBe(0)
  })

  it('skips a concurrent tick while one is already running', async () => {
    const { scheduler } = await loadScheduler()
    data['automations.json'].automations.push(baseAutomation({ id: 'auto_due', lastRunAt: '2020-01-01T00:00:00.000Z' }))
    let releaseRunner
    runnerMock.mockImplementation(() => new Promise(resolve => { releaseRunner = () => resolve({ runnerId: 'r1', runnerLabel: 'Runner', result: { summary: 'ok' } }) }))

    const firstTick = scheduler.runSchedulerTick()
    const secondTick = await scheduler.runSchedulerTick()
    expect(secondTick).toMatchObject({ skipped: true, reason: 'run_in_progress' })

    releaseRunner()
    await firstTick
  })

  it('does not send a client receipt when no runner is registered', async () => {
    runnerMock.mockResolvedValue(null)
    const { scheduler } = await loadScheduler()
    data['automations.json'].automations.push(baseAutomation({ id: 'auto_due', lastRunAt: '2020-01-01T00:00:00.000Z' }))

    await scheduler.runSchedulerTick()

    expect(data['activities.json'].activities).toHaveLength(0)
  })

  it('invokes the MyVTC sync hook once per tick and contains hook failures', async () => {
    const { scheduler } = await loadScheduler()
    const myvtcSync = vi.fn(async () => { throw new Error('temporary MyVTC failure') })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(scheduler.runSchedulerTick({
      now: Date.parse('2026-08-30T12:00:00.000Z'),
      myvtcSync,
    })).resolves.toMatchObject({ ok: true })
    expect(myvtcSync).toHaveBeenCalledTimes(1)
    expect(myvtcSync).toHaveBeenCalledWith({ now: new Date('2026-08-30T12:00:00.000Z') })
    expect(warning).toHaveBeenCalledWith('[myvtc] hourly contact sync failed:', 'temporary MyVTC failure')
    warning.mockRestore()
  })
})
