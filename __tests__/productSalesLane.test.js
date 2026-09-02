import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ leads: [], tasks: [] }))

vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(type => state[type] || []),
  create: vi.fn((type, record) => {
    const item = { id: `${type}-one`, ...record }
    state[type].unshift(item)
    return item
  }),
}))

import { ensurePaidProductOnboardingTask, recordProductTermsRequest } from '../lib/productSalesLane'

function order(overrides = {}) {
  return {
    id: 'cc-order-one',
    status: 'paid',
    product: 'farrington-command-center',
    productName: 'Farrington Command Center',
    packageId: 'platform',
    packageName: 'Command Center Platform',
    setupPrice: 125000,
    setupPriceHigh: 125000,
    amountPaid: 125000,
    paidAt: '2026-07-16T20:00:00.000Z',
    stripeSessionId: 'cs_paid_one',
    stripePaymentIntentId: 'pi_paid_one',
    paymentOption: 'stripe-financing',
    paymentOptionLabel: 'Request business financing',
    buyer: { name: 'Buyer One', company: 'Buyer Company', email: 'buyer@example.com', phone: '555-0100' },
    ...overrides,
  }
}

beforeEach(() => {
  state.leads = []
  state.tasks = []
})

describe('high-ticket sales lane records', () => {
  it('creates one internal financing lead without claiming an external submission', () => {
    const first = recordProductTermsRequest(order({ status: 'financing_requested' }))
    const replay = recordProductTermsRequest(order({ id: 'cc-order-two', status: 'financing_requested' }))

    expect(first.id).toBe(replay.id)
    expect(state.leads).toHaveLength(1)
    expect(first).toMatchObject({
      source: 'business-financing',
      status: 'new',
      dueToday: 0,
      salesRequest: { submittedExternally: false, approvalStatus: 'not_submitted' },
    })
    expect(first.notes).toContain('No lender application was submitted')
  })

  it('queues one onboarding task only for a Stripe-paid order', () => {
    expect(ensurePaidProductOnboardingTask(order({ status: 'checkout_started' }))).toBeNull()

    const first = ensurePaidProductOnboardingTask(order())
    const replay = ensurePaidProductOnboardingTask(order())

    expect(first.id).toBe(replay.id)
    expect(state.tasks).toHaveLength(1)
    expect(first).toMatchObject({
      status: 'todo',
      priority: 'high',
      source: 'paid-product-order',
      sourceRef: 'cc-order-one',
    })
    expect(first.description).toContain('does not activate or provision services automatically')
  })
})
