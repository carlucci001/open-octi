import { describe, expect, it } from 'vitest'
import {
  buildFccHealth,
  buildFccManifest,
  buildFccRevenue,
  listFccErrors,
  listFccReleases,
  readFccUsage,
} from '../lib/platform-admin/fccResources'

describe('Command Center Platform Admin v2 reference resources', () => {
  it('publishes only the Platform Admin resources Command Center implements', () => {
    const manifest = buildFccManifest({ packageVersion: '2.0.0', swVersion: '2026.08.22.1' })
    expect(manifest).toMatchObject({
      schemaVersion: '2.0',
      platform: {
        id: 'farrington-command-center',
        name: 'Command Center',
        version: '2.0.0+2026.08.22.1',
        adminApiBasePath: '/api/platform-admin/v1',
      },
      authentication: { methods: ['bearer'] },
      capabilities: ['health', 'releases', 'errors', 'usage', 'revenue'],
    })
  })

  it('reports health from sqlite, DeerFlow, and disk with a degraded aggregate when one dependency fails', async () => {
    const result = await buildFccHealth({
      version: '2.0.0+test',
      now: () => new Date('2026-08-22T12:00:00.000Z'),
      checks: {
        sqlite: async () => ({ ok: true, detail: 'SQLite read succeeded.' }),
        deerflow: async () => ({ ok: false, detail: 'DeerFlow unavailable.' }),
        disk: async () => ({ ok: true, detail: 'Disk has 50% free.' }),
      },
    })
    expect(result).toEqual({
      status: 'degraded',
      version: '2.0.0+test',
      checks: [
        { name: 'sqlite', ok: true, detail: 'SQLite read succeeded.' },
        { name: 'deerflow', ok: false, detail: 'DeerFlow unavailable.' },
        { name: 'disk', ok: true, detail: 'Disk has 50% free.' },
      ],
      ts: '2026-08-22T12:00:00.000Z',
    })
  })

  it('returns releases newest first and clamps the requested limit', () => {
    const releases = Array.from({ length: 120 }, (_, index) => ({
      id: `rel-${index}`,
      version: `2.0.${index}`,
      commit: `commit-${index}`,
      deployedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      deployer: 'codex',
      status: index === 119 ? 'live' : 'previous',
    }))
    const result = listFccReleases({ releases, limit: '999' })
    expect(result).toHaveLength(100)
    expect(result[0].id).toBe('rel-119')
  })

  it('relays truthful empty error and usage resources when FCC has no tracker or product analytics source', () => {
    expect(listFccErrors()).toEqual([])
    expect(readFccUsage()).toEqual({})
  })

  it('computes revenue from FCC subscription leases and payment outcomes for the requested period', () => {
    const result = buildFccRevenue({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      leases: [
        { id: 'a', stripeSubscriptionStatus: 'active', monthlyFee: 299, createdAt: '2026-08-05T00:00:00.000Z' },
        { id: 'b', stripeSubscriptionStatus: 'trialing', monthlyFee: 99, stripeTrialStart: '2026-08-10T00:00:00.000Z' },
        { id: 'c', stripeSubscriptionStatus: 'canceled', monthlyFee: 199, canceledAt: '2026-08-12T00:00:00.000Z' },
        { id: 'd', stripeSubscriptionStatus: 'active', monthlyFee: 49, stripeTrialStart: '2026-07-01T00:00:00.000Z', stripeTrialConvertedAt: '2026-08-14T00:00:00.000Z' },
      ],
      payments: [
        { id: 'p1', status: 'failed', date: '2026-08-20T00:00:00.000Z' },
        { id: 'p2', status: 'paid', date: '2026-08-21T00:00:00.000Z' },
      ],
      pricing: { currency: 'USD', tiers: [] },
    })
    expect(result).toEqual({
      currency: 'USD',
      mrr: 447,
      newMrr: 299,
      churnedMrr: 199,
      failedPayments: 1,
      trials: { started: 1, converted: 1 },
    })
  })

  it('uses the live Command Center pricing catalog when a lease stores a tier id instead of a copied fee', () => {
    const result = buildFccRevenue({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      leases: [{ id: 'a', tierId: 'office-manager', stripeSubscriptionStatus: 'active', createdAt: '2026-07-01T00:00:00.000Z' }],
      payments: [],
      pricing: { currency: 'USD', tiers: [{ id: 'office-manager', monthlyFee: 299 }] },
    })
    expect(result.mrr).toBe(299)
  })
})
