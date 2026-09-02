import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ order: null }))
const mocks = vi.hoisted(() => ({ updateProductOrder: vi.fn() }))

vi.mock('../lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => ({ error: null })),
  requireCrmWrite: vi.fn(async () => ({ error: null })),
}))

vi.mock('../lib/productCheckout', () => ({
  deleteProductOrder: vi.fn(),
  deleteProductOrders: vi.fn(),
  findProductOrder: vi.fn(() => state.order),
  loadProductOrders: vi.fn(() => state.order ? [state.order] : []),
  updateProductOrder: mocks.updateProductOrder,
}))

vi.mock('../lib/notifications', () => ({ pushNotification: vi.fn() }))

import { POST } from '../app/api/products/orders/route'

function request(body) {
  return new Request('https://openocti.local/api/products/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.order = { id: 'order-one', status: 'checkout_started' }
  mocks.updateProductOrder.mockReset().mockImplementation((id, patch) => ({ ...state.order, ...patch, id }))
})

describe('product order payment guard', () => {
  it('rejects manually setting paid status', async () => {
    const response = await POST(request({ action: 'status', id: 'order-one', status: 'paid' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ ok: false })
    expect(mocks.updateProductOrder).not.toHaveBeenCalled()
  })

  it('rejects onboarding conversion before verified payment', async () => {
    const response = await POST(request({ action: 'converted', id: 'order-one' }))
    expect(response.status).toBe(409)
    expect(mocks.updateProductOrder).not.toHaveBeenCalled()
  })

  it('allows a paid order to enter owner-reviewed onboarding', async () => {
    state.order.status = 'paid'
    const response = await POST(request({ action: 'converted', id: 'order-one', projectId: 'project-one' }))
    expect(response.status).toBe(200)
    expect(mocks.updateProductOrder).toHaveBeenCalledWith('order-one', expect.objectContaining({
      status: 'converted',
      fulfillmentStatus: 'in_progress',
      activationStatus: 'not_started',
    }))
  })
})
