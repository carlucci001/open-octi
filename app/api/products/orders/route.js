import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { deleteProductOrder, deleteProductOrders, findProductOrder, loadProductOrders, updateProductOrder } from '@/lib/productCheckout'
import { pushNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const url = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)))
  return NextResponse.json({
    ok: true,
    orders: loadProductOrders().slice(0, limit),
    fetchedAt: new Date().toISOString(),
  })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 })
  }

  const action = body.action || 'update'
  const id = body.id || body.orderId
  if (action === 'bulk_delete') {
    const result = deleteProductOrders(body.ids || [])
    return NextResponse.json({ ok: true, ...result })
  }
  if (!id) return NextResponse.json({ ok: false, error: 'order id required' }, { status: 400 })

  if (action === 'delete') {
    const deleted = deleteProductOrder(id)
    if (!deleted) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })
    return NextResponse.json({ ok: true, deleted: 1 })
  }

  const currentOrder = findProductOrder(id)
  if (!currentOrder) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })
  const requestedStatus = action === 'converted' ? 'converted' : body.status
  if (requestedStatus === 'paid') {
    return NextResponse.json({ ok: false, error: 'Paid status can only be set by a verified Stripe payment webhook' }, { status: 409 })
  }
  if (requestedStatus === 'converted' && !['paid', 'converted'].includes(currentOrder.status)) {
    return NextResponse.json({ ok: false, error: 'Payment must be verified before onboarding or conversion can begin' }, { status: 409 })
  }

  const patch = {}
  if (action === 'status' || action === 'update') {
    patch.status = body.status || undefined
    patch.statusNote = body.note || body.statusNote || ''
    patch.followUpAt = body.followUpAt || undefined
    patch.owner = body.owner || undefined
  } else if (action === 'follow-up') {
    patch.status = 'needs_follow_up'
    patch.statusNote = body.note || 'Needs follow-up.'
    patch.followUpAt = body.followUpAt || new Date().toISOString()
  } else if (action === 'converted') {
    patch.status = 'converted'
    patch.statusNote = body.note || 'Converted into CRM records.'
    patch.fulfillmentStatus = 'in_progress'
    patch.activationStatus = 'not_started'
    patch.accountId = body.accountId || undefined
    patch.contactId = body.contactId || undefined
    patch.projectId = body.projectId || undefined
    patch.convertedAt = new Date().toISOString()
  } else {
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  }

  Object.keys(patch).forEach(key => patch[key] === undefined && delete patch[key])
  const order = updateProductOrder(id, patch)
  if (!order) return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 })

  if (action === 'follow-up') {
    pushNotification({
      source: 'orders',
      severity: 'warn',
      title: `Order follow-up: ${order.productName || 'Product order'}`,
      body: `${order.buyer?.company || order.buyer?.name || 'Buyer'} needs follow-up on ${order.packageName || 'package'}.`,
      dedupeKey: `order-follow-up:${order.id}`,
      link: { tab: 'products', section: 'orders', orderId: order.id },
    })
  }

  return NextResponse.json({ ok: true, order })
}
