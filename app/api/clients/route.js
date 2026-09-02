import { NextResponse } from 'next/server'
import {
  getClients, findClient, createClient, updateClient, deleteClient,
  addProject, updateProject, deleteProject,
} from '@/lib/clients'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return NextResponse.json({ clients: getClients() })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const rec = createClient(body.client || {})
    return NextResponse.json({ ok: true, client: rec, clients: getClients() })
  }

  if (body.action === 'update') {
    const rec = updateClient(body.client?.id, body.client)
    if (!rec) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, client: rec, clients: getClients() })
  }

  if (body.action === 'delete') {
    const ok = deleteClient(body.id)
    if (!ok) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, clients: getClients() })
  }

  if (body.action === 'add_project') {
    const proj = addProject(body.clientId, body.project || {})
    if (!proj) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, project: proj, clients: getClients() })
  }

  if (body.action === 'update_project') {
    const proj = updateProject(body.clientId, body.project)
    if (!proj) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, project: proj, clients: getClients() })
  }

  if (body.action === 'delete_project') {
    const ok = deleteProject(body.clientId, body.projectId)
    if (!ok) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    return NextResponse.json({ ok: true, clients: getClients() })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
