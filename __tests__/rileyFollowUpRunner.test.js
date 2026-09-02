import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

import { runRileyFollowUpWatchdog } from '../lib/riley-follow-up-runner'

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = n => new Date(now - n * DAY).toISOString()

function lead(id, overrides = {}) {
  return {
    id,
    businessName: `Business ${id}`,
    name: `Contact ${id}`,
    email: `${id}@example.com`,
    tenantId: 'acme',
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
    ...overrides,
  }
}

describe('Riley follow-up watchdog runner', () => {
  beforeEach(() => {
    state.data = {
      'leads.json': {
        leads: [
          lead('ld_stale_1', { updatedAt: daysAgo(10) }),
          lead('ld_stale_2', { updatedAt: daysAgo(7) }),
          lead('ld_fresh', { updatedAt: daysAgo(1) }),
          lead('ld_other_tenant', { tenantId: 'other-co', updatedAt: daysAgo(20) }),
        ],
      },
      'activities.json': { activities: [] },
      'credentials.json': { credentials: [] },
    }
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('finds stalled records and dry-runs cleanly when Nylas config is missing', async () => {
    const result = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'acme' })

    expect(result.scanned).toBe(3) // 3 acme leads, other-co excluded from scan too
    expect(result.stalled).toBe(2)
    expect(result.drafted).toBe(0)
    expect(result.records).toHaveLength(2)
    expect(result.records.every(r => r.draft === 'skipped' && r.reason === 'nylas_not_configured')).toBe(true)
    expect(result.records.map(r => r.id).sort()).toEqual(['ld_stale_1', 'ld_stale_2'])
  })

  it('never touches a record from another tenant', async () => {
    const result = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'acme' })

    expect(result.records.some(r => r.id === 'ld_other_tenant')).toBe(false)
    expect(result.scanned).toBe(3)

    const otherTenantResult = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'other-co' })
    expect(otherTenantResult.scanned).toBe(1)
    expect(otherTenantResult.records.every(r => r.id === 'ld_other_tenant')).toBe(true)
  })

  it('respects a configured limit', async () => {
    state.data['leads.json'].leads.push(
      lead('ld_stale_3', { updatedAt: daysAgo(15) }),
      lead('ld_stale_4', { updatedAt: daysAgo(25) }),
    )
    const result = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'acme', config: { limit: 2 } })

    expect(result.stalled).toBe(2)
    expect(result.records).toHaveLength(2)
  })

  it('honors a custom stalledDays threshold', async () => {
    const result = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'acme', config: { stalledDays: 9 } })
    expect(result.records.map(r => r.id)).toEqual(['ld_stale_1'])
  })

  it('uses the most recent linked activity instead of updatedAt when present', async () => {
    state.data['activities.json'] = {
      activities: [
        { id: 'av_1', linkedTo: { leadId: 'ld_stale_1' }, at: daysAgo(1) },
      ],
    }
    const result = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'acme' })
    expect(result.records.some(r => r.id === 'ld_stale_1')).toBe(false)
    expect(result.records.some(r => r.id === 'ld_stale_2')).toBe(true)
  })

  it('drafts a real Nylas draft per stalled lead when credentials are configured', async () => {
    vi.stubEnv('NYLAS_API_KEY', 'test_key')
    vi.stubEnv('NYLAS_GRANT_ID', 'grant_123')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'draft_abc' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await runRileyFollowUpWatchdog({ id: 'auto_riley', tenantId: 'acme' })

    expect(result.drafted).toBe(2)
    expect(result.records.every(r => r.draft === 'drafted' && r.draftId === 'draft_abc')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.us.nylas.com/v3/grants/grant_123/drafts')
    expect(init.method).toBe('POST')
  })
})
