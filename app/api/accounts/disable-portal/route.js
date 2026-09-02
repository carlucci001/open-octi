import { NextResponse } from 'next/server'
import { requireCrmWrite } from '@/lib/permissions'
import { disablePortalForAccount } from '@/lib/portal-provisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const accountId = String(body.accountId || '').trim()
  if (!accountId) return NextResponse.json({ ok: false, error: 'accountId required' }, { status: 400 })

  const result = disablePortalForAccount(accountId, { disabledBy: user?.displayName || user?.username || 'admin' })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 404 })
  return NextResponse.json({ ok: true, ...result })
}
