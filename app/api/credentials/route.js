import { readData, writeData } from '@/lib/dataStore'
import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { NextResponse } from 'next/server'
import { maskVault } from '@/lib/credential-metadata'

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export async function GET(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error
  logAuditEvent({ request, user, action: 'credentials_vault_opened', area: 'credentials', severity: 'info' })
  return NextResponse.json(maskVault(readData('credentials.json') || { credentials: [] }), { headers: { 'Cache-Control': 'no-store' } })
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
    if (i === -1) return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    const stored = data.credentials[i]
    const fields = body.credential.fields
    if (!Array.isArray(fields)) return NextResponse.json({ error: 'Fields are required' }, { status: 400 })
    const updatedFields = []
    for (const field of fields) {
      const originalLabel = field.originalLabel ?? field.label
      const matches = (stored.fields || []).filter(item => item.label === originalLabel)
      if (field.originalIndex !== undefined && (!Number.isInteger(field.originalIndex) || field.originalIndex < 0)) {
        return NextResponse.json({ error: 'Invalid original field index' }, { status: 400 })
      }
      if (!Object.hasOwn(field, 'value') && field.originalIndex === undefined && matches.length > 1) {
        return NextResponse.json({ error: 'Original field label is ambiguous' }, { status: 400 })
      }
      const original = field.originalIndex === undefined ? matches[0] : stored.fields?.[field.originalIndex]
      if (field.originalIndex !== undefined && (!original || original.label !== originalLabel)) {
        return NextResponse.json({ error: 'Credential field changed; refresh and retry' }, { status: 409 })
      }
      if (!Object.hasOwn(field, 'value') && !original) {
        return NextResponse.json({ error: 'A value is required for a new field' }, { status: 400 })
      }
      updatedFields.push({ label: field.label, sensitive: !!field.sensitive, value: Object.hasOwn(field, 'value') ? field.value : original.value })
    }
    data.credentials[i] = { ...stored, ...body.credential, fields: updatedFields }
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
  return NextResponse.json(maskVault(data), { headers: { 'Cache-Control': 'no-store' } })
}
