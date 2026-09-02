import { NextResponse } from 'next/server'
import { create, loadAll, remove, update } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { FARRINGTON_LEAD_VERTICALS } from '@/lib/farrington-lead-verticals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUILT_IN_IDS = new Set(FARRINGTON_LEAD_VERTICALS.map(v => v.id))

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalize(input = {}, user = null) {
  const label = String(input.label || '').trim()
  const id = String(input.id || slugify(label) || '').trim()
  return {
    id,
    label,
    query: String(input.query || '').trim(),
    offer: String(input.offer || '').trim(),
    leadWith: String(input.leadWith || '').trim(),
    caveat: String(input.caveat || '').trim(),
    custom: true,
    createdByUserId: input.createdByUserId || user?.id || '',
  }
}

function sorted(list) {
  return [...list].sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')))
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return NextResponse.json({ ok: true, leadCategories: sorted(loadAll('leadCategories')) })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const action = body.action || 'add'
  const incoming = normalize(body.leadCategory || {}, user)

  if (action === 'add') {
    if (!incoming.label) return NextResponse.json({ ok: false, error: 'label required' }, { status: 400 })
    if (!incoming.id) return NextResponse.json({ ok: false, error: 'label must contain letters or numbers' }, { status: 400 })
    if (BUILT_IN_IDS.has(incoming.id)) {
      return NextResponse.json({ ok: false, error: `"${incoming.label}" is already a built-in category` }, { status: 409 })
    }
    const existing = loadAll('leadCategories').find(c => c.id === incoming.id)
    if (existing) return NextResponse.json({ ok: true, leadCategory: existing, existed: true })
    const rec = create('leadCategories', incoming)
    return NextResponse.json({ ok: true, leadCategory: rec })
  }

  if (action === 'update') {
    if (!incoming.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if (!incoming.label) return NextResponse.json({ ok: false, error: 'label required' }, { status: 400 })
    const rec = update('leadCategories', incoming.id, incoming)
    if (!rec) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, leadCategory: rec })
  }

  if (action === 'remove' || action === 'delete') {
    const id = String(body.id || incoming.id || '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const removed = remove('leadCategories', id)
    return NextResponse.json({ ok: removed, removed })
  }

  return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 })
}
