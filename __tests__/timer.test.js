import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  data: new Map(),
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn((filename) => store.data.get(filename) || null),
  writeData: vi.fn((filename, value) => store.data.set(filename, value)),
}))

vi.mock('@/lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => ({ user: { id: 'usr_test', role: 'owner' }, error: null })),
  requireCrmWrite: vi.fn(async () => ({ user: { id: 'usr_test', role: 'owner' }, error: null })),
}))

function jsonRequest(body) {
  return new Request('http://openocti.local/api/timer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('timer tracking', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    store.data.clear()
    store.data.set('accounts.json', {
      accounts: [
        { id: 'acc_1', name: 'Acme Client', trackedSeconds: 30 },
      ],
    })
    store.data.set('activities.json', { activities: [] })
    store.data.set('timer-state.json', {
      accountId: null,
      accountName: null,
      sessionStartedAt: null,
      accumulatedMs: 0,
      runStartedAt: null,
      status: 'idle',
      note: '',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('logs a finished session against the selected client', async () => {
    const { logTimeTrackingSession } = await import('@/lib/timeTracking')

    const result = logTimeTrackingSession({
      accountId: 'acc_1',
      startedAt: '2026-05-07T10:00:00.000Z',
      stoppedAt: '2026-05-07T10:00:45.000Z',
      durationSeconds: 45,
      note: 'Demo follow-up',
    })

    expect(result.account.trackedSeconds).toBe(75)
    expect(store.data.get('accounts.json').accounts[0].trackedSeconds).toBe(75)
    expect(store.data.get('activities.json').activities[0]).toMatchObject({
      type: 'time_tracked',
      linkedTo: { accountId: 'acc_1' },
      meta: { durationSeconds: 45, note: 'Demo follow-up' },
    })
  })

  it('stops the active timer, clears timer state, and assigns time to the client', async () => {
    const startedAt = new Date(Date.now() - 2100).toISOString()
    store.data.set('timer-state.json', {
      accountId: 'acc_1',
      accountName: 'Acme Client',
      sessionStartedAt: startedAt,
      accumulatedMs: 0,
      runStartedAt: startedAt,
      status: 'running',
      note: '',
    })

    const { POST } = await import('@/app/api/timer/route')
    const response = await POST(jsonRequest({ action: 'stop', note: 'Call wrap' }))
    const body = await response.json()

    expect(body.ok).toBe(true)
    expect(body.logged.account.id).toBe('acc_1')
    expect(body.logged.account.trackedSeconds).toBeGreaterThanOrEqual(32)
    expect(store.data.get('timer-state.json').status).toBe('idle')
    expect(store.data.get('activities.json').activities).toHaveLength(1)
    expect(store.data.get('activities.json').activities[0].meta.note).toBe('Call wrap')
  })
})
