import { randomUUID } from 'node:crypto'
import { mutateData, readData } from '../dataStore'
import { genId } from '../entityStore'
import { provisionPaidPressAutomation } from '../portal-automation-provisioning'
import { sendOutboundEmail } from '../outbound-email'
import { setPressCadence } from './cadence'
import { PRESS_RELEASE_AGENT_ID } from './release-agent-config'

export const PRESS_STRIPE_ACCOUNT_ID = 'acct_REDACTED'
export const PRESS_ORDER_PLANS = Object.freeze({
  single: { id: 'single', label: 'One-off press release', lookupKey: 'fcc_managed_package_press_release_single', mode: 'payment', frequency: null, amountCents: 29900 },
  'cadence-2w': { id: 'cadence-2w', label: 'Press release every 2 weeks', lookupKey: 'fcc_managed_package_press_release_cadence_2w', mode: 'subscription', frequency: '2w', amountCents: 44900 },
  'cadence-monthly': { id: 'cadence-monthly', label: 'Monthly press release', lookupKey: 'fcc_managed_package_press_release_monthly', mode: 'subscription', frequency: 'monthly', amountCents: 24900 },
})

const ORDER_FILE = 'press-orders.json'

function clean(value, max = 500) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) }

export function requirePressStripeKey(key, { nodeEnv = process.env.NODE_ENV } = {}) {
  const value = clean(key, 300)
  if (value.startsWith('sk_test_')) return { key: value, mode: 'test', livemode: false }
  if (value.startsWith('sk_live_') && nodeEnv === 'production') return { key: value, mode: 'live', livemode: true }
  if (value.startsWith('sk_live_')) throw new Error('Stripe live checkout is allowed only in production')
  throw new Error('A Stripe secret key is required for press release checkout')
}

export function requireStripeTestKey(key) {
  const value = requirePressStripeKey(key, { nodeEnv: 'test' })
  if (value.mode !== 'test') throw new Error('Press release acceptance checkout requires a Stripe TEST secret key')
  return value.key
}

export function pressOrderPlan(id) {
  const plan = PRESS_ORDER_PLANS[clean(id, 80)]
  if (!plan) throw new Error('Unknown press release order plan')
  return plan
}

export async function createPressCheckout({ stripe, key, account, tenantId, planId, origin, testDouble = false, nodeEnv = process.env.NODE_ENV } = {}) {
  const plan = pressOrderPlan(planId)
  if (!account?.id || !tenantId) throw new Error('Tenant-scoped account is required')
  if (testDouble) {
    return { ok: true, testMode: true, testDouble: true, session: { id: `cs_test_${randomUUID()}`, livemode: false, mode: plan.mode, payment_status: 'paid', status: 'complete', customer: 'cus_test_press', subscription: plan.mode === 'subscription' ? 'sub_test_press' : null, metadata: { purpose: 'press_release_order', accountId: account.id, tenantId, planId: plan.id, lookupKey: plan.lookupKey } } }
  }
  const stripeMode = requirePressStripeKey(key, { nodeEnv })
  const stripeAccount = await stripe.accounts.retrieve()
  if (stripeAccount?.id !== PRESS_STRIPE_ACCOUNT_ID) throw new Error('Stripe key is not connected to the Farrington Development account')
  const prices = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 })
  const price = prices?.data?.[0]
  if (!price || price.livemode !== stripeMode.livemode || Number(price.unit_amount) !== plan.amountCents) throw new Error(`Stripe ${stripeMode.mode.toUpperCase()} price is not configured at the approved amount for ${plan.lookupKey}`)
  const session = await stripe.checkout.sessions.create({
    mode: plan.mode, line_items: [{ price: price.id, quantity: 1 }], customer_email: account.email || undefined,
    success_url: `${String(origin).replace(/\/$/, '')}/portal/press-desk?order=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${String(origin).replace(/\/$/, '')}/portal/press-desk?order=cancelled`,
    metadata: { purpose: 'press_release_order', accountId: account.id, tenantId, planId: plan.id, lookupKey: plan.lookupKey },
    ...(plan.mode === 'subscription' ? { subscription_data: { metadata: { purpose: 'press_release_order', accountId: account.id, tenantId, planId: plan.id } } } : {}),
  })
  if (session.livemode !== stripeMode.livemode) throw new Error('Stripe checkout mode did not match the resolved key')
  return { ok: true, testMode: stripeMode.mode === 'test', stripeMode: stripeMode.mode, testDouble: false, session: { id: session.id, url: session.url, livemode: session.livemode, mode: session.mode } }
}

function makeOrderReceipt({ order, account, plan, now }) {
  const nextDate = plan.frequency ? new Date(new Date(now).getTime() + (plan.frequency === '2w' ? 14 : 30) * 86400000).toISOString() : null
  return mutateData('documents.json', current => {
    const data = current && typeof current === 'object' ? current : { documents: [] }
    data.documents = Array.isArray(data.documents) ? data.documents : []
    const document = { id: genId('doc'), templateId: 'press-release-order-receipt', templateName: 'Press release order receipt', title: `Order receipt — ${plan.label}`, clientId: account.id, clientName: account.name || '', linkedTo: { accountId: account.id, pressOrderId: order.id }, portalVisible: true, status: 'completed', requiresSignature: false, signature: null, body: `# Press release order receipt\n\nService: ${plan.label}\n\nAmount: $${(plan.amountCents / 100).toFixed(2)}${plan.mode === 'subscription' ? ' monthly' : ''}\n\nStripe mode: ${order.stripeMode.toUpperCase()}\n\nCadence: ${plan.frequency || 'one-off'}\n\nNext release date: ${nextDate || 'Client starts when ready'}\n\nAgent: Reese\n`, values: { planId: plan.id, lookupKey: plan.lookupKey, amountCents: plan.amountCents, stripeMode: order.stripeMode, cadence: plan.frequency, nextDate }, createdAt: now, updatedAt: now }
    data.documents.push(document)
    return { data, result: document }
  })
}

export async function processPressOrderEvent(event, options = {}) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event?.type)) return { handled: false }
  const session = event.data?.object || {}
  if (session.metadata?.purpose !== 'press_release_order') return { handled: false }
  const liveEvent = event.livemode === true || session.livemode === true
  if (liveEvent) {
    if ((options.nodeEnv || process.env.NODE_ENV) !== 'production') throw new Error('Live-mode press order events are allowed only in production')
    if (!options.stripe?.accounts?.retrieve) throw new Error('Live-mode press order events require resolved Stripe account verification')
    const stripeAccount = await options.stripe.accounts.retrieve()
    if (stripeAccount?.id !== PRESS_STRIPE_ACCOUNT_ID) throw new Error('Live-mode press order event is not connected to the Farrington Development account')
  }
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) return { handled: true, provisioned: false, reason: 'payment_not_confirmed' }
  const accountId = clean(session.metadata.accountId, 160)
  const tenantId = clean(session.metadata.tenantId, 160)
  const plan = pressOrderPlan(session.metadata.planId)
  const account = ((readData('accounts.json') || {}).accounts || []).find(item => item.id === accountId && (!item.tenantId || item.tenantId === tenantId))
  if (!account) throw new Error('Press order account not found')
  const existing = ((readData(ORDER_FILE) || {}).orders || []).find(item => item.stripeSessionId === session.id || item.stripeEventId === event.id)
  if (existing) return { handled: true, provisioned: false, idempotent: true, order: existing }
  const now = new Date(options.now || Date.now()).toISOString()
  const order = mutateData(ORDER_FILE, current => {
    const data = current && typeof current === 'object' ? current : { orders: [] }
    data.orders = Array.isArray(data.orders) ? data.orders : []
    const row = { id: genId('porder'), stripeEventId: event.id, stripeSessionId: session.id, stripeSubscriptionId: clean(session.subscription, 160) || null, stripeMode: liveEvent ? 'live' : 'test', accountId, tenantId, planId: plan.id, lookupKey: plan.lookupKey, amountCents: plan.amountCents, cadence: plan.frequency, status: 'active', createdAt: now, updatedAt: now }
    data.orders.unshift(row)
    return { data, result: row }
  })
  const provisioning = provisionPaidPressAutomation({ account, tenantId, orderId: order.id, frequency: plan.frequency, now })
  if (plan.frequency) setPressCadence({ accountId, tenantId, frequency: plan.frequency, nextDate: null, paused: false, source: `stripe-${liveEvent ? 'live' : 'test'}-order` })
  mutateData('accounts.json', current => {
    const data = current && typeof current === 'object' ? current : { accounts: [] }
    const row = (data.accounts || []).find(item => item.id === accountId)
    if (row) { row.pressService = { active: true, agentId: PRESS_RELEASE_AGENT_ID, planId: plan.id, orderId: order.id, profileCheckSeededAt: now }; row.updatedAt = now }
    return { data, result: row }
  })
  const receipt = makeOrderReceipt({ order, account, plan, now })
  let emailReceipt = { status: 'not-sent', reason: 'PRESS_TEST_INBOX is not configured' }
  const inbox = clean(process.env.PRESS_TEST_INBOX, 254)
  if (inbox) {
    try { const sent = await sendOutboundEmail({ to: inbox, subject: `TEST order receipt: ${plan.label}`, text: receipt.body }, options.emailOptions); emailReceipt = { status: 'sent', id: sent?.id || null, to: inbox } }
    catch (error) { emailReceipt = { status: 'blocked', reason: clean(error?.message, 240), to: inbox } }
  }
  return { handled: true, provisioned: true, order, provisioning, receipt, emailReceipt }
}

export function listPressOrders({ accountId, tenantId }) {
  return ((readData(ORDER_FILE) || {}).orders || []).filter(item => item.accountId === accountId && (!tenantId || item.tenantId === tenantId))
}

export function pausePressOrder({ accountId, tenantId, orderId, paused = true }) {
  const order = mutateData(ORDER_FILE, current => {
    const data = current && typeof current === 'object' ? current : { orders: [] }
    const row = (data.orders || []).find(item => item.id === orderId && item.accountId === accountId && (!tenantId || item.tenantId === tenantId))
    if (!row) throw new Error('Press order not found')
    row.status = paused ? 'paused' : 'active'; row.updatedAt = new Date().toISOString()
    return { data, result: row }
  })
  if (order.cadence) {
    mutateData('accounts.json', current => {
      const data = current && typeof current === 'object' ? current : { accounts: [] }
      const account = (data.accounts || []).find(item => item.id === accountId)
      if (account?.pressSchedule) { account.pressSchedule.paused = Boolean(paused); account.pressSchedule.updatedAt = new Date().toISOString() }
      return { data, result: account?.pressSchedule || null }
    })
  }
  return order
}
