import { readData, writeData } from '@/lib/dataStore'
import { validateApiKey } from '@/lib/apiAuth'
import { createClient } from '@/lib/clients'
import { NextResponse } from 'next/server'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const data = readData('leads.json') || { leads: [] }
  const url = new URL(request.url)
  let leads = data.leads

  const q = url.searchParams.get('q')
  if (q) {
    const lq = q.toLowerCase()
    leads = leads.filter(l =>
      (l.name || '').toLowerCase().includes(lq) ||
      (l.projectName || '').toLowerCase().includes(lq) ||
      (l.projectDescription || '').toLowerCase().includes(lq) ||
      (l.email || '').toLowerCase().includes(lq)
    )
  }

  const status = url.searchParams.get('status')
  if (status) {
    const statuses = status.split(',')
    leads = leads.filter(l => statuses.includes(l.status))
  }

  const manMoney = url.searchParams.get('man_money')
  if (manMoney !== null) leads = leads.filter(l => String(l.manGate?.money) === manMoney)
  const manAuthority = url.searchParams.get('man_authority')
  if (manAuthority !== null) leads = leads.filter(l => String(l.manGate?.authority) === manAuthority)
  const manNeed = url.searchParams.get('man_need')
  if (manNeed !== null) leads = leads.filter(l => String(l.manGate?.need) === manNeed)

  const minRating = url.searchParams.get('min_rating')
  if (minRating) leads = leads.filter(l => (l.rating || 0) >= Number(minRating))

  const limit = url.searchParams.get('limit')
  if (limit) leads = leads.slice(0, Number(limit))

  return NextResponse.json({ leads, total: leads.length })
}

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const data = readData('leads.json') || { leads: [] }

  if (body.action === 'add') {
    const lead = {
      id: genId(),
      createdAt: new Date().toISOString(),
      status: 'discovery',
      manGate: { money: false, authority: false, need: false },
      budgetTotal: 0, budgetUsed: 0,
      haiHoursTotal: 0, haiHoursUsed: 0,
      flexTasksUsed: 0, rating: null,
      notes: [], scopeItems: [],
      ...body.lead
    }
    data.leads.push(lead)
    data.lastUpdated = new Date().toISOString()
    writeData('leads.json', data)
    return NextResponse.json({ ok: true, lead })
  } else if (body.action === 'update') {
    const i = data.leads.findIndex(l => l.id === body.lead.id)
    if (i === -1) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    data.leads[i] = { ...data.leads[i], ...body.lead }
    data.lastUpdated = new Date().toISOString()
    writeData('leads.json', data)
    return NextResponse.json({ ok: true, lead: data.leads[i] })
  } else if (body.action === 'add_note') {
    const l = data.leads.find(l => l.id === body.leadId)
    if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!l.notes) l.notes = []
    const note = { id: genId(), text: body.text, date: new Date().toISOString() }
    l.notes.push(note)
    data.lastUpdated = new Date().toISOString()
    writeData('leads.json', data)
    return NextResponse.json({ ok: true, note })
  }

  if (body.action === 'delete') {
    data.leads = data.leads.filter(l => l.id !== body.id)
    data.lastUpdated = new Date().toISOString()
    writeData('leads.json', data)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'add_scope_item') {
    const l = data.leads.find(l => l.id === body.leadId)
    if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!l.scopeItems) l.scopeItems = []
    const item = { id: genId(), name: body.item.name, description: body.item.description || '', haiHours: body.item.haiHours || 0, status: 'pending' }
    l.scopeItems.push(item)
    data.lastUpdated = new Date().toISOString()
    writeData('leads.json', data)
    return NextResponse.json({ ok: true, item })
  }

  if (body.action === 'convert_to_client') {
    const l = data.leads.find(l => l.id === body.leadId)
    if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    l.status = 'converted'
    const newClient = createClient({
      name: l.name,
      email: l.email || '',
      phone: l.phone || '',
      notes: `Converted from lead. ${l.projectDescription || ''}`,
      projects: l.scopeItems?.length ? [{
        id: genId(),
        name: l.projectName || 'New Project',
        description: l.projectDescription || '',
        status: 'active',
        rate: '150',
        estimatedHours: String(l.haiHoursTotal || 0),
      }] : [],
    })
    data.lastUpdated = new Date().toISOString()
    writeData('leads.json', data)
    return NextResponse.json({ ok: true, client: newClient })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
