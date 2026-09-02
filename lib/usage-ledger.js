import { randomUUID } from 'node:crypto'
import { readData, writeData } from './dataStore'

export const USAGE_LEDGER_FILE = 'usage-ledger.json'
export const USAGE_LEDGER_VERSION = 1

const LIMIT_BEHAVIORS = new Set(['block', 'request_approval'])

function requiredText(value, field) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function optionalText(value) {
  return String(value || '').trim()
}

function integer(value, field, { nullable = false, positive = false } = {}) {
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

function defaultCycle(now) {
  const date = new Date(now)
  const startsAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const endsAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
}

function normalizeIdentity(input = {}) {
  const tenantId = requiredText(input.tenantId, 'tenantId')
  const clientId = requiredText(input.clientId || input.clientAccountId, 'clientId')
  const poolKey = optionalText(input.poolKey) || 'operating-credits'
  const accountId = [tenantId, clientId, poolKey].map(encodeURIComponent).join('::')
  return { accountId, tenantId, clientId, poolKey }
}

function loadLedger() {
  const stored = readData(USAGE_LEDGER_FILE)
  if (!stored) return { version: USAGE_LEDGER_VERSION, events: [] }
  if (Array.isArray(stored)) return { version: USAGE_LEDGER_VERSION, events: stored }
  return {
    version: Number(stored.version) || USAGE_LEDGER_VERSION,
    events: Array.isArray(stored.events) ? stored.events : [],
  }
}

function appendEvent(event) {
  const ledger = loadLedger()
  writeData(USAGE_LEDGER_FILE, {
    version: USAGE_LEDGER_VERSION,
    events: [...ledger.events, event],
  })
  return event
}

function eventId(prefix = 'usevt') {
  return `${prefix}_${randomUUID()}`
}

function matchingAccountEvents(events, accountId) {
  return events.filter(event => event.accountId === accountId)
}

function existingIdempotentEvent(events, accountId, idempotencyKey, allowedTypes) {
  const event = events.find(item => item.accountId === accountId && item.idempotencyKey === idempotencyKey)
  if (!event) return null
  if (!allowedTypes.includes(event.type)) {
    throw new Error(`idempotencyKey was already used for ${event.type}`)
  }
  return event
}

function configurationFor(events, { accountId, cycleId, now }) {
  const configurations = matchingAccountEvents(events, accountId).filter(event => event.type === 'configure')
  const matches = cycleId
    ? configurations.filter(event => event.cycleId === cycleId)
    : configurations.filter(event => event.startsAt <= now && now < event.endsAt)
  return matches.at(-1) || null
}

function requireContext(input = {}, { cycleId } = {}) {
  const identity = normalizeIdentity(input)
  const now = currentTime(input.now)
  const ledger = loadLedger()
  const configuration = configurationFor(ledger.events, {
    accountId: identity.accountId,
    cycleId: cycleId || input.cycleId,
    now,
  })
  if (!configuration) throw new Error('Usage account cycle is not configured')
  return { identity, now, ledger, configuration }
}

function eventBase({ identity, configuration, now, idempotencyKey, type }) {
  return {
    id: eventId(),
    type,
    accountId: identity.accountId,
    tenantId: identity.tenantId,
    clientId: identity.clientId,
    poolKey: identity.poolKey,
    cycleId: configuration.cycleId,
    startsAt: configuration.startsAt,
    endsAt: configuration.endsAt,
    idempotencyKey,
    occurredAt: now,
  }
}

function eventMetadata(input) {
  return input?.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? { ...input.metadata }
    : {}
}

function balanceFrom(events, configuration) {
  const cycleEvents = events.filter(event => (
    event.accountId === configuration.accountId && event.cycleId === configuration.cycleId
  ))
  const latestConfiguration = cycleEvents.filter(event => event.type === 'configure').at(-1) || configuration
  const grantedMilliCredits = cycleEvents.reduce((sum, event) => (
    event.type === 'grant' ? sum + Number(event.creditDeltaMilliCredits || 0) : sum
  ), 0)
  const committedMilliCredits = cycleEvents.reduce((sum, event) => (
    event.type === 'commit' ? sum + Math.max(0, -Number(event.creditDeltaMilliCredits || 0)) : sum
  ), 0)
  const reservedMilliCredits = Math.max(0, cycleEvents.reduce((sum, event) => (
    sum + Number(event.reservedDeltaMilliCredits || 0)
  ), 0))
  const reservedCostMicrodollars = Math.max(0, cycleEvents.reduce((sum, event) => (
    sum + Number(event.estimatedCostDeltaMicrodollars || 0)
  ), 0))
  const actualCostMicrodollars = cycleEvents.reduce((sum, event) => (
    sum + Number(event.actualCostDeltaMicrodollars || 0)
  ), 0)
  const billableCents = cycleEvents.reduce((sum, event) => (
    sum + Number(event.billableDeltaCents || 0)
  ), 0)
  const limitMilliCredits = Number(latestConfiguration.limitMilliCredits || 0)
  const costLimitMicrodollars = latestConfiguration.costLimitMicrodollars ?? null
  const availableMilliCredits = limitMilliCredits + grantedMilliCredits - committedMilliCredits - reservedMilliCredits
  const availableCostMicrodollars = costLimitMicrodollars === null
    ? null
    : Number(costLimitMicrodollars) - actualCostMicrodollars - reservedCostMicrodollars

  return {
    accountId: latestConfiguration.accountId,
    tenantId: latestConfiguration.tenantId,
    clientId: latestConfiguration.clientId,
    poolKey: latestConfiguration.poolKey,
    cycleId: latestConfiguration.cycleId,
    startsAt: latestConfiguration.startsAt,
    endsAt: latestConfiguration.endsAt,
    limitBehavior: latestConfiguration.limitBehavior,
    limitMilliCredits,
    grantedMilliCredits,
    committedMilliCredits,
    reservedMilliCredits,
    availableMilliCredits,
    costLimitMicrodollars,
    reservedCostMicrodollars,
    actualCostMicrodollars,
    availableCostMicrodollars,
    billableCents,
    overLimit: availableMilliCredits < 0 || (availableCostMicrodollars !== null && availableCostMicrodollars < 0),
    eventCount: cycleEvents.length,
  }
}

function resultForEvent(event, identity, { idempotent = false } = {}) {
  const balance = getUsageBalance({
    tenantId: identity.tenantId,
    clientId: identity.clientId,
    poolKey: identity.poolKey,
    cycleId: event.cycleId,
    now: event.occurredAt,
  })
  const decisions = {
    configure: 'configured',
    grant: 'granted',
    reserve: 'reserved',
    reserve_blocked: 'blocked',
    reserve_approval_required: 'approval_required',
    commit: 'committed',
    release: 'released',
  }
  const codes = {
    reserve_blocked: 'usage_limit_exceeded',
    reserve_approval_required: 'usage_approval_required',
  }
  return {
    ok: !['reserve_blocked', 'reserve_approval_required'].includes(event.type),
    decision: decisions[event.type],
    ...(codes[event.type] ? { code: codes[event.type] } : {}),
    ...(event.reservationId ? { reservationId: event.reservationId } : {}),
    event,
    balance,
    idempotent,
  }
}

export function configureUsageAccount(input = {}) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const now = currentTime(input.now)
  const ledger = loadLedger()
  const existing = existingIdempotentEvent(ledger.events, identity.accountId, idempotencyKey, ['configure'])
  if (existing) return resultForEvent(existing, identity, { idempotent: true })

  const defaults = defaultCycle(now)
  const startsAt = isoDate(input.startsAt || defaults.startsAt, 'startsAt')
  const endsAt = isoDate(input.endsAt || defaults.endsAt, 'endsAt')
  if (endsAt <= startsAt) throw new Error('endsAt must be after startsAt')
  const limitBehavior = optionalText(input.limitBehavior) || 'block'
  if (!LIMIT_BEHAVIORS.has(limitBehavior)) throw new Error('limitBehavior must be block or request_approval')
  const limitMilliCredits = integer(input.limitMilliCredits, 'limitMilliCredits')
  const costLimitMicrodollars = integer(input.costLimitMicrodollars, 'costLimitMicrodollars', { nullable: true })
  const cycleId = optionalText(input.cycleId) || `${identity.accountId}::${startsAt}`
  const configuration = {
    ...identity,
    cycleId,
    startsAt,
    endsAt,
  }
  const event = appendEvent({
    ...eventBase({ identity, configuration, now, idempotencyKey, type: 'configure' }),
    limitMilliCredits,
    costLimitMicrodollars,
    limitBehavior,
    metadata: eventMetadata(input),
  })
  return resultForEvent(event, identity)
}

export function getUsageBalance(input = {}) {
  const { ledger, configuration } = requireContext(input)
  return balanceFrom(ledger.events, configuration)
}

export function grantCredits(input = {}) {
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const milliCredits = integer(input.milliCredits, 'milliCredits', { positive: true })
  const { identity, now, ledger, configuration } = requireContext(input)
  const existing = existingIdempotentEvent(ledger.events, identity.accountId, idempotencyKey, ['grant'])
  if (existing) return resultForEvent(existing, identity, { idempotent: true })
  const event = appendEvent({
    ...eventBase({ identity, configuration, now, idempotencyKey, type: 'grant' }),
    creditDeltaMilliCredits: milliCredits,
    source: optionalText(input.source),
    referenceType: optionalText(input.referenceType),
    referenceId: optionalText(input.referenceId),
    metadata: eventMetadata(input),
  })
  return resultForEvent(event, identity)
}

export function reserveUsage(input = {}) {
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const milliCredits = integer(input.milliCredits, 'milliCredits', { positive: true })
  const estimatedCostMicrodollars = integer(
    input.estimatedCostMicrodollars ?? 0,
    'estimatedCostMicrodollars',
  )
  const { identity, now, ledger, configuration } = requireContext(input)
  const existing = existingIdempotentEvent(
    ledger.events,
    identity.accountId,
    idempotencyKey,
    ['reserve', 'reserve_blocked', 'reserve_approval_required'],
  )
  if (existing) return resultForEvent(existing, identity, { idempotent: true })

  const balance = balanceFrom(ledger.events, configuration)
  const creditExceeded = milliCredits > balance.availableMilliCredits
  const costExceeded = balance.availableCostMicrodollars !== null
    && estimatedCostMicrodollars > balance.availableCostMicrodollars
  if (creditExceeded || costExceeded) {
    const requiresApproval = balance.limitBehavior === 'request_approval'
    const event = appendEvent({
      ...eventBase({
        identity,
        configuration,
        now,
        idempotencyKey,
        type: requiresApproval ? 'reserve_approval_required' : 'reserve_blocked',
      }),
      requestedMilliCredits: milliCredits,
      requestedCostMicrodollars: estimatedCostMicrodollars,
      creditExceeded,
      costExceeded,
      service: optionalText(input.service),
      sku: optionalText(input.sku),
      referenceType: optionalText(input.referenceType),
      referenceId: optionalText(input.referenceId),
      metadata: eventMetadata(input),
    })
    return resultForEvent(event, identity)
  }

  const reservationId = optionalText(input.reservationId) || eventId('usrsv')
  const event = appendEvent({
    ...eventBase({ identity, configuration, now, idempotencyKey, type: 'reserve' }),
    reservationId,
    service: optionalText(input.service),
    sku: optionalText(input.sku),
    referenceType: optionalText(input.referenceType),
    referenceId: optionalText(input.referenceId),
    provider: optionalText(input.provider),
    model: optionalText(input.model),
    rateVersion: optionalText(input.rateVersion),
    reservedDeltaMilliCredits: milliCredits,
    estimatedCostDeltaMicrodollars: estimatedCostMicrodollars,
    metadata: eventMetadata(input),
  })
  return resultForEvent(event, identity)
}

function reservationContext(input, allowedIdempotencyTypes) {
  const identity = normalizeIdentity(input)
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey')
  const reservationId = requiredText(input.reservationId, 'reservationId')
  const now = currentTime(input.now)
  const ledger = loadLedger()
  const existing = existingIdempotentEvent(
    ledger.events,
    identity.accountId,
    idempotencyKey,
    allowedIdempotencyTypes,
  )
  if (existing) return { identity, idempotencyKey, reservationId, now, ledger, existing }
  const reservation = ledger.events.find(event => (
    event.accountId === identity.accountId
    && event.type === 'reserve'
    && event.reservationId === reservationId
  ))
  if (!reservation) throw new Error('Usage reservation not found')
  const configuration = configurationFor(ledger.events, {
    accountId: identity.accountId,
    cycleId: reservation.cycleId,
    now,
  })
  if (!configuration) throw new Error('Usage account cycle is not configured')
  const settlement = ledger.events.find(event => (
    event.accountId === identity.accountId
    && event.reservationId === reservationId
    && ['commit', 'release'].includes(event.type)
  ))
  return { identity, idempotencyKey, reservationId, now, ledger, reservation, configuration, settlement }
}

export function commitUsage(input = {}) {
  const context = reservationContext(input, ['commit'])
  if (context.existing) return resultForEvent(context.existing, context.identity, { idempotent: true })
  if (context.settlement?.type === 'release') throw new Error('Usage reservation was already released')
  if (context.settlement?.type === 'commit') {
    return resultForEvent(context.settlement, context.identity, { idempotent: true })
  }

  const reservedMilliCredits = Number(context.reservation.reservedDeltaMilliCredits || 0)
  const reservedCostMicrodollars = Number(context.reservation.estimatedCostDeltaMicrodollars || 0)
  const actualMilliCredits = integer(
    input.actualMilliCredits ?? reservedMilliCredits,
    'actualMilliCredits',
  )
  if (actualMilliCredits > reservedMilliCredits) {
    throw new Error('actualMilliCredits cannot exceed reservedMilliCredits')
  }
  const actualCostMicrodollars = integer(
    input.actualCostMicrodollars ?? reservedCostMicrodollars,
    'actualCostMicrodollars',
  )
  const billableCents = integer(input.billableCents ?? 0, 'billableCents')
  const event = appendEvent({
    ...eventBase({
      identity: context.identity,
      configuration: context.configuration,
      now: context.now,
      idempotencyKey: context.idempotencyKey,
      type: 'commit',
    }),
    reservationId: context.reservationId,
    service: context.reservation.service,
    sku: context.reservation.sku,
    referenceType: context.reservation.referenceType,
    referenceId: context.reservation.referenceId,
    provider: optionalText(input.provider) || context.reservation.provider,
    model: optionalText(input.model) || context.reservation.model,
    rateVersion: optionalText(input.rateVersion) || context.reservation.rateVersion,
    creditDeltaMilliCredits: -actualMilliCredits,
    reservedDeltaMilliCredits: -reservedMilliCredits,
    estimatedCostDeltaMicrodollars: -reservedCostMicrodollars,
    actualCostDeltaMicrodollars: actualCostMicrodollars,
    billableDeltaCents: billableCents,
    metadata: eventMetadata(input),
  })
  return resultForEvent(event, context.identity)
}

export function releaseUsage(input = {}) {
  const context = reservationContext(input, ['release'])
  if (context.existing) return resultForEvent(context.existing, context.identity, { idempotent: true })
  if (context.settlement?.type === 'commit') throw new Error('Usage reservation was already committed')
  if (context.settlement?.type === 'release') {
    return resultForEvent(context.settlement, context.identity, { idempotent: true })
  }

  const reservedMilliCredits = Number(context.reservation.reservedDeltaMilliCredits || 0)
  const reservedCostMicrodollars = Number(context.reservation.estimatedCostDeltaMicrodollars || 0)
  const actualCostMicrodollars = integer(input.actualCostMicrodollars ?? 0, 'actualCostMicrodollars')
  const event = appendEvent({
    ...eventBase({
      identity: context.identity,
      configuration: context.configuration,
      now: context.now,
      idempotencyKey: context.idempotencyKey,
      type: 'release',
    }),
    reservationId: context.reservationId,
    service: context.reservation.service,
    sku: context.reservation.sku,
    referenceType: context.reservation.referenceType,
    referenceId: context.reservation.referenceId,
    reservedDeltaMilliCredits: -reservedMilliCredits,
    estimatedCostDeltaMicrodollars: -reservedCostMicrodollars,
    actualCostDeltaMicrodollars: actualCostMicrodollars,
    reason: optionalText(input.reason),
    metadata: eventMetadata(input),
  })
  return resultForEvent(event, context.identity)
}
