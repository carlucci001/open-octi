import { readData } from './dataStore'
import { getInvoiceStripeClient } from './invoice-checkout'
import { changeInvoice, invoiceCents, invoiceRecord } from './invoice-lifecycle-state'
import { recordCheckoutSessionPayment } from './paymentLedger'

export function legacySessionIds(invoice) {
  return [...new Set([invoice.stripeSessionId, ...(invoice.stripeSessionIds || [])].filter(Boolean))]
}

export async function checkLegacyInvoicePayment(id, { stripe = getInvoiceStripeClient(), sessionId, guard = () => {} } = {}) {
  const invoice = invoiceRecord(id)
  if (!invoice) throw new Error('Invoice not found')
  if (!stripe) throw new Error('Stripe is not configured')
  const ids = legacySessionIds(invoice)
  if (sessionId && !ids.includes(sessionId)) throw new Error('Payment session does not match this invoice')
  const sessions = []
  // Inspect every retained session: payment through an older email still counts.
  for (const key of ids) {
    const session = await stripe.checkout.sessions.retrieve(key, { expand: ['payment_intent'] })
    guard()
    if (session.id !== key || Number(session.amount_total) !== invoiceCents(invoice)
      || String(session.currency || '').toLowerCase() !== String(invoice.currency || 'usd').toLowerCase()
      || (session.metadata?.invoiceId && session.metadata.invoiceId !== id)
      || (session.metadata?.clientId && session.metadata.clientId !== invoice.clientId)) throw new Error('Historical Checkout identity, amount or currency differs; review is required')
    if (typeof session.payment_intent === 'string') session.payment_intent = await stripe.paymentIntents.retrieve(session.payment_intent)
    guard()
    sessions.push(session)
  }
  let payment
  for (const session of sessions.filter(item => item.payment_status === 'paid')) {
    payment = recordCheckoutSessionPayment(session, { source: 'legacy_invoice_check' }).payment
  }
  const processing = sessions.some(session => session.payment_intent?.status === 'processing'
    || (session.status === 'complete' && session.payment_status === 'unpaid'
      && !session.payment_intent?.last_payment_error && session.payment_intent?.status !== 'canceled'))
  const failed = sessions.find(session => session.payment_intent?.last_payment_error)
  const updated = changeInvoice(id, current => {
    if (current.stripeInvoiceId || ['paid', 'void', 'cancelled', 'uncollectible'].includes(current.status)) return {}
    return {
      status: processing ? 'processing' : current.status === 'processing' ? 'sent' : current.status,
      paymentStatus: processing ? 'processing' : failed ? 'failed' : 'unpaid',
      lastPaymentError: failed ? String(failed.payment_intent.last_payment_error.message || 'Payment failed').slice(0, 500) : null,
      lastStripeCheckedAt: new Date().toISOString(),
    }
  })
  const open = sessions.find(session => session.status === 'open' && session.url
    && (!session.expires_at || session.expires_at * 1000 > Date.now()))
  return { handled: true, invoice: updated, payment, paid: updated.status === 'paid',
    processing: updated.paymentStatus === 'processing', paymentStatus: updated.paymentStatus, open }
}

export async function processLegacyInvoiceEvent(event, { stripe }) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
    'payment_intent.processing', 'payment_intent.succeeded', 'payment_intent.payment_failed'].includes(event.type)) return { handled: false }
  let session = event.data?.object
  if (event.type.startsWith('payment_intent.')) {
    const list = await stripe.checkout.sessions.list({ payment_intent: session.id, limit: 100 })
    session = list.data?.find(item => item.metadata?.invoiceId)
    if (!session) return { handled: false }
  }
  const invoice = (readData('invoices.json')?.invoices || []).find(item => legacySessionIds(item).includes(session.id))
  if (!invoice) return { handled: false }
  if (event.livemode !== undefined && session.livemode !== undefined && event.livemode !== session.livemode) throw new Error('Stripe environment does not match Checkout')
  return checkLegacyInvoicePayment(invoice.id, { stripe, sessionId: session.id })
}
