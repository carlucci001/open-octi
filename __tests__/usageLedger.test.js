import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => store.data[filename]),
  writeData: vi.fn((filename, value) => {
    store.data[filename] = JSON.parse(JSON.stringify(value))
  }),
  mutateData: vi.fn((filename, mutator) => {
    const current = store.data[filename]
      ? JSON.parse(JSON.stringify(store.data[filename]))
      : undefined
    const outcome = mutator(current)
    store.data[filename] = JSON.parse(JSON.stringify(outcome.data))
    return outcome.result
  }),
}))

import {
  commitUsage,
  configureUsageAccount,
  getUsageBalance,
  grantCredits,
  releaseUsage,
  reserveUsage,
} from '../lib/usage-ledger'

const cycle = {
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-08-01T00:00:00.000Z',
  now: '2026-07-15T12:00:00.000Z',
}

function configure(overrides = {}) {
  return configureUsageAccount({
    tenantId: 'tenant-acme',
    clientId: 'client-acme',
    poolKey: 'operating-credits',
    limitMilliCredits: 10_000,
    costLimitMicrodollars: 5_000_000,
    limitBehavior: 'block',
    idempotencyKey: 'configure:tenant-acme:2026-07',
    ...cycle,
    ...overrides,
  })
}

describe('usage ledger', () => {
  beforeEach(() => {
    store.data = {}
  })

  it('configures a cycle idempotently without rewriting prior events', () => {
    const first = configure()
    const repeated = configure()

    expect(first.balance).toMatchObject({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      limitMilliCredits: 10_000,
      availableMilliCredits: 10_000,
      costLimitMicrodollars: 5_000_000,
      actualCostMicrodollars: 0,
    })
    expect(repeated.idempotent).toBe(true)
    expect(store.data['usage-ledger.json'].events).toHaveLength(1)
  })

  it('grants top-up credits once for a stable idempotency key', () => {
    configure()

    grantCredits({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 2_500,
      idempotencyKey: 'topup:stripe-session-1',
      ...cycle,
    })
    const repeated = grantCredits({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 2_500,
      idempotencyKey: 'topup:stripe-session-1',
      ...cycle,
    })

    expect(repeated.idempotent).toBe(true)
    expect(repeated.balance).toMatchObject({
      grantedMilliCredits: 2_500,
      availableMilliCredits: 12_500,
    })
    expect(store.data['usage-ledger.json'].events).toHaveLength(2)
  })

  it('reserves credits and estimated cost once, then exposes the reduced balance', () => {
    configure()

    const reserved = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      service: 'social-operator',
      sku: 'social.text.variant',
      referenceType: 'campaign',
      referenceId: 'campaign-1',
      milliCredits: 3_000,
      estimatedCostMicrodollars: 80_000,
      idempotencyKey: 'campaign-1:text',
      ...cycle,
    })
    const repeated = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 3_000,
      estimatedCostMicrodollars: 80_000,
      idempotencyKey: 'campaign-1:text',
      ...cycle,
    })

    expect(reserved).toMatchObject({ ok: true, decision: 'reserved' })
    expect(repeated.idempotent).toBe(true)
    expect(repeated.reservationId).toBe(reserved.reservationId)
    expect(repeated.balance).toMatchObject({
      reservedMilliCredits: 3_000,
      availableMilliCredits: 7_000,
      reservedCostMicrodollars: 80_000,
    })
    expect(store.data['usage-ledger.json'].events).toHaveLength(2)
  })

  it('blocks an over-limit reservation idempotently when configured to block', () => {
    configure({ limitMilliCredits: 1_000 })

    const denied = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 1_001,
      idempotencyKey: 'campaign-over-limit',
      ...cycle,
    })
    const repeated = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 1_001,
      idempotencyKey: 'campaign-over-limit',
      ...cycle,
    })

    expect(denied).toMatchObject({ ok: false, decision: 'blocked', code: 'usage_limit_exceeded' })
    expect(repeated.idempotent).toBe(true)
    expect(repeated.balance.availableMilliCredits).toBe(1_000)
    expect(store.data['usage-ledger.json'].events).toHaveLength(2)
  })

  it('requests approval instead of reserving when that limit behavior is configured', () => {
    configure({ limitMilliCredits: 1_000, limitBehavior: 'request_approval' })

    const denied = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 1_001,
      idempotencyKey: 'campaign-needs-approval',
      ...cycle,
    })

    expect(denied).toMatchObject({
      ok: false,
      decision: 'approval_required',
      code: 'usage_approval_required',
    })
    expect(denied.balance).toMatchObject({ reservedMilliCredits: 0, availableMilliCredits: 1_000 })
  })

  it('commits observed integer usage and retail billing without double charging', () => {
    configure()
    const reserved = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      service: 'social-operator',
      sku: 'social.image.openai',
      referenceType: 'post',
      referenceId: 'post-1',
      milliCredits: 4_000,
      estimatedCostMicrodollars: 50_000,
      idempotencyKey: 'post-1:image:reserve',
      ...cycle,
    })

    const committed = commitUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      reservationId: reserved.reservationId,
      actualMilliCredits: 3_500,
      actualCostMicrodollars: 40_000,
      billableCents: 400,
      idempotencyKey: 'post-1:image:commit',
      ...cycle,
    })
    const repeated = commitUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      reservationId: reserved.reservationId,
      actualMilliCredits: 3_500,
      actualCostMicrodollars: 40_000,
      billableCents: 400,
      idempotencyKey: 'post-1:image:commit',
      ...cycle,
    })

    expect(committed).toMatchObject({ ok: true, decision: 'committed' })
    expect(repeated.idempotent).toBe(true)
    expect(repeated.balance).toMatchObject({
      committedMilliCredits: 3_500,
      reservedMilliCredits: 0,
      availableMilliCredits: 6_500,
      reservedCostMicrodollars: 0,
      actualCostMicrodollars: 40_000,
      billableCents: 400,
    })
    expect(store.data['usage-ledger.json'].events).toHaveLength(3)
  })

  it('rejects a commit that exceeds the reserved credits', () => {
    configure()
    const reserved = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 1_000,
      idempotencyKey: 'over-commit:reserve',
      ...cycle,
    })

    expect(() => commitUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      reservationId: reserved.reservationId,
      actualMilliCredits: 1_001,
      idempotencyKey: 'over-commit:commit',
      ...cycle,
    })).toThrow('actualMilliCredits cannot exceed reservedMilliCredits')

    expect(getUsageBalance({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      ...cycle,
    })).toMatchObject({ reservedMilliCredits: 1_000, committedMilliCredits: 0 })
  })

  it('releases an open reservation idempotently and refuses to commit it later', () => {
    configure()
    const reserved = reserveUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      milliCredits: 2_000,
      estimatedCostMicrodollars: 25_000,
      idempotencyKey: 'automation-run-1:reserve',
      ...cycle,
    })

    const released = releaseUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      reservationId: reserved.reservationId,
      idempotencyKey: 'automation-run-1:release',
      actualCostMicrodollars: 7_000,
      ...cycle,
    })
    const repeated = releaseUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      reservationId: reserved.reservationId,
      idempotencyKey: 'automation-run-1:release',
      ...cycle,
    })

    expect(released.balance).toMatchObject({
      reservedMilliCredits: 0,
      reservedCostMicrodollars: 0,
      actualCostMicrodollars: 7_000,
      availableMilliCredits: 10_000,
    })
    expect(repeated.idempotent).toBe(true)
    expect(() => commitUsage({
      tenantId: 'tenant-acme',
      clientId: 'client-acme',
      poolKey: 'operating-credits',
      reservationId: reserved.reservationId,
      actualMilliCredits: 2_000,
      idempotencyKey: 'automation-run-1:commit',
      ...cycle,
    })).toThrow(/released/i)
  })

  it('isolates balances by tenant and client even when client ids match', () => {
    configure({ tenantId: 'tenant-one', clientId: 'shared-client', idempotencyKey: 'configure-one' })
    configure({ tenantId: 'tenant-two', clientId: 'shared-client', idempotencyKey: 'configure-two', limitMilliCredits: 20_000 })

    reserveUsage({
      tenantId: 'tenant-one',
      clientId: 'shared-client',
      poolKey: 'operating-credits',
      milliCredits: 1_000,
      idempotencyKey: 'tenant-one:reserve',
      ...cycle,
    })

    expect(getUsageBalance({ tenantId: 'tenant-one', clientId: 'shared-client', poolKey: 'operating-credits', ...cycle })).toMatchObject({
      reservedMilliCredits: 1_000,
      availableMilliCredits: 9_000,
    })
    expect(getUsageBalance({ tenantId: 'tenant-two', clientId: 'shared-client', poolKey: 'operating-credits', ...cycle })).toMatchObject({
      reservedMilliCredits: 0,
      availableMilliCredits: 20_000,
    })
  })

  it('rejects fractional accounting units', () => {
    expect(() => configure({ limitMilliCredits: 1.5 })).toThrow(/integer/i)
  })
})
