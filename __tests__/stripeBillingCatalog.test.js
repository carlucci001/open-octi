import { describe, expect, it, vi } from 'vitest'
import {
  STRIPE_BILLING_WEBHOOK_EVENTS,
  STRIPE_BILLING_WEBHOOK_URL,
  assertResolvedStripeCatalogPrice,
  buildStripeBillingCatalogDefinitions,
  planStripeBillingCatalogSync,
  syncStripeBillingCatalog,
  validateStripeBillingCatalog,
} from '../lib/stripe-billing-catalog.mjs'
import {
  getRuntimeStripeBillingCatalogSource,
} from '../lib/stripe-billing-catalog-source'
import {
  assertCatalogApplyAccount,
  parseCatalogSyncArgs,
  selectProductionStripeSecret,
  selectRuntimeStripeSecret,
} from '../scripts/sync-stripe-billing-catalog.mjs'

const runtimeSource = getRuntimeStripeBillingCatalogSource()
const ciFixtureSource = {
  tiers: [{ id: 'receptionist', name: 'Receptionist', description: 'Managed receptionist', monthlyFee: 99 }],
  addons: {
    tools: [{ id: 'canva', name: 'Canva', description: 'Configured design connection', monthlyFee: 99 }],
    premiumModels: [{ id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Plan adjustment', monthlyFee: -25 }],
  },
  managedPackages: runtimeSource.managedPackages,
  creditPacks: runtimeSource.creditPacks,
}

function catalogSource() {
  return runtimeSource.tiers.length && Object.values(runtimeSource.addons || {}).flat().length
    ? runtimeSource
    : ciFixtureSource
}

function catalogDefinitions() {
  return buildStripeBillingCatalogDefinitions(catalogSource())
}

function emptyStripe() {
  return {
    products: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      create: vi.fn(async params => ({ id: `prod_${params.metadata.fcc_source_id}` })),
      update: vi.fn(),
    },
    prices: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      create: vi.fn(async params => ({ id: `price_${params.lookup_key}` })),
      update: vi.fn(),
    },
    webhookEndpoints: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 'we_existing', url: STRIPE_BILLING_WEBHOOK_URL, status: 'enabled', enabled_events: [...STRIPE_BILLING_WEBHOOK_EVENTS] }], has_more: false }),
      update: vi.fn(),
    },
  }
}

describe('Stripe billing catalog', () => {
  it('binds every catalog apply to the previewed live Stripe account', () => {
    const liveKey = ['sk', 'live', 'fixture'].join('_')
    expect(() => assertCatalogApplyAccount({ apply: true, secret: liveKey, accountId: 'acct_expected', confirmAccount: '' }))
      .toThrow('--confirm-account=acct_expected')
    expect(() => assertCatalogApplyAccount({ apply: true, secret: ['sk', 'test', 'fixture'].join('_'), accountId: 'acct_expected', confirmAccount: 'acct_expected' }))
      .toThrow('production Stripe key')
    expect(() => assertCatalogApplyAccount({ apply: true, secret: liveKey, accountId: 'acct_expected', confirmAccount: 'acct_expected' }))
      .not.toThrow()
  })

  it('selects the Command Center production key from the credential field schema', () => {
    const productionKey = ['sk', 'live', 'fixture'].join('_')
    expect(selectProductionStripeSecret([
      { name: 'Stripe', fields: [
        { label: 'Secret Key (S)', value: ['sk', 'test', 'fixture'].join('_') },
        { label: 'Secret Key (P)', value: productionKey },
      ] },
      { name: 'Newsroom AIOS Stripe', fields: [{ label: 'Secret Key', value: ['sk', 'live', 'other'].join('_') }] },
    ])).toBe(productionKey)
  })

  it('prefers the running Command Center environment over a separate vault account', () => {
    const runtimeKey = ['sk', 'live', 'runtime'].join('_')
    const vaultKey = ['sk', 'live', 'vault'].join('_')
    expect(selectRuntimeStripeSecret({
      envContents: [`NEXT_PUBLIC_APP_URL=https://crm.example\nSTRIPE_SECRET_KEY=${runtimeKey}\n`],
      credentials: [{ name: 'Stripe', value: vaultKey }],
    })).toBe(runtimeKey)
  })

  it('deterministically inventories every local billable definition', () => {
    const definitions = catalogDefinitions()
    const source = catalogSource()
    const tiers = definitions.filter(item => item.kind === 'tier')
    const addons = definitions.filter(item => item.kind === 'addon')
    const managed = definitions.filter(item => item.kind === 'managed-package')
    const creditPacks = definitions.filter(item => item.kind === 'credit-pack')
    const localAddons = Object.values(source.addons).flat()

    expect(tiers).toHaveLength(source.tiers.length)
    expect(addons).toHaveLength(localAddons.length)
    expect(managed).toHaveLength(source.managedPackages.length)
    expect(creditPacks).toHaveLength(source.creditPacks.length)
    expect(tiers.map(item => [item.sourceId, item.displayAmountCents])).toEqual(source.tiers.map(item => [item.id, item.monthlyFee * 100]))
    expect(addons.map(item => [item.sourceId, item.displayAmountCents])).toEqual(localAddons.map(item => [item.id, item.monthlyFee * 100]))
    expect(managed.map(item => [item.sourceId, item.displayAmountCents])).toEqual(source.managedPackages.map(item => [item.id, item.monthlyFee * 100]))
    expect(creditPacks.map(item => [item.sourceId, item.displayAmountCents])).toEqual(source.creditPacks.map(item => [item.id, (item.priceUsd ?? item.amountCents / 100) * 100]))
    expect(Object.isFrozen(definitions)).toBe(true)
  })

  it('uses unique stable lookup keys and never creates negative Stripe Prices', () => {
    const definitions = catalogDefinitions()
    const validation = validateStripeBillingCatalog(definitions)
    const lookupKeys = definitions.flatMap(item => item.prices.map(price => price.lookupKey))
    const downgrade = definitions.find(item => item.sourceId === 'claude-haiku-4-5')

    expect(validation).toEqual({ ok: true, errors: [] })
    expect(new Set(lookupKeys).size).toBe(lookupKeys.length)
    expect(lookupKeys.every(key => /^fcc_[a-z0-9_]+_v(?:1|2_[a-f0-9]{12})$/.test(key))).toBe(true)
    expect(STRIPE_BILLING_WEBHOOK_EVENTS).toContain('customer.subscription.created')
    expect(downgrade).toMatchObject({ billingMode: 'adjustment', displayAmountCents: -2500, prices: [] })
  })

  it('retains v1 lookup keys for unchanged prices and deterministically bumps changed immutable configurations', () => {
    const source = catalogSource()
    const current = buildStripeBillingCatalogDefinitions(source).find(item => item.sourceId === 'receptionist')
    const changedSource = {
      ...source,
      tiers: source.tiers.map(tier => tier.id === 'receptionist' ? { ...tier, monthlyFee: tier.monthlyFee + 1 } : tier),
    }
    const changed = buildStripeBillingCatalogDefinitions(changedSource).find(item => item.sourceId === 'receptionist')
    const repeated = buildStripeBillingCatalogDefinitions(changedSource).find(item => item.sourceId === 'receptionist')

    expect(current.prices[0].lookupKey).toBe('fcc_tier_receptionist_monthly_usd_v1')
    expect(changed.prices[0].lookupKey).toMatch(/^fcc_tier_receptionist_monthly_usd_v2_[a-f0-9]{12}$/)
    expect(changed.prices[0].lookupKey).toBe(repeated.prices[0].lookupKey)
    expect(changed.prices[0].lookupKey).not.toBe(current.prices[0].lookupKey)

    const product = {
      id: 'prod_receptionist',
      active: true,
      name: changed.name,
      description: changed.description,
      metadata: {
        managed_by: 'farrington-command-center',
        fcc_catalog_key: changed.catalogKey,
        fcc_catalog_version: '2026-07-16.1',
        fcc_catalog_kind: changed.kind,
        fcc_source_id: changed.sourceId,
        ...changed.metadata,
      },
    }
    const plan = planStripeBillingCatalogSync({
      definitions: [changed],
      existingProducts: [product],
      existingPrices: [{
        id: 'price_v1',
        active: true,
        lookup_key: current.prices[0].lookupKey,
        product: product.id,
        unit_amount: current.prices[0].unitAmount,
        currency: 'usd',
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      }],
      webhookEndpoints: [{ id: 'we_existing', url: STRIPE_BILLING_WEBHOOK_URL, status: 'enabled', enabled_events: [...STRIPE_BILLING_WEBHOOK_EVENTS] }],
    })
    expect(plan.ok).toBe(true)
    expect(plan.operations).toContainEqual(expect.objectContaining({ action: 'create', resource: 'price', lookupKey: changed.prices[0].lookupKey }))
    expect(plan.operations.some(operation => operation.action === 'conflict')).toBe(false)
  })

  it.each([
    ['inactive', { active: false }],
    ['wrong amount', { unit_amount: 9901 }],
    ['wrong currency', { currency: 'eur' }],
    ['wrong interval', { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }],
    ['wrong interval count', { recurring: { interval: 'month', interval_count: 2, usage_type: 'licensed' } }],
    ['wrong product', { product: { id: 'prod_wrong', active: true, metadata: { managed_by: 'farrington-command-center', fcc_catalog_key: 'fcc_tier_wrong' } } }],
  ])('rejects a %s Stripe Price before checkout or migration', (_label, override) => {
    const item = catalogDefinitions().find(entry => entry.sourceId === 'receptionist')
    const desired = item.prices[0]
    const valid = {
      id: 'price_receptionist',
      active: true,
      lookup_key: desired.lookupKey,
      unit_amount: desired.unitAmount,
      currency: desired.currency,
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      product: { id: 'prod_receptionist', active: true, metadata: { managed_by: 'farrington-command-center', fcc_catalog_key: item.catalogKey } },
    }
    expect(() => assertResolvedStripeCatalogPrice({ ...valid, ...override }, item, desired)).toThrow('Stripe catalog sync required')
  })

  it('detects duplicate definition keys before any Stripe mutation', () => {
    const definitions = catalogDefinitions()
    const [definition] = definitions
    const duplicateCatalog = validateStripeBillingCatalog([definition, definition])
    const duplicateLookup = validateStripeBillingCatalog([
      definition,
      { ...definitions[1], catalogKey: 'unique-key', prices: [{ ...definitions[1].prices[0], lookupKey: definition.prices[0].lookupKey }] },
    ])

    expect(duplicateCatalog.ok).toBe(false)
    expect(duplicateCatalog.errors.some(error => error.includes('Duplicate catalog key'))).toBe(true)
    expect(duplicateLookup.ok).toBe(false)
    expect(duplicateLookup.errors.some(error => error.includes('Duplicate lookup key'))).toBe(true)
  })

  it('defaults to dry-run and makes no create or update calls', async () => {
    const stripe = emptyStripe()
    const [definition] = catalogDefinitions()
    const result = await syncStripeBillingCatalog({ stripe, definitions: [definition] })

    expect(result.mode).toBe('dry-run')
    expect(result.applied).toBe(false)
    expect(result.summary.create).toBe(2)
    expect(stripe.products.create).not.toHaveBeenCalled()
    expect(stripe.products.update).not.toHaveBeenCalled()
    expect(stripe.prices.create).not.toHaveBeenCalled()
    expect(stripe.prices.update).not.toHaveBeenCalled()
    expect(parseCatalogSyncArgs([])).toEqual({ apply: false, help: false, confirmAccount: '' })
    expect(parseCatalogSyncArgs(['--apply', '--confirm-account=acct_expected'])).toEqual({ apply: true, help: false, confirmAccount: 'acct_expected' })
    expect(() => parseCatalogSyncArgs(['--force'])).toThrow('Unknown argument')
  })

  it('uses idempotency keys only when apply is explicitly true', async () => {
    const stripe = emptyStripe()
    const [definition] = catalogDefinitions()
    const result = await syncStripeBillingCatalog({ stripe, apply: true, definitions: [definition] })

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(true)
    expect(stripe.products.create).toHaveBeenCalledOnce()
    expect(stripe.prices.create).toHaveBeenCalledOnce()
    expect(stripe.products.create.mock.calls[0][1].idempotencyKey).toMatch(/^fcc_catalog:create_product:/)
    expect(stripe.prices.create.mock.calls[0][1].idempotencyKey).toMatch(/^fcc_catalog:create_price:/)
  })

  it('refuses apply when a stable lookup key has incompatible immutable fields', async () => {
    const stripe = emptyStripe()
    const [definition] = catalogDefinitions()
    const product = {
      id: 'prod_existing',
      active: true,
      name: definition.name,
      description: definition.description,
      metadata: {
        managed_by: 'farrington-command-center',
        fcc_catalog_key: definition.catalogKey,
        fcc_catalog_version: '2026-07-16.1',
        fcc_catalog_kind: definition.kind,
        fcc_source_id: definition.sourceId,
        ...definition.metadata,
      },
    }
    stripe.products.list.mockResolvedValue({ data: [product], has_more: false })
    stripe.prices.list.mockResolvedValue({
      data: [{
        id: 'price_conflict',
        active: true,
        lookup_key: definition.prices[0].lookupKey,
        product: product.id,
        unit_amount: definition.prices[0].unitAmount + 1,
        currency: 'usd',
        recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
        metadata: {},
      }],
      has_more: false,
    })

    const result = await syncStripeBillingCatalog({ stripe, apply: true, definitions: [definition] })
    expect(result.ok).toBe(false)
    expect(result.summary.conflicts).toBe(1)
    expect(stripe.products.create).not.toHaveBeenCalled()
    expect(stripe.products.update).not.toHaveBeenCalled()
    expect(stripe.prices.create).not.toHaveBeenCalled()
    expect(stripe.prices.update).not.toHaveBeenCalled()
  })

  it('detects duplicate Stripe objects in a pure plan', () => {
    const [definition] = catalogDefinitions()
    const duplicate = id => ({ id, metadata: { fcc_catalog_key: definition.catalogKey } })
    const plan = planStripeBillingCatalogSync({
      definitions: [definition],
      existingProducts: [duplicate('prod_1'), duplicate('prod_2')],
      existingPrices: [],
      webhookEndpoints: [{ id: 'we_existing', url: STRIPE_BILLING_WEBHOOK_URL, status: 'enabled', enabled_events: [...STRIPE_BILLING_WEBHOOK_EVENTS] }],
    })

    expect(plan.ok).toBe(false)
    expect(plan.errors.some(error => error.includes('Duplicate Stripe products'))).toBe(true)
    expect(plan.operations.some(operation => operation.action === 'conflict')).toBe(true)
  })
})
