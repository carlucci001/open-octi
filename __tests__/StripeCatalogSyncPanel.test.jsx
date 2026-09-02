import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }) => <div>{children}</div>,
  EmbeddedCheckout: () => <div>Embedded Stripe Checkout</div>,
}))

import StripeCatalogSyncPanel from '../app/products/StripeCatalogSyncPanel'

const catalogPreview = {
  ok: true,
  canApply: true,
  pendingChanges: true,
  previewToken: 'catalog.preview-token',
  plan: {
    ok: true,
    mode: 'dry-run',
    catalogHash: 'abc1234567890cataloghash',
    catalogVersion: '2026-07-16',
    summary: { create: 2, update: 1, unchanged: 3, conflicts: 0, errors: 0 },
    operations: [{
      action: 'create',
      resource: 'price',
      catalogKey: 'receptionist',
      lookupKey: 'fcc_receptionist_month',
      reason: 'Price is missing',
    }],
    errors: [],
  },
  lastSync: {
    catalogHash: 'older-catalog-hash',
    status: 'synced',
    completedAt: '2026-07-15T12:00:00.000Z',
  },
  clients: [{
    leaseId: 'lease_acme',
    accountName: 'Acme Heating',
    tierName: 'Receptionist',
    hasStripeSubscription: true,
    stripeSubscriptionStatus: 'active',
    billingStatus: 'paid',
    currentPeriodEnd: '2026-08-16T12:00:00.000Z',
    verifiedAt: '2026-07-16T12:00:00.000Z',
  }, {
    leaseId: 'lease_new',
    accountName: 'New Client',
    tierName: 'Receptionist',
    hasStripeSubscription: false,
    stripeSubscriptionStatus: 'not_connected',
    billingStatus: 'setup_required',
  }],
}

const migrationPreview = {
  ok: true,
  canApply: true,
  previewToken: 'migration.preview-token',
  summary: { subscriptions: 4, items: 2, unchanged: 1, errors: 0 },
}

const clientSubscriptionPreview = {
  ok: true,
  canApply: true,
  canCreateCheckout: false,
  previewToken: 'client.preview-token',
  lease: { leaseId: 'lease_acme', accountName: 'Acme Heating', tierName: 'Receptionist' },
  plan: {
    ok: true,
    planHash: 'client-plan-hash',
    monthlyAmountCents: 19900,
    checkoutRequired: false,
    summary: { add: 0, replace: 1, remove: 0, current: 0 },
    errors: [],
  },
}

const clientCheckoutPreview = {
  ok: true,
  canApply: false,
  canCreateCheckout: true,
  previewToken: 'checkout.preview-token',
  lease: { leaseId: 'lease_new', accountName: 'New Client', tierName: 'Receptionist' },
  plan: {
    ok: true,
    planHash: 'checkout-plan-hash',
    monthlyAmountCents: 19900,
    checkoutRequired: true,
    summary: { add: 1, replace: 0, remove: 0, current: 0 },
    errors: [],
  },
}

describe('StripeCatalogSyncPanel', () => {
  let fetchMock
  let cancelScheduled

  beforeEach(() => {
    cancelScheduled = false
    fetchMock = vi.fn(async (url, options = {}) => {
      if (url !== '/api/admin/stripe-catalog-sync') throw new Error(`Unexpected request: ${url}`)
      if (!options.method) return { ok: true, json: async () => catalogPreview }
      const body = JSON.parse(options.body)
      if (body.action === 'apply') {
        return { ok: true, json: async () => ({ ok: true, idempotent: false, result: { mode: 'apply' } }) }
      }
      if (body.action === 'preview-existing-subscriptions') {
        return { ok: true, json: async () => migrationPreview }
      }
      if (body.action === 'migrate-existing-subscriptions') {
        return { ok: true, json: async () => ({ ok: true, idempotent: false, result: { applied: 2 } }) }
      }
      if (body.action === 'preview-client-subscription') {
        return { ok: true, json: async () => body.leaseId === 'lease_new' ? clientCheckoutPreview : clientSubscriptionPreview }
      }
      if (body.action === 'update-client-subscription') {
        return { ok: true, json: async () => ({ ok: true, idempotent: false, result: { applied: true } }) }
      }
      if (body.action === 'create-client-billing-setup') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            checkout: {
              clientSecret: 'cs_test_embedded_secret',
              publishableKey: 'pk_test_mock_only',
              monthlyAmountCents: 19900,
              leaseId: 'lease_new',
            },
          }),
        }
      }
      if (body.action === 'preview-client-cancellation') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            previewToken: cancelScheduled ? 'cancel.undo-token' : 'cancel.preview-token',
            lease: { leaseId: 'lease_acme', accountName: 'Acme Heating' },
            cancellation: {
              ok: true,
              status: 'active',
              cancelAtPeriodEnd: cancelScheduled,
              currentPeriodEnd: '2026-08-16T00:00:00.000Z',
              canSchedule: !cancelScheduled,
              canUndo: cancelScheduled,
              errors: [],
            },
          }),
        }
      }
      if (body.action === 'cancel-client-at-renewal') {
        cancelScheduled = true
        return { ok: true, json: async () => ({ ok: true, result: { cancelAtPeriodEnd: true } }) }
      }
      if (body.action === 'undo-client-cancellation') {
        cancelScheduled = false
        return { ok: true, json: async () => ({ ok: true, result: { cancelAtPeriodEnd: false } }) }
      }
      throw new Error(`Unexpected action: ${body.action}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('previews backend drift and requires typed owner confirmation before updating Stripe', async () => {
    render(<StripeCatalogSyncPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Preview Stripe changes' }))
    expect(await screen.findByText('Pending Stripe changes')).toBeInTheDocument()
    expect(screen.getByText('abc123456789…')).toBeInTheDocument()
    expect(screen.getByText('Price is missing')).toBeInTheDocument()
    expect(screen.getByText('Acme Heating')).toBeInTheDocument()

    const update = screen.getByRole('button', { name: 'Update Stripe' })
    expect(update).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type UPDATE STRIPE CATALOG'), { target: { value: 'UPDATE STRIPE CATALOG' } })
    expect(update).toBeEnabled()
    fireEvent.click(update)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'
        && JSON.parse(options.body).action === 'apply')
      expect(JSON.parse(call[1].body)).toMatchObject({
        action: 'apply',
        previewToken: 'catalog.preview-token',
        confirmation: 'UPDATE STRIPE CATALOG',
        requestId: expect.any(String),
        existingSubscriptions: { mode: 'none' },
      })
    })
    expect(await screen.findByText('Stripe catalog updated from the backend.')).toBeInTheDocument()
  })

  it('loads the dedicated client subscription workspace without exposing catalog mutation controls', async () => {
    render(<StripeCatalogSyncPanel mode="clients" />)
    expect(await screen.findByText('Client subscriptions')).toBeInTheDocument()
    expect(screen.getByText('Acme Heating')).toBeInTheDocument()
    expect(screen.queryByText('Stripe catalog control')).not.toBeInTheDocument()
    expect(screen.queryByText('Existing subscriptions')).not.toBeInTheDocument()
  })

  it('keeps immediate no-proration subscription migration separate and labels its timing accurately', async () => {
    render(<StripeCatalogSyncPanel />)

    expect(screen.getByText('Immediate item update · no proration')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Preview subscription migration' }))
    expect(await screen.findByText('Items to migrate')).toBeInTheDocument()

    const migrate = screen.getByRole('button', { name: 'Update without proration' })
    expect(migrate).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type MIGRATE WITHOUT PRORATION'), { target: { value: 'MIGRATE WITHOUT PRORATION' } })
    fireEvent.click(migrate)

    await waitFor(() => {
      const previewCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'
        && JSON.parse(options.body).action === 'preview-existing-subscriptions')
      const applyCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'
        && JSON.parse(options.body).action === 'migrate-existing-subscriptions')
      expect(JSON.parse(previewCall[1].body)).toMatchObject({
        existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
      })
      expect(JSON.parse(applyCall[1].body)).toMatchObject({
        confirmation: 'MIGRATE WITHOUT PRORATION',
        existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
      })
    })
    expect(await screen.findByText('Stripe items were updated immediately without a prorated charge.')).toBeInTheDocument()
  })

  it('previews and explicitly updates one client subscription without proration', async () => {
    render(<StripeCatalogSyncPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview Stripe changes' }))
    await screen.findByText('Client subscriptions')

    fireEvent.click(screen.getByRole('button', { name: 'Preview Stripe billing for Acme Heating' }))
    expect(await screen.findByText('$199.00 / month')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type UPDATE CLIENT SUBSCRIPTION'), { target: { value: 'UPDATE CLIENT SUBSCRIPTION' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update client in Stripe' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'
        && JSON.parse(options.body).action === 'update-client-subscription')
      expect(JSON.parse(call[1].body)).toMatchObject({
        leaseId: 'lease_acme',
        previewToken: 'client.preview-token',
        confirmation: 'UPDATE CLIENT SUBSCRIPTION',
        existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
      })
    })
  })

  it('prepares consent-gated embedded Checkout for a client without a subscription', async () => {
    render(<StripeCatalogSyncPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview Stripe changes' }))
    await screen.findByText('Client subscriptions')

    fireEvent.click(screen.getByRole('button', { name: 'Preview Stripe billing for New Client' }))
    expect(await screen.findByText(/has no Stripe subscription/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /customer requested or approved/ }))
    fireEvent.change(screen.getByLabelText('Type CREATE BILLING SETUP'), { target: { value: 'CREATE BILLING SETUP' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create billing setup' }))

    expect(await screen.findByText('Embedded Stripe Checkout')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'
      && JSON.parse(options.body).action === 'create-client-billing-setup')
    expect(JSON.parse(call[1].body)).toMatchObject({
      leaseId: 'lease_new',
      previewToken: 'checkout.preview-token',
      confirmation: 'CREATE BILLING SETUP',
      customerConsent: true,
      requestId: expect.any(String),
    })
  })

  it('previews, schedules, and can undo cancellation only at renewal', async () => {
    render(<StripeCatalogSyncPanel mode="clients" />)
    await screen.findByText('Client subscriptions')

    fireEvent.click(screen.getByRole('button', { name: 'Preview renewal status for Acme Heating' }))
    expect(await screen.findByText(/never cancels immediately/)).toBeInTheDocument()
    const cancelButton = screen.getByRole('button', { name: 'Cancel at renewal' })
    expect(cancelButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type CANCEL AT RENEWAL'), { target: { value: 'CANCEL AT RENEWAL' } })
    fireEvent.click(cancelButton)

    expect(await screen.findByText(/Cancellation is scheduled/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type KEEP SUBSCRIPTION ACTIVE'), { target: { value: 'KEEP SUBSCRIPTION ACTIVE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Keep subscription active' }))

    await waitFor(() => {
      const bodies = fetchMock.mock.calls
        .filter(([, options]) => options?.method === 'POST')
        .map(([, options]) => JSON.parse(options.body))
      expect(bodies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'cancel-client-at-renewal',
          confirmation: 'CANCEL AT RENEWAL',
          previewToken: 'cancel.preview-token',
        }),
        expect.objectContaining({
          action: 'undo-client-cancellation',
          confirmation: 'KEEP SUBSCRIPTION ACTIVE',
          previewToken: 'cancel.undo-token',
        }),
      ]))
    })
  })
})
