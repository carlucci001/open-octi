import Stripe from 'stripe'
import { readData } from './dataStore'

function createMockInvoiceStripeClient() {
  return {
    checkout: {
      sessions: {
        async create(checkout) {
          const id = `cs_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
          const success = new URL(checkout.success_url)
          success.searchParams.set('session_id', id)
          const returnUrl = `${success.pathname}${success.search}`
          const url = new URL('/portal/mock-checkout', getInvoiceBaseUrl())
          url.searchParams.set('session', id)
          url.searchParams.set('return_url', returnUrl)
          return { id, url: url.toString(), status: 'open', payment_status: 'unpaid' }
        },
        async retrieve(id) {
          return {
            id,
            status: 'complete',
            payment_status: 'paid',
            payment_intent: { id: `pi_${id}` },
          }
        },
      },
    },
  }
}

function stripeKeyFromVault() {
  const credentials = readData('credentials.json') || { credentials: [] }
  const entry = (credentials.credentials || []).find(credential => /stripe/i.test(credential.name || ''))
  if (!entry) return ''

  const fields = entry.fields || []
  const production = fields.find(field => /secret.*\(p\)/i.test(field.label || ''))
  const sandbox = fields.find(field => /secret.*\(s\)/i.test(field.label || ''))
  const fallback = fields.find(field => /secret/i.test(field.label || ''))
  return (production || sandbox || fallback)?.value?.trim() || ''
}

export function getInvoiceStripeClient() {
  if (process.env.NODE_ENV !== 'production' && process.env.FCC_INVOICE_CHECKOUT_MOCK === '1') {
    return createMockInvoiceStripeClient()
  }
  // Preserve the existing Send behavior: an explicit runtime key (including
  // local Stripe test mode) overrides the Command Vault fallback.
  const key = process.env.STRIPE_SECRET_KEY || stripeKeyFromVault()
  return key ? new Stripe(key) : null
}

export function getInvoiceBaseUrl() {
  const configured = process.env.INVOICE_BASE_URL
  return configured
    ? configured.trim().replace(/\/$/, '')
    : 'https://crm.company.example.com'
}

export function invoiceAmount(invoice) {
  const itemTotal = (invoice?.items || []).reduce((sum, item) => (
    sum + (Number(item.qty) || 1) * (Number(item.rate) || 0)
  ), 0)
  return itemTotal > 0 ? itemTotal : Number(invoice?.amount) || 0
}

export async function createInvoiceCheckoutSession(invoice, client, { successUrl, cancelUrl }) {
  const stripe = getInvoiceStripeClient()
  if (!stripe) throw new Error('Stripe not configured (STRIPE_SECRET_KEY missing)')

  const amount = invoiceAmount(invoice)
  if (amount <= 0) throw new Error('Invoice amount must be greater than zero')

  const email = String(client?.email || '').trim()
  const lineItems = (invoice.items || [])
    .filter(item => (Number(item.rate) || 0) > 0)
    .map(item => ({
      quantity: Math.max(1, Math.round(Number(item.qty) || 1)),
      price_data: {
        currency: 'usd',
        unit_amount: Math.round((Number(item.rate) || 0) * 100),
        product_data: { name: String(item.description || 'Service').slice(0, 250) },
      },
    }))

  if (lineItems.length === 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(amount * 100),
        product_data: { name: `Invoice ${invoice.number}` },
      },
    })
  }

  const metadata = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    clientId: invoice.clientId || '',
  }
  const checkout = {
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_intent_data: {
      description: `Invoice ${invoice.number} — ${client?.name || invoice.clientName}`,
      metadata,
    },
    metadata,
  }
  if (email) {
    checkout.customer_email = email
    checkout.payment_intent_data.receipt_email = email
  }

  return stripe.checkout.sessions.create(checkout)
}
