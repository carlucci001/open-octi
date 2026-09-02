import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, logActivity } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const contactId = searchParams.get('contactId')
  const leadId = searchParams.get('leadId')
  const opportunityId = searchParams.get('opportunityId')
  const projectId = searchParams.get('projectId')
  const type = searchParams.get('type')
  let list = loadAll('activities')
  if (accountId) list = list.filter(a => a.linkedTo?.accountId === accountId)
  if (contactId) list = list.filter(a => a.linkedTo?.contactId === contactId)
  if (leadId) list = list.filter(a => a.linkedTo?.leadId === leadId)
  if (opportunityId) list = list.filter(a => a.linkedTo?.opportunityId === opportunityId)
  if (projectId) list = list.filter(a => a.linkedTo?.projectId === projectId)
  if (type) list = list.filter(a => a.type === type)
  list.sort((a, b) => (b.at || b.createdAt || '').localeCompare(a.at || a.createdAt || ''))
  return NextResponse.json({ activities: list })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const a = body.activity || {}
    // Route through logActivity so tenant attribution (active-lease accounts →
    // client portal) applies to manually logged notes/calls too.
    const rec = logActivity({
      type: a.type || 'note',
      subject: a.subject || '',
      body: a.body || '',
      linkedTo: a.linkedTo || {},
      meta: a.meta || {},
      tenantId: a.tenantId,
      agentId: a.agentId,
    })

    // No size cap. The dashboard's Activity Pulse rolls up the last 7/14/30
    // days and needs every entry inside those windows; a count cap silently
    // empties the chart the moment volume crosses the threshold. 100 entries
    // is ~50KB — storage isn't a concern. If we ever need to prune, do it by
    // date window (e.g. older than 2 years), not by count.
    return NextResponse.json({ ok: true, activity: rec })
  }

  if (body.action === 'update') {
    const rec = update('activities', body.activity.id, body.activity)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, activity: rec })
  }

  if (body.action === 'delete') {
    remove('activities', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'clear_for_account') {
    if (!body.accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
    const list = loadAll('activities')
    const toRemove = list.filter(a => a.linkedTo?.accountId === body.accountId)
    for (const a of toRemove) remove('activities', a.id)
    return NextResponse.json({ ok: true, cleared: toRemove.length })
  }

  if (body.action === 'clear_for_contact') {
    if (!body.contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })
    const list = loadAll('activities')
    const toRemove = list.filter(a => a.linkedTo?.contactId === body.contactId)
    for (const a of toRemove) remove('activities', a.id)
    return NextResponse.json({ ok: true, cleared: toRemove.length })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
