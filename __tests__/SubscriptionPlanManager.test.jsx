import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app/components/ThemedSelect', () => ({
  default: ({ children, value, onChange, ...props }) => <select value={value} onChange={onChange} {...props}>{children}</select>,
}))

import SubscriptionPlanManager from '../app/products/SubscriptionPlanManager'

const initial = {
  ok: true,
  catalogHash: 'catalog_hash_one',
  plans: [{
    id: 'receptionist',
    name: 'Receptionist',
    tagline: 'Answer every call',
    monthlyFee: 99,
    color: '#3b82f6',
    capabilities: ['Inbound calls'],
    creditAllowance: { includedCredits: 8500 },
  }],
  addons: [{ id: 'stripe', group: 'tools', name: 'Stripe processing', monthlyFee: 50, description: 'Payments' }],
}

describe('SubscriptionPlanManager', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(async (url, options = {}) => {
      if (url !== '/api/admin/subscription-plans') throw new Error(`Unexpected request: ${url}`)
      if (!options.method) return { ok: true, json: async () => initial }
      const body = JSON.parse(options.body)
      if (body.action === 'upsert-plan') {
        return {
          ok: true,
          json: async () => ({
            ...initial,
            stripeSyncRequired: true,
            saved: {
              type: 'plan',
              created: false,
              item: { ...initial.plans[0], monthlyFee: Number(body.plan.monthlyFee), creditAllowance: { includedCredits: Number(body.plan.includedCredits) } },
            },
          }),
        }
      }
      if (body.action === 'upsert-addon') {
        return {
          ok: true,
          json: async () => ({
            ...initial,
            stripeSyncRequired: true,
            saved: { type: 'addon', created: false, item: { ...initial.addons[0], monthlyFee: Number(body.addon.monthlyFee) } },
          }),
        }
      }
      throw new Error(`Unexpected action: ${body.action}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('edits a monthly plan and routes the resulting backend drift to Stripe review', async () => {
    const onStripeReview = vi.fn()
    render(<SubscriptionPlanManager onStripeReview={onStripeReview} />)

    expect(await screen.findByText('Answer every call')).toBeInTheDocument()
    expect(screen.getByText('8,500')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Receptionist' }))
    fireEvent.change(screen.getByLabelText('Monthly price'), { target: { value: '129' } })
    fireEvent.change(screen.getByLabelText('Included credits per paid period'), { target: { value: '10000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(JSON.parse(call[1].body)).toMatchObject({
        action: 'upsert-plan',
        plan: { id: 'receptionist', monthlyFee: '129', includedCredits: '10000' },
        requestId: expect.any(String),
      })
    })
    expect(await screen.findByText(/Stripe review pending/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review Stripe changes' }))
    expect(onStripeReview).toHaveBeenCalledOnce()
  })

  it('edits the real add-on catalog and never updates Stripe silently', async () => {
    render(<SubscriptionPlanManager />)
    await screen.findByText('Answer every call')
    fireEvent.click(screen.getByRole('button', { name: 'Add-on catalog' }))
    expect(screen.getByText('Stripe processing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Stripe processing' }))
    fireEvent.change(screen.getByLabelText('Monthly price'), { target: { value: '65' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save add-on' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(JSON.parse(call[1].body)).toMatchObject({
        action: 'upsert-addon',
        addon: { id: 'stripe', group: 'tools', monthlyFee: '65' },
      })
    })
    expect(await screen.findByText(/Stripe review pending/)).toBeInTheDocument()
  })
})
