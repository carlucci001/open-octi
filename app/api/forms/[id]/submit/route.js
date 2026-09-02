import { NextResponse } from 'next/server'
import { clientIp, loadDocumentData, saveDocumentData } from '@/lib/documentSignatures'

function sanitizeValue(value) {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return ''
  return String(value).slice(0, 5000)
}

export async function POST(request, { params }) {
  const data = loadDocumentData()
  const form = (data.forms || []).find(f => f.id === params.id && f.status === 'active')
  if (!form) return NextResponse.json({ error: 'Form is not accepting submissions' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const rawValues = body.values || {}
  const values = {}
  for (const field of form.fields || []) {
    const value = sanitizeValue(rawValues[field.key])
    if (field.required && (value === '' || value === false)) {
      return NextResponse.json({ error: `${field.label || field.key} is required` }, { status: 400 })
    }
    values[field.key] = value
  }
  const submission = {
    id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    formId: form.id,
    formTitle: form.title,
    values,
    destination: form.destination || 'leads',
    automation: form.automation || '',
    createdAt: new Date().toISOString(),
    source: 'public-form',
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent') || '',
  }
  saveDocumentData({
    ...data,
    formSubmissions: [...(data.formSubmissions || []), submission],
  })
  return NextResponse.json({ ok: true, submissionId: submission.id })
}
