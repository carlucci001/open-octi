import { describe, expect, it } from 'vitest'

import {
  buildDunningCandidates,
  buildDunningHandoffPayload,
  buildFccClientRevenue,
  buildMoneySnapshot,
  moneySnapshotCsv,
  upsertMonthlySnapshot,
} from '../lib/money-console'

const PERIOD = { key: '2026-08', from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }

describe('Money Console aggregation', () => {
  it('makes portfolio MRR equal the rounded sum of every available product', () => {
    const snapshot = buildMoneySnapshot({
      period: PERIOD,
      capturedAt: '2026-08-23T12:00:00.000Z',
      revenueRows: [
        { productId: 'farrington-command-center', name: 'Command Center', currency: 'USD', mrr: 100.105, newMrr: 20, churnedMrr: 5, failedPayments: 1, trials: { started: 3, converted: 2 } },
        { productId: 'getfound3', name: 'GetFound3', currency: 'USD', mrr: 49.995, newMrr: 10, churnedMrr: 0, failedPayments: 2, trials: { started: 4, converted: 1 } },
      ],
      usageByProduct: [],
    })

    expect(snapshot.portfolio.mrr).toBe(150.1)
    expect(snapshot.portfolio.mrr).toBe(snapshot.products.reduce((sum, product) => Number((sum + product.mrr).toFixed(2)), 0))
    expect(snapshot.portfolio).toMatchObject({ newMrr: 30, churnedMrr: 5, failedPayments: 3, trials: { started: 7, converted: 3 } })
  })

  it('shows unknown margin for an unpriced usage event instead of inventing a number', () => {
    const snapshot = buildMoneySnapshot({
      period: PERIOD,
      revenueRows: [{ productId: 'getfound3', name: 'GetFound3', currency: 'USD', mrr: 80, newMrr: 0, churnedMrr: 0, failedPayments: 0, trials: { started: 0, converted: 0 } }],
      usageByProduct: [{ key: 'getfound3', estCostUsd: 4.25, unknown: true, unknownEvents: 1 }],
    })

    expect(snapshot.products[0]).toMatchObject({ attributedCostUsd: 'unknown', marginUsd: 'unknown', marginUnknown: true })
    expect(snapshot.portfolio).toMatchObject({ attributedCostUsd: 'unknown', marginUsd: 'unknown', marginUnknown: true })
  })

  it('keeps known zero-cost products numeric and client attribution honest', () => {
    const snapshot = buildMoneySnapshot({
      period: PERIOD,
      revenueRows: [{ productId: 'fcc', name: 'FCC', currency: 'USD', mrr: 25, newMrr: 0, churnedMrr: 0, failedPayments: 0, trials: { started: 0, converted: 0 } }],
      usageByProduct: [],
      usageByClient: [{ key: 'client-1', estCostUsd: 2, unknown: false }],
    })

    expect(snapshot.products[0]).toMatchObject({ attributedCostUsd: 0, marginUsd: 25, marginUnknown: false })
    expect(snapshot.clients[0]).toMatchObject({ clientId: 'client-1', revenueUsd: 'unknown', marginUsd: 'unknown', attributedCostUsd: 2 })
  })

  it('calculates per-client margin when FCC lifecycle revenue is known', () => {
    const clientRevenue = buildFccClientRevenue({ leases: [{ id: 'lease-1', accountId: 'client-1', status: 'active', monthlyFee: 25 }], accounts: [{ id: 'client-1', name: 'Client One' }] })
    const snapshot = buildMoneySnapshot({ period: PERIOD, revenueRows: [], usageByClient: [{ key: 'client-1', estCostUsd: 2, unknown: false }], clientRevenue })

    expect(snapshot.clients[0]).toMatchObject({ clientId: 'client-1', name: 'Client One', revenueUsd: 25, attributedCostUsd: 2, marginUsd: 23, marginUnknown: false })
  })

  it('upserts the current month without erasing earlier monthly snapshots', () => {
    const earlier = { id: 'revenue-2026-07', periodKey: '2026-07', portfolio: { mrr: 90 } }
    const current = { id: 'revenue-2026-08', periodKey: '2026-08', portfolio: { mrr: 100 } }
    const replacement = { ...current, portfolio: { mrr: 110 } }

    expect(upsertMonthlySnapshot([current, earlier], replacement)).toEqual([replacement, earlier])
  })

  it('exports stable Finance CSV rows with explicit unknown values', () => {
    const csv = moneySnapshotCsv({
      periodKey: '2026-08',
      products: [{ productId: 'getfound3', name: 'GetFound3, Inc.', currency: 'USD', mrr: 80, newMrr: 10, churnedMrr: 5, failedPayments: 1, trials: { started: 2, converted: 1 }, attributedCostUsd: 'unknown', marginUsd: 'unknown' }],
    })

    expect(csv.split('\n')[0]).toBe('period,product_id,product_name,currency,mrr,new_mrr,churned_mrr,failed_payments,trials_started,trials_converted,attributed_cost_usd,margin_usd')
    expect(csv).toContain('"GetFound3, Inc."')
    expect(csv).toContain(',unknown,unknown')
  })

  it('exports unavailable platform revenue as unknown rather than false zeroes', () => {
    const csv = moneySnapshotCsv({ periodKey: '2026-08', products: [{ productId: 'dark', name: 'Dark', currency: 'USD', available: false, mrr: 0, newMrr: 0, churnedMrr: 0, failedPayments: 0, trials: { started: 0, converted: 0 }, attributedCostUsd: 0, marginUsd: 0 }] })
    expect(csv.split('\n')[1]).toContain('USD,unknown,unknown,unknown,unknown,unknown,unknown,0,unknown')
  })
})

describe('Money Console dunning guardrails', () => {
  it('only proposes pause after the configured age and never marks it automatic', () => {
    const candidates = buildDunningCandidates({
      now: '2026-08-23T12:00:00.000Z',
      proposalDays: 7,
      leases: [
        { id: 'lease-old', accountId: 'client-1', accountName: 'Old Client', email: 'old@example.com', stripeSubscriptionStatus: 'past_due', billingStatus: 'payment_failed', paymentFailedAt: '2026-08-14T12:00:00.000Z' },
        { id: 'lease-new', accountId: 'client-2', accountName: 'New Client', email: 'new@example.com', stripeSubscriptionStatus: 'past_due', billingStatus: 'payment_failed', paymentFailedAt: '2026-08-20T12:00:00.000Z' },
      ],
    })

    expect(candidates.find(candidate => candidate.id === 'lease-old')).toMatchObject({ pauseProposed: true, automatic: false, targetId: 'client-1' })
    expect(candidates.find(candidate => candidate.id === 'lease-new')).toMatchObject({ pauseProposed: false, automatic: false })
  })

  it('builds an Orca drafting request that explicitly forbids sending', () => {
    const payload = buildDunningHandoffPayload({ id: 'lease-old', clientName: 'Old Client', email: 'old@example.com', failedAt: '2026-08-14T12:00:00.000Z', productName: 'Command Center' }, { subject: 'Payment issue for {company}', body: 'Hi {contact}, please update payment for {company}.' })

    expect(payload).toMatchObject({ action: 'start', fromAgentId: 'money-console', complexity: 'light', outputFormat: 'email subject and body', wait: 120 })
    expect(payload.task).toMatch(/draft only/i)
    expect(payload.task).toMatch(/never send/i)
    expect(payload.context).toMatch(/Payment issue for Old Client/)
  })
})
