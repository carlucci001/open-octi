import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { findClient as findClientRecord } from '@/lib/clients'
import { findById as findEntityById, loadAll as loadEntities, logActivity } from '@/lib/entityStore'
import { consumePublicEndpointQuota } from '@/lib/public-endpoint-rate-limit'
import { usesStripeInvoice } from '@/lib/invoice-lifecycle-state'
import { stripeInvoicePaymentDestination } from '@/lib/stripe-invoice-lifecycle'
import { reconcileStripeInvoice } from '@/lib/stripe-invoice-settlement'
import { resolveLegacyInvoicePayment } from '@/lib/legacy-invoice-payments'
import {
  getInvoiceBaseUrl,
  invoiceAmount,
} from '@/lib/invoice-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Permanent "pay online" link for a CRM invoice, printable on a PDF quote:
//   https://crm.company.example.com/pay/<invoiceId>
// Resolve the existing native invoice or safely reuse a historical Checkout.
// The customer-facing link remains stable after individual provider URLs expire.
const PAY_LINK_RATE_LIMIT = Object.freeze({
  namespace: 'invoice-pay-link',
  windowMs: 10 * 60_000,
  // Behind Cloudflare without PUBLIC_RATE_LIMIT_TRUST_PROXY every visitor shares one client bucket.
  perClientLimit: 60,
  globalLimit: 300,
})

function text(body, status, extraHeaders = {}) {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

function redirect(url) {
  const res = NextResponse.redirect(url, 303)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

function findInvoice(idOrNumber) {
  const wanted = String(idOrNumber || '').trim()
  if (!wanted) return null
  const list = readData('invoices.json')?.invoices || []
  return list.find(i => i.id === wanted) || list.find(i => i.number && String(i.number) === wanted) || null
}

// Same lookups as app/api/invoices/route.js (account by clientId), with a
// contact fallback for the email. Only name + email ever reach Stripe.
function resolveClient(invoice) {
  const fallbackName = invoice.clientName || ''
  try {
    const id = invoice.clientId
    if (!id) return { name: fallbackName, email: '' }
    const account = findClientRecord(id) || findEntityById('accounts', id)
    let email = String(account?.email || '').trim()
    if (!email) {
      const contact = findEntityById('contacts', id)
        || loadEntities('contacts').find(c => c.accountId === id && String(c.email || '').includes('@'))
      email = String(contact?.email || '').trim()
    }
    return { name: account?.name || fallbackName, email }
  } catch {
    return { name: fallbackName, email: '' }
  }
}

function logLinkOpened(invoice, sessionId) {
  try {
    logActivity({
      type: 'invoice',
      subject: `Payment link opened: ${invoice.number}`,
      linkedTo: { accountId: invoice.clientId || undefined },
      meta: { invoiceId: invoice.id, invoiceNumber: invoice.number, sessionId },
    })
  } catch (err) {
    console.warn('[pay] activity log failed', invoice.id, String(err?.message || err).slice(0, 160))
  }
}

export async function GET(request, { params }) {
  const quota = consumePublicEndpointQuota(request, PAY_LINK_RATE_LIMIT)
  if (quota.limited) {
    return text('Too many requests. Please try again shortly.', 429, { 'Retry-After': String(quota.retryAfterSeconds) })
  }

  const invoice = findInvoice(params?.invoiceId)
  if (!invoice) return text('Invoice not found', 404)

  const base = getInvoiceBaseUrl()
  if (invoice.status === 'paid' || invoice.paidAt) {
    return redirect(`${base}/invoice/${encodeURIComponent(invoice.id)}/paid`)
  }
  if (invoice.status === 'void' || invoice.status === 'cancelled') {
    return text('This invoice is no longer payable. Please contact Your organization.', 410)
  }
  if (invoiceAmount(invoice) <= 0) return text('Invoice has no amount due', 400)

  try {
    if (usesStripeInvoice(invoice)) {
      if (!invoice.stripeInvoiceId) return text('This invoice has not been issued yet. Please contact the business.', 409)
      const destination = await stripeInvoicePaymentDestination(invoice.id)
      if (destination.paid) {
        await reconcileStripeInvoice(invoice.id)
        return redirect(`${base}/invoice/${encodeURIComponent(invoice.id)}/paid`)
      }
      if (destination.processing) return text('Your bank payment is processing. Please do not submit another payment.', 202)
      return redirect(destination.url)
    }
    const destination = await resolveLegacyInvoicePayment(invoice.id, resolveClient(invoice), {
      successUrl: `${base}/invoice/${invoice.id}/paid?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/invoice/${invoice.id}`,
    })
    if (destination.paid) return redirect(`${base}/invoice/${encodeURIComponent(invoice.id)}/paid`)
    if (destination.processing) return text('Your bank payment is processing. Please do not submit another payment.', 202)
    logLinkOpened(invoice, destination.invoice?.stripeSessionId)
    return redirect(destination.url)
  } catch (err) {
    console.warn('[pay] invoice resolution failed', invoice.id, String(err?.message || err).slice(0, 160))
    return text('Payments are temporarily unavailable. Please contact the business; no new invoice has been created.', 503)
  }
}
