import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, removeMany, findById, logActivity } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Read-model fields attached by enrichWithNames(). They describe linked
// records and must never be written back onto the opportunity itself.
const DERIVED_CONTACT_FIELDS = ['contactName', 'contactTitle', 'contactPhone', 'contactEmail']

function enrichWithNames(opps) {
  const accounts = loadAll('accounts')
  const accountsById = new Map(accounts.map(a => [a.id, a]))
  // The person behind the deal. Qualifying a lead creates a Contact and
  // stores only its id on the opportunity; without the name, phone and
  // email in hand the deal cannot be worked from the pipeline.
  const contacts = loadAll('contacts')
  const contactsById = new Map(contacts.map(c => [c.id, c]))
  const primaryByAccount = new Map()
  for (const c of contacts) {
    if (!c.accountId) continue
    const cur = primaryByAccount.get(c.accountId)
    if (!cur || (c.primary && !cur.primary)) primaryByAccount.set(c.accountId, c)
  }
  return opps.map(o => {
    const contact = contactsById.get(o.contactId) || primaryByAccount.get(o.accountId) || null
    return {
      ...o,
      accountName: accountsById.get(o.accountId)?.name || '(no account)',
      accountType: accountsById.get(o.accountId)?.type || null,
      contactName: contact?.name || '',
      contactTitle: contact?.title || '',
      contactPhone: contact?.phone || '',
      contactEmail: contact?.email || '',
    }
  })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    const rec = findById('opportunities', id)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ opportunity: enrichWithNames([rec])[0] })
  }
  const pipelineId = searchParams.get('pipelineId')
  const accountId = searchParams.get('accountId')
  const stageId = searchParams.get('stageId')
  let opps = loadAll('opportunities')
  if (pipelineId) opps = opps.filter(o => o.pipelineId === pipelineId)
  if (accountId) opps = opps.filter(o => o.accountId === accountId)
  if (stageId) opps = opps.filter(o => o.stageId === stageId)
  return NextResponse.json({ opportunities: enrichWithNames(opps) })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const rec = create('opportunities', {
      name: '',
      accountId: null,
      contactId: null,
      pipelineId: null,
      stageId: null,
      value: 0,
      probability: 0,
      expectedClose: null,
      notes: '',
      tags: [],
      ...body.opportunity,
    })
    logActivity({ type: 'note', subject: 'Opportunity created', body: `${rec.name}`, linkedTo: { opportunityId: rec.id, accountId: rec.accountId } })
    return NextResponse.json({ ok: true, opportunity: rec })
  }

  if (body.action === 'update') {
    const before = findById('opportunities', body.opportunity.id)
    const patch = { ...body.opportunity }
    for (const k of DERIVED_CONTACT_FIELDS) delete patch[k]
    const stageChanged = before && patch.stageId && before.stageId !== patch.stageId
    if (stageChanged) patch.stageChangedAt = new Date().toISOString()
    const rec = update('opportunities', patch.id, patch)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    // Log stage change (with win/loss reason when the move closes the deal)
    if (stageChanged) {
      const closeLine = patch.closeOutcome
        ? `${patch.closeOutcome === 'won' ? 'Won' : 'Lost'}${patch.closeReason ? ': ' + patch.closeReason : ''}${patch.closeNote ? ' — ' + patch.closeNote : ''}`
        : ''
      logActivity({
        type: 'stage_change',
        subject: `Stage: ${before.stageId || '(none)'} → ${patch.stageId}`,
        body: closeLine,
        linkedTo: { opportunityId: rec.id, accountId: rec.accountId },
      })
    }
    return NextResponse.json({ ok: true, opportunity: rec })
  }

  if (body.action === 'delete') {
    remove('opportunities', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    removeMany('opportunities', body.ids || [])
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
