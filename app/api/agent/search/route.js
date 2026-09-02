// Unified search across the new entity model.
// Returns matches across accounts, contacts, leads, opportunities, projects, domains.
// Each match includes a `tabId` the UI uses to navigate to the right view.
import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { loadAll } from '@/lib/entityStore'
import { requireCrmRead } from '@/lib/permissions'

function score(record, q, primaryField) {
  const str = JSON.stringify(record).toLowerCase()
  if (!str.includes(q)) return 0
  const name = (record[primaryField] || record.name || record.bn || record.domain || '').toString().toLowerCase()
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 60
  return 20
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const rawType = url.searchParams.get('type')
  const typeFilter = rawType === 'client' || rawType === 'sponsor' ? 'account' : rawType
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  const out = []

  if (!typeFilter || typeFilter === 'account') {
    for (const a of loadAll('accounts')) {
      const s = score(a, q, 'name')
      if (s > 0) out.push({ type: 'account', id: a.id, name: a.name, email: a.email, phone: a.phone, accountType: a.type, _score: s, tabId: 'accounts' })
    }
  }

  if (!typeFilter || typeFilter === 'contact') {
    for (const c of loadAll('contacts')) {
      const s = score(c, q, 'name')
      if (s > 0) out.push({ type: 'contact', id: c.id, name: c.name, email: c.email, phone: c.phone, accountId: c.accountId, _score: s, tabId: 'contacts' })
    }
  }

  if (!typeFilter || typeFilter === 'lead') {
    for (const l of loadAll('leads')) {
      const s = score(l, q, 'name')
      if (s > 0) out.push({ type: 'lead', id: l.id, name: l.businessName || l.name, email: l.email, phone: l.phone, status: l.status, _score: s, tabId: 'leads' })
    }
  }

  if (!typeFilter || typeFilter === 'opportunity') {
    for (const o of loadAll('opportunities')) {
      const s = score(o, q, 'name')
      if (s > 0) out.push({ type: 'opportunity', id: o.id, name: o.name, pipelineId: o.pipelineId, stageId: o.stageId, value: o.value, accountId: o.accountId, _score: s, tabId: 'pipelines' })
    }
  }

  if (!typeFilter || typeFilter === 'project') {
    for (const p of loadAll('projects')) {
      const s = score(p, q, 'name')
      if (s > 0) out.push({ type: 'project', id: p.id, name: p.name, status: p.status, accountId: p.accountId, _score: s, tabId: 'projects' })
    }
  }

  if (!typeFilter || typeFilter === 'domain') {
    const domains = readData('domains.json')?.domains || []
    for (const d of domains) {
      const s = score(d, q, 'domain')
      if (s > 0) out.push({ type: 'domain', id: d.id, name: d.domain, registrar: d.registrar, status: d.status, _score: s, tabId: 'domains' })
    }
  }

  out.sort((a, b) => b._score - a._score)
  return NextResponse.json({ q, matches: out.slice(0, 10) })
}
