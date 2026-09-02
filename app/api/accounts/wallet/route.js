import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requireCrmWrite, requireCrmRead } from '@/lib/permissions'
import { tenantIdForAccount } from '@/lib/entityStore'
import { getCreditWallet, issuePrepaidCredits } from '@/lib/credit-wallet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function walletIdentity(accountId) {
  const tenantId = tenantIdForAccount(accountId)
  if (!tenantId) return null
  return { tenantId, accountId }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const accountId = String(new URL(request.url).searchParams.get('accountId') || '').trim()
  if (!accountId) return NextResponse.json({ ok: false, error: 'accountId required' }, { status: 400 })

  const identity = walletIdentity(accountId)
  if (!identity) return NextResponse.json({ ok: true, hasWallet: false, reason: 'No active portal lease — the client needs portal access before they have a balance.' })

  const wallet = getCreditWallet(identity)
  return NextResponse.json({
    ok: true,
    hasWallet: true,
    availableCredits: wallet.availableCredits,
    balanceUsd: (wallet.availableCredits / 100).toFixed(2),
  })
}

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const accountId = String(body.accountId || '').trim()
  const amountUsd = Number(body.amountUsd)
  if (!accountId) return NextResponse.json({ ok: false, error: 'accountId required' }, { status: 400 })
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 10000) {
    return NextResponse.json({ ok: false, error: 'Enter an amount between $0.01 and $10,000' }, { status: 400 })
  }

  const identity = walletIdentity(accountId)
  if (!identity) return NextResponse.json({ ok: false, error: 'No active portal lease — the client needs portal access before funds can be added.' }, { status: 409 })

  try {
    const result = issuePrepaidCredits({
      ...identity,
      credits: Math.round(amountUsd * 100),
      idempotencyKey: crypto.randomUUID(),
      source: 'admin_grant',
      reason: String(body.note || 'Owner grant from CRM').slice(0, 200),
      issuedBy: user?.email || user?.id || 'crm-admin',
    })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error || 'Grant failed' }, { status: 502 })
    const wallet = getCreditWallet(identity)
    return NextResponse.json({
      ok: true,
      availableCredits: wallet.availableCredits,
      balanceUsd: (wallet.availableCredits / 100).toFixed(2),
    })
  } catch (grantError) {
    return NextResponse.json({ ok: false, error: grantError?.message || 'Grant failed' }, { status: 502 })
  }
}
