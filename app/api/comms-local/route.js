import { readData, writeData } from '@/lib/dataStore'
import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const data = readData('comms-local.json') || { archived: [], deleted: [], drafts: [] }
  return NextResponse.json({ archived: data.archived || [], deleted: data.deleted || [], drafts: data.drafts || [] })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()
  const data = readData('comms-local.json') || { archived: [], deleted: [], drafts: [] }
  data.archived ||= []
  data.deleted ||= []
  data.drafts ||= []

  if (body.action === 'archive') {
    const ids = Array.isArray(body.ids) ? body.ids : [body.ids]
    data.archived = [...new Set([...data.archived, ...ids])]
  } else if (body.action === 'unarchive') {
    const ids = Array.isArray(body.ids) ? body.ids : [body.ids]
    data.archived = data.archived.filter(id => !ids.includes(id))
  } else if (body.action === 'clear_archive') {
    data.archived = []
  } else if (body.action === 'delete') {
    const ids = (Array.isArray(body.ids) ? body.ids : [body.ids]).map(id => String(id || '').trim()).filter(Boolean)
    data.deleted = [...new Set([...data.deleted, ...ids])]
    data.archived = data.archived.filter(id => !ids.includes(id))
  } else if (body.action === 'create_draft') {
    const now = new Date().toISOString()
    const draft = {
      id: `draft_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      source: String(body.source || 'manual').slice(0, 80),
      candidateId: String(body.candidateId || '').slice(0, 160),
      to: String(body.to || '').trim().slice(0, 320),
      subject: String(body.subject || '').trim().slice(0, 500),
      html: String(body.html || '').slice(0, 50_000),
      approvalRequired: true,
      status: 'pending_approval',
      createdAt: now,
      updatedAt: now,
    }
    if (!draft.to || !draft.subject) return NextResponse.json({ ok: false, error: 'Draft recipient and subject are required.' }, { status: 400 })
    data.drafts.unshift(draft)
    writeData('comms-local.json', data)
    return NextResponse.json({ ok: true, draft, archived: data.archived, drafts: data.drafts })
  } else if (body.action === 'mark_draft_sent') {
    const draft = data.drafts.find(row => row.id === body.id)
    if (!draft) return NextResponse.json({ ok: false, error: 'Draft not found.' }, { status: 404 })
    draft.status = 'sent'
    draft.sentAt = new Date().toISOString()
    draft.updatedAt = draft.sentAt
  } else if (body.action === 'discard_draft') {
    data.drafts = data.drafts.filter(row => row.id !== body.id)
  }

  writeData('comms-local.json', data)
  return NextResponse.json({ ...data, ok: true })
}
