import { readData } from './dataStore'
import { recordPayment } from './paymentLedger'
import { assertLinkedStripeInvoice, changeInvoice, invoiceRecord, stripeObjectId } from './invoice-lifecycle-state'
import { retrieveLinkedStripeInvoice } from './stripe-invoice-lifecycle'

// Always reconcile the latest provider object, not an old event payload. Bank
// payment failures and successes can arrive out of order or be retried.
export async function reconcileStripeInvoice(id, { remote, stripe, event } = {}) {
  if (!remote || !stripe) ({ remote, stripe } = await retrieveLinkedStripeInvoice(id))
  const invoice = invoiceRecord(id)
  assertLinkedStripeInvoice(invoice, remote)
  if (event?.id && invoice.stripeEventIds?.includes(event.id)) return { handled: true, duplicate: true, invoice }
  let intent = remote.payment_intent
  if (typeof intent === 'string') intent = await stripe.paymentIntents.retrieve(intent)
  const paid = remote.status === 'paid' && Number(remote.amount_remaining) === 0
  const processing = !paid && intent?.status === 'processing'
  const failed = !paid && !processing && Boolean(intent?.last_payment_error)
  if (invoice.status === 'paid' && !paid) throw new Error('Stripe and CRM settlement states disagree; review is required')
  let payment
  // A paid invoice may have been settled with credit or marked paid outside
  // Stripe. Do not invent cash revenue when no successful Stripe payment exists.
  if (paid && intent?.status === 'succeeded' && Number(intent.amount_received) > 0) {
    if (String(intent.currency).toLowerCase() !== String(remote.currency).toLowerCase()
      || Number(intent.amount_received) > Number(remote.total)
      || (intent.customer && stripeObjectId(intent.customer) !== stripeObjectId(remote.customer))) {
      throw new Error('Stripe payment evidence conflicts with the linked invoice')
    }
    payment = recordPayment({
      stripeId: intent.id, stripeInvoiceId: remote.id, stripeChargeId: stripeObjectId(intent.latest_charge),
      amount: Number(intent.amount_received) / 100, currency: remote.currency,
      clientId: invoice.clientId, clientName: invoice.clientName,
      projectId: invoice.projectId || '', invoiceId: invoice.id, invoiceNumber: invoice.number,
      description: `Invoice ${invoice.number}`, status: 'succeeded', type: 'invoice',
      date: remote.status_transitions?.paid_at ? new Date(remote.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString(),
      source: 'stripe_invoice',
    }).payment
  }
  const paymentStatus = paid ? 'paid' : processing ? 'processing' : failed ? 'failed'
    : intent?.status === 'requires_action' ? 'requires_action' : 'unpaid'
  const updated = changeInvoice(id, current => {
    assertLinkedStripeInvoice(current, remote)
    // An earlier provider request may finish after a newer settlement event.
    // Never let that earlier snapshot reopen a paid or terminal receivable.
    if ((current.status === 'paid' && !paid)
      || (['void', 'cancelled', 'uncollectible'].includes(current.status) && remote.status === 'open')) return {}
    return {
    stripeInvoiceStatus: remote.status, stripeInvoiceNumber: remote.number,
    hostedUrl: remote.hosted_invoice_url || current.hostedUrl,
    stripeInvoicePdf: remote.invoice_pdf || current.stripeInvoicePdf,
    paymentStatus,
    status: paid ? 'paid' : processing ? 'processing'
      : remote.status === 'void' ? 'void' : remote.status === 'uncollectible' ? 'uncollectible' : 'open',
    ...(paid ? {
      paidAt: remote.status_transitions?.paid_at ? new Date(remote.status_transitions.paid_at * 1000).toISOString() : current.paidAt || new Date().toISOString(),
      paidAmount: Number(remote.amount_paid) / 100,
      settlementSource: remote.paid_out_of_band ? 'stripe_out_of_band' : 'stripe_invoice',
    } : {}),
    stripePaymentIntentId: stripeObjectId(intent) || current.stripePaymentIntentId || '',
    lastPaymentError: failed ? String(intent.last_payment_error.message || 'Payment failed').slice(0, 500) : null,
    lastStripeCheckedAt: new Date().toISOString(),
    ...(event?.id ? { stripeEventIds: [...(current.stripeEventIds || []).filter(value => value !== event.id), event.id].slice(-200) } : {}),
    }
  })
  return { handled: true, invoice: updated, payment, paid: updated.status === 'paid', paymentStatus: updated.paymentStatus }
}

export async function processCrmInvoiceEvent(event, { stripe }) {
  if (![
    'invoice.finalized', 'invoice.sent', 'invoice.paid', 'invoice.payment_failed',
    'invoice.payment_action_required', 'invoice.voided', 'invoice.marked_uncollectible',
    'payment_intent.processing', 'payment_intent.succeeded', 'payment_intent.payment_failed',
  ].includes(event.type)) return { handled: false }
  const object = event.data?.object || {}
  let remoteId = event.type?.startsWith('invoice.') ? object.id : stripeObjectId(object.invoice)
  if (!remoteId) return { handled: false }
  const invoice = (readData('invoices.json')?.invoices || []).find(item => item.stripeInvoiceId === remoteId)
  if (!invoice) return { handled: false }
  if (event.account && invoice.stripeAccountId && event.account !== invoice.stripeAccountId) throw new Error('Stripe event account does not match the invoice')
  if (invoice.stripeLivemode !== undefined && event.livemode !== invoice.stripeLivemode) throw new Error('Stripe event environment does not match the invoice')
  const account = await stripe.accounts.retrieve()
  if (invoice.stripeAccountId && account.id !== invoice.stripeAccountId) throw new Error('Configured Stripe account does not match the invoice')
  const remote = await stripe.invoices.retrieve(remoteId, { expand: ['payment_intent'] })
  const result = await reconcileStripeInvoice(invoice.id, { remote, stripe, event })
  if (event.type === 'invoice.sent') {
    result.invoice = changeInvoice(invoice.id, {
      deliveryProvider: 'stripe', deliveryStatus: 'sent',
      sentAt: invoice.sentAt || new Date(event.created * 1000).toISOString(),
      sentTo: remote.customer_email || invoice.sentTo || '',
    })
  }
  return result
}
