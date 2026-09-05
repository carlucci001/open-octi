import crypto from 'crypto'

import { CREDIT_TOP_UP_PACKS } from './usage-pricing'
import { customTopUp } from './credit-topup-amounts'
export { customTopUp, CREDITS_PER_USD, CUSTOM_TOP_UP_MIN_USD, CUSTOM_TOP_UP_MAX_USD } from './credit-topup-amounts'

export const CREDIT_TOP_UP_PURPOSE = 'credit_topup'
export const CREDIT_TOP_UP_CURRENCY = 'usd'

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

function stableKey(prefix, parts) {
  const hash = crypto
    .createHash('sha256')
    .update(parts.map(part => requiredText(part, 'idempotency identity')).join('\u001f'))
    .digest('hex')
    .slice(0, 48)
  return `${prefix}${hash}`
}

function asIsoDate(value) {
  if (value === null || value === undefined || value === '') return null
  let candidate = value
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate < 10_000_000_000) {
    candidate *= 1000
  }
  const date = new Date(candidate)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function publicPack(pack) {
  const credits = Number(pack?.credits)
  const priceUsd = Number(pack?.priceUsd)
  if (!pack?.id || !Number.isSafeInteger(credits) || credits <= 0 || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error('Invalid server credit pack')
  }
  const amountCents = Math.round(priceUsd * 100)
  return Object.freeze({
    id: String(pack.id),
    name: String(pack.name || pack.id),
    credits,
    priceUsd,
    amountCents,
    currency: CREDIT_TOP_UP_CURRENCY,
    popular: pack.popular === true,
  })
}

const PACKS = Object.freeze(CREDIT_TOP_UP_PACKS.map(publicPack))

export function listCreditTopUpPacks() {
  return PACKS.map(pack => ({ ...pack }))
}

export function getCreditTopUpPack(packId) {
  const id = String(packId || '').trim()
  return PACKS.find(pack => pack.id === id) || null
}

export function parseCreditTopUpRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid credit top-up request')
  const allowed = new Set(['packId', 'amountUsd', 'requestId', 'credits'])
  if (Object.keys(body).some(key => !allowed.has(key))) {
    throw new Error('Only packId or amountUsd and requestId are accepted')
  }
  const custom = Object.hasOwn(body, 'amountUsd')
  if (custom && Object.hasOwn(body, 'packId')) throw new Error('Choose a pack or a custom amount')
  // Ignore client-supplied credits: the catalog or amount determines the award.
  const pack = custom ? customTopUp(body.amountUsd) : getCreditTopUpPack(body.packId)
  if (!pack) throw new Error('Unknown credit pack')
  const requestId = String(body.requestId || '').trim()
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new Error('Invalid requestId')
  return { pack, requestId }
}

export function activePortalCreditLease(leases, identity) {
  if (!identity?.leaseId || !identity?.accountId || !identity?.tenantId) return null
  return (Array.isArray(leases) ? leases : []).find(lease => (
    lease?.id === identity.leaseId
    && lease.clientAccountId === identity.accountId
    && lease.tenantId === identity.tenantId
    && lease.status === 'active'
  )) || null
}

export function buildPortalCustomerIdempotencyKey({ tenantId, accountId, leaseId }) {
  return stableKey('fcc_portal_customer_', [tenantId, accountId, leaseId])
}

export function buildCreditTopUpIntent({
  tenantId,
  accountId,
  leaseId,
  customerId,
  requestId,
  pack,
}) {
  const resolvedPack = pack?.custom === true ? customTopUp(pack.priceUsd) : getCreditTopUpPack(pack?.id)
  if (!resolvedPack) throw new Error('Unknown credit pack')
  const parsed = parseCreditTopUpRequest({
    ...(resolvedPack.custom ? { amountUsd: resolvedPack.priceUsd } : { packId: resolvedPack.id }),
    requestId,
  })
  const identity = {
    tenantId: requiredText(tenantId, 'tenantId'),
    accountId: requiredText(accountId, 'accountId'),
    leaseId: requiredText(leaseId, 'leaseId'),
  }
  const stripeCustomerId = requiredText(customerId, 'customerId')
  return {
    idempotencyKey: stableKey('fcc_credit_topup_', [
      identity.tenantId,
      identity.accountId,
      identity.leaseId,
      parsed.requestId,
      String(resolvedPack.amountCents),
    ]),
    params: {
      amount: resolvedPack.amountCents,
      currency: resolvedPack.currency,
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `Portal credits top-up — ${resolvedPack.credits.toLocaleString('en-US')} credits`,
      metadata: {
        purpose: CREDIT_TOP_UP_PURPOSE,
        packId: resolvedPack.id,
        credits: String(resolvedPack.credits),
        tenantId: identity.tenantId,
        accountId: identity.accountId,
        leaseId: identity.leaseId,
        requestId: parsed.requestId,
        ...(resolvedPack.custom ? { custom: 'true' } : {}),
      },
    },
  }
}

export function validateCreditTopUpPaymentIntent(intent, lease) {
  if (!intent || intent.metadata?.purpose !== CREDIT_TOP_UP_PURPOSE) throw new Error('Not a credit top-up PaymentIntent')
  const pack = intent.metadata.custom === 'true'
    ? customTopUp(Number(intent.amount) / 100)
    : getCreditTopUpPack(intent.metadata.packId)
  if (!pack || pack.id !== intent.metadata.packId || String(intent.metadata.credits || '') !== String(pack.credits)) {
    throw new Error('Credit top-up pack mismatch')
  }
  const { requestId } = parseCreditTopUpRequest({
    ...(pack.custom ? { amountUsd: pack.priceUsd } : { packId: pack.id }),
    requestId: intent.metadata.requestId,
  })
  if (intent.status !== 'succeeded') throw new Error('Credit top-up is not paid')
  if (Number(intent.amount) !== pack.amountCents || Number(intent.amount_received) !== pack.amountCents) {
    throw new Error('Credit top-up amount mismatch')
  }
  if (String(intent.currency || '').toLowerCase() !== pack.currency) throw new Error('Credit top-up currency mismatch')
  if (!lease || lease.status !== 'active') throw new Error('Credit top-up lease is inactive')
  if (intent.metadata.tenantId !== lease.tenantId
    || intent.metadata.accountId !== lease.clientAccountId
    || intent.metadata.leaseId !== lease.id) {
    throw new Error('Credit top-up ownership mismatch')
  }
  const intentCustomerId = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id
  if (!lease.stripeCustomerId || intentCustomerId !== lease.stripeCustomerId) {
    throw new Error('Credit top-up customer mismatch')
  }
  return { pack, requestId }
}

export function subscriptionPeriodForLease(lease, now = new Date()) {
  const leaseId = requiredText(lease?.id || lease?.clientAccountId, 'leaseId')
  const datePairs = [
    ['currentPeriodStart', 'currentPeriodEnd'],
    ['billingPeriodStart', 'billingPeriodEnd'],
    ['stripeCurrentPeriodStart', 'stripeCurrentPeriodEnd'],
    ['current_period_start', 'current_period_end'],
  ]
  for (const [startField, endField] of datePairs) {
    const startsAt = asIsoDate(lease?.[startField])
    const endsAt = asIsoDate(lease?.[endField])
    if (startsAt && endsAt && new Date(endsAt) > new Date(startsAt)) {
      const periodId = `${leaseId}:${startsAt}`
      return {
        periodId,
        startsAt,
        endsAt,
        idempotencyKey: `subscription:${periodId}`,
      }
    }
  }

  const current = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(current.getTime())) throw new Error('Invalid billing period date')
  const year = current.getUTCFullYear()
  const month = current.getUTCMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const startsAt = new Date(Date.UTC(year, month, 1)).toISOString()
  const endsAt = new Date(Date.UTC(year, month + 1, 1)).toISOString()
  return {
    periodId: `${leaseId}:${monthKey}`,
    startsAt,
    endsAt,
    idempotencyKey: `subscription:${leaseId}:${monthKey}`,
  }
}
