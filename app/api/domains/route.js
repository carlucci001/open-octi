import { readData, writeData } from '@/lib/dataStore'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  return NextResponse.json(readData('domains.json') || { domains: [] })
}

export async function POST(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const body = await request.json()
  const data = readData('domains.json') || { domains: [] }

  if (body.action === 'add') {
    data.domains.push({ id: genId(), registrar: 'GoDaddy', hosting: 'unknown', hostingType: 'unknown', dnsProvider: 'GoDaddy', sslStatus: 'unknown', autoRenew: true, status: 'active', notes: '', aRecords: [], cnameRecords: [], nsRecords: [], lastScanned: null, ...body.domain })
  } else if (body.action === 'update') {
    const i = data.domains.findIndex(d => d.id === body.domain.id)
    if (i !== -1) data.domains[i] = { ...data.domains[i], ...body.domain }
  } else if (body.action === 'delete') {
    data.domains = data.domains.filter(d => d.id !== body.id)
  } else if (body.action === 'bulk_delete') {
    const ids = new Set(body.ids || [])
    data.domains = data.domains.filter(d => !ids.has(d.id))
  } else if (body.action === 'import') {
    const existing = new Set(data.domains.map(d => d.domain.toLowerCase()))
    for (const dom of (body.domains || [])) {
      if (!dom.domain || existing.has(dom.domain.toLowerCase())) continue
      data.domains.push({ id: genId(), registrar: 'GoDaddy', hosting: 'unknown', hostingType: 'unknown', dnsProvider: 'GoDaddy', sslStatus: 'unknown', autoRenew: true, status: 'active', notes: '', aRecords: [], cnameRecords: [], nsRecords: [], lastScanned: null, ...dom })
      existing.add(dom.domain.toLowerCase())
    }
  }

  data.lastUpdated = new Date().toISOString()
  writeData('domains.json', data)
  return NextResponse.json(data)
}
