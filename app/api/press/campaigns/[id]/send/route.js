import { NextResponse } from 'next/server'
import { findById } from '@/lib/entityStore'
import { requireCrmWrite } from '@/lib/permissions'
import { sendPressCampaign } from '@/lib/press/send-gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const { id } = await params
  const campaign = findById('pressCampaigns', String(id || ''))
  const ownerUserId = String(user?.id || user?.username || user?.email || '').trim()
  if (!campaign || (campaign.ownerUserId !== ownerUserId && campaign.source !== 'portal-press-release')) {
    return NextResponse.json({ ok: false, error: 'Press campaign not found' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  try {
    const result = await sendPressCampaign(campaign.id, body)
    return NextResponse.json({ ok: true, ...result })
  } catch (sendError) {
    return NextResponse.json({ ok: false, error: sendError.message }, { status: 400 })
  }
}
