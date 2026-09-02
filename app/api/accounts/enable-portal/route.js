import crypto from 'crypto'
import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { issuePrepaidCredits } from '@/lib/credit-wallet'
import { enablePortalForAccount, activeLeaseForAccount, isComplimentaryLease } from '@/lib/portal-provisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CREDIT_GRANT_PARTIAL_MESSAGE = 'Portal access was enabled, but promotional credits were not issued. Review the credit ledger before retrying.'

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

function positiveWholeNumber(value, field, fallback) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${field} must be a positive whole number.`)
  return number
}

function conciergeVoicePolicy(value) {
  if (!value || value.enabled !== true) return value?.enabled === false ? { enabled: false } : undefined
  const warningThresholds = value.warningThresholds === undefined ? [50, 75, 90, 100] : value.warningThresholds
  if (!Array.isArray(warningThresholds)
    || warningThresholds.length < 1
    || warningThresholds.some(item => !Number.isSafeInteger(Number(item)) || Number(item) < 1 || Number(item) > 100)
    || warningThresholds.some((item, index) => index > 0 && Number(item) <= Number(warningThresholds[index - 1]))) {
    throw new Error('Voice warning thresholds must be unique ascending percentages from 1 to 100.')
  }
  return {
    enabled: true,
    dailySeconds: positiveWholeNumber(value.dailySeconds, 'Daily voice allowance', 900),
    maxSessionSeconds: positiveWholeNumber(value.maxSessionSeconds, 'Maximum voice session', 600),
    idleTimeoutSeconds: positiveWholeNumber(value.idleTimeoutSeconds, 'Voice idle timeout', 90),
    warningThresholds: warningThresholds.map(Number),
  }
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  if (!accountId) return json({ error: 'accountId required' }, 400)
  const lease = activeLeaseForAccount(accountId)
  return json({
    ok: true,
    portal: lease ? {
      status: lease.portalAccess === 'disabled' ? 'disabled' : 'active',
      plan: lease.plan || lease.tierId || '',
      leaseId: lease.id,
      complimentary: isComplimentaryLease(lease),
      complimentaryDuration: lease.complimentaryDuration || null,
      complimentaryExpiresAt: lease.complimentaryExpiresAt || null,
      conciergeVoice: lease.conciergeVoice || null,
    } : { status: 'none' },
  })
}

export async function POST(request) {
  const { error, user } = await requireAdmin(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const accountId = String(body?.accountId || '').trim()
  if (!accountId) return json({ error: 'accountId required' }, 400)

  const now = new Date()
  const complimentary = body?.complimentary === true
  const complimentaryDuration = String(body?.complimentaryDuration || 'never')
  const complimentaryReason = String(body?.complimentaryReason || '').trim().slice(0, 300)
  const grant = body?.promotionalCreditGrant
  const grantEnabled = grant?.enabled === true
  let complimentaryExpiresAt = null
  let grantExpiresAt = null
  let voice
  try {
    if (complimentary) complimentaryExpiresAt = futureExpiration(complimentaryDuration, body?.complimentaryExpiresAt, now)
    if (grantEnabled) grantExpiresAt = futureExpiration(grant?.expiration, grant?.expiresAt, now)
    voice = conciergeVoicePolicy(body?.conciergeVoice)
  } catch (validationError) {
    return json({ ok: false, error: validationError.message }, 400)
  }

  const grantCredits = Number(grant?.credits)
  const grantReason = String(grant?.reason || '').trim().slice(0, 300)
  if (complimentary && complimentaryReason.length < 3) {
    return json({ ok: false, error: 'Enter a complimentary reason for the audit trail.' }, 400)
  }
  if (grantEnabled && (!Number.isSafeInteger(grantCredits) || grantCredits < 1 || grantCredits > 1_000_000)) {
    return json({ ok: false, error: 'Promotional credits must be a whole number between 1 and 1,000,000.' }, 400)
  }
  if (grantEnabled && grantReason.length < 3) {
    return json({ ok: false, error: 'Enter a promotional credit reason for the audit trail.' }, 400)
  }

  const enabledBy = user?.displayName || user?.name || user?.username || user?.email || user?.id || 'Command Center administrator'
  let result
  try {
    result = enablePortalForAccount(accountId, {
      enabledBy,
      complimentary,
      complimentaryDuration,
      complimentaryExpiresAt,
      complimentaryReason,
      conciergeVoice: voice,
    })
  } catch {
    return json({ ok: false, error: 'Portal access could not be enabled.' }, 500)
  }
  if (!result.ok) {
    if (result.error === 'Account not found') return json({ ok: false, error: 'Account not found' }, 404)
    return json({ ok: false, error: 'Portal access could not be enabled.' }, 500)
  }

  let creditResult = null
  let creditGrantFailed = false
  if (grantEnabled) {
    const suppliedRequestId = String(grant?.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
    const requestId = suppliedRequestId || crypto.randomUUID()
    try {
      const issued = issuePrepaidCredits({
        tenantId: result.lease.tenantId,
        accountId: result.lease.clientAccountId,
        leaseId: result.lease.id,
        credits: grantCredits,
        reason: grantReason,
        issuedBy: enabledBy,
        expiresAt: grantExpiresAt,
        idempotencyKey: `portal-credit-grant:${result.lease.id}:${requestId}`,
        metadata: { source: 'portal-onboarding', promotional: !!grantExpiresAt },
      })
      if (!issued?.ok || !issued.event) throw new Error('Credit grant did not complete')
      creditResult = issued
    } catch {
      creditGrantFailed = true
    }
  }

  try {
    logAuditEvent({
      request,
      user,
      action: creditGrantFailed
        ? (result.created ? 'client_portal_enabled_credit_grant_failed' : 'client_portal_updated_credit_grant_failed')
        : (result.created ? 'client_portal_enabled' : 'client_portal_updated'),
      area: 'accounts',
      severity: creditGrantFailed ? 'warn' : 'info',
      targetId: accountId,
      targetName: result.lease.tenantName || accountId,
      meta: {
        leaseId: result.lease.id,
        complimentary,
        complimentaryDuration: complimentary ? complimentaryDuration : null,
        complimentaryExpiresAt,
        complimentaryReason,
        promotionalCredits: grantEnabled ? grantCredits : 0,
        promotionalCreditsExpiresAt: grantExpiresAt,
        walletEventId: creditResult?.event?.id || null,
        creditGrantFailed,
        conciergeVoiceEnabled: voice?.enabled === true,
      },
    })
  } catch {}

  return json({
    ok: true,
    portalEnabled: true,
    creditGrantFailed,
    creditGrantMessage: creditGrantFailed ? CREDIT_GRANT_PARTIAL_MESSAGE : null,
    created: result.created,
    leaseId: result.lease.id,
    plan: result.lease.plan || result.lease.tierId,
    complimentary: isComplimentaryLease(result.lease),
    complimentaryExpiresAt: result.lease.complimentaryExpiresAt || null,
    conciergeVoice: result.lease.conciergeVoice || null,
    grant: creditResult ? {
      eventId: creditResult.event.id,
      credits: grantCredits,
      reason: grantReason,
      createdAt: creditResult.event.occurredAt,
      expiresAt: creditResult.event.expiresAt || null,
    } : null,
  })
}
