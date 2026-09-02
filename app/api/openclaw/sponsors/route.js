import { validateApiKey } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'sponsor-leads.json')

export async function GET(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  if (!fs.existsSync(FILE)) return NextResponse.json({ sponsors: [], total: 0 })
  const sponsors = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  const url = new URL(request.url)

  let results = Array.isArray(sponsors) ? sponsors : []

  const q = url.searchParams.get('q')
  if (q) {
    const lq = q.toLowerCase()
    results = results.filter(s =>
      JSON.stringify(s).toLowerCase().includes(lq)
    )
  }

  const cat = url.searchParams.get('cat')
  if (cat) results = results.filter(s => (s.cat || '').toLowerCase().includes(cat.toLowerCase()))

  const bt = url.searchParams.get('bt')
  if (bt) results = results.filter(s => (s.bt || '').toLowerCase().includes(bt.toLowerCase()))

  const mk = url.searchParams.get('mk')
  if (mk) results = results.filter(s => (s.mk || '').toLowerCase() === mk.toLowerCase())

  const st = url.searchParams.get('st')
  if (st) results = results.filter(s => (s.st || '').toLowerCase() === st.toLowerCase())

  const limit = url.searchParams.get('limit')
  if (limit) results = results.slice(0, Number(limit))

  return NextResponse.json({ leads: results, total: results.length })
}

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

  if (body.action === 'add') {
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]', 'utf-8')
    const leads = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    const lead = {
      id: genId(),
      bn: '', cn: '', ph: '', em: '', mk: '', cat: '', bt: '',
      st: 'prospect', lt: 'business', notes: [],
      ts: new Date().toISOString(), lc: null,
      ...body.lead
    }
    leads.push(lead)
    fs.writeFileSync(FILE, JSON.stringify(leads, null, 2), 'utf-8')
    return NextResponse.json({ ok: true, lead })
  }

  if (body.action === 'update') {
    if (!fs.existsSync(FILE)) return NextResponse.json({ error: 'No data file' }, { status: 404 })
    const leads = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    const i = leads.findIndex(l => l.id === body.lead.id)
    if (i === -1) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    leads[i] = { ...leads[i], ...body.lead }
    fs.writeFileSync(FILE, JSON.stringify(leads, null, 2), 'utf-8')
    return NextResponse.json({ ok: true, lead: leads[i] })
  }

  if (body.action === 'delete') {
    if (!fs.existsSync(FILE)) return NextResponse.json({ error: 'No data file' }, { status: 404 })
    let leads = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    leads = leads.filter(l => l.id !== body.id)
    fs.writeFileSync(FILE, JSON.stringify(leads, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'add_note') {
    if (!fs.existsSync(FILE)) return NextResponse.json({ error: 'No data file' }, { status: 404 })
    const leads = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    const l = leads.find(l => l.id === body.leadId)
    if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!Array.isArray(l.notes)) l.notes = []
    const note = { id: genId(), text: body.text, date: new Date().toISOString() }
    l.notes.push(note)
    fs.writeFileSync(FILE, JSON.stringify(leads, null, 2), 'utf-8')
    return NextResponse.json({ ok: true, note })
  }

  if (body.action === 'batch_update') {
    if (!Array.isArray(body.updates)) return NextResponse.json({ error: 'updates must be an array' }, { status: 400 })
    if (!fs.existsSync(FILE)) return NextResponse.json({ error: 'No data file' }, { status: 404 })
    const leads = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    let updated = 0
    for (const upd of body.updates) {
      if (!upd.id) continue
      const i = leads.findIndex(l => l.id === upd.id)
      if (i !== -1) {
        if (upd.em) leads[i].em = upd.em
        if (upd.ph) leads[i].ph = upd.ph
        if (upd.cn) leads[i].cn = upd.cn
        updated++
      }
    }
    fs.writeFileSync(FILE, JSON.stringify(leads, null, 2), 'utf-8')
    return NextResponse.json({ ok: true, updated, total: body.updates.length })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
