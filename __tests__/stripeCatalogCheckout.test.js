import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {},
  writes: [],
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  writeData: vi.fn((filename, data) => {
    state.data[filename] = data
    state.writes.push([filename, data])
  }),
}))
vi.mock('../lib/notifications', () => ({ pushNotification: vi.fn() }))

import { createProductCheckoutSession } from '../lib/productCheckout'
import { POST as createLeaseCheckout } from '../app/api/stripe/lease-checkout/route'

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data }
}

function stripePrice({ id, lookupKey, amount, catalogKey }) {
  return {
    id,
    active: true,
    lookup_key: lookupKey,
    unit_amount: amount,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    product: { id: `prod_${catalogKey}`, active: true, metadata: { managed_by: 'farrington-command-center', fcc_catalog_key: catalogKey } },
  }
}

beforeEach(() => {
  state.writes = []
  state.data = {
    'credentials.json': { credentials: [{ name: 'Stripe', fields: [{ label: 'Secret (P)', value: 'sk_live_not_a_real_key' }] }] },
    'product-orders.json': { orders: [] },
    'pricing-tiers.json': {
      tiers: [{ id: 'receptionist', name: 'Receptionist', tagline: 'Answer calls', monthlyFee: 99 }],
      addons: {
        tools: [{ id: 'twilio-extra-line', name: 'Extra phone line', monthlyFee: 5 }],
        specialties: [],
        premiumModels: [],
      },
    },
  }
  vi.restoreAllMocks()
})

describe('persistent Stripe catalog checkout', () => {
  it('uses exact persistent monthly and setup Prices for a managed package', async () => {
    let checkoutBody
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/prices?')) {
        const lookupKey = new URL(value).searchParams.get('lookup_keys[]')
        if (lookupKey.includes('_monthly_')) return response({ data: [stripePrice({ id: 'price_operator_monthly', lookupKey, amount: 39900, catalogKey: 'fcc_managed_package_operator_crm' })] })
        return response({ data: [{ ...stripePrice({ id: 'price_operator_setup', lookupKey, amount: 150000, catalogKey: 'fcc_managed_package_operator_crm' }), recurring: null }] })
      }
      checkoutBody = new URLSearchParams(options.body)
      return response({ id: 'cs_operator', client_secret: 'cs_secret_operator' })
    }))

    const result = await createProductCheckoutSession({
      body: {
        productId: 'farrington-command-center',
        packageId: 'operator-crm',
        buyer: { email: 'owner@example.com', name: 'Owner', company: 'Example Co' },
      },
      origin: 'https://farringtondevelopment.com',
    })

    expect(result.monthlyFee).toBe(399)
    expect(checkoutBody.get('line_items[0][price]')).toBe('price_operator_monthly')
    expect(checkoutBody.get('line_items[1][price]')).toBe('price_operator_setup')
    expect(checkoutBody.has('line_items[0][price_data][unit_amount]')).toBe(false)
  })

  it('fails closed when a managed recurring Price has not been synced', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: [] })))
    await expect(createProductCheckoutSession({
      body: {
        productId: 'farrington-command-center',
        packageId: 'operator-crm',
        buyer: { email: 'owner@example.com', name: 'Owner', company: 'Example Co' },
      },
      origin: 'https://farringtondevelopment.com',
    })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('Stripe catalog sync required') })
  })

  it('fails public agent lease checkout closed until a tier is explicitly audited for complete delivery', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const request = new Request('http://local/api/stripe/lease-checkout', {
      method: 'POST',
      body: JSON.stringify({
        tierId: 'receptionist',
        addons: { tools: ['twilio-extra-line'], specialties: [], premiumModels: [] },
        customer: { email: 'owner@example.com', name: 'Owner', company: 'Example Co' },
      }),
    })
    const result = await createLeaseCheckout(request)
    const body = await result.json()

    expect(result.status).toBe(409)
    expect(body).toMatchObject({ ok: false, code: 'managed_configuration_required' })
    expect(body.error).toContain('request configuration')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not contact Stripe even when a blocked public tier has no synced recurring Price', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request('http://local/api/stripe/lease-checkout', {
      method: 'POST',
      body: JSON.stringify({ tierId: 'receptionist', addons: {}, customer: { email: 'owner@example.com' } }),
    })
    const result = await createLeaseCheckout(request)
    const body = await result.json()

    expect(result.status).toBe(409)
    expect(body.code).toBe('managed_configuration_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
