import { NextResponse } from 'next/server'
import { create, loadAll } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ownerKey(user) {
  return String(user?.id || user?.username || user?.email || '').trim()
}

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  const ownerUserId = ownerKey(user)
  const pressCampaigns = loadAll('pressCampaigns').filter(item => item.ownerUserId === ownerUserId || item.source === 'portal-press-release')
  return NextResponse.json({ ok: true, pressCampaigns })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  if (!String(body.releaseDocId || '').trim()) {
    return NextResponse.json({ ok: false, error: 'Release document is required' }, { status: 400 })
  }
  if (!String(body.listId || '').trim()) {
    return NextResponse.json({ ok: false, error: 'Saved press list is required' }, { status: 400 })
  }
  const campaign = create('pressCampaigns', {
    ownerUserId: ownerKey(user),
    releaseDocId: String(body.releaseDocId),
    listId: String(body.listId),
    clientAccountId: String(body.clientAccountId || ''),
    personalization: body.personalization || {},
    subject: String(body.subject || ''),
    body: String(body.body || ''),
    sendWindow: body.sendWindow || null,
    dryRun: true,
    explicitApproval: false,
    requireCarlApproval: true,
    operatorHold: true,
    liveSendEnabled: false,
    status: 'draft',
    sends: [],
    outcome: { opens: 0, replies: 0, bounces: 0, pickups: [] },
  })
  return NextResponse.json({ ok: true, campaign })
}
