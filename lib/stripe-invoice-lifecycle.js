import { createHash, randomUUID } from 'crypto'
import { getInvoiceStripeClient } from './invoice-checkout'
import {
  assertLinkedStripeInvoice, changeInvoice, invoiceCents, invoicePayUrl,
  invoiceRecord, isLegacyCheckoutInvoice, stripeObjectId,
} from './invoice-lifecycle-state'

const LOCK_MS = 5 * 60 * 1000
const IDEMPOTENCY_RECOVERY_MS = 20 * 60 * 60 * 1000
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
const requestOptions = key => ({ idempotencyKey: `fcc-invoice:${key}` })

function clientOrThrow() {
  const stripe = getInvoiceStripeClient()
  if (!stripe) throw new Error('Stripe is not configured')
  return stripe
}

export async function withInvoiceOperation(id, operation) {
  const token = randomUUID()
  changeInvoice(id, invoice => {
    if (invoice.billingOperation?.until > Date.now()) throw new Error('Invoice work is already in progress. Check its status before retrying.')
    return { billingOperation: { token, until: Date.now() + LOCK_MS } }
  })
  try {
    const guard = () => changeInvoice(id, invoice => {
      if (invoice.billingOperation?.token !== token) throw new Error('Invoice operation was superseded; check its current state before retrying')
      return { billingOperation: { token, until: Date.now() + LOCK_MS } }
    })
    return await operation(guard)
  } catch (error) {
    changeInvoice(id, { lastBillingError: String(error.message || error).slice(0, 500), lastBillingErrorAt: new Date().toISOString() })
    throw error
  } finally {
    changeInvoice(id, invoice => invoice.billingOperation?.token === token ? { billingOperation: null } : {})
  }
}

async function listAll(list, parameters) {
  const rows = []
  let after
  do {
    const page = await list({ ...parameters, limit: 100, ...(after ? { starting_after: after } : {}) })
    rows.push(...page.data)
    if (!page.has_more) return rows
    after = page.data.at(-1)?.id
    if (!after) throw new Error('Stripe pagination could not be completed')
  } while (after)
  return rows
}

function issuanceDetails(invoice, client) {
  const email = String(client?.email || '').trim().toLowerCase()
  if (!email.includes('@')) throw new Error('A verified client billing email is required')
  const items = (invoice.items || []).map((item, index) => {
    const quantity = Number(item.qty ?? 1)
    const rate = Number(item.rate)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate < 0) throw new Error(`Invoice line ${index + 1} has an invalid quantity or rate`)
    // Stripe quantities are integers; preserve fractional billable hours in the
    // description and issue their exact extended line amount as one item.
    return { description: `${String(item.description || 'Service')} (${quantity} × ${rate.toFixed(2)})`.slice(0, 500), quantity: 1, unit_amount: Math.round(quantity * rate * 100) }
  })
  if (!items.length || items.reduce((sum, item) => sum + item.quantity * item.unit_amount, 0) !== invoiceCents(invoice)) throw new Error('Invoice line items do not match its total')
  return {
    email, name: client.name || invoice.clientName || email,
    clientId: invoice.clientId || '', projectId: invoice.projectId || '',
    currency: String(invoice.currency || 'usd').toLowerCase(),
    amount: invoiceCents(invoice), dueDate: invoice.dueDate || '', number: invoice.number, project: invoice.project || '', items,
  }
}

async function assertAccount(stripe, invoice) {
  const account = await stripe.accounts.retrieve()
  if (invoice.stripeAccountId && account.id !== invoice.stripeAccountId) throw new Error('The configured Stripe account differs from this invoice; review is required')
  return account
}

async function resolveCustomer(stripe, invoice, client, details, guard) {
  const linkedId = invoice.stripeCustomerId || client.stripeCustomerId
  let customer
  if (linkedId) {
    customer = await stripe.customers.retrieve(linkedId)
  } else {
    const candidates = await listAll(params => stripe.customers.list(params), { email: details.email })
    const exact = candidates.filter(item => !item.deleted && String(item.email || '').trim().toLowerCase() === details.email)
    const owned = exact.filter(item => item.metadata?.fcc_client_id === details.clientId)
    if (owned.length === 1) customer = owned[0]
    else if (exact.length === 1) customer = exact[0]
    else if (exact.length > 1) throw new Error('More than one Stripe customer uses this email. Link the correct customer before sending.')
    else {
      guard()
      customer = await stripe.customers.create({
      email: details.email, name: details.name,
      metadata: { fcc_client_id: details.clientId, fcc_source: 'command-center' },
      }, requestOptions(`${invoice.id}:customer`))
    }
  }
  if (customer.deleted || String(customer.email || '').trim().toLowerCase() !== details.email) throw new Error('The linked Stripe customer has a different billing email; review the customer link before sending')
  if (customer.metadata?.fcc_client_id && customer.metadata.fcc_client_id !== details.clientId) throw new Error('The Stripe customer is linked to another CRM client')
  guard()
  changeInvoice(invoice.id, { stripeCustomerId: customer.id, stripeLivemode: customer.livemode })
  return customer
}

async function ensureIssued(stripe, id, client, guard) {
  let invoice = invoiceRecord(id)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.reconciliationRequired) throw new Error('Invoice payment reconciliation is required before sending')
  if (isLegacyCheckoutInvoice(invoice)) throw new Error('Historical Checkout invoices must not be converted automatically. Resend their existing stable payment link or explicitly associate a verified Stripe invoice.')
  if (['void', 'cancelled', 'uncollectible'].includes(invoice.status)) throw new Error('This invoice is not available for sending')
  const account = await assertAccount(stripe, invoice)
  guard()
  // A manual association points at an existing receivable. Sending it must not
  // add lines, finalize a draft, or change any collection settings.
  if (invoice.stripeAssociation?.kind === 'existing') {
    const remote = await stripe.invoices.retrieve(invoice.stripeInvoiceId)
    guard()
    assertLinkedStripeInvoice(invoiceRecord(id), remote)
    if (!['open', 'paid'].includes(remote.status)) throw new Error('An associated Stripe invoice must already be finalized before it can be sent')
    return { invoice: invoiceRecord(id), remote }
  }
  const details = issuanceDetails(invoice, client)
  const fingerprint = digest(details)
  if (invoice.stripeIssuance && invoice.stripeIssuance.fingerprint !== fingerprint) throw new Error('Invoice details changed after Stripe issuance started. Review the existing invoice instead of creating another obligation.')
  if (!invoice.stripeIssuance) invoice = changeInvoice(id, {
    billingWorkflow: 'stripe_invoice', stripeAccountId: account.id,
    stripeIssuance: {
      fingerprint, details, startedAt: new Date().toISOString(),
      dueAt: details.dueDate && Number.isFinite(Date.parse(`${details.dueDate.slice(0, 10)}T23:59:59Z`))
        ? Math.max(Math.floor(Date.parse(`${details.dueDate.slice(0, 10)}T23:59:59Z`) / 1000), Math.floor(Date.now() / 1000) + 3600) : null,
    },
  })
  let remote
  if (invoice.stripeInvoiceId) {
    remote = await stripe.invoices.retrieve(invoice.stripeInvoiceId)
  } else {
    const customer = await resolveCustomer(stripe, invoice, client, details, guard)
    // Idempotency keys have finite retention. Recovery also discovers an earlier
    // create whose response could not be persisted, even after that window.
    const previous = (await listAll(params => stripe.invoices.list(params), { customer: customer.id }))
      .filter(item => item.metadata?.fcc_invoice_id === id)
    if (previous.length > 1) throw new Error('Multiple Stripe invoices claim this CRM invoice; review is required')
    if (previous.length) remote = previous[0]
    else {
      if (Date.now() - Date.parse(invoice.stripeIssuance.startedAt) > IDEMPOTENCY_RECOVERY_MS) throw new Error('An earlier invoice creation has an unknown outcome; review Stripe history before creating another obligation')
      guard()
      remote = await stripe.invoices.create({
        customer: customer.id, collection_method: 'send_invoice', auto_advance: false,
        pending_invoice_items_behavior: 'exclude', currency: details.currency,
        ...(invoice.stripeIssuance.dueAt ? { due_date: invoice.stripeIssuance.dueAt } : { days_until_due: 30 }),
        payment_settings: { payment_method_types: ['card', 'us_bank_account'] },
        description: `Invoice ${details.number}${details.project ? ` — ${details.project}` : ''}`,
        footer: `View this invoice and its current payment status: ${invoicePayUrl(invoice)}`,
        metadata: { fcc_source: 'command-center', fcc_invoice_id: id, fcc_client_id: details.clientId, fcc_project_id: details.projectId, fcc_issuance: fingerprint },
      }, requestOptions(`${id}:create:${fingerprint}`))
    }
    guard()
    invoice = changeInvoice(id, { stripeInvoiceId: remote.id, stripeCustomerId: customer.id, stripeLivemode: remote.livemode, stripeInvoiceStatus: remote.status })
  }
  if (remote.metadata?.fcc_issuance && remote.metadata.fcc_issuance !== fingerprint) throw new Error('Stripe issuance details conflict with the saved CRM invoice')
  if (remote.status === 'draft') {
    const lines = await listAll(params => stripe.invoiceItems.list(params), { invoice: remote.id })
    for (const [index, item] of details.items.entries()) {
      const lineKey = `${fingerprint}:${index}`
      const matches = lines.filter(line => line.metadata?.fcc_line_key === lineKey)
      if (matches.length > 1) throw new Error('Duplicate Stripe invoice lines require review')
      guard()
      if (!matches.length) await stripe.invoiceItems.create({
        customer: invoice.stripeCustomerId, invoice: remote.id, currency: details.currency,
        ...item, metadata: { fcc_invoice_id: id, fcc_line_key: lineKey },
      }, requestOptions(`${id}:line:${lineKey}`))
    }
    remote = await stripe.invoices.retrieve(remote.id)
    guard()
    assertLinkedStripeInvoice(invoiceRecord(id), remote)
    remote = await stripe.invoices.finalizeInvoice(remote.id, { auto_advance: false }, requestOptions(`${id}:finalize:${fingerprint}`))
  }
  assertLinkedStripeInvoice(invoiceRecord(id), remote)
  guard()
  if (remote.status !== 'open' && remote.status !== 'paid') throw new Error(`Stripe invoice is ${remote.status}; it cannot be sent`)
  if (!remote.hosted_invoice_url) throw new Error('Stripe has not provided a hosted invoice URL')
  invoice = changeInvoice(id, current => {
    if (['void', 'cancelled', 'uncollectible'].includes(current.status)) throw new Error('Invoice was closed during issuance; review its Stripe state')
    return {
    stripeInvoiceStatus: remote.status, stripeInvoiceNumber: remote.number,
    hostedUrl: remote.hosted_invoice_url, stripeInvoicePdf: remote.invoice_pdf || null,
    status: current.status === 'paid' ? 'paid' : remote.status === 'paid' ? 'paid' : 'open',
    lastBillingError: null, lastBillingErrorAt: null,
    }
  })
  return { invoice, remote }
}

export async function sendStripeInvoice(id, client, { resend = false, requestId } = {}) {
  return withInvoiceOperation(id, async guard => {
    const current = invoiceRecord(id)
    if (current.status === 'paid') return { invoice: current, alreadyPaid: true, payUrl: invoicePayUrl(current) }
    const stripe = clientOrThrow()
    const { remote } = await ensureIssued(stripe, id, client, guard)
    let invoice = invoiceRecord(id)
    if (remote.status === 'paid' || invoice.status === 'paid') return { invoice, alreadyPaid: true, payUrl: invoicePayUrl(invoice) }
    if (resend && !requestId) throw new Error('Resending requires a request ID so a retry cannot send twice')
    const attemptId = resend ? `resend:${digest(String(requestId))}` : 'first'
    const prior = invoice.deliveryAttempts?.find(attempt => attempt.id === attemptId)
    if (prior?.status === 'sent' || (!resend && invoice.deliveryStatus === 'sent')) return { invoice, alreadySent: true, payUrl: invoicePayUrl(invoice) }
    if (prior?.startedAt && Date.now() - Date.parse(prior.startedAt) > IDEMPOTENCY_RECOVERY_MS && prior.status === 'pending') throw new Error('An earlier email attempt has an unknown outcome. Check Stripe delivery history before starting another send.')
    changeInvoice(id, current => ({
      deliveryProvider: 'stripe', deliveryStatus: 'pending',
      deliveryAttempts: [...(current.deliveryAttempts || []).filter(attempt => attempt.id !== attemptId), {
        id: attemptId, status: 'pending', startedAt: prior?.startedAt || new Date().toISOString(),
      }],
    }))
    try {
      guard()
      const sent = await stripe.invoices.sendInvoice(remote.id, {}, requestOptions(`${id}:send:${attemptId}`))
      guard()
      invoice = changeInvoice(id, current => ({
        deliveryProvider: 'stripe', deliveryStatus: 'sent', sentAt: new Date().toISOString(),
        sentTo: sent.customer_email || invoice.stripeIssuance?.details.email || client.email,
        deliveryAttempts: (current.deliveryAttempts || []).map(attempt => attempt.id === attemptId ? { ...attempt, status: 'sent', completedAt: new Date().toISOString() } : attempt),
        lastSendError: null, lastSendErrorAt: null, lastBillingError: null,
      }))
      return { invoice, payUrl: invoicePayUrl(invoice), sentTo: invoice.sentTo, deliveryProvider: 'stripe' }
    } catch (error) {
      // A timeout has an unknown delivery outcome. Keep the same pending attempt
      // and idempotency key rather than claiming failure means no email was sent.
      changeInvoice(id, { deliveryStatus: 'unknown', lastSendError: String(error.message || error).slice(0, 500), lastSendErrorAt: new Date().toISOString() })
      throw error
    }
  })
}

export async function retrieveLinkedStripeInvoice(id) {
  const invoice = invoiceRecord(id)
  if (!invoice?.stripeInvoiceId) throw new Error('This invoice has not been issued through Stripe')
  const stripe = clientOrThrow()
  await assertAccount(stripe, invoice)
  const remote = await stripe.invoices.retrieve(invoice.stripeInvoiceId, { expand: ['payment_intent'] })
  assertLinkedStripeInvoice(invoice, remote)
  return { stripe, invoice, remote }
}

export async function stripeInvoicePaymentDestination(id) {
  const { invoice, remote } = await retrieveLinkedStripeInvoice(id)
  if (invoice.reconciliationRequired) throw new Error('Invoice payment reconciliation is required before requesting payment')
  if (remote.status === 'paid') return { paid: true, invoice, remote }
  if (remote.status !== 'open') throw new Error('This invoice is no longer payable')
  // Retrieving the existing invoice refreshes Stripe's hosted URL validity. This
  // never creates a second invoice, Checkout session, or payment obligation.
  if (!remote.hosted_invoice_url) throw new Error('Stripe invoice payment page is unavailable')
  return { url: remote.hosted_invoice_url, invoice, remote, processing: remote.payment_intent?.status === 'processing' }
}
