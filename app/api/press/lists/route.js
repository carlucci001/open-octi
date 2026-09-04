import { NextResponse } from 'next/server'
import { create, loadAll, remove, update } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { normalizePressQuery } from '@/lib/press/query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_LISTS_PER_USER = 100

function ownerKey(user) {
  return String(user?.id || user?.username || user?.email || '').trim()
}

function publicList(record) {
  return {
    id: record.id,
    name: record.name,
    query: record.query,
    contactIds: record.contactIds || [],
    builtAt: record.builtAt,
    updatedAt: record.updatedAt,
  }
}

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  const ownerUserId = ownerKey(user)
  const pressLists = loadAll('pressLists')
    .filter(record => record.ownerUserId === ownerUserId)
    .map(publicList)
  return NextResponse.json({ ok: true, pressLists })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const ownerUserId = ownerKey(user)
  if (!ownerUserId) return NextResponse.json({ ok: false, error: 'Could not identify the signed-in user' }, { status: 400 })
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'save')
  const mine = loadAll('pressLists').filter(record => record.ownerUserId === ownerUserId)

  if (action === 'remove' || action === 'delete') {
    const target = mine.find(record => record.id === body.id)
    if (!target) return NextResponse.json({ ok: false, error: 'Press list not found' }, { status: 404 })
    return NextResponse.json({ ok: true, removed: remove('pressLists', target.id) })
  }

  const name = String(body.name || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ ok: false, error: 'List name is required' }, { status: 400 })
  const contactIds = [...new Set((body.contactIds || []).map(String).filter(Boolean))].slice(0, 500)
  const patch = {
    name,
    query: normalizePressQuery(body.query),
    contactIds,
    builtAt: new Date().toISOString(),
  }
  if (body.id) {
    const target = mine.find(record => record.id === body.id)
    if (!target) return NextResponse.json({ ok: false, error: 'Press list not found' }, { status: 404 })
    return NextResponse.json({ ok: true, pressList: publicList(update('pressLists', target.id, patch)) })
  }
  if (mine.length >= MAX_LISTS_PER_USER) {
    return NextResponse.json({ ok: false, error: 'Saved press-list limit reached' }, { status: 400 })
  }
  const saved = create('pressLists', { ownerUserId, ...patch })
  return NextResponse.json({ ok: true, pressList: publicList(saved) })
}
