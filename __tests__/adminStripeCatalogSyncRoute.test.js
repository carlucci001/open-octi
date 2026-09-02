import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  owner: null,
  data: {},
  audits: [],
  catalogCalls: [],
  migrationCalls: [],
  leaseCalls: [],
  checkoutCalls: [],
  subscriptionCancelAtPeriodEnd: false,
  subscriptionUpdates: [],
}))

vi.mock('stripe', () => ({
  default: class StripeMock {
    constructor() {
      this.subscriptions = {
        retrieve: vi.fn(async id => ({
          id,
          status: 'active',
          cancel_at_period_end: state.subscriptionCancelAtPeriodEnd,
          current_period_end: 1786924800,
        })),
        update: vi.fn(async (id, params, options) => {
          state.subscriptionUpdates.push({ id, params, options })
          state.subscriptionCancelAtPeriodEnd = params.cancel_at_period_end === true
          return {
            id,
            status: 'active',
            cancel_at_period_end: state.subscriptionCancelAtPeriodEnd,
            current_period_end: 1786924800,
          }
        }),
      }
    }
  },
}))

vi.mock('../lib/auth', () => ({
  requireOwner: vi.fn(async () => state.owner
    ? { user: state.owner, error: null }
    : { user: null, error: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }),
}))

vi.mock('../lib/auditLog', () => ({
  logAuditEvent: vi.fn(event => state.audits.push(event)),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  mutateData: vi.fn((filename, mutator) => {
    const current = structuredClone(state.data[filename] || {})
    const outcome = mutator(current)
    state.data[filename] = outcome.data
    return outcome.result
  }),
}))

const catalogResult = apply => ({
  ok: true,
  mode: apply ? 'apply' : 'dry-run',
  catalogVersion: '2026-07-16',
  catalogHash: 'catalog_hash_one',
  summary: { create: 2, update: 1, unchanged: 3, conflicts: 0, errors: 0 },
  items: [{ catalogKey: 'receptionist', kind: 'tier', name: 'Receptionist', billingMode: 'recurring', priceCount: 1, status: 'ready' }],
  operations: [{ action: 'create', resource: 'price', catalogKey: 'receptionist', lookupKey: 'fcc_receptionist_month', reason: 'Price is missing' }],
  errors: [],
})

const migrationResult = apply => ({
  ok: true,
  mode: apply ? 'apply' : 'preview',
  catalogVersion: '2026-07-16',
  catalogHash: 'catalog_hash_one',
  summary: { subscriptionsScanned: 3, itemsScanned: 4, eligible: 2, current: 1, unsupported: 1 },
  items: [{ requestId: 'migration_hash_one', catalogKey: 'receptionist', status: 'eligible', quantity: 1 }],
  applied: apply ? 2 : 0,
  errors: [],
})

vi.mock('../lib/stripe-billing-catalog.mjs', () => ({
  createLeaseStripeCheckoutSession: vi.fn(async input => {
    state.checkoutCalls.push(input)
    return {
      ok: true,
      clientSecret: 'cs_test_embedded_secret',
      sessionId: 'cs_test_embedded',
      planHash: 'lease_plan_hash',
      monthlyAmountCents: 19900,
    }
  }),
  previewLeaseStripeSubscription: vi.fn(async input => {
    state.leaseCalls.push({ type: 'preview', ...input })
    const checkoutRequired = !input.lease.stripeSubscriptionId
    return {
      ok: true,
      mode: 'preview',
      catalogHash: 'catalog_hash_one',
      planHash: 'lease_plan_hash',
      checkoutRequired,
      monthlyAmountCents: 19900,
      summary: { desired: 1, add: checkoutRequired ? 1 : 0, replace: checkoutRequired ? 0 : 1, remove: 0, current: 0 },
      operations: [{ catalogKey: 'fcc_tier_receptionist', action: checkoutRequired ? 'add' : 'replace', quantity: 1 }],
      applied: false,
      errors: [],
    }
  }),
  syncStripeBillingCatalog: vi.fn(async input => {
    state.catalogCalls.push(input)
    return catalogResult(input.apply === true)
  }),
  previewStripeSubscriptionMigrations: vi.fn(async input => {
    state.migrationCalls.push({ type: 'preview', ...input })
    return migrationResult(false)
  }),
  syncStripeSubscriptionMigrations: vi.fn(async input => {
    state.migrationCalls.push({ type: 'apply', ...input })
    return migrationResult(true)
  }),
  updateLeaseStripeSubscription: vi.fn(async input => {
    state.leaseCalls.push({ type: 'apply', ...input })
    return {
      ok: true,
      mode: 'apply',
      catalogHash: 'catalog_hash_one',
      planHash: 'lease_plan_hash',
      checkoutRequired: false,
      monthlyAmountCents: 19900,
      summary: { desired: 1, add: 0, replace: 1, remove: 0, current: 0 },
      operations: [{ catalogKey: 'fcc_tier_receptionist', action: 'replace', quantity: 1 }],
      applied: true,
      errors: [],
    }
  }),
}))

vi.mock('../lib/stripe-billing-catalog-source', () => ({
  getRuntimeStripeBillingCatalogDefinitions: vi.fn(() => [{ catalogKey: 'receptionist', amount: 19900 }]),
}))

import { GET, POST } from '../app/api/admin/stripe-catalog-sync/route'

function post(body) {
  return new Request('https://openocti.local/api/admin/stripe-catalog-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('owner Stripe catalog sync route', () => {
  beforeEach(() => {
    state.owner = null
    state.data = {}
    state.audits = []
    state.catalogCalls = []
    state.migrationCalls = []
    state.leaseCalls = []
    state.checkoutCalls = []
    state.subscriptionCancelAtPeriodEnd = false
    state.subscriptionUpdates = []
    vi.stubEnv('CRM_SESSION_SECRET', 'route-signing-secret-for-tests')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_only')
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PK', 'pk_test_mock_only')
  })

  it('is owner-only', async () => {
    expect((await GET(new Request('https://openocti.local/api/admin/stripe-catalog-sync'))).status).toBe(401)
    expect((await POST(post({ action: 'apply' }))).status).toBe(401)
    expect(state.catalogCalls).toEqual([])
  })

  it('previews sanitized drift and reports the last successful sync hash', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    state.data['stripe-catalog-sync-runs.json'] = {
      lastSync: { catalogHash: 'older_hash', status: 'synced', completedAt: '2026-07-15T12:00:00.000Z' },
      runs: [],
    }
    state.data['leases.json'] = { leases: [{
      id: 'lease_acme',
      status: 'active',
      clientAccountId: 'account_acme',
      tierId: 'receptionist',
      tierName: 'Receptionist',
      stripeCustomerId: 'cus_private_one',
      stripeSubscriptionId: 'sub_private_one',
      stripeSubscriptionStatus: 'active',
      billingStatus: 'paid',
      currentPeriodEnd: '2026-08-16T12:00:00.000Z',
      stripeLifecycleVerifiedAt: '2026-07-16T12:00:00.000Z',
    }] }
    state.data['accounts.json'] = { accounts: [{ id: 'account_acme', name: 'Acme Heating' }] }

    const response = await GET(new Request('https://openocti.local/api/admin/stripe-catalog-sync'))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      ok: true,
      canApply: true,
      pendingChanges: true,
      plan: {
        catalogHash: 'catalog_hash_one',
        summary: { create: 2, update: 1, unchanged: 3, conflicts: 0, errors: 0 },
      },
      lastSync: { catalogHash: 'older_hash' },
      clients: [{
        leaseId: 'lease_acme',
        accountName: 'Acme Heating',
        tierName: 'Receptionist',
        hasStripeCustomer: true,
        hasStripeSubscription: true,
        stripeSubscriptionStatus: 'active',
        billingStatus: 'paid',
      }],
    })
    expect(result.previewToken).toMatch(/\./)
    expect(JSON.stringify(result)).not.toContain('sk_test_mock_only')
    expect(JSON.stringify(result)).not.toContain('cus_private_one')
    expect(JSON.stringify(result)).not.toContain('sub_private_one')
  })

  it('requires the reviewed token and confirmation before applying an idempotent catalog sync', async () => {
    state.owner = { id: 'owner_carl', name: 'Carl Farrington', role: 'owner' }
    const preview = await (await GET(new Request('https://openocti.local/api/admin/stripe-catalog-sync'))).json()

    expect((await POST(post({
      action: 'apply',
      previewToken: preview.previewToken,
      confirmation: 'update it',
      requestId: 'catalog-run-one',
      existingSubscriptions: { mode: 'none' },
    }))).status).toBe(400)

    const response = await POST(post({
      action: 'apply',
      previewToken: preview.previewToken,
      confirmation: 'UPDATE STRIPE CATALOG',
      requestId: 'catalog-run-one',
      existingSubscriptions: { mode: 'none' },
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ ok: true, idempotent: false, result: { mode: 'apply', catalogHash: 'catalog_hash_one' } })
    expect(state.catalogCalls.some(call => call.apply === true)).toBe(true)
    expect(state.data['stripe-catalog-sync-runs.json'].lastSync.catalogHash).toBe('catalog_hash_one')
    expect(state.audits[0]).toMatchObject({ action: 'stripe_catalog_updated', area: 'billing' })

    const repeated = await POST(post({
      action: 'apply',
      previewToken: preview.previewToken,
      confirmation: 'UPDATE STRIPE CATALOG',
      requestId: 'catalog-run-one',
      existingSubscriptions: { mode: 'none' },
    }))
    expect(await repeated.json()).toMatchObject({ ok: true, idempotent: true })
  })

  it('never folds existing subscription migration into a catalog update', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    const preview = await (await GET(new Request('https://openocti.local/api/admin/stripe-catalog-sync'))).json()
    const response = await POST(post({
      action: 'apply',
      previewToken: preview.previewToken,
      confirmation: 'UPDATE STRIPE CATALOG',
      requestId: 'catalog-run-two',
      existingSubscriptions: { mode: 'next_renewal' },
    }))
    expect(response.status).toBe(409)
    expect(state.catalogCalls.filter(call => call.apply === true)).toHaveLength(0)
  })

  it('previews and separately confirms immediate subscription item migration with no proration', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    const previewResponse = await POST(post({
      action: 'preview-existing-subscriptions',
      existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
    }))
    const preview = await previewResponse.json()
    expect(preview).toMatchObject({ ok: true, canApply: true, summary: { subscriptions: 3, items: 2 } })

    const response = await POST(post({
      action: 'migrate-existing-subscriptions',
      previewToken: preview.previewToken,
      confirmation: 'MIGRATE WITHOUT PRORATION',
      requestId: 'migration-run-one',
      existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ ok: true, result: { applied: 2 } })
    expect(state.migrationCalls.find(call => call.type === 'apply')).toMatchObject({
      migrateExisting: true,
      confirmCatalogHash: 'catalog_hash_one',
    })
    expect(state.audits[0]).toMatchObject({ action: 'stripe_subscriptions_migrated', area: 'billing' })
  })

  it('previews and updates one existing client subscription without proration', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    state.data['leases.json'] = { leases: [{
      id: 'lease_acme',
      status: 'active',
      tenantId: 'tenant_acme',
      clientAccountId: 'account_acme',
      tierId: 'receptionist',
      stripeSubscriptionId: 'sub_private_one',
    }] }
    state.data['accounts.json'] = { accounts: [{ id: 'account_acme', name: 'Acme Heating' }] }

    const preview = await (await POST(post({
      action: 'preview-client-subscription',
      leaseId: 'lease_acme',
    }))).json()
    expect(preview).toMatchObject({
      ok: true,
      canApply: true,
      canCreateCheckout: false,
      lease: { leaseId: 'lease_acme', accountName: 'Acme Heating' },
      plan: { monthlyAmountCents: 19900, summary: { replace: 1 } },
    })
    expect(JSON.stringify(preview)).not.toContain('sub_private_one')

    const response = await POST(post({
      action: 'update-client-subscription',
      leaseId: 'lease_acme',
      previewToken: preview.previewToken,
      confirmation: 'UPDATE CLIENT SUBSCRIPTION',
      requestId: 'client-update-one',
      existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ ok: true, result: { applied: true } })
    expect(state.leaseCalls.find(call => call.type === 'apply')).toMatchObject({
      apply: true,
      confirmPlanHash: 'lease_plan_hash',
      lease: { id: 'lease_acme', stripeSubscriptionId: 'sub_private_one' },
    })
    expect(state.audits[0]).toMatchObject({ action: 'stripe_client_subscription_updated', area: 'billing' })
  })

  it('creates a consent-gated embedded billing setup for a lease without a subscription', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    state.data['leases.json'] = { leases: [{
      id: 'lease_new',
      status: 'active',
      tenantId: 'tenant_new',
      clientAccountId: 'account_new',
      tierId: 'receptionist',
    }] }
    state.data['accounts.json'] = { accounts: [{ id: 'account_new', name: 'New Client', email: 'billing@example.com' }] }

    const preview = await (await POST(post({
      action: 'preview-client-subscription',
      leaseId: 'lease_new',
    }))).json()
    expect(preview).toMatchObject({ ok: true, canApply: false, canCreateCheckout: true })

    expect((await POST(post({
      action: 'create-client-billing-setup',
      leaseId: 'lease_new',
      previewToken: preview.previewToken,
      confirmation: 'CREATE BILLING SETUP',
      customerConsent: false,
      requestId: 'checkout-one',
    }))).status).toBe(400)

    const response = await POST(post({
      action: 'create-client-billing-setup',
      leaseId: 'lease_new',
      previewToken: preview.previewToken,
      confirmation: 'CREATE BILLING SETUP',
      customerConsent: true,
      requestId: 'checkout-one',
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      ok: true,
      checkout: {
        clientSecret: 'cs_test_embedded_secret',
        publishableKey: 'pk_test_mock_only',
        monthlyAmountCents: 19900,
        leaseId: 'lease_new',
      },
    })
    expect(state.checkoutCalls[0]).toMatchObject({
      lease: { id: 'lease_new' },
      customerEmail: 'billing@example.com',
      requestId: 'checkout-one',
      checkoutNonce: expect.stringMatching(/^[a-f0-9]{64}$/),
      customerConsent: true,
    })
    expect(state.checkoutCalls[0].returnUrl).toContain('https://openocti.local/')
    expect(state.data['leases.json'].leases).toHaveLength(1)
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      id: 'lease_new',
      pendingStripeSubscriptionCheckout: expect.objectContaining({
        requestId: 'checkout-one',
        planHash: 'lease_plan_hash',
        sessionId: 'cs_test_embedded',
      }),
    })
    expect(state.data['leases.json'].leases[0].stripeSubscriptionId).toBeUndefined()
    expect(state.audits[0]).toMatchObject({ action: 'stripe_client_billing_setup_created', area: 'billing' })
  })

  it('does not create initial billing Checkout when the lease already has a subscription', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    state.data['leases.json'] = { leases: [{
      id: 'lease_existing',
      status: 'active',
      tenantId: 'tenant_existing',
      clientAccountId: 'account_existing',
      tierId: 'receptionist',
      stripeSubscriptionId: 'sub_existing',
    }] }
    state.data['accounts.json'] = { accounts: [{ id: 'account_existing', name: 'Existing Client', email: 'billing@example.com' }] }

    const preview = await (await POST(post({
      action: 'preview-client-subscription',
      leaseId: 'lease_existing',
    }))).json()
    const response = await POST(post({
      action: 'create-client-billing-setup',
      leaseId: 'lease_existing',
      previewToken: preview.previewToken,
      confirmation: 'CREATE BILLING SETUP',
      customerConsent: true,
      requestId: 'checkout-existing',
    }))

    expect(response.status).toBe(409)
    expect(state.checkoutCalls).toEqual([])
    expect(state.data['leases.json'].leases[0].pendingStripeSubscriptionCheckout).toBeUndefined()
  })

  it('requires a live preview and typed confirmation before scheduling cancellation at renewal', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    state.data['leases.json'] = { leases: [{
      id: 'lease_acme',
      status: 'active',
      tenantId: 'tenant_acme',
      clientAccountId: 'account_acme',
      stripeSubscriptionId: 'sub_private_one',
      stripeSubscriptionStatus: 'active',
    }] }
    state.data['accounts.json'] = { accounts: [{ id: 'account_acme', name: 'Acme Heating' }] }

    const previewResponse = await POST(post({ action: 'preview-client-cancellation', leaseId: 'lease_acme' }))
    const preview = await previewResponse.json()
    expect(preview).toMatchObject({
      ok: true,
      cancellation: { status: 'active', cancelAtPeriodEnd: false, canSchedule: true, canUndo: false },
    })
    expect(state.subscriptionUpdates).toEqual([])
    expect(JSON.stringify(preview)).not.toContain('sub_private_one')

    const refused = await POST(post({
      action: 'cancel-client-at-renewal',
      leaseId: 'lease_acme',
      previewToken: preview.previewToken,
      confirmation: 'CANCEL NOW',
      requestId: 'cancel-request-one',
    }))
    expect(refused.status).toBe(400)
    expect(state.subscriptionUpdates).toEqual([])

    const response = await POST(post({
      action: 'cancel-client-at-renewal',
      leaseId: 'lease_acme',
      previewToken: preview.previewToken,
      confirmation: 'CANCEL AT RENEWAL',
      requestId: 'cancel-request-one',
    }))
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result).toMatchObject({ ok: true, result: { cancelAtPeriodEnd: true, applied: true } })
    expect(state.subscriptionUpdates).toHaveLength(1)
    expect(state.subscriptionUpdates[0]).toMatchObject({
      id: 'sub_private_one',
      params: { cancel_at_period_end: true },
      options: { idempotencyKey: expect.stringContaining('fcc_billing:cancel_at_renewal:') },
    })
    expect(Object.keys(state.subscriptionUpdates[0].params)).toEqual(['cancel_at_period_end'])
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      stripeCancelAtPeriodEnd: true,
      stripeCancellationLastAction: 'scheduled_at_period_end',
    })
    expect(state.data['leases.json'].leases[0].status).toBe('active')
    expect(state.audits[0]).toMatchObject({ action: 'stripe_subscription_cancel_at_period_end_scheduled' })
  })

  it('separately previews and confirms removal of a scheduled cancellation', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    state.subscriptionCancelAtPeriodEnd = true
    state.data['leases.json'] = { leases: [{
      id: 'lease_acme',
      status: 'active',
      clientAccountId: 'account_acme',
      stripeSubscriptionId: 'sub_private_one',
      stripeCancelAtPeriodEnd: true,
    }] }
    state.data['accounts.json'] = { accounts: [{ id: 'account_acme', name: 'Acme Heating' }] }

    const preview = await (await POST(post({ action: 'preview-client-cancellation', leaseId: 'lease_acme' }))).json()
    expect(preview.cancellation).toMatchObject({ canSchedule: false, canUndo: true })
    const response = await POST(post({
      action: 'undo-client-cancellation',
      leaseId: 'lease_acme',
      previewToken: preview.previewToken,
      confirmation: 'KEEP SUBSCRIPTION ACTIVE',
      requestId: 'undo-cancel-one',
    }))
    expect(response.status).toBe(200)
    expect(state.subscriptionUpdates[0].params).toEqual({ cancel_at_period_end: false })
    expect(state.data['leases.json'].leases[0]).toMatchObject({
      status: 'active',
      stripeCancelAtPeriodEnd: false,
      stripeCancellationLastAction: 'schedule_removed',
    })
    expect(state.audits[0]).toMatchObject({ action: 'stripe_subscription_cancel_at_period_end_removed' })
  })
})
