import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, findById, saveAll } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { ensureCommandCenterPipeline } from '@/lib/salesPipelines'
import { isOpenOcti } from '@/lib/edition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    const pl = findById('pipelines', id)
    if (!pl) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ pipeline: pl })
  }
  if (!isOpenOcti()) ensureCommandCenterPipeline()
  return NextResponse.json({ pipelines: loadAll('pipelines') })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const p = body.pipeline || {}
    if (!p.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const id = p.id || slugify(p.name)
    // Avoid id collision
    const existing = findById('pipelines', id)
    if (existing) return NextResponse.json({ error: `pipeline "${id}" already exists` }, { status: 409 })
    const pipeline = {
      id,
      name: p.name,
      description: p.description || '',
      color: p.color || '#89b4fa',
      stages: Array.isArray(p.stages) && p.stages.length > 0 ? p.stages : [
        { id: 'new',       label: 'New',       color: '#6c7086', probability: 5 },
        { id: 'working',   label: 'Working',   color: '#89b4fa', probability: 40 },
        { id: 'won',       label: 'Won',       color: '#a6e3a1', probability: 100, terminal: 'won' },
        { id: 'lost',      label: 'Lost',      color: '#f38ba8', probability: 0,   terminal: 'lost' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const list = loadAll('pipelines')
    list.push(pipeline)
    saveAll('pipelines', list)
    return NextResponse.json({ ok: true, pipeline })
  }

  if (body.action === 'update') {
    const rec = update('pipelines', body.pipeline.id, body.pipeline)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, pipeline: rec })
  }

  if (body.action === 'delete') {
    // Refuse if any opportunity still uses this pipeline
    const opps = loadAll('opportunities').filter(o => o.pipelineId === body.id)
    if (opps.length > 0) {
      return NextResponse.json({ error: `${opps.length} opportunit${opps.length === 1 ? 'y' : 'ies'} still use this pipeline. Move or delete them first.` }, { status: 409 })
    }
    remove('pipelines', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
    const opps = loadAll('opportunities')
    const blocked = ids
      .map(id => ({ id, count: opps.filter(o => o.pipelineId === id).length }))
      .filter(item => item.count > 0)
    if (blocked.length > 0) {
      const summary = blocked.map(item => `${item.id}: ${item.count}`).join(', ')
      return NextResponse.json({ error: `Cannot delete selected pipelines while opportunities still use them (${summary}). Move or delete those opportunities first.` }, { status: 409 })
    }
    for (const id of ids) remove('pipelines', id)
    return NextResponse.json({ ok: true, deleted: ids.length })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
