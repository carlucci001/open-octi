import { NextResponse } from 'next/server'
import { findById, loadAll, saveAll, update } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  const { id } = await params
  const campaign = findById('pressCampaigns', String(id || ''))
  const ownerUserId = String(user?.id || user?.username || user?.email || '').trim()
  if (!campaign || (campaign.ownerUserId !== ownerUserId && campaign.source !== 'portal-press-release')) {
    return NextResponse.json({ ok: false, error: 'Press campaign not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, campaign })
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const { id } = await params
  const campaign = findById('pressCampaigns', String(id || ''))
  const ownerUserId = String(user?.id || user?.username || user?.email || '').trim()
  if (!campaign || (campaign.ownerUserId !== ownerUserId && campaign.source !== 'portal-press-release')) {
    return NextResponse.json({ ok: false, error: 'Press campaign not found' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  const patch = {}
  if (typeof body.operatorHold === 'boolean') patch.operatorHold = body.operatorHold
  if (typeof body.requireCarlApproval === 'boolean') patch.requireCarlApproval = body.requireCarlApproval
  if (typeof body.liveSendEnabled === 'boolean') patch.liveSendEnabled = body.liveSendEnabled
  if (typeof body.subject === 'string') patch.subject = body.subject.slice(0, 160)
  if (typeof body.body === 'string') patch.body = body.body.slice(0, 20000)
  if (typeof body.sendWindow === 'string' || body.sendWindow === null) patch.sendWindow = body.sendWindow
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: 'No supported changes supplied' }, { status: 400 })
  if (patch.operatorHold === true) patch.status = 'operator-held'
  else if (patch.operatorHold === false && campaign.status === 'operator-held') patch.status = 'draft'
  const accountSettingKeys = ['requireCarlApproval', 'liveSendEnabled'].filter(key => typeof patch[key] === 'boolean')
  if (campaign.clientAccountId && accountSettingKeys.length) {
    const now = new Date().toISOString()
    const campaigns = loadAll('pressCampaigns').map(item => item.clientAccountId === campaign.clientAccountId
      ? { ...item, ...Object.fromEntries(accountSettingKeys.map(key => [key, patch[key]])), updatedAt: now }
      : item)
    saveAll('pressCampaigns', campaigns)
  }
  return NextResponse.json({ ok: true, campaign: update('pressCampaigns', campaign.id, patch) })
}
