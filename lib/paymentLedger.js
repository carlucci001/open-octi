import { readData, writeData } from './dataStore'
import { pushNotification } from './notifications'
import { markProductOrderPaid } from './productCheckout'

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
  const paymentsData = readData('payments.json') || { payments: [] }
  const payments = paymentsData.payments || []

  const invoiceId = paymentInput.invoiceId || ''
  const stripeId = paymentInput.stripeId || paymentInput.paymentIntentId || ''
  const stripeSessionId = paymentInput.stripeSessionId || ''
  const account = findAccount({
    id: paymentInput.clientId,
    email: paymentInput.email,
    name: paymentInput.clientName,
  })

  const existing = payments.find(p =>
    (stripeId && p.stripeId === stripeId)
    || (stripeSessionId && p.stripeSessionId === stripeSessionId)
    || (invoiceId && p.invoiceId === invoiceId && Number(p.amount) === Number(paymentInput.amount) && p.status === 'succeeded')
  )

  const payment = {
    id: existing?.id || paymentInput.id || genId('pay'),
    stripeId,
    stripeSessionId,
    amount: Number(paymentInput.amount) || 0,
    clientName: paymentInput.clientName || account?.name || '',
    clientId: paymentInput.clientId || account?.id || '',
    description: paymentInput.description || '',
    email: paymentInput.email || account?.email || '',
    status: paymentInput.status || 'succeeded',
    type: paymentInput.type || 'one-time',
    date: paymentInput.date || existing?.date || new Date().toISOString(),
    last4: paymentInput.last4 || existing?.last4 || '',
    brand: paymentInput.brand || existing?.brand || '',
    invoiceId,
    invoiceNumber: paymentInput.invoiceNumber || '',
    source: paymentInput.source || existing?.source || 'crm',
    updatedAt: new Date().toISOString(),
  }

  if (existing) {
    Object.assign(existing, payment)
  } else {
    payments.unshift(payment)
  }

  paymentsData.payments = payments
  paymentsData.lastUpdated = new Date().toISOString()
  writeData('payments.json', paymentsData)

  if (activity) savePaymentActivity(payment)
  if (notify) notifyPayment(payment)

  return { payment, created: !existing }
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
  )
  const invoice = invoiceIndex >= 0 ? invoices[invoiceIndex] : null
  const amount = Number(session.amount_total || session.amount_subtotal || 0) / 100
  const customerEmail = session.customer_email || session.customer_details?.email || ''
  const customerName = session.customer_details?.name || meta.clientName || ''
  const account = findAccount({
    id: meta.clientId || invoice?.clientId,
    email: customerEmail,
    name: invoice?.clientName || customerName,
  })

  if (invoice && invoice.status !== 'paid') {
    invoices[invoiceIndex] = {
      ...invoice,
      status: 'paid',
      paidAt: new Date().toISOString(),
      paidAmount: amount || invoice.amount,
      stripePaymentIntentId: paymentIntent,
      stripeSessionId: session.id || invoice.stripeSessionId,
      updatedAt: new Date().toISOString(),
    }
    invoicesData.invoices = invoices
    invoicesData.lastUpdated = new Date().toISOString()
    writeData('invoices.json', invoicesData)
  }

  const { payment, created } = recordPayment({
    stripeId: paymentIntent,
    stripeSessionId: session.id || '',
    amount: amount || invoice?.amount || 0,
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

  if (meta.orderId || session.id) {
    markProductOrderPaid({
      orderId: meta.orderId || '',
      stripeSessionId: session.id || '',
      stripePaymentIntentId: paymentIntent,
      amountPaid: payment.amount,
    })
  }

  return { ok: true, payment, invoice: invoiceIndex >= 0 ? invoices[invoiceIndex] : null, created }
}
