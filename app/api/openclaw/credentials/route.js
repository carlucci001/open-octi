import { readData, writeData } from '@/lib/dataStore'
import { validateApiKey } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const data = readData('credentials.json') || { credentials: [] }
  const url = new URL(request.url)
  const name = url.searchParams.get('name')
  const category = url.searchParams.get('category')
  const id = url.searchParams.get('id')

  let creds = data.credentials
  if (id) creds = creds.filter(c => c.id === id)
  if (name) {
    const ln = name.toLowerCase()
    creds = creds.filter(c => (c.name || '').toLowerCase().includes(ln))
  }
  if (category) creds = creds.filter(c => c.category === category)

  return NextResponse.json({ credentials: creds, total: creds.length })
}

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const data = readData('credentials.json') || { credentials: [] }

  if (body.action === 'add') {
    const credential = { id: genId(), ...body.credential }
    data.credentials.push(credential)
    data.lastUpdated = new Date().toISOString()
    writeData('credentials.json', data)
    return NextResponse.json({ ok: true, credential })
  } else if (body.action === 'update') {
    const i = data.credentials.findIndex(c => c.id === body.credential.id)
    if (i === -1) return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    data.credentials[i] = { ...data.credentials[i], ...body.credential }
    data.lastUpdated = new Date().toISOString()
    writeData('credentials.json', data)
    return NextResponse.json({ ok: true, credential: data.credentials[i] })
  } else if (body.action === 'delete') {
    data.credentials = data.credentials.filter(c => c.id !== body.id)
    data.lastUpdated = new Date().toISOString()
    writeData('credentials.json', data)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
