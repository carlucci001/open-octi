import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))
const mocks = vi.hoisted(() => ({
  markProductOrderPaid: vi.fn(),
  pushNotification: vi.fn(),
  writeData: vi.fn(),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  writeData: vi.fn((filename, data) => {
    state.data[filename] = structuredClone(data)
    mocks.writeData(filename, data)
  }),
}))

vi.mock('../lib/notifications', () => ({
  pushNotification: mocks.pushNotification,
}))

vi.mock('../lib/productCheckout', () => ({
  markProductOrderPaid: mocks.markProductOrderPaid,
}))

import { recordCheckoutSessionPayment } from '../lib/paymentLedger'

function checkoutSession(paymentStatus) {
  return {
    id: 'cs_order_one',
    status: 'complete',
    payment_status: paymentStatus,
    payment_intent: 'pi_order_one',
    amount_total: 4900,
    customer_email: 'owner@example.com',
    customer_details: { name: 'Example Company' },
    metadata: {
      invoiceId: 'invoice-one',
      orderId: 'order-one',
      clientId: 'account-one',
    },
  }
}

beforeEach(() => {
  state.data = {
    'accounts.json': { accounts: [{ id: 'account-one', name: 'Example Company', email: 'owner@example.com' }] },
    'invoices.json': {
      invoices: [{ id: 'invoice-one', number: 'INV-1', status: 'sent', amount: 49, clientId: 'account-one' }],
    },
    'payments.json': { payments: [] },
    'activities.json': { activities: [] },
  }
  vi.clearAllMocks()
})

describe('recordCheckoutSessionPayment', () => {
  it.each(['unpaid', 'no_payment_required'])('does not mark a complete checkout paid when payment_status=%s', paymentStatus => {
    const result = recordCheckoutSessionPayment(checkoutSession(paymentStatus), { source: 'stripe_payment_webhook' })

    expect(result).toMatchObject({ ok: false, ignored: true })
    expect(state.data['invoices.json'].invoices[0]).toMatchObject({ status: 'sent' })
    expect(state.data['payments.json'].payments).toEqual([])
    expect(state.data['activities.json'].activities).toEqual([])
    expect(mocks.markProductOrderPaid).not.toHaveBeenCalled()
    expect(mocks.pushNotification).not.toHaveBeenCalled()
    expect(mocks.writeData).not.toHaveBeenCalled()
  })

  it('records paid async-success checkout data and fulfills the matching order once', () => {
    const first = recordCheckoutSessionPayment(checkoutSession('paid'), { source: 'stripe_async_payment_succeeded' })
    const replay = recordCheckoutSessionPayment(checkoutSession('paid'), { source: 'stripe_async_payment_succeeded' })

    expect(first).toMatchObject({ ok: true, created: true })
    expect(replay).toMatchObject({ ok: true, created: false })
    expect(state.data['invoices.json'].invoices[0]).toMatchObject({
      status: 'paid',
      paidAmount: 49,
      stripePaymentIntentId: 'pi_order_one',
      stripeSessionId: 'cs_order_one',
    })
    expect(state.data['payments.json'].payments).toHaveLength(1)
    expect(state.data['payments.json'].payments[0]).toMatchObject({
      status: 'succeeded',
      stripeId: 'pi_order_one',
      stripeSessionId: 'cs_order_one',
    })
    expect(mocks.markProductOrderPaid).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-one',
      stripeSessionId: 'cs_order_one',
      stripePaymentIntentId: 'pi_order_one',
      amountPaid: 49,
    }))
  })
})
