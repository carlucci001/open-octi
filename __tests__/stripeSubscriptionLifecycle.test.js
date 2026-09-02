import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  mutateData: vi.fn((filename, mutator) => {
    const outcome = mutator(structuredClone(state.data[filename] || null))
    state.data[filename] = outcome.data
    return outcome.result
  }),
}))

import {
  AGENT_LEASE_CHECKOUT_PURPOSE,
  EXISTING_LEASE_SUBSCRIPTION_PURPOSE,
  bindExistingLeaseSubscriptionCheckoutSession,
  processStripeSubscriptionLifecycleEvent,
  reserveExistingLeaseSubscriptionCheckout,
} from '../lib/stripe-subscription-lifecycle'

function lease(overrides = {}) {
  return {
    id: 'lease-one',
    agentId: 'receptionist-acme',
    clientAccountId: 'account-one',
    tenantId: 'tenant-one',
    tierId: 'receptionist',
    tierName: 'Receptionist',
    plan: 'managed',
    status: 'active',
    stripeCustomerId: 'cus_one',
    stripeSubscriptionId: 'sub_one',
    ...overrides,
  }
}

function subscription(overrides = {}) {
  return {
    id: 'sub_one',
    customer: 'cus_one',
    status: 'active',
    current_period_start: 1783684800,
    current_period_end: 1786363200,
    trial_start: 1783684800,
    trial_end: 1786363200,
    collection_method: 'charge_automatically',
    metadata: {
      purpose: AGENT_LEASE_CHECKOUT_PURPOSE,
      tierId: 'receptionist',
    },
    ...overrides,
  }
}

function stripeClient(sub = subscription()) {
  return {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(sub),
    },
  }
}

const existingCheckoutIdentity = {
  leaseId: 'lease-one',
  accountId: 'account-one',
  tenantId: 'tenant-one',
  tierId: 'receptionist',
  planHash: 'plan_hash_one',
  requestId: 'request_existing_one',
  checkoutNonce: 'nonce_existing_lease_subscription_1234567890',
}

function reserveExistingCheckout(overrides = {}) {
  const input = { ...existingCheckoutIdentity, ...overrides }
  const reserved = reserveExistingLeaseSubscriptionCheckout(input)
  expect(reserved).toMatchObject({ ok: true, leaseId: input.leaseId })
  return input
}

function existingCheckoutSubscription(overrides = {}) {
  const identity = { ...existingCheckoutIdentity, ...(overrides.identity || {}) }
  const { identity: _ignored, ...subscriptionOverrides } = overrides
  return subscription({
    metadata: {
      purpose: EXISTING_LEASE_SUBSCRIPTION_PURPOSE,
      leaseId: identity.leaseId,
      accountId: identity.accountId,
      tenantId: identity.tenantId,
      tierId: identity.tierId,
      planHash: identity.planHash,
      requestId: identity.requestId,
      checkoutNonce: identity.checkoutNonce,
    },
    ...subscriptionOverrides,
  })
}

function existingCheckoutEvent(overrides = {}) {
  const identity = { ...existingCheckoutIdentity, ...(overrides.identity || {}) }
  const { identity: _ignored, ...sessionOverrides } = overrides
  return {
    id: 'evt_existing_lease_checkout',
    type: 'checkout.session.completed',
    created: 610,
    data: {
      object: {
        id: 'cs_existing_lease',
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        customer: 'cus_one',
        subscription: 'sub_one',
        metadata: {
          purpose: EXISTING_LEASE_SUBSCRIPTION_PURPOSE,
          leaseId: identity.leaseId,
          accountId: identity.accountId,
          tenantId: identity.tenantId,
          tierId: identity.tierId,
          planHash: identity.planHash,
          requestId: identity.requestId,
          checkoutNonce: identity.checkoutNonce,
        },
        ...sessionOverrides,
      },
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-16T14:00:00.000Z'))
  state.data = {
    'leases.json': { leases: [lease()] },
    'accounts.json': { accounts: [{ id: 'account-one', name: 'Acme', email: 'owner@example.com' }] },
    'agents.json': { agents: { 'receptionist-acme': { id: 'receptionist-acme', name: 'Receptionist for Acme' } } },
    'pricing-tiers.json': {
      tiers: [{ id: 'receptionist', name: 'Receptionist', monthlyFee: 99, agents: ['receptionist'] }],
    },
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Stripe subscription lifecycle evidence', () => {
  it('applies an invoice paid period once and records replay-safe audit evidence', async () => {
    const event = {
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      created: 1784206800,
      data: {
        object: {
          id: 'in_one',
          customer: 'cus_one',
          subscription: 'sub_one',
          period_start: 1783684800,
          period_end: 1786363200,
        },
      },
    }

    const first = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient() })
    const replay = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient() })
    const saved = state.data['leases.json'].leases[0]

    expect(first).toMatchObject({ handled: true, matched: true, idempotent: false })
    expect(replay).toMatchObject({ handled: true, matched: true, idempotent: true })
    expect(saved).toMatchObject({
      stripeCustomerId: 'cus_one',
      stripeSubscriptionId: 'sub_one',
      stripeSubscriptionStatus: 'active',
      billingStatus: 'paid',
      currentPeriodStart: '2026-07-10T12:00:00.000Z',
      currentPeriodEnd: '2026-08-10T12:00:00.000Z',
      paidThrough: '2026-08-10T12:00:00.000Z',
      stripeLifecycleVerifiedAt: '2026-07-16T14:00:00.000Z',
      stripeLastEventId: 'evt_invoice_paid',
    })
    expect(saved.stripeLifecycle.events).toEqual([
      expect.objectContaining({ id: 'evt_invoice_paid', type: 'invoice.paid', applied: true }),
    ])
  })

  it('does not let an older paid event overwrite newer payment-failure evidence', async () => {
    const stripe = stripeClient(subscription({ status: 'past_due' }))
    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_failed_newer',
      type: 'invoice.payment_failed',
      created: 200,
      data: { object: { id: 'in_failed', customer: 'cus_one', subscription: 'sub_one', period_start: 1783684800, period_end: 1786363200 } },
    }, { stripe })

    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_paid_older',
      type: 'invoice.paid',
      created: 100,
      data: { object: { id: 'in_old', customer: 'cus_one', subscription: 'sub_one', period_start: 1783684800, period_end: 1786363200 } },
    }, { stripe: stripeClient() })

    const saved = state.data['leases.json'].leases[0]
    expect(saved.billingStatus).toBe('payment_failed')
    expect(saved.paidThrough).toBe('2026-07-10T12:00:00.000Z')
    expect(saved.failedPeriodEnd).toBe('2026-08-10T12:00:00.000Z')
    expect(saved.stripeLastEventId).toBe('evt_failed_newer')
    expect(saved.stripeLifecycle.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'evt_paid_older', applied: false, reason: 'stale_event' }),
    ]))
  })

  it('tracks subscription updates and deletion without changing the operational lease status', async () => {
    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_sub_created',
      type: 'customer.subscription.created',
      created: 250,
      data: { object: subscription() },
    }, { stripe: stripeClient() })

    expect(state.data['leases.json'].leases[0]).toMatchObject({
      status: 'active',
      stripeSubscriptionStatus: 'active',
      billingStatus: 'pending_payment',
      stripeLastEventId: 'evt_sub_created',
    })

    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_sub_update',
      type: 'customer.subscription.updated',
      created: 300,
      data: { object: subscription({ status: 'trialing' }) },
    }, { stripe: stripeClient() })

    expect(state.data['leases.json'].leases[0]).toMatchObject({
      status: 'active',
      stripeSubscriptionStatus: 'trialing',
      billingStatus: 'trialing',
    })

    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_sub_deleted',
      type: 'customer.subscription.deleted',
      created: 400,
      data: { object: subscription({ status: 'canceled' }) },
    }, { stripe: stripeClient() })

    expect(state.data['leases.json'].leases[0]).toMatchObject({
      status: 'active',
      stripeSubscriptionStatus: 'canceled',
      billingStatus: 'canceled',
    })
  })

  it('preserves payment failure until a later invoice.paid event verifies recovery', async () => {
    state.data['leases.json'] = { leases: [lease({
      stripeSubscriptionStatus: 'past_due',
      billingStatus: 'payment_failed',
      currentPeriodStart: '2026-07-10T12:00:00.000Z',
      currentPeriodEnd: '2026-08-10T12:00:00.000Z',
      paymentFailedAt: '2026-07-16T13:00:00.000Z',
    })] }

    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_active_after_failure',
      type: 'customer.subscription.updated',
      created: 450,
      data: { object: subscription({ status: 'active' }) },
    }, { stripe: stripeClient() })

    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeSubscriptionStatus: 'active',
      billingStatus: 'payment_failed',
      paymentFailedAt: '2026-07-16T13:00:00.000Z',
    })

    await processStripeSubscriptionLifecycleEvent({
      id: 'evt_paid_after_failure',
      type: 'invoice.paid',
      created: 460,
      data: {
        object: {
          id: 'in_recovered',
          customer: 'cus_one',
          subscription: 'sub_one',
          period_start: 1783684800,
          period_end: 1786363200,
        },
      },
    }, { stripe: stripeClient() })

    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeSubscriptionStatus: 'active',
      billingStatus: 'paid',
      paidThrough: '2026-08-10T12:00:00.000Z',
      paymentFailedAt: null,
    })
  })

  it('ignores generic checkout sessions instead of treating product orders as leases', async () => {
    const result = await processStripeSubscriptionLifecycleEvent({
      id: 'evt_generic_checkout',
      type: 'checkout.session.completed',
      created: 500,
      data: {
        object: {
          id: 'cs_generic',
          mode: 'payment',
          payment_status: 'paid',
          metadata: { orderId: 'order-one' },
        },
      },
    }, { stripe: stripeClient() })

    expect(result).toEqual({ handled: false })
    expect(state.data['leases.json'].leases).toEqual([lease()])
  })

  it('acknowledges an unmatched subscription event without creating a lease', async () => {
    state.data['leases.json'] = { leases: [] }

    const result = await processStripeSubscriptionLifecycleEvent({
      id: 'evt_unmatched_subscription',
      type: 'customer.subscription.created',
      created: 550,
      data: { object: subscription() },
    }, { stripe: stripeClient() })

    expect(result).toEqual({ handled: true, matched: false, ignored: true })
    expect(state.data['leases.json'].leases).toEqual([])
  })

  it('attaches a paid existing-lease subscription exactly once without account, lease, agent, or Twilio provisioning', async () => {
    state.data['leases.json'] = { leases: [lease({ stripeCustomerId: undefined, stripeSubscriptionId: undefined })] }
    const identity = reserveExistingCheckout()
    expect(bindExistingLeaseSubscriptionCheckoutSession({
      leaseId: identity.leaseId,
      requestId: identity.requestId,
      checkoutNonce: identity.checkoutNonce,
      sessionId: 'cs_existing_lease',
    })).toMatchObject({ ok: true })
    const beforeAccounts = structuredClone(state.data['accounts.json'])
    const beforeAgents = structuredClone(state.data['agents.json'])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const event = existingCheckoutEvent()
    const stripe = stripeClient(existingCheckoutSubscription())

    const first = await processStripeSubscriptionLifecycleEvent(event, { stripe })
    const replay = await processStripeSubscriptionLifecycleEvent(event, { stripe })
    const saved = state.data['leases.json'].leases[0]

    expect(first).toMatchObject({
      handled: true,
      matched: true,
      existingLease: true,
      provisioned: false,
      idempotent: false,
    })
    expect(replay).toMatchObject({ handled: true, matched: true, idempotent: true })
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(saved).toMatchObject({
      id: 'lease-one',
      clientAccountId: 'account-one',
      tenantId: 'tenant-one',
      stripeCustomerId: 'cus_one',
      stripeSubscriptionId: 'sub_one',
      billingStatus: 'paid',
      paidThrough: '2026-08-10T12:00:00.000Z',
      pendingStripeSubscriptionCheckout: null,
    })
    expect(state.data['accounts.json']).toEqual(beforeAccounts)
    expect(state.data['agents.json']).toEqual(beforeAgents)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the pending existing-lease checkout untouched until paid or rigorously trialing', async () => {
    state.data['leases.json'] = { leases: [lease({ stripeCustomerId: undefined, stripeSubscriptionId: undefined })] }
    reserveExistingCheckout()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await processStripeSubscriptionLifecycleEvent(
      existingCheckoutEvent({ payment_status: 'unpaid' }),
      { stripe: stripeClient(existingCheckoutSubscription()) },
    )

    expect(result).toMatchObject({ handled: true, matched: false, ignored: true, reason: 'payment_not_confirmed' })
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeSubscriptionId: undefined,
      pendingStripeSubscriptionCheckout: expect.objectContaining({ requestId: 'request_existing_one' }),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['nonce', { identity: { checkoutNonce: 'wrong_nonce_123456789012345678901234567890' } }],
    ['account', { identity: { accountId: 'account-other' } }],
    ['tenant', { identity: { tenantId: 'tenant-other' } }],
  ])('rejects existing-lease checkout with a mismatched %s binding', async (_field, overrides) => {
    state.data['leases.json'] = { leases: [lease({ stripeCustomerId: undefined, stripeSubscriptionId: undefined })] }
    reserveExistingCheckout()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const event = existingCheckoutEvent(overrides)
    const sub = existingCheckoutSubscription(overrides)

    const result = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient(sub) })

    expect(result).toMatchObject({ handled: true, matched: false, ignored: true })
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(state.data['leases.json'].leases[0].stripeSubscriptionId).toBeUndefined()
    expect(state.data['leases.json'].leases[0].pendingStripeSubscriptionCheckout).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a different Stripe customer when the existing lease is already customer-bound', async () => {
    state.data['leases.json'] = { leases: [lease({ stripeSubscriptionId: undefined })] }
    reserveExistingCheckout()
    const event = existingCheckoutEvent({ customer: 'cus_other' })
    const sub = existingCheckoutSubscription({ customer: 'cus_other' })

    const result = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient(sub) })

    expect(result).toMatchObject({ handled: true, matched: false, ignored: true })
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeCustomerId: 'cus_one',
      stripeSubscriptionId: undefined,
    })
  })

  it('supports a rigorously verified existing-lease trial without provisioning', async () => {
    state.data['leases.json'] = { leases: [lease({ stripeCustomerId: undefined, stripeSubscriptionId: undefined })] }
    reserveExistingCheckout()
    const trial = existingCheckoutSubscription({ status: 'trialing' })
    const event = existingCheckoutEvent({ payment_status: 'no_payment_required' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient(trial) })

    expect(result).toMatchObject({ handled: true, matched: true, existingLease: true, provisioned: false })
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeSubscriptionId: 'sub_one',
      stripeSubscriptionStatus: 'trialing',
      billingStatus: 'trialing',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to reserve initial billing checkout for a lease with an existing subscription', () => {
    expect(reserveExistingLeaseSubscriptionCheckout(existingCheckoutIdentity)).toMatchObject({
      ok: false,
      code: 'subscription_exists',
    })
    expect(state.data['leases.json'].leases[0].pendingStripeSubscriptionCheckout).toBeUndefined()
  })

  it.each([
    ['checkout.session.completed', 'unpaid'],
    ['checkout.session.async_payment_succeeded', 'unpaid'],
  ])('does not create or provision a lease for %s with payment_status=%s', async (eventType, paymentStatus) => {
    state.data['leases.json'] = { leases: [] }
    state.data['accounts.json'] = { accounts: [] }
    state.data['agents.json'] = { agents: {} }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await processStripeSubscriptionLifecycleEvent({
      id: `evt_unpaid_${eventType}`,
      type: eventType,
      created: 575,
      data: {
        object: {
          id: 'cs_unpaid_agent',
          mode: 'subscription',
          status: 'complete',
          payment_status: paymentStatus,
          customer: 'cus_one',
          subscription: 'sub_one',
          customer_email: 'owner@example.com',
          metadata: {
            purpose: AGENT_LEASE_CHECKOUT_PURPOSE,
            tierId: 'receptionist',
            tierName: 'Receptionist',
          },
        },
      },
    }, { stripe: stripeClient() })

    expect(result).toEqual({
      handled: true,
      matched: false,
      ignored: true,
      reason: 'payment_not_confirmed',
    })
    expect(state.data['accounts.json'].accounts).toEqual([])
    expect(state.data['leases.json'].leases).toEqual([])
    expect(state.data['agents.json'].agents).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects no-payment-required checkout unless Stripe proves a current automatic-charge trial', async () => {
    state.data['leases.json'] = { leases: [] }
    state.data['accounts.json'] = { accounts: [] }
    state.data['agents.json'] = { agents: {} }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await processStripeSubscriptionLifecycleEvent({
      id: 'evt_invalid_trial_checkout',
      type: 'checkout.session.completed',
      created: 580,
      data: {
        object: {
          id: 'cs_invalid_trial',
          mode: 'subscription',
          status: 'complete',
          payment_status: 'no_payment_required',
          customer: 'cus_one',
          subscription: 'sub_one',
          customer_email: 'owner@example.com',
          metadata: { purpose: AGENT_LEASE_CHECKOUT_PURPOSE, tierId: 'receptionist' },
        },
      },
    }, { stripe: stripeClient(subscription({ trial_end: 1 })) })

    expect(result).toMatchObject({ handled: true, matched: false, ignored: true, reason: 'payment_not_confirmed' })
    expect(state.data['accounts.json'].accounts).toEqual([])
    expect(state.data['leases.json'].leases).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows a rigorously verified current Stripe trial to provision once', async () => {
    state.data['leases.json'] = { leases: [] }
    state.data['accounts.json'] = { accounts: [] }
    state.data['agents.json'] = { agents: {} }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const trialSubscription = subscription({ status: 'trialing' })
    const result = await processStripeSubscriptionLifecycleEvent({
      id: 'evt_valid_trial_checkout',
      type: 'checkout.session.completed',
      created: 590,
      data: {
        object: {
          id: 'cs_valid_trial',
          mode: 'subscription',
          status: 'complete',
          payment_status: 'no_payment_required',
          customer: 'cus_one',
          subscription: 'sub_one',
          customer_email: 'owner@example.com',
          customer_details: { name: 'Acme' },
          metadata: {
            purpose: AGENT_LEASE_CHECKOUT_PURPOSE,
            tierId: 'receptionist',
            tierName: 'Receptionist',
            customer_company: 'Acme',
          },
        },
      },
    }, { stripe: stripeClient(trialSubscription) })

    expect(result).toMatchObject({ handled: true, matched: true, provisioned: true })
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      billingStatus: 'trialing',
      stripeSubscriptionStatus: 'trialing',
      stripeTrialStart: '2026-07-10T12:00:00.000Z',
      stripeTrialEnd: '2026-08-10T12:00:00.000Z',
      stripeCollectionMethod: 'charge_automatically',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('handles an agent lease checkout once and resumes safely on webhook replay', async () => {
    state.data['leases.json'] = { leases: [] }
    state.data['accounts.json'] = { accounts: [] }
    state.data['agents.json'] = { agents: {} }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const event = {
      id: 'evt_agent_checkout',
      type: 'checkout.session.completed',
      created: 600,
      data: {
        object: {
          id: 'cs_agent_one',
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          customer: 'cus_one',
          subscription: 'sub_one',
          amount_total: 9900,
          customer_email: 'owner@example.com',
          customer_details: { name: 'Acme' },
          metadata: {
            purpose: AGENT_LEASE_CHECKOUT_PURPOSE,
            tierId: 'receptionist',
            tierName: 'Receptionist',
            customer_company: 'Acme',
          },
        },
      },
    }

    const first = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient() })
    const replay = await processStripeSubscriptionLifecycleEvent(event, { stripe: stripeClient() })

    expect(first).toMatchObject({ handled: true, matched: true, provisioned: true })
    expect(replay).toMatchObject({ handled: true, matched: true, idempotent: true })
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      tierId: 'receptionist',
      stripeSessionId: 'cs_agent_one',
      stripeCustomerId: 'cus_one',
      stripeSubscriptionId: 'sub_one',
      billingStatus: 'paid',
      provisioningStatus: 'ready',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
