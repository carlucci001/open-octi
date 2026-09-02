// Tasks API — supports polymorphic linkedTo: { accountId?, contactId?, leadId?, opportunityId?, projectId? }.
// Legacy clientId/projectId fields on incoming requests are normalized into linkedTo for back-compat.
import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, removeMany, findById, saveAll } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Legacy aliasing — accept old-shape requests
function normalize(task = {}) {
  const linkedTo = { ...(task.linkedTo || {}) }
  if (task.clientId && !linkedTo.accountId) linkedTo.accountId = task.clientId
  if (task.projectId && !linkedTo.projectId) linkedTo.projectId = task.projectId
  return { ...task, linkedTo }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  let tasks = loadAll('tasks')

  const accountId = searchParams.get('accountId') || searchParams.get('clientId')
  const contactId = searchParams.get('contactId')
  const leadId = searchParams.get('leadId')
  const opportunityId = searchParams.get('opportunityId')
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status')

  if (accountId) tasks = tasks.filter(t => t.linkedTo?.accountId === accountId || t.clientId === accountId)
  if (contactId) tasks = tasks.filter(t => t.linkedTo?.contactId === contactId)
  if (leadId) tasks = tasks.filter(t => t.linkedTo?.leadId === leadId)
  if (opportunityId) tasks = tasks.filter(t => t.linkedTo?.opportunityId === opportunityId)
  if (projectId) tasks = tasks.filter(t => t.linkedTo?.projectId === projectId || t.projectId === projectId)
  if (status) tasks = tasks.filter(t => t.status === status)

  return NextResponse.json({ tasks })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const normalized = normalize(body.task || {})
    const rec = create('tasks', {
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      linkedTo: {},
      tags: [],
      completedAt: null,
      ...normalized,
    })
    return NextResponse.json({ ok: true, task: rec })
  }

  if (body.action === 'update') {
    const prev = findById('tasks', body.task.id)
    if (!prev) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    const normalized = normalize(body.task)
    const patch = { ...normalized }
    if (normalized.status === 'done' && prev.status !== 'done') patch.completedAt = new Date().toISOString()
    if (normalized.status && normalized.status !== 'done') patch.completedAt = null
    const rec = update('tasks', body.task.id, patch)
    return NextResponse.json({ ok: true, task: rec })
  }

  if (body.action === 'delete') {
    remove('tasks', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    removeMany('tasks', body.ids || [])
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_status') {
    const ids = new Set(body.ids || [])
    const now = new Date().toISOString()
    const list = loadAll('tasks').map(t => ids.has(t.id)
      ? { ...t, status: body.status, updatedAt: now, completedAt: body.status === 'done' ? now : null }
      : t)
    saveAll('tasks', list)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
