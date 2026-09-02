import { readData, writeData } from '@/lib/dataStore'
import { validateApiKey } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const data = readData('domains.json') || { domains: [] }
  const url = new URL(request.url)
  let domains = data.domains

  const id = url.searchParams.get('id')
  if (id) domains = domains.filter(d => d.id === id)

  const q = url.searchParams.get('q')
  if (q) {
    const lq = q.toLowerCase()
    domains = domains.filter(d => (d.domain || '').toLowerCase().includes(lq))
  }

  const registrar = url.searchParams.get('registrar')
  if (registrar) domains = domains.filter(d => (d.registrar || '').toLowerCase() === registrar.toLowerCase())

  const status = url.searchParams.get('status')
  if (status) domains = domains.filter(d => d.status === status)

  const limit = url.searchParams.get('limit')
  if (limit) domains = domains.slice(0, Number(limit))

  return NextResponse.json({ domains, total: domains.length })
}

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const data = readData('domains.json') || { domains: [] }

  if (body.action === 'add') {
    const domain = {
      id: genId(),
      registrar: 'GoDaddy', hosting: 'unknown', hostingType: 'unknown',
      dnsProvider: 'GoDaddy', sslStatus: 'unknown', autoRenew: true,
      status: 'active', notes: '', aRecords: [], cnameRecords: [], nsRecords: [],
      lastScanned: null,
      ...body.domain
    }
    data.domains.push(domain)
    data.lastUpdated = new Date().toISOString()
    writeData('domains.json', data)
    return NextResponse.json({ ok: true, domain })
  } else if (body.action === 'update') {
    const i = data.domains.findIndex(d => d.id === body.domain.id)
    if (i === -1) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    data.domains[i] = { ...data.domains[i], ...body.domain }
    data.lastUpdated = new Date().toISOString()
    writeData('domains.json', data)
    return NextResponse.json({ ok: true, domain: data.domains[i] })
  } else if (body.action === 'delete') {
    data.domains = data.domains.filter(d => d.id !== body.id)
    data.lastUpdated = new Date().toISOString()
    writeData('domains.json', data)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
