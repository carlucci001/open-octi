import { mutateData, readData, writeData } from './dataStore'
import { pushNotification } from './notifications'
import { markProductOrderPaid } from './productCheckout'
import { changeInvoice, invoiceCents, invoiceRecord } from './invoice-lifecycle-state'

function genId(prefix = 'pay') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function fmtUSD(amount) {
  return Number(amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function norm(value) {
  return String(value || '').trim().toLowerCase()
}

function loadAccounts() {
  const data = readData('accounts.json') || { accounts: [] }
  return data.accounts || data.clients || []
}

function findAccount({ id = '', email = '', name = '' } = {}) {
  const accounts = loadAccounts()
  const emailNorm = norm(email)
  const nameNorm = norm(name)
  return accounts.find(a => a.id && a.id === id)
    || (emailNorm ? accounts.find(a => norm(a.email) === emailNorm) : null)
    || (nameNorm ? accounts.find(a => norm(a.name) === nameNorm) : null)
    || null
}

function savePaymentActivity(payment) {
  if (!payment?.clientId) return
  const data = readData('activities.json') || { activities: [] }
  const activities = data.activities || []
  const dedupeKey = `payment:${payment.stripeId || payment.stripeSessionId || payment.id}`
  if (activities.some(a => a.meta?.dedupeKey === dedupeKey)) return
  activities.unshift({
    id: genId('act'),
    type: 'payment',
    subject: `Payment received: ${fmtUSD(payment.amount)}`,
    body: [
      payment.invoiceNumber ? `Invoice ${payment.invoiceNumber}` : '',
      payment.description || '',
    ].filter(Boolean).join(' - '),
    linkedTo: { accountId: payment.clientId },
    meta: {
      dedupeKey,
      paymentId: payment.id,
      stripeId: payment.stripeId || '',
      invoiceId: payment.invoiceId || '',
      invoiceNumber: payment.invoiceNumber || '',
      amount: payment.amount,
    },
    at: payment.date,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  data.activities = activities
  data.lastUpdated = new Date().toISOString()
  writeData('activities.json', data)
}

function notifyPayment(payment) {
  const title = `Payment received: ${fmtUSD(payment.amount)}`
  const body = [
    payment.clientName || 'Unknown client',
    payment.invoiceNumber ? `Invoice ${payment.invoiceNumber}` : payment.description || '',
  ].filter(Boolean).join(' - ')
  pushNotification({
    source: 'payments',
    severity: 'success',
    title,
    body,
    dedupeKey: `payment:${payment.stripeId || payment.stripeSessionId || payment.id}`,
    link: payment.clientId ? {
      tab: 'accounts',
      record: {
        type: 'account',
        id: payment.clientId,
        name: payment.clientName || 'Account',
        tabId: 'accounts',
        subTab: 'payments',
      },
    } : { tab: 'finance', sub: 'payments' },
  })
}

export function recordPayment(paymentInput = {}, { notify = true, activity = true } = {}) {
  const invoiceId = paymentInput.invoiceId || ''
  const stripeId = paymentInput.stripeId || paymentInput.paymentIntentId || ''
  const stripeSessionId = paymentInput.stripeSessionId || ''
  const stripeChargeId = paymentInput.stripeChargeId || ''
  const identities = [stripeId, stripeSessionId, stripeChargeId].filter(Boolean)
  const account = findAccount({
    id: paymentInput.clientId,
    email: paymentInput.email,
    name: paymentInput.clientName,
  })

  const result = mutateData('payments.json', current => {
    const paymentsData = current || { payments: [] }
    const payments = paymentsData.payments || []
    const matches = payments.filter(p => identities.length
      ? [p.stripeId, p.stripeSessionId, p.stripeChargeId, p.stripePaymentIntentId].some(value => value && identities.includes(value))
      : invoiceId && !p.stripeId && !p.stripeSessionId && p.invoiceId === invoiceId && Number(p.amount) === Number(paymentInput.amount) && p.status === 'succeeded')
    if (matches.length > 1) throw new Error('Multiple payment records share this Stripe identity; reconciliation is required')
    const existing = matches[0]
    if (existing && Number(existing.amount) !== Number(paymentInput.amount)) throw new Error('Existing payment amount conflicts with Stripe evidence')
    for (const field of ['invoiceId', 'clientId', 'currency', 'stripeInvoiceId', 'projectId']) {
      if (existing?.[field] && paymentInput[field] && String(existing[field]).toLowerCase() !== String(paymentInput[field]).toLowerCase()) throw new Error(`Existing payment ${field} conflicts with Stripe evidence`)
    }
    const payment = {
    ...existing,
    id: existing?.id || paymentInput.id || genId('pay'),
    stripeId: stripeId || existing?.stripeId || '',
    stripeSessionId: stripeSessionId || existing?.stripeSessionId || '',
    stripeChargeId: stripeChargeId || existing?.stripeChargeId || '',
    stripeInvoiceId: paymentInput.stripeInvoiceId || existing?.stripeInvoiceId || '',
    currency: paymentInput.currency || existing?.currency || 'usd',
    projectId: paymentInput.projectId || existing?.projectId || '',
    amount: Number(paymentInput.amount) || 0,
    clientName: paymentInput.clientName || existing?.clientName || account?.name || '',
    clientId: paymentInput.clientId || existing?.clientId || account?.id || '',
    description: paymentInput.description || existing?.description || '',
    email: paymentInput.email || existing?.email || account?.email || '',
    status: paymentInput.status || 'succeeded',
    type: paymentInput.type || existing?.type || 'one-time',
    date: paymentInput.date || existing?.date || new Date().toISOString(),
    last4: paymentInput.last4 || existing?.last4 || '',
    brand: paymentInput.brand || existing?.brand || '',
    invoiceId: invoiceId || existing?.invoiceId || '',
    invoiceNumber: paymentInput.invoiceNumber || existing?.invoiceNumber || '',
    source: paymentInput.source || existing?.source || 'crm',
    updatedAt: new Date().toISOString(),
  }

    if (existing) Object.assign(existing, payment)
    else payments.unshift(payment)
    paymentsData.payments = payments
    paymentsData.lastUpdated = new Date().toISOString()
    return { data: paymentsData, result: { payment, created: !existing } }
  })
  if (result.created && activity) savePaymentActivity(result.payment)
  if (result.created && notify) notifyPayment(result.payment)
  return result
}

export function recordCheckoutSessionPayment(session = {}, { source = 'stripe_checkout' } = {}) {
  const meta = session.metadata || {}
  const paymentIntent = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || ''
  const paid = session.payment_status === 'paid'
  if (!paid) return { ok: false, ignored: true, reason: `checkout not paid: ${session.payment_status || session.status || 'unknown'}` }

  const invoicesData = readData('invoices.json') || { invoices: [] }
  const invoices = invoicesData.invoices || []
  const invoiceIndex = invoices.findIndex(i =>
    (meta.invoiceId && i.id === meta.invoiceId)
    || (session.id && i.stripeSessionId === session.id)
    || (session.id && i.stripeSessionIds?.includes(session.id))
  )
  const invoice = invoiceIndex >= 0 ? invoices[invoiceIndex] : null
  const amount = Number(session.amount_total || session.amount_subtotal || 0) / 100
  if (invoice) {
    if (meta.invoiceId && meta.invoiceId !== invoice.id) throw new Error('Checkout invoice identity conflicts with CRM')
    if (meta.clientId && meta.clientId !== invoice.clientId) throw new Error('Checkout client identity conflicts with CRM')
    if (Number(session.amount_total) !== invoiceCents(invoice)
      || String(session.currency || '').toLowerCase() !== String(invoice.currency || 'usd').toLowerCase()) throw new Error('Checkout amount or currency conflicts with CRM invoice')
  }
  const customerEmail = session.customer_email || session.customer_details?.email || ''
  const customerName = session.customer_details?.name || meta.clientName || ''
  const account = findAccount({
    id: meta.clientId || invoice?.clientId,
    email: customerEmail,
    name: invoice?.clientName || customerName,
  })

  const { payment, created } = recordPayment({
    stripeId: paymentIntent,
    stripeSessionId: session.id || '',
    amount: amount || invoice?.amount || 0,
    currency: session.currency,
    projectId: invoice?.projectId || '',
    clientName: invoice?.clientName || account?.name || customerName || customerEmail,
    clientId: invoice?.clientId || meta.clientId || account?.id || '',
    description: invoice?.number ? `Invoice ${invoice.number}` : meta.description || 'Stripe checkout payment',
    email: customerEmail,
    status: 'succeeded',
    type: invoice ? 'invoice' : 'stripe-checkout',
    date: new Date().toISOString(),
    invoiceId: invoice?.id || meta.invoiceId || '',
    invoiceNumber: invoice?.number || meta.invoiceNumber || '',
    source,
  })

  if (invoice) changeInvoice(invoice.id, current => {
    if (current.stripeInvoiceId) return {
      reconciliationRequired: true,
      reconciliationReason: 'A historical Checkout payment was received after this invoice was associated with a Stripe invoice. Review both obligations before requesting payment.',
      legacyPaymentIntentIds: [...new Set([...(current.legacyPaymentIntentIds || []), paymentIntent].filter(Boolean))],
    }
    if (current.status === 'paid') return {}
    return {
      status: 'paid', paymentStatus: 'paid', paidAt: new Date().toISOString(),
      paidAmount: amount, stripePaymentIntentId: paymentIntent,
      stripeSessionId: session.id || current.stripeSessionId,
      stripeSessionIds: [...new Set([...(current.stripeSessionIds || []), current.stripeSessionId, session.id].filter(Boolean))],
    }
  })

  if (meta.orderId || session.id) {
    markProductOrderPaid({
      orderId: meta.orderId || '',
      stripeSessionId: session.id || '',
      stripePaymentIntentId: paymentIntent,
      amountPaid: payment.amount,
      stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || '',
      currency: session.currency,
    })
  }

  return { ok: true, payment, invoice: invoice ? invoiceRecord(invoice.id) : null, created }
}
