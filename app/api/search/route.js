import { NextResponse } from 'next/server'
import { loadAll } from '@/lib/entityStore'
import { listSupportTickets } from '@/lib/supportTickets'
import { requireCrmRead } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const norm = s => (s || '').toString().toLowerCase()

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const q = norm(searchParams.get('q')).trim()
  if (!q || q.length < 2) return NextResponse.json({ ok: true, results: [] })
  const match = (...fields) => fields.some(f => norm(f).includes(q))
  const results = []

  const accounts = loadAll('accounts')
  const accountName = id => accounts.find(a => a.id === id)?.name || ''

  for (const a of accounts) {
    if (match(a.name, a.email, a.phone, a.industry)) results.push({ type: 'account', tabId: 'accounts', id: a.id, name: a.name, sub: a.industry || a.email || a.type || '' })
  }
  for (const c of loadAll('contacts')) {
    if (match(c.name, c.email, c.phone, c.title)) results.push({ type: 'contact', tabId: 'contacts', id: c.id, name: c.name, sub: [c.title, accountName(c.accountId)].filter(Boolean).join(' \u00b7 ') })
  }
  for (const o of loadAll('opportunities')) {
    if (match(o.name)) results.push({ type: 'opportunity', tabId: 'pipelines', id: o.id, name: o.name, sub: accountName(o.accountId) })
  }
  for (const p of loadAll('projects')) {
    if (match(p.name, p.description)) results.push({ type: 'project', tabId: 'projects', id: p.id, name: p.name, sub: accountName(p.accountId) })
  }
  for (const t of loadAll('tasks')) {
    if (match(t.title, t.name)) results.push({ type: 'task', tabId: 'tasks', id: t.id, name: t.title || t.name, sub: t.status || '' })
  }
  for (const l of loadAll('leads')) {
    if (match(l.name, l.email, l.phone, l.company)) results.push({ type: 'lead', tabId: 'leads', id: l.id, name: l.name || l.company || l.email || '(lead)', sub: l.company || l.phone || '' })
  }
  let tickets = []
  try { tickets = listSupportTickets({}) || [] } catch { tickets = [] }
  for (const t of tickets) {
    if (match(t.subject, t.ticketNumber, t.description)) results.push({ type: 'ticket', tabId: 'support', id: t.id, name: t.subject || t.ticketNumber, sub: t.status || '' })
  }

  // Cap per type and overall so the palette stays snappy
  const perType = {}
  const capped = []
  for (const r of results) {
    perType[r.type] = (perType[r.type] || 0) + 1
    if (perType[r.type] <= 6 && capped.length < 30) capped.push(r)
  }
  return NextResponse.json({ ok: true, results: capped })
}
