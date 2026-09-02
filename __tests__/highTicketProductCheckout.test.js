import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))
const mocks = vi.hoisted(() => ({
  ensurePaidProductOnboardingTask: vi.fn(),
  recordProductTermsRequest: vi.fn(),
  pushNotification: vi.fn(),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = structuredClone(value)
  }),
}))

vi.mock('../lib/notifications', () => ({ pushNotification: mocks.pushNotification }))
vi.mock('../lib/productSalesLane', () => ({
  ensurePaidProductOnboardingTask: mocks.ensurePaidProductOnboardingTask,
  recordProductTermsRequest: mocks.recordProductTermsRequest,
}))

import { createProductCheckoutSession, markProductOrderPaid } from '../lib/productCheckout'

const buyer = { name: 'Buyer One', company: 'Buyer Company', email: 'buyer@example.com', phone: '555-0100' }

function stripeResponse() {
  return {
    ok: true,
    json: async () => ({ id: 'cs_high_ticket', client_secret: 'cs_secret_high_ticket' }),
  }
}

function checkoutBody(paymentOption, extra = {}) {
  return {
    productId: 'farrington-command-center',
    packageId: 'platform',
    paymentOption,
    buyer,
    ...extra,
  }
}

beforeEach(() => {
  state.data = {
    'credentials.json': {
      credentials: [{ name: 'Stripe', fields: [{ label: 'Secret (P)', value: 'stripe-key-for-unit-test' }] }],
    },
    'product-orders.json': { orders: [] },
  }
  mocks.ensurePaidProductOnboardingTask.mockReset()
  mocks.recordProductTermsRequest.mockReset().mockReturnValue({ id: 'lead-finance-one' })
  mocks.pushNotification.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => stripeResponse()))
})

describe('high-ticket Command Center checkout', () => {
  it('creates an embedded Stripe session for the server-owned $125,000 full price', async () => {
    const result = await createProductCheckoutSession({
      body: checkoutBody('stripe-full-payment'),
      origin: 'https://farringtondevelopment.com',
    })

    expect(result).toMatchObject({ ok: true, checkoutAmount: 125000, clientSecret: 'cs_secret_high_ticket' })
    const params = new URLSearchParams(fetch.mock.calls[0][1].body)
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('12500000')
    expect(params.get('metadata[paymentOption]')).toBe('stripe-full-payment')
    expect(state.data['product-orders.json'].orders[0]).toMatchObject({
      status: 'checkout_started',
      packageId: 'platform',
      checkoutAmount: 125000,
      activationStatus: 'not_started',
    })
  })

  it('uses the published $25,000 Platform retainer and rejects client-side amount changes', async () => {
    await createProductCheckoutSession({ body: checkoutBody('stripe-retainer'), origin: 'https://farringtondevelopment.com' })
    const params = new URLSearchParams(fetch.mock.calls[0][1].body)
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('2500000')

    fetch.mockClear()
    await expect(createProductCheckoutSession({
      body: checkoutBody('stripe-retainer', { dueToday: 100 }),
      origin: 'https://farringtondevelopment.com',
    })).rejects.toThrow('must match the published retainer of $25,000')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('records financing as an internal lead request without creating a Stripe session', async () => {
    const result = await createProductCheckoutSession({
      body: checkoutBody('stripe-financing'),
      origin: 'https://farringtondevelopment.com',
    })

    expect(result).toMatchObject({
      ok: true,
      requestOnly: true,
      financingRequest: true,
      paymentCollected: false,
      serviceActivated: false,
      status: 'financing_requested',
      leadId: 'lead-finance-one',
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.recordProductTermsRequest).toHaveBeenCalledOnce()
    expect(state.data['product-orders.json'].orders[0]).toMatchObject({ status: 'financing_requested', checkoutAmount: 0 })
  })

  it('marks paid evidence and queues onboarding without activating service', () => {
    state.data['product-orders.json'] = {
      orders: [{
        id: 'cc-paid-one',
        status: 'checkout_started',
        product: 'farrington-command-center',
        productName: 'Farrington Command Center',
        packageId: 'platform',
        packageName: 'Command Center Platform',
        checkoutAmount: 125000,
        buyer,
        stripeSessionId: 'cs_paid_one',
      }],
    }
    mocks.ensurePaidProductOnboardingTask.mockReturnValue({ id: 'task-onboarding-one' })

    const paid = markProductOrderPaid({
      orderId: 'cc-paid-one',
      stripeSessionId: 'cs_paid_one',
      stripePaymentIntentId: 'pi_paid_one',
      amountPaid: 125000,
    })

    expect(paid).toMatchObject({
      status: 'paid',
      amountPaid: 125000,
      fulfillmentStatus: 'queued',
      activationStatus: 'not_started',
      onboardingTaskId: 'task-onboarding-one',
    })
    expect(mocks.ensurePaidProductOnboardingTask).toHaveBeenCalledOnce()
  })
})
