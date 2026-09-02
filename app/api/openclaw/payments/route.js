import { readData, writeData } from '@/lib/dataStore'
import { validateApiKey } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const data = readData('payments.json') || { payments: [] }
  const url = new URL(request.url)
  let payments = data.payments

  const clientName = url.searchParams.get('clientName')
  if (clientName) {
    const lc = clientName.toLowerCase()
    payments = payments.filter(p => (p.clientName || '').toLowerCase().includes(lc))
  }

  const clientId = url.searchParams.get('clientId')
  if (clientId) payments = payments.filter(p => p.clientId === clientId)

  const status = url.searchParams.get('status')
  if (status) payments = payments.filter(p => p.status === status)

  const since = url.searchParams.get('since')
  if (since) payments = payments.filter(p => p.date >= since)

  const limit = url.searchParams.get('limit')
  if (limit) payments = payments.slice(0, Number(limit))

  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  return NextResponse.json({ payments, count: payments.length, totalAmount: total })
}

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const data = readData('payments.json') || { payments: [] }

  if (body.action === 'record') {
    const payment = {
      id: genId(),
      stripeId: body.stripeId || '',
      amount: parseFloat(body.amount),
      clientName: body.clientName,
      clientId: body.clientId || '',
      description: body.description || '',
      email: body.email || '',
      status: body.status || 'succeeded',
      type: body.type || 'one-time',
      date: body.date || new Date().toISOString(),
      last4: body.last4 || '',
      brand: body.brand || '',
    }
    data.payments.push(payment)
    data.lastUpdated = new Date().toISOString()
    writeData('payments.json', data)
    return NextResponse.json({ ok: true, payment })
  } else if (body.action === 'delete') {
    data.payments = data.payments.filter(p => p.id !== body.id)
    data.lastUpdated = new Date().toISOString()
    writeData('payments.json', data)
    return NextResponse.json({ ok: true })
  } else if (body.action === 'update') {
    const i = data.payments.findIndex(p => p.id === body.payment.id)
    if (i === -1) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    data.payments[i] = { ...data.payments[i], ...body.payment }
    data.lastUpdated = new Date().toISOString()
    writeData('payments.json', data)
    return NextResponse.json({ ok: true, payment: data.payments[i] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
