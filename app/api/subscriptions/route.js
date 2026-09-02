import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'subscriptions.json'

function load() {
  const wrap = readData(FILE) || { subscriptions: [], lastUpdated: null }
  return Array.isArray(wrap) ? { subscriptions: wrap, lastUpdated: null } : wrap
}

function save(wrap) {
  wrap.lastUpdated = new Date().toISOString()
  writeData(FILE, wrap)
}

function genId() { return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// Compute the next due date given a starting date and frequency
function computeNextDue(currentNextDue, frequency) {
  if (!currentNextDue) return null
  const d = new Date(currentNextDue)
  if (isNaN(d.getTime())) return currentNextDue
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const data = load()
  return NextResponse.json(data)
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    const data = load()

    if (body.action === 'create') {
      const sub = {
        id: genId(),
        vendor: body.vendor || 'Unnamed',
        productOrPlan: body.productOrPlan || '',
        category: body.category || 'other',
        amount: Number(body.amount) || 0,
        currency: body.currency || 'USD',
        frequency: body.frequency || 'monthly',
        billingType: body.billingType || 'fixed',
        billingDayOfMonth: body.billingDayOfMonth || null,
        lastChargeDate: body.lastChargeDate || null,
        nextDue: body.nextDue || null,
        status: body.status || (body.active === false ? 'paused' : 'active'),
        paymentMethod: body.paymentMethod || '',
        businessEntity: body.businessEntity || '',
        projectOrProduct: body.projectOrProduct || '',
        // Multi-project tagging: which projects/clients this vendor is used in.
        // Each link: { kind:'project'|'account', id, name, billable } — billable means it can be charged to that client's invoice.
        links: Array.isArray(body.links) ? body.links : [],
        // True for vendors used everywhere (e.g. Cloudflare) — saves tagging every project.
        usedEverywhere: body.usedEverywhere === true,
        minObservedAmount: body.minObservedAmount ?? null,
        maxObservedAmount: body.maxObservedAmount ?? null,
        avgMonthlyAmount: body.avgMonthlyAmount ?? null,
        last3Charges: body.last3Charges || null,
        loginUrl: body.loginUrl || '',
        notes: body.notes || '',
        active: body.active !== false,
        autoSource: body.autoSource || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      data.subscriptions.push(sub)
      save(data)
      return NextResponse.json({ ok: true, subscription: sub })
    }

    if (body.action === 'update') {
      const idx = data.subscriptions.findIndex(s => s.id === body.id)
      if (idx < 0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      data.subscriptions[idx] = { ...data.subscriptions[idx], ...body.patch, updatedAt: new Date().toISOString() }
      save(data)
      return NextResponse.json({ ok: true, subscription: data.subscriptions[idx] })
    }

    if (body.action === 'delete') {
      data.subscriptions = data.subscriptions.filter(s => s.id !== body.id)
      save(data)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'mark_paid') {
      // Advance the next-due date by one frequency cycle
      const idx = data.subscriptions.findIndex(s => s.id === body.id)
      if (idx < 0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      const sub = data.subscriptions[idx]
      const next = computeNextDue(sub.nextDue, sub.frequency)
      const paidAt = new Date().toISOString()
      data.subscriptions[idx] = { ...sub, nextDue: next, lastChargeDate: paidAt.slice(0, 10), lastPaidAt: paidAt, updatedAt: paidAt }
      save(data)
      return NextResponse.json({ ok: true, subscription: data.subscriptions[idx] })
    }

    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
