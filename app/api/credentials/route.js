import { readData, writeData } from '@/lib/dataStore'
import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { NextResponse } from 'next/server'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error
  logAuditEvent({ request, user, action: 'credentials_vault_opened', area: 'credentials', severity: 'info' })
  return NextResponse.json(readData('credentials.json') || { credentials: [] })
}

export async function POST(request) {
  const { user, error: authError } = await requireOwner(request)
  if (authError) return authError
  const body = await request.json()
  const data = readData('credentials.json') || { credentials: [] }

  if (body.action === 'add') {
    data.credentials.push({ id: genId(), ...body.credential })
  } else if (body.action === 'update') {
    const i = data.credentials.findIndex(c => c.id === body.credential.id)
    if (i !== -1) data.credentials[i] = body.credential
  } else if (body.action === 'delete') {
    data.credentials = data.credentials.filter(c => c.id !== body.id)
  } else if (body.action === 'bulk_delete') {
    const ids = new Set(body.ids || [])
    data.credentials = data.credentials.filter(c => !ids.has(c.id))
  }

  data.lastUpdated = new Date().toISOString()
  writeData('credentials.json', data)
  logAuditEvent({
    request,
    user,
    action: `credential_${body.action || 'changed'}`,
    area: 'credentials',
    severity: body.action === 'delete' ? 'warn' : 'info',
    targetId: body.id || body.credential?.id || '',
    targetName: body.credential?.name || '',
    meta: {
      category: body.credential?.category || '',
      fieldCount: body.credential?.fields?.length || '',
    },
  })
  return NextResponse.json(data)
}
