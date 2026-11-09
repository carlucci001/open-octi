import { readData, writeData } from '@/lib/dataStore'
import { validateApiKey } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/auditLog'
import { credentialMetadata } from '@/lib/credential-metadata'
import { NextResponse } from 'next/server'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
const actor = { id: 'openclaw', username: 'openclaw', displayName: 'OpenClaw', role: 'agent' }

function audit(request, action, credentials) {
  logAuditEvent({
    request, user: actor, action, area: 'credentials',
    meta: { ids: credentials.map(c => c.id), names: credentials.map(c => c.name) },
  })
}

export async function GET(request) {
  let creds = []
  try {
    const auth = validateApiKey(request)
    if (!auth.ok) return auth.response
    const data = readData('credentials.json') || { credentials: [] }
    const url = new URL(request.url)
    const name = url.searchParams.get('name')
    const category = url.searchParams.get('category')
    const id = url.searchParams.get('id')
    creds = data.credentials
    if (id) creds = creds.filter(c => c.id === id)
    if (name) creds = creds.filter(c => (c.name || '').toLowerCase().includes(name.toLowerCase()))
    if (category) creds = creds.filter(c => c.category === category)
    return NextResponse.json({ credentials: creds.map(credentialMetadata), total: creds.length }, { headers: { 'Cache-Control': 'no-store' } })
  } finally {
    audit(request, 'openclaw_credentials_read', creds)
  }
}

export async function POST(request) {
  const affected = []
  try {
    const auth = validateApiKey(request)
    if (!auth.ok) return auth.response
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const data = readData('credentials.json') || { credentials: [] }
    let credential
    if (body.action === 'add') {
      if (!body.credential || typeof body.credential !== 'object') return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
      credential = { ...body.credential, id: genId() }
      data.credentials.push(credential)
      affected.push(credential)
    } else if (body.action === 'update') {
      const i = data.credentials.findIndex(c => c.id === body.credential?.id)
      if (i === -1) return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
      credential = { ...data.credentials[i], ...body.credential }
      data.credentials[i] = credential
      affected.push(credential)
    } else if (body.action === 'delete') {
      affected.push(...data.credentials.filter(c => c.id === body.id))
      data.credentials = data.credentials.filter(c => c.id !== body.id)
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    data.lastUpdated = new Date().toISOString()
    writeData('credentials.json', data)
    return NextResponse.json({ ok: true, ...(credential ? { credential: credentialMetadata(credential) } : {}) }, { headers: { 'Cache-Control': 'no-store' } })
  } finally {
    audit(request, 'openclaw_credentials_write', affected)
  }
}
