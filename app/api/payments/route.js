import { readData, writeData } from '@/lib/dataStore'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { recordPayment } from '@/lib/paymentLedger'

function getStripeKeyFromVault() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = (creds.credentials || []).find(c => /stripe/i.test(c.name || ''))
  if (!entry) return ''
  const fields = entry.fields || []
  const prod = fields.find(f => /secret.*\(p\)/i.test(f.label || ''))
  const test = fields.find(f => /secret.*\(s\)/i.test(f.label || ''))
  const fallback = fields.find(f => /secret/i.test(f.label || ''))
  return (prod || test || fallback)?.value?.trim() || ''
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || getStripeKeyFromVault()
  if (!key) return null
  return new Stripe(key)
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const data = readData('payments.json') || { payments: [] }
  let payments = data.payments || []
  const clientId = url.searchParams.get('clientId')
  const clientName = url.searchParams.get('clientName')
  const since = url.searchParams.get('since')
  if (clientId) payments = payments.filter(p => p.clientId === clientId)
  if (clientName) {
    const q = clientName.toLowerCase()
    payments = payments.filter(p => (p.clientName || '').toLowerCase() === q)
  }
  if (since) payments = payments.filter(p => (p.date || '') >= since)
  return NextResponse.json({ ...data, payments })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()
  const data = readData('payments.json') || { payments: [] }
  const stripe = getStripe()

  if (body.action === 'create_intent') {
    if (!stripe) {
      console.warn('[payments] create_intent blocked: stripe key missing')
      return NextResponse.json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY or a Stripe secret in the CRM vault.' }, { status: 400 })
    }
    try {
      const amount = Math.round(parseFloat(body.amount) * 100)
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Payment amount must be greater than zero' }, { status: 400 })
      console.info('[payments] create_intent requested', { amount, hasClientId: Boolean(body.clientId), hasEmail: Boolean(body.email) })
      const intent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        description: `${body.clientName} — ${body.description}`,
        receipt_email: body.email || undefined,
        metadata: { client_name: body.clientName, project: body.description, client_id: body.clientId || '', source: 'Farrington Command Center' },
      })
      console.info('[payments] create_intent ready', { intentId: intent.id })
      return NextResponse.json({ clientSecret: intent.client_secret, intentId: intent.id })
    } catch (err) {
      console.warn('[payments] create_intent failed', { type: err?.type || err?.name || 'error', code: err?.code || '', status: err?.statusCode || '' })
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
  }

  if (body.action === 'confirm') {
    if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
    try {
      const intent = await stripe.paymentIntents.confirm(body.intentId, { payment_method: body.paymentMethodId })
      if (intent.status === 'succeeded') {
        const charge = intent.latest_charge ? await stripe.charges.retrieve(intent.latest_charge) : null
        recordPayment({
          id: genId(), stripeId: intent.id, amount: intent.amount / 100,
          clientName: body.clientName, clientId: body.clientId || '', description: body.description,
          email: body.email || '', status: 'succeeded', type: body.type || 'one-time',
          date: new Date().toISOString(),
          last4: charge?.payment_method_details?.card?.last4 || '', brand: charge?.payment_method_details?.card?.brand || '',
          source: 'payment_intent_confirm',
        })
      }
      return NextResponse.json({ status: intent.status })
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
  }

  if (body.action === 'record_from_intent') {
    if (!stripe) {
      console.warn('[payments] record_from_intent blocked: stripe key missing')
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
    }
    try {
      console.info('[payments] record_from_intent requested', { hasIntentId: Boolean(body.intentId) })
      const intent = await stripe.paymentIntents.retrieve(body.intentId, { expand: ['latest_charge'] })
      if (intent.status !== 'succeeded') return NextResponse.json({ error: 'Payment not succeeded: ' + intent.status }, { status: 400 })
      const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null
      const meta = intent.metadata || {}
      const { payment } = recordPayment({
        id: genId(), stripeId: intent.id, amount: intent.amount / 100,
        clientName: meta.client_name || body.clientName || '', clientId: meta.client_id || body.clientId || '',
        description: meta.project || body.description || '',
        email: body.email || '', status: 'succeeded', type: body.type || 'one-time',
        date: new Date().toISOString(),
        last4: charge?.payment_method_details?.card?.last4 || '',
        brand: charge?.payment_method_details?.card?.brand || '',
        invoiceId: body.invoiceId || '',
        source: 'payment_intent_lookup',
      })
      const next = readData('payments.json') || { payments: [] }
      console.info('[payments] record_from_intent saved', { paymentId: payment.id })
      return NextResponse.json({ ...next, ok: true, payment, payments: next.payments || [] })
    } catch (err) {
      console.warn('[payments] record_from_intent failed', { type: err?.type || err?.name || 'error', code: err?.code || '', status: err?.statusCode || '' })
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
  }

  if (body.action === 'record') {
    const { payment } = recordPayment({
      id: genId(), stripeId: body.stripeId || '', amount: parseFloat(body.amount),
      clientName: body.clientName, clientId: body.clientId || '', description: body.description,
      email: body.email || '', status: body.status || 'succeeded', type: body.type || 'one-time',
      date: body.date || new Date().toISOString(), last4: body.last4 || '', brand: body.brand || '',
      invoiceId: body.invoiceId || '', invoiceNumber: body.invoiceNumber || '',
      source: 'manual_record',
    })
    const next = readData('payments.json') || { payments: [] }
    console.info('[payments] record_from_intent saved', { paymentId: payment.id })
    return NextResponse.json({ ...next, ok: true, payment, payments: next.payments || [] })
  }

  if (body.action === 'delete') {
    data.payments = data.payments.filter(p => p.id !== body.id)
    data.lastUpdated = new Date().toISOString()
    writeData('payments.json', data)
    return NextResponse.json(data)
  }

  if (body.action === 'update') {
    const i = data.payments.findIndex(p => p.id === body.payment.id)
    if (i !== -1) data.payments[i] = { ...data.payments[i], ...body.payment }
    data.lastUpdated = new Date().toISOString()
    writeData('payments.json', data)
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
