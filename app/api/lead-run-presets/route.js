import { NextResponse } from 'next/server'
import { create, loadAll, remove, update } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PRESETS_PER_USER = 40
const NAME_MAX = 60
const VALUE_MAX = 400

// The exact Leads Lab form fields a saved setup restores. Anything outside this
// list is dropped, so a future form field cannot silently ride along.
const CONFIG_FIELDS = [
  'mode', 'category', 'count', 'location', 'destination', 'selectedLeadListId',
  'sourceTool', 'organizationPreset', 'organizationScope', 'mustHave', 'exclude',
  'notes', 'draftCategoryLabel', 'draftCategoryTerms',
]

// Saved setups are private to the operator. entityStore has no owner-filter
// convention, so it is done explicitly here -- and deliberately WITHOUT an admin
// bypass, because "just me" has to mean just me.
function ownerKey(user) {
  return String(user?.id || user?.username || user?.email || '').trim()
}

function isOwn(record, key) {
  return Boolean(key) && String(record?.ownerUserId || '') === key
}

function cleanConfig(input) {
  if (!input || typeof input !== 'object') return null
  const out = {}
  for (const field of CONFIG_FIELDS) {
    const value = input[field]
    if (value === undefined || value === null) continue
    out[field] = typeof value === 'number' ? value : String(value).slice(0, VALUE_MAX)
  }
  return Object.keys(out).length ? out : null
}

function publicPreset(record) {
  return {
    id: record.id,
    name: record.name,
    config: record.config,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function mineOnly(key) {
  return loadAll('leadRunPresets').filter(record => isOwn(record, key))
}

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error

  const key = ownerKey(user)
  const mine = mineOnly(key)
  const named = mine
    .filter(record => record.slot !== 'last')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  const last = mine.find(record => record.slot === 'last') || null

  return NextResponse.json({
    ok: true,
    leadRunPresets: named.map(publicPreset),
    lastUsed: last?.config || null,
  })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error

  const key = ownerKey(user)
  if (!key) {
    return NextResponse.json({ ok: false, error: 'Could not identify the signed-in user' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'save')
  const config = cleanConfig(body.config)

  // Called after every run so the form comes back as the operator left it.
  // Fired without awaiting on the client, so it must never be noisy.
  if (action === 'remember') {
    if (!config) return NextResponse.json({ ok: true, skipped: true })
    const existing = mineOnly(key).find(record => record.slot === 'last')
    const saved = existing
      ? update('leadRunPresets', existing.id, { config })
      : create('leadRunPresets', { ownerUserId: key, slot: 'last', name: '', config })
    return NextResponse.json({ ok: true, lastUsed: saved?.config || null })
  }

  if (action === 'save' || action === 'update') {
    const name = String(body.name || '').trim().slice(0, NAME_MAX)
    if (!name) return NextResponse.json({ ok: false, error: 'Name the setup first.' }, { status: 400 })
    if (!config) return NextResponse.json({ ok: false, error: 'Nothing to save.' }, { status: 400 })

    const named = mineOnly(key).filter(record => record.slot !== 'last')
    const target = body.id
      ? named.find(record => record.id === body.id)
      : named.find(record => String(record.name || '').toLowerCase() === name.toLowerCase())

    // A supplied id that matches nothing the caller owns must 404. Falling
    // through to create would silently duplicate a preset whose id went stale
    // (deleted in another tab), and would let an id belonging to another
    // operator quietly mint a copy.
    if (body.id && !target) {
      return NextResponse.json({ ok: false, error: 'Saved setup not found' }, { status: 404 })
    }

    if (target) {
      const saved = update('leadRunPresets', target.id, { name, config })
      if (!saved) return NextResponse.json({ ok: false, error: 'Saved setup not found' }, { status: 404 })
      return NextResponse.json({ ok: true, leadRunPreset: publicPreset(saved), updated: true })
    }

    if (named.length >= MAX_PRESETS_PER_USER) {
      return NextResponse.json({
        ok: false,
        error: `You already have ${MAX_PRESETS_PER_USER} saved setups. Delete one first.`,
      }, { status: 400 })
    }

    const saved = create('leadRunPresets', { ownerUserId: key, slot: 'named', name, config })
    return NextResponse.json({ ok: true, leadRunPreset: publicPreset(saved) })
  }

  if (action === 'remove' || action === 'delete') {
    const id = String(body.id || '')
    const target = loadAll('leadRunPresets').find(record => record.id === id)
    // Ownership is checked before removal so one operator cannot delete another's.
    if (!target || !isOwn(target, key)) {
      return NextResponse.json({ ok: false, error: 'Saved setup not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, removed: remove('leadRunPresets', id) })
  }

  return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
}
