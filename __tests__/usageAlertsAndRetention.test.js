import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  entities: { usageEvents: [], usageRollups: [], supportTickets: [] },
  files: {},
  logActivity: vi.fn(),
  pushNtfy: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../lib/entityStore', () => ({
  genId: vi.fn(() => 'ue_generated'),
  loadAll: vi.fn(type => state.entities[type] || []),
  saveAll: vi.fn((type, rows) => { state.entities[type] = rows }),
  create: vi.fn((type, row) => { const record = { ...row }; state.entities[type] = [record, ...(state.entities[type] || [])]; return record }),
  findById: vi.fn((type, id) => (state.entities[type] || []).find(row => row.id === id) || null),
  update: vi.fn((type, id, patch) => { const row = state.entities[type].find(item => item.id === id); Object.assign(row, patch); return row }),
  logActivity: state.logActivity,
}))
vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(file => state.files[file] || null),
  writeData: vi.fn((file, value) => { state.files[file] = value }),
}))
vi.mock('../lib/ntfy', () => ({ pushNtfy: state.pushNtfy }))

import { pruneUsageEvents, recordUsageEvent } from '../lib/usage-events'

describe('usage retention and budget alerts', () => {
  beforeEach(() => {
    state.entities = { usageEvents: [], usageRollups: [], supportTickets: [] }
    state.files = {}
    state.logActivity.mockClear()
    state.pushNtfy.mockClear()
  })

  it('moves events older than 90 days into durable daily rollups', () => {
    state.entities.usageEvents = [
      { id: 'old', ts: '2026-01-01T12:00:00.000Z', agentId: 'nadia', provider: 'google', model: 'gemini', promptTokens: 10, completionTokens: 5, estCostUsd: 0.1, clientId: 'c1', productId: 'research', source: 'deerflow', unknown: false },
      { id: 'new', ts: '2026-08-20T12:00:00.000Z', agentId: 'nadia', provider: 'google', model: 'gemini', promptTokens: 20, completionTokens: 10, estCostUsd: 0.2, clientId: 'c1', productId: 'research', source: 'deerflow', unknown: false },
    ]
    expect(pruneUsageEvents({ now: new Date('2026-08-22T12:00:00.000Z') })).toMatchObject({ pruned: 1, retained: 1, rollups: 1 })
    expect(state.entities.usageEvents.map(row => row.id)).toEqual(['new'])
    expect(state.entities.usageRollups[0]).toMatchObject({ day: '2026-01-01', events: 1, estCostUsd: 0.1 })
  })

  it('attaches cost to a request and emits one ntfy plus Feed note on a monthly breach', async () => {
    state.entities.supportTickets = [{ id: 'ticket-1', estCostUsd: 0, usageEventCount: 0 }]
    state.files['usage-settings.json'] = { agentMonthlyUsd: { nadia: 1 }, clientMonthlyUsd: { c1: 2 }, alertState: {} }

    recordUsageEvent({ ts: '2026-08-22T12:00:00.000Z', agentId: 'nadia', provider: 'google', model: 'gemini', promptTokens: 10, completionTokens: 5, estCostUsd: 1.25, clientId: 'c1', requestId: 'ticket-1', source: 'deerflow' })
    recordUsageEvent({ ts: '2026-08-22T13:00:00.000Z', agentId: 'nadia', provider: 'google', model: 'gemini', promptTokens: 10, completionTokens: 5, estCostUsd: 0.10, clientId: 'c1', requestId: 'ticket-1', source: 'deerflow' })
    await Promise.resolve()

    expect(state.entities.supportTickets[0]).toMatchObject({ estCostUsd: 1.35, usageEventCount: 2 })
    expect(state.logActivity).toHaveBeenCalledTimes(1)
    expect(state.pushNtfy).toHaveBeenCalledTimes(1)
    expect(state.files['usage-settings.json'].alertState['2026-08:agent:nadia']).toBeTruthy()
  })
})
