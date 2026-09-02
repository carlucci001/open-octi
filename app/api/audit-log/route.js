import { NextResponse } from 'next/server'
import { getCurrentUser, requireOwner } from '@/lib/auth'
import { listAuditEvents, logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireOwner(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  return NextResponse.json({ ok: true, events: listAuditEvents({ limit: searchParams.get('limit') || 250 }) })
}

export async function POST(request) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const action = String(body?.action || '').slice(0, 80)
  if (!action) return NextResponse.json({ ok: false, error: 'action required' }, { status: 400 })
  logAuditEvent({
    request,
    user,
    action,
    area: String(body?.area || 'crm').slice(0, 60),
    severity: String(body?.severity || 'info').slice(0, 24),
    targetId: body?.targetId || '',
    targetName: body?.targetName || '',
    meta: body?.meta || {},
  })
  return NextResponse.json({ ok: true })
}
