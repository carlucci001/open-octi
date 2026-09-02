import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'inbound-channels.json'

function load() {
  return readData(FILE) || { channels: [], lastUpdated: null }
}
function save(data) {
  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
  return data
}
function genId(label) {
  const slug = String(label || 'channel').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return slug + '_' + Math.random().toString(36).slice(2, 6)
}

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  return NextResponse.json(load())
}

export async function POST(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const body = await request.json()
  const data = load()

  if (body.action === 'add') {
    const ch = body.channel || {}
    const id = ch.id || genId(ch.label)
    if (data.channels.some(c => c.id === id)) {
      return NextResponse.json({ error: 'Channel id already exists' }, { status: 409 })
    }
    const channel = {
      id,
      label: ch.label || 'Untitled Channel',
      icon: ch.icon || '📥',
      type: ch.type || 'webhook',
      enabled: ch.enabled !== false,
      createdAt: new Date().toISOString(),
      config: ch.config || (ch.type === 'webhook' ? { secret: crypto.randomBytes(24).toString('hex') } : {}),
      targetCampaign: ch.targetCampaign || id,
      autoCreateOpportunity: !!ch.autoCreateOpportunity,
      targetPipelineId: ch.targetPipelineId || null,
      targetStageId: ch.targetStageId || null,
    }
    data.channels.push(channel)
    save(data)
    return NextResponse.json({ ok: true, channel })
  }

  if (body.action === 'update') {
    const idx = data.channels.findIndex(c => c.id === body.channel?.id)
    if (idx < 0) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    data.channels[idx] = { ...data.channels[idx], ...body.channel, id: data.channels[idx].id }
    save(data)
    return NextResponse.json({ ok: true, channel: data.channels[idx] })
  }

  if (body.action === 'toggle') {
    const idx = data.channels.findIndex(c => c.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    data.channels[idx].enabled = !data.channels[idx].enabled
    save(data)
    return NextResponse.json({ ok: true, channel: data.channels[idx] })
  }

  if (body.action === 'delete') {
    data.channels = data.channels.filter(c => c.id !== body.id)
    save(data)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'rotate_secret') {
    const idx = data.channels.findIndex(c => c.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    if (data.channels[idx].type !== 'webhook') return NextResponse.json({ error: 'Only webhook channels have secrets' }, { status: 400 })
    data.channels[idx].config = { ...data.channels[idx].config, secret: crypto.randomBytes(24).toString('hex') }
    save(data)
    return NextResponse.json({ ok: true, channel: data.channels[idx] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
