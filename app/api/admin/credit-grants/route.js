import crypto from 'crypto'
import { NextResponse } from 'next/server'

import { requireOwner } from '@/lib/auth'
import { issuePrepaidCredits, getCreditWallet } from '@/lib/credit-wallet'
import { readData } from '@/lib/dataStore'
import { logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function futureExpiration(mode, customValue, now = new Date()) {
  const expiration = String(mode || 'never')
  if (!['never', '30_days', 'custom'].includes(expiration)) throw new Error('Select a valid expiration.')
  if (expiration === 'never') return null
  if (expiration === '30_days') return new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString()
  const custom = new Date(customValue)
  if (Number.isNaN(custom.getTime()) || custom.getTime() <= now.getTime()) {
    throw new Error('Custom expiration must be a future date.')
  }
  return custom.toISOString()
}

function activeClients() {
  const leases = (readData('leases.json') || {}).leases || []
  const accounts = (readData('accounts.json') || {}).accounts || []
  const accountById = new Map(accounts.map(account => [account.id, account]))
  return leases
    .filter(lease => lease.status === 'active' && lease.tenantId && lease.clientAccountId)
    .map(lease => {
      const account = accountById.get(lease.clientAccountId)
      const wallet = getCreditWallet({ tenantId: lease.tenantId, accountId: lease.clientAccountId })
      return {
        leaseId: lease.id,
        tenantId: lease.tenantId,
        accountId: lease.clientAccountId,
        accountName: account?.name || lease.tenantName || lease.clientAccountId,
        tierId: lease.tierId || '',
        tierName: lease.tierName || lease.tierId || 'Portal access',
        availableCredits: wallet.availableCredits,
        includedCredits: wallet.subscription.availableCredits,
        issuedCredits: wallet.prepaid.availableCredits + Number(wallet.promotional?.availableCredits || 0),
        promotionalCredits: Number(wallet.promotional?.availableCredits || 0),
        nextPromotionalExpiry: wallet.promotional?.nextExpiresAt || null,
      }
    })
    .sort((a, b) => a.accountName.localeCompare(b.accountName))
}

export async function GET(request) {
  const { error } = await requireOwner(request)
  if (error) return error
  return json({ ok: true, clients: activeClients() })
}

export async function POST(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const leaseId = String(body?.leaseId || '').trim()
  const credits = Number(body?.credits)
  const reason = String(body?.reason || '').trim().slice(0, 300)
  let expiresAt
  try {
    expiresAt = futureExpiration(body?.expiration, body?.expiresAt)
  } catch (validationError) {
    return json({ ok: false, error: validationError.message }, 400)
  }
  const suppliedRequestId = String(body?.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  const requestId = suppliedRequestId || crypto.randomUUID()

  if (!leaseId) return json({ ok: false, error: 'Select a client.' }, 400)
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000) {
    return json({ ok: false, error: 'Credits must be a whole number between 1 and 1,000,000.' }, 400)
  }
  if (reason.length < 3) return json({ ok: false, error: 'Enter a reason for the audit trail.' }, 400)

  const leases = (readData('leases.json') || {}).leases || []
  const lease = leases.find(item => item.id === leaseId && item.status === 'active')
  if (!lease?.tenantId || !lease?.clientAccountId) return json({ ok: false, error: 'Active client lease not found.' }, 404)

  const issuedBy = user?.name || user?.email || user?.id || 'Command Center owner'
  const result = issuePrepaidCredits({
    tenantId: lease.tenantId,
    accountId: lease.clientAccountId,
    leaseId: lease.id,
    credits,
    reason,
    issuedBy,
    expiresAt,
    idempotencyKey: `owner-credit-grant:${lease.id}:${requestId}`,
    metadata: { source: 'owner-credit-console', promotional: !!expiresAt },
  })

  try {
    logAuditEvent({
      request,
      user,
      action: 'client_credits_issued',
      area: 'billing',
      severity: 'info',
      targetId: lease.clientAccountId,
      targetName: lease.tenantName || lease.clientAccountId,
      meta: { leaseId: lease.id, credits, reason, expiresAt, walletEventId: result.event.id },
    })
  } catch {}

  return json({
    ok: true,
    idempotent: result.idempotent,
    grant: {
      eventId: result.event.id,
      credits,
      reason,
      issuedBy,
      createdAt: result.event.occurredAt,
      expiresAt,
    },
    wallet: result.wallet,
    clients: activeClients(),
  })
}
