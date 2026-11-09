import { mutateData, readData } from './dataStore'
import { getInvoiceBaseUrl } from './invoice-checkout'

export function invoiceRecord(id) {
  return (readData('invoices.json')?.invoices || []).find(invoice => invoice.id === id) || null
}

// Merge changes against the current row inside the datastore transaction. Never
// write a snapshot captured before a Stripe request over a concurrent settlement.
export function changeInvoice(id, update) {
  return mutateData('invoices.json', current => {
    const data = current || { invoices: [] }
    const invoice = (data.invoices || []).find(item => item.id === id)
    if (!invoice) throw new Error('Invoice not found')
    const patch = typeof update === 'function' ? update(invoice) : update
    Object.assign(invoice, patch, { updatedAt: new Date().toISOString() })
    data.lastUpdated = invoice.updatedAt
    return { data, result: { ...invoice } }
  })
}

export function usesStripeInvoice(invoice) {
  return Boolean(invoice?.stripeInvoiceId || invoice?.billingWorkflow === 'stripe_invoice')
}

export function isLegacyCheckoutInvoice(invoice) {
  return !usesStripeInvoice(invoice) && Boolean(
    invoice?.stripeSessionId || invoice?.stripeSessionIds?.length || invoice?.sentAt
    || ['sent', 'overdue', 'unpaid'].includes(invoice?.status),
  )
}

export function invoicePayUrl(invoice) {
  return `${getInvoiceBaseUrl()}/pay/${encodeURIComponent(invoice.id)}`
}

export function stripeObjectId(value) {
  return typeof value === 'string' ? value : value?.id || ''
}

export function invoiceCents(invoice) {
  const amount = Number(invoice?.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invoice amount must be greater than zero')
  return Math.round(amount * 100)
}

export function assertLinkedStripeInvoice(invoice, remote) {
  if (!invoice?.stripeInvoiceId || remote?.id !== invoice.stripeInvoiceId) throw new Error('Stripe invoice identity does not match')
  if (invoice.stripeCustomerId && stripeObjectId(remote.customer) !== invoice.stripeCustomerId) throw new Error('Stripe customer does not match')
  if (invoice.stripeLivemode !== undefined && remote.livemode !== invoice.stripeLivemode) throw new Error('Stripe environment does not match')
  if (remote.metadata?.fcc_invoice_id && remote.metadata.fcc_invoice_id !== invoice.id) throw new Error('Stripe invoice is linked to another CRM invoice')
  if (String(remote.currency || '').toLowerCase() !== String(invoice.currency || 'usd').toLowerCase()) throw new Error('Stripe invoice currency does not match')
  if (Number(remote.total) !== invoiceCents(invoice)) throw new Error('Stripe invoice total differs from the CRM invoice; review is required')
}
