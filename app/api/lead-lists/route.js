import { NextResponse } from 'next/server'
import { create, loadAll, remove, saveAll, update } from '@/lib/entityStore'
import { accessibleLeadListsForUser, normalizeLeadList, slugifyLeadList, userCanAccessLeadList } from '@/lib/leadLists'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { isAdminLike } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function canManageLeadList(user, list = {}) {
  if (isAdminLike(user)) return true
  return userCanAccessLeadList(user, list) && String(list.ownerUserId || '') === String(user?.id || '')
}

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const leadLists = accessibleLeadListsForUser(user)
  if (id) {
    const leadList = leadLists.find(list => list.id === id || list.legacyPipelineId === id)
    if (!leadList) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ leadList })
  }
  return NextResponse.json({ leadLists })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))

  if (body.action === 'add') {
    const incoming = body.leadList || {}
    const id = incoming.id || slugifyLeadList(incoming.name)
    if (!id || !incoming.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (loadAll('leadLists').some(list => list.id === id)) {
      return NextResponse.json({ error: `lead list "${id}" already exists` }, { status: 409 })
    }
    const rec = create('leadLists', normalizeLeadList({
      ...incoming,
      id,
      ownerUserId: incoming.ownerUserId || user.id,
      assignedUserIds: Array.isArray(incoming.assignedUserIds) ? incoming.assignedUserIds : [user.id].filter(Boolean),
      visibleToAll: incoming.visibleToAll !== undefined ? incoming.visibleToAll : isAdminLike(user),
      source: 'lead_list',
    }))
    return NextResponse.json({ ok: true, leadList: rec })
  }

  if (body.action === 'update') {
    const incoming = normalizeLeadList(body.leadList || {})
    const existing = loadAll('leadLists').find(list => list.id === incoming.id)
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!canManageLeadList(user, existing)) return NextResponse.json({ error: 'permission denied' }, { status: 403 })
    const rec = update('leadLists', incoming.id, { ...incoming, updatedAt: new Date().toISOString() })
    return NextResponse.json({ ok: true, leadList: rec })
  }

  if (body.action === 'materialize_legacy') {
    const incoming = normalizeLeadList(body.leadList || {})
    if (!incoming.id || !incoming.name) return NextResponse.json({ error: 'leadList required' }, { status: 400 })
    if (!isAdminLike(user) && !userCanAccessLeadList(user, incoming)) {
      return NextResponse.json({ error: 'permission denied' }, { status: 403 })
    }
    const existing = loadAll('leadLists').find(list => list.id === incoming.id)
    if (existing) return NextResponse.json({ ok: true, leadList: existing })
    const rec = create('leadLists', {
      ...incoming,
      source: 'lead_list',
      system: false,
      ownerUserId: incoming.ownerUserId || (isAdminLike(user) ? '' : user.id),
      visibleToAll: incoming.visibleToAll !== undefined ? incoming.visibleToAll : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true, leadList: rec })
  }

  if (body.action === 'delete') {
    const id = String(body.id || '').trim()
    const existing = loadAll('leadLists').find(list => list.id === id)
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!canManageLeadList(user, existing)) return NextResponse.json({ error: 'permission denied' }, { status: 403 })
    remove('leadLists', id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_replace') {
    if (!isAdminLike(user)) return NextResponse.json({ error: 'permission denied' }, { status: 403 })
    const leadLists = Array.isArray(body.leadLists) ? body.leadLists.map(normalizeLeadList).filter(list => list.id) : []
    saveAll('leadLists', leadLists)
    return NextResponse.json({ ok: true, leadLists })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
