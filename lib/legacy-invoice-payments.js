import { randomUUID } from 'crypto'
import { createInvoiceCheckoutSession, getInvoiceStripeClient } from './invoice-checkout'
import { changeInvoice, invoiceRecord } from './invoice-lifecycle-state'
import { withInvoiceOperation } from './stripe-invoice-lifecycle'
import { checkLegacyInvoicePayment } from './legacy-invoice-settlement'

export async function resolveLegacyInvoicePayment(id, client, urls) {
  return withInvoiceOperation(id, async guard => {
    let invoice = invoiceRecord(id)
    if (invoice.stripeInvoiceId) throw new Error('This invoice now uses its linked Stripe invoice')
    if (invoice.status === 'paid' || invoice.paidAt) return { paid: true, invoice }
    if (['draft', 'void', 'cancelled', 'uncollectible'].includes(invoice.status)) throw new Error('This invoice is not payable')
    const stripe = getInvoiceStripeClient()
    if (!stripe) throw new Error('Stripe is not configured')
    const checked = await checkLegacyInvoicePayment(id, { stripe, guard })
    invoice = checked.invoice
    if (checked.paid || checked.processing) return checked
    if (checked.open) return { url: checked.open.url, reused: true, invoice }
    let attempt = invoice.legacyCheckoutAttempt
    if (!attempt || attempt.status === 'created') {
      attempt = { id: randomUUID(), startedAt: new Date().toISOString(), status: 'pending' }
      invoice = changeInvoice(id, { legacyCheckoutAttempt: attempt })
    } else if (Date.now() - Date.parse(attempt.startedAt) > 20 * 60 * 60 * 1000) {
      throw new Error('An earlier Checkout attempt has an unknown outcome; review is required before creating another')
    }
    guard()
    if (invoiceRecord(id).status === 'paid' || invoiceRecord(id).stripeInvoiceId) throw new Error('Invoice changed while preparing payment; reopen the payment page')
    const session = await createInvoiceCheckoutSession(invoice, client, { ...urls, idempotencyKey: `fcc-legacy-invoice:${id}:${attempt.id}` })
    guard()
    if (!session.url) throw new Error('Checkout returned no payment URL')
    invoice = changeInvoice(id, current => ({
      stripeSessionId: session.id, stripeSessionUrl: session.url,
      stripeSessionExpiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      stripeSessionIds: [...new Set([...(current.stripeSessionIds || []), current.stripeSessionId, session.id].filter(Boolean))],
      legacyCheckoutAttempt: { ...attempt, status: 'created', sessionId: session.id },
      paymentStatus: 'unpaid', status: current.status === 'processing' ? 'sent' : current.status,
    }))
    return { url: session.url, reused: false, invoice }
  })
}
