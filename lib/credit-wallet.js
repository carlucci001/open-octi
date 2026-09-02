import { randomUUID } from 'node:crypto'
import { mutateData, readData } from './dataStore'

export const CREDIT_WALLET_FILE = 'credit-wallet.json'
export const CREDIT_WALLET_VERSION = 1

function requiredText(value, field) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function optionalText(value) {
  return String(value || '').trim()
}

function credits(value, field, { positive = false, nullable = false } = {}) {
  if (nullable && (value === undefined || value === null || value === '')) return null
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized)) throw new Error(`${field} must be a safe integer`)
  if (positive ? normalized <= 0 : normalized < 0) {
    throw new Error(`${field} must be ${positive ? 'greater than zero' : 'zero or greater'}`)
  }
  return normalized
}

function isoDate(value, field) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date`)
  return date.toISOString()
}

function currentTime(value) {
  return isoDate(value || new Date(), 'now')
}

function metadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

function normalizeIdentity(input = {}) {
  const tenantId = requiredText(input.tenantId, 'tenantId')
  const accountId = requiredText(input.accountId, 'accountId')
  const walletId = [tenantId, accountId].map(encodeURIComponent).join('::')
  return { walletId, tenantId, accountId }
}

function normalizeLedger(stored) {
  if (!stored) return { version: CREDIT_WALLET_VERSION, events: [] }
  return {
    version: Number(stored.version) || CREDIT_WALLET_VERSION,
    events: Array.isArray(stored.events) ? stored.events : [],
  }
}

function eventId(prefix = 'cw_evt') {
  return `${prefix}_${randomUUID()}`
}

function walletEvents(ledger, walletId) {
  return ledger.events.filter(event => event.walletId === walletId)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  }
  return value
}

function fingerprint(value) {
  return JSON.stringify(stableValue(value))
}

function existingIdempotentEvent(events, walletId, idempotencyKey, requestFingerprint, allowedTypes) {
  const event = events.find(item => (
    item.walletId === walletId && item.idempotencyKey === idempotencyKey
  ))
  if (!event) return null
  if (!allowedTypes.includes(event.type)) {
    throw new Error(`idempotencyKey was already used for ${event.type}`)
  }
  if (event.requestFingerprint !== requestFingerprint) {
    throw new Error('idempotencyKey was already used with different input')
  }
  return event
}

function settlementFor(events, walletId, reservationId) {
  return events.find(event => (
    event.walletId === walletId
    && event.reservationId === reservationId
    && ['commit', 'release'].includes(event.type)
  )) || null
}

function reservationFrom(events, reserveEvent) {
  const settlement = settlementFor(events, reserveEvent.walletId, reserveEvent.reservationId)
  return {
    id: reserveEvent.reservationId,
    status: settlement?.type === 'commit'
      ? 'committed'
      : settlement?.type === 'release'
        ? 'released'
        : 'reserved',
    requestedCredits: reserveEvent.requestedCredits,
    service: reserveEvent.service,
    sku: reserveEvent.sku,
    referenceType: reserveEvent.referenceType,
    referenceId: reserveEvent.referenceId,
    reservedAt: reserveEvent.occurredAt,
    settledAt: settlement?.occurredAt || null,
    childReservations: (settlement?.childReservations || reserveEvent.childReservations || []).map(child => ({
      ...child,
    })),
  }
}

function activeSubscriptionPeriod(events, walletId, now) {
  return events
    .filter(event => (
      event.walletId === walletId
      && event.type === 'subscription_grant'
      && event.startsAt <= now
      && now < event.endsAt
    ))
    .sort((a, b) => (
      a.startsAt.localeCompare(b.startsAt) || a.occurredAt.localeCompare(b.occurredAt)
    ))
    .at(-1) || null
}

function usageByPool(events, walletId, { pool, periodId = null, grantEventId = null }) {
  let reservedCredits = 0
  let spentCredits = 0
  for (const reserveEvent of events) {
    if (reserveEvent.walletId !== walletId || reserveEvent.type !== 'reserve') continue
    const settlement = settlementFor(events, walletId, reserveEvent.reservationId)
    const children = settlement?.childReservations || reserveEvent.childReservations || []
    for (const child of children) {
      if (child.pool !== pool) continue
      if (pool === 'subscription' && child.periodId !== periodId) continue
      if (pool === 'promotional' && grantEventId && child.grantEventId !== grantEventId) continue
      if (!settlement) reservedCredits += Number(child.reservedCredits || 0)
      if (settlement?.type === 'commit') spentCredits += Number(child.committedCredits || 0)
    }
  }
  return { reservedCredits, spentCredits }
}

function recentActivity(events, walletId, limit = 12) {
  return events
    .filter(event => event.walletId === walletId && [
      'subscription_grant',
      'prepaid_purchase',
      'manual_grant',
      'commit',
      'release',
    ].includes(event.type))
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit)
    .map(event => {
      const reservation = event.reservationId
        ? events.find(item => item.walletId === walletId
          && item.type === 'reserve'
          && item.reservationId === event.reservationId)
        : null
      const releasedCredits = (event.childReservations || []).reduce((sum, child) => (
        sum + Number(child.releasedCredits || 0)
      ), 0)
      const descriptions = {
        subscription_grant: 'Monthly plan capacity added',
        prepaid_purchase: 'Purchased credits added',
        manual_grant: 'Service credits issued by Farrington',
        commit: reservation?.service === 'campaign-assistant'
          ? 'Seven-day campaign created'
          : 'Service completed',
        release: 'Reserved credits returned',
      }
      const activityCredits = event.type === 'commit'
        ? -Number(event.committedCredits || 0)
        : event.type === 'release'
          ? releasedCredits
          : Number(event.credits || 0)
      return {
        id: event.id,
        type: event.type === 'prepaid_purchase' ? 'purchase' : event.type === 'manual_grant' ? 'grant' : event.type,
        credits: activityCredits,
        service: reservation?.service || event.planId || event.packId || '',
        description: descriptions[event.type],
        createdAt: event.occurredAt,
        referenceId: reservation?.referenceId || event.stripePaymentIntentId || '',
        expiresAt: event.expiresAt || null,
      }
    })
}

function walletFrom(ledger, identity, now) {
  const events = walletEvents(ledger, identity.walletId)
  const activePeriod = activeSubscriptionPeriod(events, identity.walletId, now)
  const periodId = activePeriod?.periodId || null
  const subscriptionGrants = activePeriod
    ? events.filter(event => event.type === 'subscription_grant' && event.periodId === periodId)
    : []
  const subscriptionUsage = usageByPool(events, identity.walletId, {
    pool: 'subscription',
    periodId,
  })
  const subscriptionGrantedCredits = subscriptionGrants.reduce((sum, event) => (
    sum + Number(event.credits || 0)
  ), 0)
  const subscriptionAvailableCredits = Math.max(
    0,
    subscriptionGrantedCredits
      - subscriptionUsage.spentCredits
      - subscriptionUsage.reservedCredits,
  )

  const prepaidGrantedCredits = events.reduce((sum, event) => (
    (event.type === 'prepaid_purchase' || (event.type === 'manual_grant' && !event.expiresAt))
      ? sum + Number(event.credits || 0)
      : sum
  ), 0)
  const prepaidUsage = usageByPool(events, identity.walletId, { pool: 'prepaid' })
  const prepaidAvailableCredits = Math.max(
    0,
    prepaidGrantedCredits - prepaidUsage.spentCredits - prepaidUsage.reservedCredits,
  )

  const promotionalGrants = events
    .filter(event => event.type === 'manual_grant' && event.expiresAt)
    .map(event => {
      const usage = usageByPool(events, identity.walletId, {
        pool: 'promotional',
        grantEventId: event.id,
      })
      const active = now < event.expiresAt
      const unusedCredits = Math.max(
        0,
        Number(event.credits || 0) - usage.spentCredits - usage.reservedCredits,
      )
      return {
        eventId: event.id,
        expiresAt: event.expiresAt,
        grantedCredits: Number(event.credits || 0),
        reservedCredits: usage.reservedCredits,
        spentCredits: usage.spentCredits,
        availableCredits: active ? unusedCredits : 0,
        expiredCredits: active ? 0 : unusedCredits,
        active,
      }
    })
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  const promotionalGrantedCredits = promotionalGrants.reduce((sum, grant) => sum + grant.grantedCredits, 0)
  const promotionalReservedCredits = promotionalGrants.reduce((sum, grant) => sum + grant.reservedCredits, 0)
  const promotionalSpentCredits = promotionalGrants.reduce((sum, grant) => sum + grant.spentCredits, 0)
  const promotionalAvailableCredits = promotionalGrants.reduce((sum, grant) => sum + grant.availableCredits, 0)
  const promotionalExpiredCredits = promotionalGrants.reduce((sum, grant) => sum + grant.expiredCredits, 0)
  const nextPromotionalExpiry = promotionalGrants.find(grant => grant.active && grant.availableCredits > 0)?.expiresAt || null

  const availableCredits = subscriptionAvailableCredits + promotionalAvailableCredits + prepaidAvailableCredits
  const reservedCredits = subscriptionUsage.reservedCredits + promotionalReservedCredits + prepaidUsage.reservedCredits
  const spentCredits = subscriptionUsage.spentCredits + promotionalSpentCredits + prepaidUsage.spentCredits
  return {
    tenantId: identity.tenantId,
    accountId: identity.accountId,
    availableCredits,
    balanceCredits: availableCredits,
    reservedCredits,
    spentCredits,
    recent: recentActivity(events, identity.walletId),
    subscription: {
      periodId,
      startsAt: activePeriod?.startsAt || null,
      endsAt: activePeriod?.endsAt || null,
      grantedCredits: subscriptionGrantedCredits,
      reservedCredits: subscriptionUsage.reservedCredits,
      spentCredits: subscriptionUsage.spentCredits,
      availableCredits: subscriptionAvailableCredits,
    },
    prepaid: {
      grantedCredits: prepaidGrantedCredits,
      reservedCredits: prepaidUsage.reservedCredits,
      spentCredits: prepaidUsage.spentCredits,
      availableCredits: prepaidAvailableCredits,
      expiresAt: null,
    },
    promotional: {
      grantedCredits: promotionalGrantedCredits,
      reservedCredits: promotionalReservedCredits,
      spentCredits: promotionalSpentCredits,
      availableCredits: promotionalAvailableCredits,
      expiredCredits: promotionalExpiredCredits,
      nextExpiresAt: nextPromotionalExpiry,
      grants: promotionalGrants,
    },
  }
}

function eventBase({ identity, type, idempotencyKey, requestFingerprint, now }) {
  return {
    id: eventId(),
    type,
    walletId: identity.walletId,
    tenantId: identity.tenantId,
    accountId: identity.accountId,
    idempotencyKey,
    requestFingerprint,
    occurredAt: now,
  }
}

function mutateWallet(mutator) {
  return mutateData(CREDIT_WALLET_FILE, stored => {
    const ledger = normalizeLedger(stored)
    const result = mutator(ledger)
    return { data: ledger, result }
  })
}

export function getCreditWallet(input = {}) {
  const identity = normalizeIdentity(input)
  const now = currentTime(input.now)
  return walletFrom(normalizeLedger(readData(CREDIT_WALLET_FILE)), identity, now)
}

export function grantSubscriptionCredits(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const grantedCredits = credits(input.credits, 'credits', { positive: true })
  const periodId = requiredText(input.periodId, 'periodId')
  const startsAt = isoDate(input.startsAt, 'startsAt')
  const endsAt = isoDate(input.endsAt, 'endsAt')
  if (endsAt <= startsAt) throw new Error('endsAt must be after startsAt')
  const now = currentTime(input.now)
  const source = optionalText(input.source) || 'plan_allowance'
  const requestFingerprint = fingerprint({
    credits: grantedCredits,
    periodId,
    startsAt,
    endsAt,
    source,
    leaseId: optionalText(input.leaseId),
    planId: optionalText(input.planId),
  })

  return mutateWallet(ledger => {
    const existing = existingIdempotentEvent(
      ledger.events,
      identity.walletId,
      idempotencyKey,
      requestFingerprint,
      ['subscription_grant'],
    )
    if (existing) {
      return {
        ok: true,
        decision: 'subscription_granted',
        idempotent: true,
        event: existing,
        wallet: walletFrom(ledger, identity, now),
      }
    }
    const event = {
      ...eventBase({ identity, type: 'subscription_grant', idempotencyKey, requestFingerprint, now }),
      credits: grantedCredits,
      periodId,
      startsAt,
      endsAt,
      source,
      leaseId: optionalText(input.leaseId),
      planId: optionalText(input.planId),
      metadata: metadata(input.metadata),
    }
    ledger.events.push(event)
    return {
      ok: true,
      decision: 'subscription_granted',
      idempotent: false,
      event,
      wallet: walletFrom(ledger, identity, now),
    }
  })
}

export function purchasePrepaidCredits(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const purchasedCredits = credits(input.credits, 'credits', { positive: true })
  const amountCents = credits(input.amountCents, 'amountCents', { nullable: true })
  const now = currentTime(input.now)
  const requestFingerprint = fingerprint({
    credits: purchasedCredits,
    amountCents,
    currency: optionalText(input.currency).toLowerCase(),
    stripePaymentIntentId: optionalText(input.stripePaymentIntentId),
    stripeRequestId: optionalText(input.stripeRequestId),
    packId: optionalText(input.packId),
    leaseId: optionalText(input.leaseId),
  })

  return mutateWallet(ledger => {
    const existing = existingIdempotentEvent(
      ledger.events,
      identity.walletId,
      idempotencyKey,
      requestFingerprint,
      ['prepaid_purchase'],
    )
    if (existing) {
      return {
        ok: true,
        decision: 'purchased',
        idempotent: true,
        event: existing,
        wallet: walletFrom(ledger, identity, now),
      }
    }
    const event = {
      ...eventBase({ identity, type: 'prepaid_purchase', idempotencyKey, requestFingerprint, now }),
      credits: purchasedCredits,
      amountCents,
      currency: optionalText(input.currency).toLowerCase() || 'usd',
      stripePaymentIntentId: optionalText(input.stripePaymentIntentId),
      stripeRequestId: optionalText(input.stripeRequestId),
      packId: optionalText(input.packId),
      leaseId: optionalText(input.leaseId),
      expiresAt: null,
      metadata: metadata(input.metadata),
    }
    ledger.events.push(event)
    return {
      ok: true,
      decision: 'purchased',
      idempotent: false,
      event,
      wallet: walletFrom(ledger, identity, now),
    }
  })
}

export function issuePrepaidCredits(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const grantedCredits = credits(input.credits, 'credits', { positive: true })
  const reason = requiredText(input.reason, 'reason')
  const issuedBy = requiredText(input.issuedBy, 'issuedBy')
  const now = currentTime(input.now)
  const expiresAt = input.expiresAt === undefined || input.expiresAt === null || input.expiresAt === ''
    ? null
    : isoDate(input.expiresAt, 'expiresAt')
  if (expiresAt && expiresAt <= now) throw new Error('expiresAt must be after now')
  const fingerprintInput = {
    credits: grantedCredits,
    reason,
    issuedBy,
    leaseId: optionalText(input.leaseId),
  }
  if (expiresAt) fingerprintInput.expiresAt = expiresAt
  const requestFingerprint = fingerprint(fingerprintInput)

  return mutateWallet(ledger => {
    const existing = existingIdempotentEvent(
      ledger.events,
      identity.walletId,
      idempotencyKey,
      requestFingerprint,
      ['manual_grant'],
    )
    if (existing) {
      return {
        ok: true,
        decision: 'granted',
        idempotent: true,
        event: existing,
        wallet: walletFrom(ledger, identity, now),
      }
    }
    const event = {
      ...eventBase({ identity, type: 'manual_grant', idempotencyKey, requestFingerprint, now }),
      credits: grantedCredits,
      reason,
      issuedBy,
      leaseId: optionalText(input.leaseId),
      expiresAt,
      metadata: metadata(input.metadata),
    }
    ledger.events.push(event)
    return {
      ok: true,
      decision: 'granted',
      idempotent: false,
      event,
      wallet: walletFrom(ledger, identity, now),
    }
  })
}

function reservationResult(ledger, identity, event, now, { idempotent = false } = {}) {
  if (event.type === 'reserve_blocked') {
    return {
      ok: false,
      decision: 'blocked',
      code: 'insufficient_credits',
      idempotent,
      event,
      wallet: walletFrom(ledger, identity, now),
    }
  }
  const reserveEvent = event.type === 'reserve'
    ? event
    : ledger.events.find(item => (
      item.walletId === identity.walletId
      && item.type === 'reserve'
      && item.reservationId === event.reservationId
    ))
  return {
    ok: true,
    decision: event.type === 'reserve' ? 'reserved' : event.type === 'commit' ? 'committed' : 'released',
    idempotent,
    event,
    reservation: reservationFrom(ledger.events, reserveEvent),
    wallet: walletFrom(ledger, identity, now),
  }
}

export function reserveWalletCredits(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const requestedCredits = credits(input.credits, 'credits', { positive: true })
  const now = currentTime(input.now)
  const requestFingerprint = fingerprint({
    credits: requestedCredits,
    service: optionalText(input.service),
    sku: optionalText(input.sku),
    referenceType: optionalText(input.referenceType),
    referenceId: optionalText(input.referenceId),
  })

  return mutateWallet(ledger => {
    const existing = existingIdempotentEvent(
      ledger.events,
      identity.walletId,
      idempotencyKey,
      requestFingerprint,
      ['reserve', 'reserve_blocked'],
    )
    if (existing) return reservationResult(ledger, identity, existing, now, { idempotent: true })

    const wallet = walletFrom(ledger, identity, now)
    if (requestedCredits > wallet.availableCredits) {
      const event = {
        ...eventBase({ identity, type: 'reserve_blocked', idempotencyKey, requestFingerprint, now }),
        requestedCredits,
        availableCredits: wallet.availableCredits,
        service: optionalText(input.service),
        sku: optionalText(input.sku),
        referenceType: optionalText(input.referenceType),
        referenceId: optionalText(input.referenceId),
        metadata: metadata(input.metadata),
      }
      ledger.events.push(event)
      return reservationResult(ledger, identity, event, now)
    }

    const reservationId = optionalText(input.reservationId) || eventId('cw_res')
    const subscriptionCredits = Math.min(requestedCredits, wallet.subscription.availableCredits)
    let remainingCredits = requestedCredits - subscriptionCredits
    const childReservations = []
    if (subscriptionCredits > 0) {
      childReservations.push({
        id: eventId('cw_child'),
        pool: 'subscription',
        periodId: wallet.subscription.periodId,
        reservedCredits: subscriptionCredits,
        committedCredits: 0,
        releasedCredits: 0,
        status: 'reserved',
      })
    }
    for (const grant of wallet.promotional.grants) {
      if (remainingCredits <= 0) break
      const promotionalCredits = Math.min(remainingCredits, grant.availableCredits)
      if (promotionalCredits <= 0) continue
      childReservations.push({
        id: eventId('cw_child'),
        pool: 'promotional',
        periodId: null,
        grantEventId: grant.eventId,
        expiresAt: grant.expiresAt,
        reservedCredits: promotionalCredits,
        committedCredits: 0,
        releasedCredits: 0,
        status: 'reserved',
      })
      remainingCredits -= promotionalCredits
    }
    const prepaidCredits = remainingCredits
    if (prepaidCredits > 0) {
      childReservations.push({
        id: eventId('cw_child'),
        pool: 'prepaid',
        periodId: null,
        reservedCredits: prepaidCredits,
        committedCredits: 0,
        releasedCredits: 0,
        status: 'reserved',
      })
    }
    const event = {
      ...eventBase({ identity, type: 'reserve', idempotencyKey, requestFingerprint, now }),
      reservationId,
      requestedCredits,
      service: optionalText(input.service),
      sku: optionalText(input.sku),
      referenceType: optionalText(input.referenceType),
      referenceId: optionalText(input.referenceId),
      childReservations,
      metadata: metadata(input.metadata),
    }
    ledger.events.push(event)
    return reservationResult(ledger, identity, event, now)
  })
}

function findOpenReservation(ledger, identity, reservationId) {
  const reserveEvent = ledger.events.find(event => (
    event.walletId === identity.walletId
    && event.type === 'reserve'
    && event.reservationId === reservationId
  ))
  if (!reserveEvent) throw new Error('Wallet reservation not found')
  return { reserveEvent, settlement: settlementFor(ledger.events, identity.walletId, reservationId) }
}

export function commitWalletReservation(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const reservationId = requiredText(input.reservationId, 'reservationId')
  const now = currentTime(input.now)

  return mutateWallet(ledger => {
    const { reserveEvent, settlement } = findOpenReservation(ledger, identity, reservationId)
    const committedCredits = input.credits === undefined || input.credits === null
      ? Number(reserveEvent.requestedCredits || 0)
      : credits(input.credits, 'credits')
    if (committedCredits > Number(reserveEvent.requestedCredits || 0)) {
      throw new Error('Committed credits cannot exceed reserved credits')
    }
    const requestFingerprint = fingerprint({ reservationId, credits: committedCredits })
    const existing = existingIdempotentEvent(
      ledger.events,
      identity.walletId,
      idempotencyKey,
      requestFingerprint,
      ['commit'],
    )
    if (existing) return reservationResult(ledger, identity, existing, now, { idempotent: true })
    if (settlement?.type === 'release') throw new Error('Wallet reservation was already released')
    if (settlement?.type === 'commit') throw new Error('Wallet reservation was already committed')

    let remaining = committedCredits
    const childReservations = reserveEvent.childReservations.map(child => {
      const childCommittedCredits = Math.min(Number(child.reservedCredits || 0), remaining)
      remaining -= childCommittedCredits
      const releasedCredits = Number(child.reservedCredits || 0) - childCommittedCredits
      return {
        ...child,
        committedCredits: childCommittedCredits,
        releasedCredits,
        status: childCommittedCredits === 0
          ? 'released'
          : releasedCredits > 0
            ? 'partially_committed'
            : 'committed',
      }
    })
    const event = {
      ...eventBase({ identity, type: 'commit', idempotencyKey, requestFingerprint, now }),
      reservationId,
      committedCredits,
      childReservations,
      metadata: metadata(input.metadata),
    }
    ledger.events.push(event)
    return reservationResult(ledger, identity, event, now)
  })
}

export function releaseWalletReservation(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const reservationId = requiredText(input.reservationId, 'reservationId')
  const now = currentTime(input.now)
  const reason = optionalText(input.reason)
  const requestFingerprint = fingerprint({ reservationId, reason })

  return mutateWallet(ledger => {
    const { reserveEvent, settlement } = findOpenReservation(ledger, identity, reservationId)
    const existing = existingIdempotentEvent(
      ledger.events,
      identity.walletId,
      idempotencyKey,
      requestFingerprint,
      ['release'],
    )
    if (existing) return reservationResult(ledger, identity, existing, now, { idempotent: true })
    if (settlement?.type === 'commit') throw new Error('Wallet reservation was already committed')
    if (settlement?.type === 'release') throw new Error('Wallet reservation was already released')

    const childReservations = reserveEvent.childReservations.map(child => ({
      ...child,
      committedCredits: 0,
      releasedCredits: Number(child.reservedCredits || 0),
      status: 'released',
    }))
    const event = {
      ...eventBase({ identity, type: 'release', idempotencyKey, requestFingerprint, now }),
      reservationId,
      reason,
      childReservations,
      metadata: metadata(input.metadata),
    }
    ledger.events.push(event)
    return reservationResult(ledger, identity, event, now)
  })
}
