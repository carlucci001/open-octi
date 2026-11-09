import { createHash } from 'crypto'
import { Resend } from 'resend'
import { changeInvoice, invoicePayUrl, invoiceRecord } from './invoice-lifecycle-state'
import { withInvoiceOperation } from './stripe-invoice-lifecycle'

export async function sendLegacyInvoiceEmail(id, { resend = false, requestId, email, apiKey }, prepare) {
  return withInvoiceOperation(id, async guard => {
    let invoice = invoiceRecord(id)
    if (invoice.stripeInvoiceId || invoice.reconciliationRequired) throw new Error('Invoice changed or requires payment reconciliation')
    if (invoice.status === 'paid') return { invoice, alreadyPaid: true, payUrl: invoicePayUrl(invoice) }
    if (['void', 'cancelled', 'uncollectible'].includes(invoice.status)) throw new Error('Invoice is not available for sending')
    if (resend && !requestId) throw new Error('Resending requires a request ID so a retry cannot send twice')
    const key = resend ? createHash('sha256').update(String(requestId)).digest('hex') : 'first'
    let attempt = invoice.legacyEmailAttempts?.find(item => item.id === key)
    if (attempt?.status === 'sent' || (!resend && invoice.sentAt)) return { invoice, alreadySent: true, payUrl: invoicePayUrl(invoice) }
    if (attempt && Date.now() - Date.parse(attempt.startedAt) > 20 * 60 * 60 * 1000) throw new Error('Earlier email outcome is unknown; check provider history before another send')
    if (attempt?.email && attempt.email !== email) throw new Error('Retry recipient differs from the original email attempt')
    if (!attempt) {
      const payload = await prepare(invoice)
      guard()
      attempt = { id: key, status: 'pending', email, startedAt: new Date().toISOString(), payload }
      changeInvoice(id, current => ({
        legacyEmailAttempts: [...(current.legacyEmailAttempts || []), attempt],
        deliveryStatus: 'pending', deliveryProvider: 'resend',
      }))
    }
    try {
      guard()
      const latest = invoiceRecord(id)
      if (latest.stripeInvoiceId || latest.reconciliationRequired || ['paid', 'void', 'cancelled', 'uncollectible'].includes(latest.status)) throw new Error('Invoice changed before email delivery')
      const result = await new Resend(apiKey).emails.send(attempt.payload, { idempotencyKey: `fcc-invoice:${id}:${key}` })
      guard()
      if (result.error) throw new Error(result.error.message || 'Email provider rejected the invoice')
      const receipt = result.data?.id || result.id
      if (!receipt) throw new Error('Email provider returned no delivery receipt')
      invoice = changeInvoice(id, current => ({
        status: ['paid', 'processing', 'void', 'cancelled', 'uncollectible'].includes(current.status) ? current.status : 'sent',
        deliveryProvider: 'resend', deliveryStatus: 'sent', resendEmailId: receipt,
        sentAt: new Date().toISOString(), sentTo: email, lastSendError: null, lastSendErrorAt: null,
        legacyEmailAttempts: (current.legacyEmailAttempts || []).map(item => item.id === key
          ? { id: key, status: 'sent', email, startedAt: item.startedAt, receipt, completedAt: new Date().toISOString() } : item),
      }))
      return { invoice, payUrl: invoicePayUrl(invoice), sentTo: email, resendEmailId: receipt }
    } catch (error) {
      changeInvoice(id, { deliveryStatus: 'unknown', lastSendError: String(error.message).slice(0, 500), lastSendErrorAt: new Date().toISOString() })
      throw error
    }
  })
}
