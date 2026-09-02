import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {},
  session: null,
  wallet: {
    tenantId: 'tenant-one',
    accountId: 'account-one',
    availableCredits: 8500,
    reservedCredits: 0,
    spentCredits: 0,
    subscription: { availableCredits: 8500 },
    prepaid: { availableCredits: 0, expiresAt: null },
  },
}))

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  customersCreate: vi.fn(),
  paymentIntentsCreate: vi.fn(),
  sessionsList: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  grantSubscriptionCredits: vi.fn(),
  getCreditWallet: vi.fn(),
  purchasePrepaidCredits: vi.fn(),
  recordCheckoutSessionPayment: vi.fn(),
  stripeKeys: [],
  writeData: vi.fn(),
}))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  writeData: mocks.writeData,
  mutateData: vi.fn((filename, mutator) => {
    const outcome = mutator(structuredClone(state.data[filename] || null))
    state.data[filename] = outcome.data
    return outcome.result
  }),
}))

vi.mock('../lib/credit-wallet', () => ({
  grantSubscriptionCredits: mocks.grantSubscriptionCredits,
  getCreditWallet: mocks.getCreditWallet,
  purchasePrepaidCredits: mocks.purchasePrepaidCredits,
}))

vi.mock('../lib/paymentLedger', () => ({
  recordCheckoutSessionPayment: mocks.recordCheckoutSessionPayment,
}))

vi.mock('stripe', () => ({
  default: class StripeMock {
    constructor(key) {
      mocks.stripeKeys.push(key)
      this.customers = { create: mocks.customersCreate }
      this.paymentIntents = { create: mocks.paymentIntentsCreate }
      this.checkout = { sessions: { list: mocks.sessionsList } }
      this.subscriptions = { retrieve: mocks.subscriptionsRetrieve }
      this.webhooks = { constructEvent: mocks.constructEvent }
    }
  },
}))

import { GET as getWallet } from '../app/api/portal/billing/wallet/route'
import { POST as createTopUpIntent } from '../app/api/portal/billing/top-up-intent/route'
import { POST as handlePaymentWebhook } from '../app/api/stripe/payment-webhook/route'

const session = {
  sessionId: 'portal-session-one',
  email: 'owner@example.com',
  accountId: 'account-one',
  leaseId: 'lease-one',
  tenantId: 'tenant-one',
}

function activeLease(overrides = {}) {
  return {
    id: 'lease-one',
    clientAccountId: 'account-one',
    tenantId: 'tenant-one',
    tierId: 'receptionist',
    plan: 'managed',
    status: 'active',
    stripeCustomerId: 'cus_existing_one',
    stripeSubscriptionId: 'sub_existing_one',
    stripeSubscriptionStatus: 'active',
    billingStatus: 'paid',
    currentPeriodStart: '2026-07-10T12:00:00.000Z',
    currentPeriodEnd: '2026-08-10T12:00:00.000Z',
    paidThrough: '2026-08-10T12:00:00.000Z',
    stripeLifecycleVerifiedAt: '2026-07-10T12:00:05.000Z',
    stripeLastEventId: 'evt_verified_subscription',
    stripeLifecycle: { verified: true, events: [{ id: 'evt_verified_subscription', applied: true }] },
    provisioningStatus: 'ready',
    ...overrides,
  }
}

function jsonRequest(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-16T14:00:00.000Z'))
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_only')
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PK', 'pk_test_mock_only')
  vi.stubEnv('STRIPE_PAYMENT_WEBHOOK_SECRET', 'whsec_mock_only')
  state.session = { ...session }
  state.data = {
    'leases.json': { leases: [activeLease()] },
    'accounts.json': { accounts: [{ id: 'account-one', name: 'Example Company', email: 'owner@example.com' }] },
    'pricing-tiers.json': { tiers: [{ id: 'receptionist', creditAllowance: { includedCredits: 8500 } }] },
  }
  mocks.getCreditWallet.mockReturnValue(state.wallet)
  mocks.grantSubscriptionCredits.mockReturnValue({ ok: true, decision: 'subscription_granted', wallet: state.wallet })
  mocks.customersCreate.mockResolvedValue({ id: 'cus_created_one' })
  mocks.paymentIntentsCreate.mockResolvedValue({
    id: 'pi_topup_one',
    client_secret: 'pi_topup_one_secret_mock',
    status: 'requires_payment_method',
  })
  mocks.purchasePrepaidCredits.mockReturnValue({ ok: true, decision: 'purchased', idempotent: false, wallet: state.wallet })
  mocks.recordCheckoutSessionPayment.mockReturnValue({ ok: true, payment: { id: 'payment-one' } })
  mocks.subscriptionsRetrieve.mockResolvedValue({
    id: 'sub_existing_one',
    customer: 'cus_existing_one',
    status: 'active',
    current_period_start: 1783684800,
    current_period_end: 1786363200,
    metadata: { purpose: 'agent_lease', tierId: 'receptionist' },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  mocks.stripeKeys.length = 0
})

describe('GET /api/portal/billing/wallet', () => {
  it('requires a signed-in portal session', async () => {
    state.session = null
    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    expect(response.status).toBe(401)
    expect(mocks.getCreditWallet).not.toHaveBeenCalled()
  })

  it('requires an exact active tenant/account/lease match', async () => {
    state.data['leases.json'] = { leases: [activeLease({ tenantId: 'tenant-other' })] }
    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    expect(response.status).toBe(403)
    expect(mocks.getCreditWallet).not.toHaveBeenCalled()
  })

  it('idempotently grants the plan allowance before returning the wallet and packs', async () => {
    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-one',
      accountId: 'account-one',
      leaseId: 'lease-one',
      planId: 'receptionist',
      credits: 8500,
      periodId: 'stripe:sub_existing_one:2026-07-10T12:00:00.000Z',
      startsAt: '2026-07-10T12:00:00.000Z',
      endsAt: '2026-08-10T12:00:00.000Z',
      idempotencyKey: 'subscription:sub_existing_one:2026-07-10T12:00:00.000Z',
      source: 'plan_allowance',
    }))
    expect(mocks.getCreditWallet).toHaveBeenCalledWith({ tenantId: 'tenant-one', accountId: 'account-one' })
    expect(body).toMatchObject({
      ok: true,
      wallet: state.wallet,
    })
    expect(body.packs).toHaveLength(4)
    expect(body.packs[0]).toMatchObject({ id: 'credits-2500', credits: 2500, amountCents: 2500 })
  })

  it('allows a complimentary lease to view and purchase prepaid credits without a plan grant', async () => {
    state.data['leases.json'] = { leases: [activeLease({
      tierId: 'complimentary',
      plan: 'complimentary',
      stripeCustomerId: undefined,
      stripeSubscriptionId: undefined,
      stripeSubscriptionStatus: undefined,
      billingStatus: undefined,
      currentPeriodStart: undefined,
      currentPeriodEnd: undefined,
      stripeLifecycleVerifiedAt: undefined,
    })] }
    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).not.toHaveBeenCalled()
    expect(mocks.getCreditWallet).toHaveBeenCalled()
  })

  it('fails closed on plan credits for a legacy paid lease without verified Stripe billing evidence', async () => {
    state.data['leases.json'] = { leases: [activeLease({
      stripeSubscriptionId: undefined,
      stripeSubscriptionStatus: undefined,
      billingStatus: undefined,
      currentPeriodStart: undefined,
      currentPeriodEnd: undefined,
      stripeLifecycleVerifiedAt: undefined,
    })] }

    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).not.toHaveBeenCalled()
    expect(mocks.getCreditWallet).toHaveBeenCalled()
    expect(body).toMatchObject({
      ok: true,
      subscriptionAllowance: {
        eligible: false,
        code: 'stripe_subscription_unverified',
      },
    })
  })

  it('fails closed on plan credits after a payment failure while preserving prepaid wallet access', async () => {
    state.data['leases.json'] = { leases: [activeLease({
      stripeSubscriptionStatus: 'past_due',
      billingStatus: 'payment_failed',
    })] }

    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).not.toHaveBeenCalled()
    expect(mocks.getCreditWallet).toHaveBeenCalled()
    expect(body.subscriptionAllowance).toMatchObject({
      eligible: false,
      code: 'stripe_subscription_inactive',
    })
  })

  it('fails closed when the verified Stripe billing period has expired', async () => {
    state.data['leases.json'] = { leases: [activeLease({
      currentPeriodStart: '2026-06-10T12:00:00.000Z',
      currentPeriodEnd: '2026-07-10T12:00:00.000Z',
    })] }

    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).not.toHaveBeenCalled()
    expect(body.subscriptionAllowance).toMatchObject({
      eligible: false,
      code: 'stripe_billing_period_inactive',
    })
  })

  it('fails closed when active status lacks paid evidence through the current period', async () => {
    state.data['leases.json'] = { leases: [activeLease({
      paidThrough: '2026-07-20T12:00:00.000Z',
    })] }

    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).not.toHaveBeenCalled()
    expect(body.subscriptionAllowance).toMatchObject({
      eligible: false,
      code: 'stripe_payment_not_verified',
    })
  })

  it('grants the billing-period allowance for a rigorously verified current Stripe trial', async () => {
    state.data['leases.json'] = { leases: [activeLease({
      stripeSubscriptionStatus: 'trialing',
      billingStatus: 'trialing',
      paidThrough: undefined,
      stripeTrialStart: '2026-07-10T12:00:00.000Z',
      stripeTrialEnd: '2026-08-10T12:00:00.000Z',
      stripeCollectionMethod: 'charge_automatically',
    })] }

    const response = await getWallet(new Request('https://openocti.local/api/portal/billing/wallet'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.grantSubscriptionCredits).toHaveBeenCalledWith(expect.objectContaining({
      leaseId: 'lease-one',
      startsAt: '2026-07-10T12:00:00.000Z',
      endsAt: '2026-08-10T12:00:00.000Z',
    }))
    expect(body.subscriptionAllowance).toMatchObject({
      eligible: true,
      code: 'stripe_trial_verified',
    })
  })
})

describe('POST /api/portal/billing/top-up-intent', () => {
  it('rejects client-defined payment values before contacting Stripe', async () => {
    const response = await createTopUpIntent(jsonRequest(
      'https://openocti.local/api/portal/billing/top-up-intent',
      { packId: 'credits-2500', requestId: 'request_12345678', amount: 1 },
    ))
    expect(response.status).toBe(400)
    expect(mocks.customersCreate).not.toHaveBeenCalled()
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled()
  })

  it('creates and persists a linked Stripe customer, then returns an embedded PaymentIntent', async () => {
    state.data['leases.json'] = { leases: [activeLease({ stripeCustomerId: undefined })] }
    const response = await createTopUpIntent(jsonRequest(
      'https://openocti.local/api/portal/billing/top-up-intent',
      { packId: 'credits-5000', requestId: 'request_12345678' },
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.customersCreate).toHaveBeenCalledWith({
      email: 'owner@example.com',
      name: 'Example Company',
      metadata: {
        source: 'farrington_portal',
        tenantId: 'tenant-one',
        accountId: 'account-one',
        leaseId: 'lease-one',
      },
    }, expect.objectContaining({ idempotencyKey: expect.stringMatching(/^fcc_portal_customer_/) }))
    expect(mocks.writeData).toHaveBeenCalledWith('leases.json', expect.objectContaining({
      leases: [expect.objectContaining({ id: 'lease-one', stripeCustomerId: 'cus_created_one' })],
    }))
    expect(mocks.paymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5000,
      currency: 'usd',
      customer: 'cus_created_one',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: expect.objectContaining({
        purpose: 'credit_topup',
        credits: '5000',
        tenantId: 'tenant-one',
        accountId: 'account-one',
        leaseId: 'lease-one',
      }),
    }), expect.objectContaining({ idempotencyKey: expect.stringMatching(/^fcc_credit_topup_/) }))
    expect(body).toMatchObject({
      ok: true,
      clientSecret: 'pi_topup_one_secret_mock',
      paymentIntentId: 'pi_topup_one',
      publishableKey: 'pk_test_mock_only',
      pack: { id: 'credits-5000', credits: 5000, amountCents: 5000, currency: 'usd' },
    })
    expect(body.redirectUrl).toBeUndefined()
  })

  it('reuses the lease Stripe customer and never accepts a mismatched active lease', async () => {
    state.data['leases.json'] = { leases: [activeLease({ stripeCustomerId: 'cus_existing_one' })] }
    const accepted = await createTopUpIntent(jsonRequest(
      'https://openocti.local/api/portal/billing/top-up-intent',
      { packId: 'credits-2500', requestId: 'request_12345678' },
    ))
    expect(accepted.status).toBe(200)
    expect(mocks.customersCreate).not.toHaveBeenCalled()
    expect(mocks.paymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing_one' }), expect.any(Object))

    vi.clearAllMocks()
    state.data['leases.json'] = { leases: [activeLease({ clientAccountId: 'account-other' })] }
    const denied = await createTopUpIntent(jsonRequest(
      'https://openocti.local/api/portal/billing/top-up-intent',
      { packId: 'credits-2500', requestId: 'request_87654321' },
    ))
    expect(denied.status).toBe(403)
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/stripe/payment-webhook credit top-ups', () => {
  function topUpIntent(overrides = {}) {
    return {
      id: 'pi_topup_one',
      status: 'succeeded',
      amount: 2500,
      amount_received: 2500,
      currency: 'usd',
      customer: 'cus_existing_one',
      metadata: {
        purpose: 'credit_topup',
        packId: 'credits-2500',
        credits: '2500',
        tenantId: 'tenant-one',
        accountId: 'account-one',
        leaseId: 'lease-one',
        requestId: 'request_12345678',
      },
      ...overrides,
    }
  }

  function signedWebhookRequest() {
    return new Request('https://openocti.local/api/stripe/payment-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_mock_only' },
      body: 'signed-payload',
    })
  }

  it('verifies the signature and idempotently grants validated purchased credits', async () => {
    state.data['leases.json'] = { leases: [activeLease({ stripeCustomerId: 'cus_existing_one' })] }
    mocks.constructEvent.mockReturnValue({ type: 'payment_intent.succeeded', data: { object: topUpIntent() } })

    const response = await handlePaymentWebhook(signedWebhookRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.constructEvent).toHaveBeenCalledWith('signed-payload', 'sig_mock_only', 'whsec_mock_only')
    expect(mocks.purchasePrepaidCredits).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-one',
      accountId: 'account-one',
      leaseId: 'lease-one',
      credits: 2500,
      amountCents: 2500,
      currency: 'usd',
      packId: 'credits-2500',
      stripePaymentIntentId: 'pi_topup_one',
      stripeRequestId: 'request_12345678',
      idempotencyKey: 'stripe:payment_intent:pi_topup_one',
    }))
    expect(body).toMatchObject({ ok: true, event: 'payment_intent.succeeded', credited: true })
  })

  it('does not grant credits when any paid value or ownership field is inconsistent', async () => {
    state.data['leases.json'] = { leases: [activeLease({ stripeCustomerId: 'cus_existing_one' })] }
    mocks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: topUpIntent({ amount_received: 1 }) },
    })

    const response = await handlePaymentWebhook(signedWebhookRequest())
    expect(response.status).toBe(400)
    expect(mocks.purchasePrepaidCredits).not.toHaveBeenCalled()
  })

  it('preserves the existing checkout-session behavior for ordinary PaymentIntents', async () => {
    const ordinaryIntent = { id: 'pi_ordinary', status: 'succeeded', metadata: {} }
    const checkoutSession = { id: 'cs_existing', payment_intent: 'pi_ordinary', payment_status: 'paid' }
    mocks.constructEvent.mockReturnValue({ type: 'payment_intent.succeeded', data: { object: ordinaryIntent } })
    mocks.sessionsList.mockResolvedValue({ data: [checkoutSession] })

    const response = await handlePaymentWebhook(signedWebhookRequest())
    expect(response.status).toBe(200)
    expect(mocks.sessionsList).toHaveBeenCalledWith({ payment_intent: 'pi_ordinary', limit: 1 })
    expect(mocks.recordCheckoutSessionPayment).toHaveBeenCalledWith(checkoutSession, { source: 'stripe_payment_intent_webhook' })
    expect(mocks.purchasePrepaidCredits).not.toHaveBeenCalled()
  })

  it('routes a purpose-marked agent lease checkout to lifecycle handling after signature verification', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_agent_checkout_existing',
      type: 'checkout.session.completed',
      created: 1784206800,
      data: {
        object: {
          id: 'cs_agent_existing',
          mode: 'subscription',
          status: 'complete',
          payment_status: 'paid',
          customer: 'cus_existing_one',
          subscription: 'sub_existing_one',
          customer_email: 'owner@example.com',
          metadata: { purpose: 'agent_lease', tierId: 'receptionist', tierName: 'Receptionist' },
        },
      },
    })

    const response = await handlePaymentWebhook(signedWebhookRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.constructEvent).toHaveBeenCalledWith('signed-payload', 'sig_mock_only', 'whsec_mock_only')
    expect(mocks.recordCheckoutSessionPayment).not.toHaveBeenCalled()
    expect(body).toMatchObject({
      ok: true,
      event: 'checkout.session.completed',
      lifecycle: { handled: true, matched: true },
    })
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeSessionId: 'cs_agent_existing',
      stripeLastEventId: 'evt_agent_checkout_existing',
      billingStatus: 'paid',
    })
  })

  it('keeps generic product checkout completion on the payment ledger path', async () => {
    const session = {
      id: 'cs_product_order',
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      metadata: { orderId: 'order-one' },
    }
    mocks.constructEvent.mockReturnValue({
      id: 'evt_product_checkout',
      type: 'checkout.session.completed',
      created: 1784206800,
      data: { object: session },
    })

    const response = await handlePaymentWebhook(signedWebhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.recordCheckoutSessionPayment).toHaveBeenCalledWith(session, { source: 'stripe_payment_webhook' })
    expect(state.data['leases.json'].leases[0].stripeLastEventId).toBe('evt_verified_subscription')
  })

  it('routes a paid async checkout success to the payment ledger', async () => {
    const session = {
      id: 'cs_product_async',
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      metadata: { orderId: 'order-async' },
    }
    mocks.constructEvent.mockReturnValue({
      id: 'evt_product_async',
      type: 'checkout.session.async_payment_succeeded',
      created: 1784206800,
      data: { object: session },
    })

    const response = await handlePaymentWebhook(signedWebhookRequest())

    expect(response.status).toBe(200)
    expect(mocks.recordCheckoutSessionPayment).toHaveBeenCalledWith(session, { source: 'stripe_payment_webhook' })
  })

  it('applies signed invoice payment evidence and the Stripe paid-through date', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_invoice_paid_route',
      type: 'invoice.paid',
      created: 1784206800,
      data: {
        object: {
          id: 'in_route_one',
          customer: 'cus_existing_one',
          subscription: 'sub_existing_one',
          period_start: 1783684800,
          period_end: 1786363200,
        },
      },
    })

    const response = await handlePaymentWebhook(signedWebhookRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lifecycle).toMatchObject({ handled: true, matched: true })
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      billingStatus: 'paid',
      paidThrough: '2026-08-10T12:00:00.000Z',
      stripeLastEventId: 'evt_invoice_paid_route',
    })
  })
})
