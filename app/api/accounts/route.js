import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, removeMany, findById, accountWithRelations, logActivity } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    const withRel = searchParams.get('with') === 'relations'
    const rec = withRel ? accountWithRelations(id) : findById('accounts', id)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ account: rec })
  }
  const type = searchParams.get('type')
  let accounts = loadAll('accounts')
  if (type) accounts = accounts.filter(a => a.type === type)
  return NextResponse.json({ accounts })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const rec = create('accounts', {
      name: '', type: 'prospect', stage: 'active', priority: 'medium',
      website: '', industry: '', notes: '', tags: [], address: '',
      lastContactedAt: null, nextFollowUpAt: null,
      ...body.account,
    })
    return NextResponse.json({ ok: true, account: rec })
  }

  if (body.action === 'update') {
    const rec = update('accounts', body.account.id, body.account)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, account: rec })
  }

  if (body.action === 'promote_to_client') {
    const id = body.id || body.accountId
    const account = findById('accounts', id)
    if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const rec = update('accounts', id, {
      type: 'client',
      stage: body.stage || account.stage || 'active',
      promotedAt: new Date().toISOString(),
      promotedFromType: account.type || null,
    })
    logActivity({
      type: 'account_promoted',
      subject: `Prospect promoted to client account: ${rec.name}`,
      body: body.note || 'Promoted from prospect to client account.',
      linkedTo: { accountId: rec.id, opportunityId: body.opportunityId || null },
    })
    return NextResponse.json({ ok: true, account: rec })
  }

  if (body.action === 'delete') {
    remove('accounts', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    removeMany('accounts', body.ids || [])
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
