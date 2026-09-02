import { describe, expect, it, vi } from 'vitest'
import {
  buildStripeBillingCatalogDefinitions,
  createLeaseStripeCheckoutSession,
  previewLeaseStripeSubscription,
  previewStripeSubscriptionMigrations,
  syncStripeSubscriptionMigrations,
  updateLeaseStripeSubscription,
} from '../lib/stripe-billing-catalog.mjs'

const definitions = buildStripeBillingCatalogDefinitions({
  tiers: [{ id: 'receptionist', name: 'Receptionist', description: 'Answer calls', monthlyFee: 99 }],
  addons: {},
  managedPackages: [],
  creditPacks: [],
})
const definition = definitions[0]
const desiredPrice = definition.prices[0]

function stripeFixture(priceOverrides = {}) {
  const product = { id: 'prod_receptionist', active: true, metadata: { managed_by: 'farrington-command-center', fcc_catalog_key: definition.catalogKey } }
  const price = {
    id: 'price_receptionist_current',
    active: true,
    lookup_key: desiredPrice.lookupKey,
    product: product.id,
    unit_amount: desiredPrice.unitAmount,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    ...priceOverrides,
  }
  const subscription = { id: 'sub_one', status: 'active' }
  const item = {
    id: 'si_one',
    quantity: 3,
    price: { id: 'price_legacy', product: { id: product.id, metadata: product.metadata } },
  }
  return {
    products: { list: vi.fn().mockResolvedValue({ data: [product], has_more: false }) },
    prices: { list: vi.fn().mockResolvedValue({ data: [price], has_more: false }) },
    subscriptions: {
      list: vi.fn(async params => ({ data: params.status === 'active' ? [subscription] : [], has_more: false })),
      retrieve: vi.fn().mockResolvedValue(subscription),
      update: vi.fn().mockResolvedValue(subscription),
    },
    subscriptionItems: {
      list: vi.fn().mockResolvedValue({ data: [item], has_more: false }),
      update: vi.fn().mockResolvedValue({ ...item, price }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'cs_lease', client_secret: 'cs_secret_lease' }),
      },
    },
  }
}

describe('Stripe subscription migration controls', () => {
  it('previews safely and requires the current catalog hash before no-proration apply', async () => {
    const stripe = stripeFixture()
    const preview = await previewStripeSubscriptionMigrations({ stripe, definitions })

    expect(preview).toMatchObject({ mode: 'preview', applied: false, summary: { eligible: 1, current: 0 } })
    expect(preview.items[0]).toEqual(expect.objectContaining({ catalogKey: definition.catalogKey, status: 'eligible', quantity: 3 }))
    expect(preview.items[0]).not.toHaveProperty('subscriptionItemId')

    const refused = await syncStripeSubscriptionMigrations({ stripe, definitions, migrateExisting: true, confirmCatalogHash: 'stale' })
    expect(refused.ok).toBe(false)
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled()

    const applied = await syncStripeSubscriptionMigrations({ stripe, definitions, migrateExisting: true, confirmCatalogHash: preview.catalogHash })
    expect(applied.applied).toBe(true)
    expect(stripe.subscriptionItems.update).toHaveBeenCalledWith('si_one', {
      price: 'price_receptionist_current',
      quantity: 3,
      proration_behavior: 'none',
    }, expect.objectContaining({ idempotencyKey: expect.stringMatching(/^fcc_catalog:migrate_subscription_item:/) }))
  })

  it('previews a lease separately and requires customer consent for embedded checkout', async () => {
    const stripe = stripeFixture()
    const lease = { id: 'lease_one', tierId: 'receptionist', tenantId: 'tenant_one', clientAccountId: 'account_one', addons: {} }
    const preview = await previewLeaseStripeSubscription({ stripe, definitions, lease })

    expect(preview).toMatchObject({ ok: true, checkoutRequired: true, monthlyAmountCents: 9900, summary: { add: 1 } })
    await expect(createLeaseStripeCheckoutSession({
      stripe,
      definitions,
      lease,
      customerEmail: 'owner@example.com',
      returnUrl: 'https://openocti.local/portal/billing',
      requestId: 'request_1234',
      checkoutNonce: 'nonce_existing_lease_subscription_1234567890',
      customerConsent: false,
    })).rejects.toThrow('Customer consent')

    const checkout = await createLeaseStripeCheckoutSession({
      stripe,
      definitions,
      lease,
      customerEmail: 'owner@example.com',
      returnUrl: 'https://openocti.local/portal/billing',
      requestId: 'request_1234',
      checkoutNonce: 'nonce_existing_lease_subscription_1234567890',
      customerConsent: true,
    })
    expect(checkout).toMatchObject({ ok: true, clientSecret: 'cs_secret_lease', monthlyAmountCents: 9900 })
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      ui_mode: 'embedded',
      line_items: [{ price: 'price_receptionist_current', quantity: 1 }],
      metadata: expect.objectContaining({
        purpose: 'existing_lease_subscription',
        leaseId: 'lease_one',
        checkoutNonce: 'nonce_existing_lease_subscription_1234567890',
      }),
      subscription_data: {
        metadata: expect.objectContaining({
          purpose: 'existing_lease_subscription',
          leaseId: 'lease_one',
          checkoutNonce: 'nonce_existing_lease_subscription_1234567890',
        }),
      },
    }), expect.objectContaining({ idempotencyKey: expect.stringMatching(/^fcc_catalog:lease_checkout:/) }))
  })

  it('updates one existing lease only after matching plan confirmation', async () => {
    const stripe = stripeFixture()
    const lease = { id: 'lease_one', tierId: 'receptionist', stripeSubscriptionId: 'sub_one', addons: {} }
    const preview = await previewLeaseStripeSubscription({ stripe, definitions, lease })
    const refused = await updateLeaseStripeSubscription({ stripe, definitions, lease, apply: true, confirmPlanHash: 'stale' })

    expect(refused.ok).toBe(false)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()

    const applied = await updateLeaseStripeSubscription({ stripe, definitions, lease, apply: true, confirmPlanHash: preview.planHash })
    expect(applied.applied).toBe(true)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_one', {
      items: [{ id: 'si_one', price: 'price_receptionist_current', quantity: 3 }],
      proration_behavior: 'none',
    }, expect.objectContaining({ idempotencyKey: expect.stringMatching(/^fcc_catalog:update_lease_subscription:/) }))
  })

  it('fails closed in both bulk and per-lease previews when the desired Stripe Price is stale', async () => {
    const stripe = stripeFixture({ unit_amount: desiredPrice.unitAmount + 100 })
    const lease = { id: 'lease_one', tierId: 'receptionist', stripeSubscriptionId: 'sub_one', addons: {} }

    const bulk = await previewStripeSubscriptionMigrations({ stripe, definitions })
    const client = await previewLeaseStripeSubscription({ stripe, definitions, lease })
    await expect(createLeaseStripeCheckoutSession({
      stripe,
      definitions,
      lease: { ...lease, stripeSubscriptionId: '' },
      customerEmail: 'owner@example.com',
      returnUrl: 'https://openocti.local/portal/billing',
      requestId: 'request_stale_price',
      checkoutNonce: 'nonce_existing_lease_subscription_stale_1234',
      customerConsent: true,
    })).rejects.toThrow('Stripe catalog sync required')

    expect(bulk).toMatchObject({ ok: false, summary: { unsupported: 1 } })
    expect(bulk.items[0]).toMatchObject({ status: 'unsupported', catalogKey: definition.catalogKey })
    expect(client.ok).toBe(false)
    expect(client.errors).toContain(`Stripe catalog sync required for ${definition.catalogKey}`)
    expect(stripe.subscriptionItems.update).not.toHaveBeenCalled()
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
})
