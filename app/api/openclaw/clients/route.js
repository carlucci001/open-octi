import { validateApiKey } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'
import {
  getClients, createClient, updateClient, deleteClient,
  addProject, updateProject, deleteProject,
} from '@/lib/clients'

export async function GET(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  let clients = getClients()

  const id = url.searchParams.get('id')
  if (id) clients = clients.filter(c => c.id === id)

  const q = url.searchParams.get('q')
  if (q) {
    const lq = q.toLowerCase()
    clients = clients.filter(c =>
      (c.name || '').toLowerCase().includes(lq) ||
      (c.email || '').toLowerCase().includes(lq) ||
      (c.notes || '').toLowerCase().includes(lq)
    )
  }

  const limit = url.searchParams.get('limit')
  if (limit) clients = clients.slice(0, Number(limit))

  return NextResponse.json({ clients, total: clients.length })
}

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()

  if (body.action === 'add') {
    const client = createClient(body.client || {})
    return NextResponse.json({ ok: true, client })
  }

  if (body.action === 'update') {
    const client = updateClient(body.client?.id, body.client)
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, client })
  }

  if (body.action === 'delete') {
    const ok = deleteClient(body.id)
    if (!ok) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'add_project') {
    const project = addProject(body.clientId, body.project || {})
    if (!project) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, project })
  }

  if (body.action === 'update_project') {
    const project = updateProject(body.clientId, body.project)
    if (!project) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, project })
  }

  if (body.action === 'delete_project') {
    const ok = deleteProject(body.clientId, body.projectId)
    if (!ok) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
