import { describe, expect, it } from 'vitest'

import {
  activePortalCreditLease,
  buildCreditTopUpIntent,
  getCreditTopUpPack,
  listCreditTopUpPacks,
  parseCreditTopUpRequest,
  subscriptionPeriodForLease,
  validateCreditTopUpPaymentIntent,
} from '../lib/credit-topups'

describe('credit top-up catalog', () => {
  it('exposes only the server-owned credit packs with derived Stripe amounts', () => {
    expect(listCreditTopUpPacks().map(pack => ({
      id: pack.id,
      credits: pack.credits,
      amountCents: pack.amountCents,
      currency: pack.currency,
    }))).toEqual([
      { id: 'credits-2500', credits: 2500, amountCents: 2500, currency: 'usd' },
      { id: 'credits-5000', credits: 5000, amountCents: 5000, currency: 'usd' },
      { id: 'credits-10000', credits: 10000, amountCents: 10000, currency: 'usd' },
      { id: 'credits-25000', credits: 25000, amountCents: 25000, currency: 'usd' },
    ])
  })

  it('accepts only packId and a constrained requestId from the portal', () => {
    expect(parseCreditTopUpRequest({
      packId: 'credits-5000',
      requestId: 'request_12345678',
    })).toMatchObject({
      requestId: 'request_12345678',
      pack: { id: 'credits-5000', credits: 5000, amountCents: 5000 },
    })

    expect(() => parseCreditTopUpRequest({
      packId: 'credits-5000',
      requestId: 'request_12345678',
      amount: 1,
    })).toThrow('Only packId and requestId are accepted')
    expect(() => parseCreditTopUpRequest({
      packId: 'credits-made-up',
      requestId: 'request_12345678',
    })).toThrow('Unknown credit pack')
    expect(() => parseCreditTopUpRequest({
      packId: 'credits-2500',
      requestId: 'short',
    })).toThrow('Invalid requestId')
  })
})

describe('credit top-up identity and Stripe integrity', () => {
  const identity = {
    tenantId: 'tenant-one',
    accountId: 'account-one',
    leaseId: 'lease-one',
  }

  it('requires one exact active portal lease match', () => {
    const leases = [
      { id: 'lease-one', clientAccountId: 'account-one', tenantId: 'tenant-one', status: 'active' },
      { id: 'lease-two', clientAccountId: 'account-one', tenantId: 'tenant-two', status: 'active' },
    ]
    expect(activePortalCreditLease(leases, identity)).toEqual(leases[0])
    expect(activePortalCreditLease(leases, { ...identity, tenantId: 'tenant-two' })).toBeNull()
  })

  it('builds a stable embedded PaymentIntent from server values', () => {
    const input = {
      ...identity,
      customerId: 'cus_portal_one',
      requestId: 'request_12345678',
      pack: getCreditTopUpPack('credits-10000'),
    }
    const first = buildCreditTopUpIntent(input)
    const repeated = buildCreditTopUpIntent(input)

    expect(first).toEqual(repeated)
    expect(first.params).toMatchObject({
      amount: 10000,
      currency: 'usd',
      customer: 'cus_portal_one',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        purpose: 'credit_topup',
        packId: 'credits-10000',
        credits: '10000',
        tenantId: 'tenant-one',
        accountId: 'account-one',
        leaseId: 'lease-one',
        requestId: 'request_12345678',
      },
    })
    expect(first.idempotencyKey).toMatch(/^fcc_credit_topup_[a-f0-9]{48}$/)
  })

  it('validates the paid amount, currency, customer, tenant, account, and lease', () => {
    const pack = getCreditTopUpPack('credits-2500')
    const lease = {
      id: 'lease-one',
      clientAccountId: 'account-one',
      tenantId: 'tenant-one',
      stripeCustomerId: 'cus_portal_one',
      status: 'active',
    }
    const intent = {
      id: 'pi_topup_one',
      status: 'succeeded',
      amount: 2500,
      amount_received: 2500,
      currency: 'usd',
      customer: 'cus_portal_one',
      metadata: {
        purpose: 'credit_topup',
        packId: pack.id,
        credits: String(pack.credits),
        tenantId: lease.tenantId,
        accountId: lease.clientAccountId,
        leaseId: lease.id,
        requestId: 'request_12345678',
      },
    }

    expect(validateCreditTopUpPaymentIntent(intent, lease)).toMatchObject({
      pack,
      requestId: 'request_12345678',
    })
    expect(() => validateCreditTopUpPaymentIntent({ ...intent, amount_received: 1 }, lease)).toThrow('Credit top-up amount mismatch')
    expect(() => validateCreditTopUpPaymentIntent({ ...intent, customer: 'cus_other' }, lease)).toThrow('Credit top-up customer mismatch')
  })
})

describe('subscription credit periods', () => {
  it('uses a deterministic UTC calendar month when the lease has no billing bounds', () => {
    expect(subscriptionPeriodForLease(
      { id: 'lease-one' },
      new Date('2026-07-16T14:00:00.000Z'),
    )).toEqual({
      periodId: 'lease-one:2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
      idempotencyKey: 'subscription:lease-one:2026-07',
    })
  })

  it('honors explicit current billing-period dates on the lease', () => {
    expect(subscriptionPeriodForLease({
      id: 'lease-one',
      currentPeriodStart: '2026-07-10T12:00:00.000Z',
      currentPeriodEnd: '2026-08-10T12:00:00.000Z',
    })).toEqual({
      periodId: 'lease-one:2026-07-10T12:00:00.000Z',
      startsAt: '2026-07-10T12:00:00.000Z',
      endsAt: '2026-08-10T12:00:00.000Z',
      idempotencyKey: 'subscription:lease-one:2026-07-10T12:00:00.000Z',
    })
  })
})
