import { create, loadAll } from './entityStore'

function clean(value, limit = 240) {
  return String(value || '').trim().slice(0, limit)
}

function requestTypeFor(option) {
  if (option === 'stripe-financing') return 'business-financing'
  if (option === 'lease-to-own') return 'lease-to-own-review'
  return 'milestone-plan-review'
}

export function recordProductTermsRequest(order = {}) {
  if (!order.id || !order.buyer?.email) return null
  const requestType = requestTypeFor(order.paymentOption)
  const requestKey = `${requestType}:${clean(order.product, 80)}:${clean(order.packageId, 80)}:${clean(order.buyer.email, 180).toLowerCase()}`
  const existing = loadAll('leads').find(lead => lead.salesRequest?.requestKey === requestKey && lead.status !== 'disqualified')
  if (existing) return existing

  return create('leads', {
    name: clean(order.buyer.name, 120),
    email: clean(order.buyer.email, 180).toLowerCase(),
    phone: clean(order.buyer.phone, 60),
    businessName: clean(order.buyer.company, 160),
    source: requestType,
    status: 'new',
    notes: [
      `${order.paymentOptionLabel || 'Payment terms review'} requested for ${order.productName || 'Farrington Command Center'} ${order.packageName || ''}.`,
      `Published implementation price: $${Number(order.setupPrice || 0).toLocaleString()}.`,
      'This is an internal follow-up request only. No lender application was submitted and no approval or terms were promised.',
      clean(order.notes, 500),
    ].filter(Boolean).join('\n'),
    tags: ['command-center', 'product-inquiry', requestType],
    productOpportunity: clean(order.productName || 'Farrington Command Center', 160),
    serviceLine: 'Farrington Development - Command Center',
    estimatedBuildLow: Number(order.setupPrice || 0),
    estimatedBuildHigh: Number(order.setupPriceHigh || order.setupPrice || 0),
    dueToday: 0,
    salesRequest: {
      requestKey,
      orderId: order.id,
      type: requestType,
      packageId: clean(order.packageId, 80),
      packageName: clean(order.packageName, 160),
      submittedExternally: false,
      approvalStatus: 'not_submitted',
    },
  })
}

export function ensurePaidProductOnboardingTask(order = {}) {
  if (!order.id || order.status !== 'paid' || !order.stripeSessionId) return null
  const existing = loadAll('tasks').find(task => task.source === 'paid-product-order' && task.sourceRef === order.id)
  if (existing) return existing

  return create('tasks', {
    title: `Start paid onboarding - ${clean(order.buyer?.company || order.buyer?.name || order.packageName, 120)}`,
    description: [
      `Stripe-verified product order ${order.id}.`,
      `${order.productName || 'Farrington Command Center'} - ${order.packageName || 'package'}.`,
      `Amount paid: $${Number(order.amountPaid || 0).toLocaleString()}.`,
      'Review the signed scope, create the client/project records, and begin fulfillment. This task does not activate or provision services automatically.',
    ].join('\n'),
    status: 'todo',
    priority: 'high',
    dueDate: null,
    linkedTo: {},
    tags: ['paid-product-order', 'onboarding', clean(order.product, 80)].filter(Boolean),
    completedAt: null,
    source: 'paid-product-order',
    sourceRef: order.id,
    paymentEvidence: {
      stripeSessionId: clean(order.stripeSessionId, 160),
      stripePaymentIntentId: clean(order.stripePaymentIntentId, 160),
      verifiedAt: order.paidAt || new Date().toISOString(),
    },
  })
}
