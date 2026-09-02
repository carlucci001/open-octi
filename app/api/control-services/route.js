import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'control-services.json'

const DEFAULT_SERVICES = [
  {
    id: 'lead_capture_agent',
    name: 'Lead Capture Agent',
    status: 'active',
    category: 'sales',
    audience: 'service businesses',
    monthlyPrice: 750,
    setupFee: 1500,
    creditBudget: 120,
    cadence: 'daily',
    owner: 'Carl',
    delivery: ['dashboard', 'email'],
    approvalGate: 'Approve outbound messages before send.',
    inputs: 'Website form, missed-call notes, inbox requests.',
    outputs: 'Qualified lead record, next task, draft reply, pipeline opportunity.',
    runbook: 'Capture request, qualify fit, create/update CRM record, assign follow-up, report gaps.',
    safeguards: 'No external send without approval. Never overwrite a live record without matching email or phone.',
    tags: ['lead intake', 'crm', 'follow-up'],
  },
  {
    id: 'appointment_reactivation',
    name: 'Appointment Reactivation',
    status: 'draft',
    category: 'retention',
    audience: 'local operators',
    monthlyPrice: 500,
    setupFee: 950,
    creditBudget: 80,
    cadence: 'weekly',
    owner: 'Carl',
    delivery: ['dashboard', 'csv'],
    approvalGate: 'Approve campaign audience and message before launch.',
    inputs: 'Dormant client list, last appointment date, service type.',
    outputs: 'Segmented outreach list, approved message set, booked-call summary.',
    runbook: 'Segment stale customers, propose offer, queue outreach, track booked responses.',
    safeguards: 'Respect do-not-contact status and suppress bounced or unsubscribed contacts.',
    tags: ['retention', 'campaign', 'appointments'],
  },
]

function now() {
  return new Date().toISOString()
}

function slug(value) {
  return String(value || 'service')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizeService(input = {}, existing = {}) {
  const name = String(input.name || existing.name || 'Untitled Control Service').trim()
  const base = existing.createdAt ? existing : { createdAt: now() }
  return {
    ...base,
    id: existing.id || input.id || `${slug(name)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    status: input.status || existing.status || 'draft',
    category: input.category || existing.category || 'operations',
    audience: input.audience || existing.audience || '',
    monthlyPrice: Number(input.monthlyPrice ?? existing.monthlyPrice ?? 0) || 0,
    setupFee: Number(input.setupFee ?? existing.setupFee ?? 0) || 0,
    creditBudget: Number(input.creditBudget ?? existing.creditBudget ?? 0) || 0,
    cadence: input.cadence || existing.cadence || 'manual',
    owner: input.owner || existing.owner || 'Carl',
    delivery: normalizeList(input.delivery ?? existing.delivery),
    approvalGate: input.approvalGate ?? existing.approvalGate ?? '',
    inputs: input.inputs ?? existing.inputs ?? '',
    outputs: input.outputs ?? existing.outputs ?? '',
    runbook: input.runbook ?? existing.runbook ?? '',
    safeguards: input.safeguards ?? existing.safeguards ?? '',
    tags: normalizeList(input.tags ?? existing.tags),
    updatedAt: now(),
  }
}

function load() {
  const data = readData(FILE)
  if (data?.services) return data
  return { lastUpdated: now(), services: DEFAULT_SERVICES.map(service => normalizeService(service, service)) }
}

function save(data) {
  const next = { ...data, lastUpdated: now() }
  writeData(FILE, next)
  return next
}

async function guard(request) {
  return requireCapability(request, 'system:manage')
}

export async function GET(request) {
  const { error } = await guard(request)
  if (error) return error
  return NextResponse.json({ ok: true, ...load() })
}

export async function POST(request) {
  const { error } = await guard(request)
  if (error) return error
  const body = await request.json()
  const data = load()

  if (body.action === 'clone') {
    const source = data.services.find(service => service.id === body.id)
    if (!source) return NextResponse.json({ ok: false, error: 'service not found' }, { status: 404 })
    const clone = normalizeService({
      ...source,
      id: `${slug(source.name)}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${source.name} Copy`,
      status: 'draft',
    })
    data.services.unshift(clone)
    save(data)
    return NextResponse.json({ ok: true, service: clone })
  }

  if (body.action === 'toggle') {
    const index = data.services.findIndex(service => service.id === body.id)
    if (index < 0) return NextResponse.json({ ok: false, error: 'service not found' }, { status: 404 })
    const current = data.services[index]
    data.services[index] = normalizeService({ ...current, status: current.status === 'active' ? 'paused' : 'active' }, current)
    save(data)
    return NextResponse.json({ ok: true, service: data.services[index] })
  }

  const service = normalizeService(body.service || body)
  if (data.services.some(item => item.id === service.id)) {
    return NextResponse.json({ ok: false, error: 'service id already exists' }, { status: 409 })
  }
  data.services.unshift(service)
  save(data)
  return NextResponse.json({ ok: true, service }, { status: 201 })
}

export async function PUT(request) {
  const { error } = await guard(request)
  if (error) return error
  const body = await request.json()
  const patch = body.service || body
  const data = load()
  const index = data.services.findIndex(service => service.id === patch.id)
  if (index < 0) return NextResponse.json({ ok: false, error: 'service not found' }, { status: 404 })
  data.services[index] = normalizeService(patch, data.services[index])
  save(data)
  return NextResponse.json({ ok: true, service: data.services[index] })
}

export async function DELETE(request) {
  const { error } = await guard(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const body = request.headers.get('content-type')?.includes('application/json')
    ? await request.json().catch(() => ({}))
    : {}
  const id = body.id || searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'missing service id' }, { status: 400 })
  const data = load()
  const before = data.services.length
  data.services = data.services.filter(service => service.id !== id)
  if (data.services.length === before) {
    return NextResponse.json({ ok: false, error: 'service not found' }, { status: 404 })
  }
  save(data)
  return NextResponse.json({ ok: true })
}
