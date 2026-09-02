import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const store = vi.hoisted(() => ({ data: {} }))

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => clone(store.data[filename])),
  writeData: vi.fn((filename, value) => {
    store.data[filename] = clone(value)
  }),
  mutateData: vi.fn((filename, mutator) => {
    const outcome = mutator(clone(store.data[filename]))
    store.data[filename] = clone(outcome.data)
    return clone(outcome.result)
  }),
}))

import {
  commitWalletReservation,
  getCreditWallet,
  grantSubscriptionCredits,
  issuePrepaidCredits,
  purchasePrepaidCredits,
  releaseWalletReservation,
  reserveWalletCredits,
} from '../lib/credit-wallet'

const identity = {
  tenantId: 'tenant-acme',
  accountId: 'account-acme',
}

const july = {
  periodId: 'sub-period-2026-07',
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-08-01T00:00:00.000Z',
  now: '2026-07-15T12:00:00.000Z',
}

function grantSubscription(overrides = {}) {
  return grantSubscriptionCredits({
    ...identity,
    ...july,
    credits: 100,
    idempotencyKey: 'subscription:2026-07',
    ...overrides,
  })
}

function purchasePrepaid(overrides = {}) {
  return purchasePrepaidCredits({
    ...identity,
    credits: 250,
    stripePaymentIntentId: 'pi_wallet_1',
    amountCents: 250,
    currency: 'usd',
    idempotencyKey: 'purchase:pi_wallet_1',
    now: july.now,
    ...overrides,
  })
}

describe('credit wallet', () => {
  beforeEach(() => {
    store.data = {}
  })

  it('adds evergreen prepaid credits exactly once and exposes one combined balance', () => {
    grantSubscription()
    const purchased = purchasePrepaid()
    const repeated = purchasePrepaid()

    expect(purchased).toMatchObject({ ok: true, decision: 'purchased', idempotent: false })
    expect(repeated).toMatchObject({ ok: true, decision: 'purchased', idempotent: true })
    expect(repeated.event.id).toBe(purchased.event.id)
    expect(repeated.wallet).toMatchObject({
      ...identity,
      availableCredits: 350,
      reservedCredits: 0,
      spentCredits: 0,
      subscription: {
        periodId: july.periodId,
        grantedCredits: 100,
        availableCredits: 100,
      },
      prepaid: {
        grantedCredits: 250,
        availableCredits: 250,
        expiresAt: null,
      },
    })
  })

  it('lets the owner issue non-expiring client credits with an auditable reason', () => {
    const granted = issuePrepaidCredits({
      ...identity,
      credits: 500,
      reason: 'Demo launch courtesy capacity',
      issuedBy: 'Carl Farrington',
      leaseId: 'lease-acme',
      idempotencyKey: 'owner-grant:demo-launch',
      now: july.now,
    })
    const repeated = issuePrepaidCredits({
      ...identity,
      credits: 500,
      reason: 'Demo launch courtesy capacity',
      issuedBy: 'Carl Farrington',
      leaseId: 'lease-acme',
      idempotencyKey: 'owner-grant:demo-launch',
      now: july.now,
    })

    expect(granted).toMatchObject({ ok: true, decision: 'granted', idempotent: false })
    expect(repeated).toMatchObject({ ok: true, decision: 'granted', idempotent: true })
    expect(granted.wallet.prepaid).toMatchObject({ grantedCredits: 500, availableCredits: 500, expiresAt: null })
    expect(granted.wallet.recent[0]).toMatchObject({ type: 'grant', credits: 500 })
  })

  it('keeps legacy non-expiring grant idempotency fingerprints compatible', () => {
    store.data['credit-wallet.json'] = {
      version: 1,
      events: [{
        id: 'cw_evt_legacy',
        type: 'manual_grant',
        walletId: 'tenant-acme::account-acme',
        tenantId: 'tenant-acme',
        accountId: 'account-acme',
        idempotencyKey: 'owner-grant:legacy',
        requestFingerprint: '{"credits":500,"issuedBy":"Carl Farrington","leaseId":"lease-acme","reason":"Legacy grant"}',
        occurredAt: july.now,
        credits: 500,
        reason: 'Legacy grant',
        issuedBy: 'Carl Farrington',
        leaseId: 'lease-acme',
        expiresAt: null,
      }],
    }

    const replayed = issuePrepaidCredits({
      ...identity,
      credits: 500,
      reason: 'Legacy grant',
      issuedBy: 'Carl Farrington',
      leaseId: 'lease-acme',
      idempotencyKey: 'owner-grant:legacy',
      now: july.now,
    })

    expect(replayed).toMatchObject({ ok: true, idempotent: true, event: { id: 'cw_evt_legacy' } })
  })

  it('expires promotional grants without reducing purchased credits', () => {
    purchasePrepaid({ credits: 200 })
    const granted = issuePrepaidCredits({
      ...identity,
      credits: 100,
      reason: 'Thirty-day prospect trial',
      issuedBy: 'Carl Farrington',
      leaseId: 'lease-acme',
      expiresAt: '2026-08-01T00:00:00.000Z',
      idempotencyKey: 'owner-grant:trial',
      now: july.now,
    })

    expect(granted.event).toMatchObject({ expiresAt: '2026-08-01T00:00:00.000Z' })
    expect(granted.wallet).toMatchObject({
      availableCredits: 300,
      prepaid: { availableCredits: 200, expiresAt: null },
      promotional: {
        grantedCredits: 100,
        availableCredits: 100,
        expiredCredits: 0,
        nextExpiresAt: '2026-08-01T00:00:00.000Z',
      },
    })

    expect(getCreditWallet({ ...identity, now: '2026-08-15T12:00:00.000Z' })).toMatchObject({
      availableCredits: 200,
      prepaid: { availableCredits: 200 },
      promotional: {
        grantedCredits: 100,
        availableCredits: 0,
        expiredCredits: 100,
        nextExpiresAt: null,
      },
    })
  })

  it('reserves active promotional credits before evergreen prepaid credits', () => {
    purchasePrepaid({ credits: 100 })
    issuePrepaidCredits({
      ...identity,
      credits: 60,
      reason: 'Expiring trial capacity',
      issuedBy: 'Carl Farrington',
      expiresAt: '2026-08-01T00:00:00.000Z',
      idempotencyKey: 'owner-grant:expiring-first',
      now: july.now,
    })

    const reserved = reserveWalletCredits({
      ...identity,
      credits: 80,
      idempotencyKey: 'trial-job:reserve',
      now: july.now,
    })

    expect(reserved.reservation.childReservations).toEqual([
      expect.objectContaining({ pool: 'promotional', reservedCredits: 60 }),
      expect.objectContaining({ pool: 'prepaid', reservedCredits: 20 }),
    ])
    expect(reserved.wallet).toMatchObject({
      availableCredits: 80,
      promotional: { availableCredits: 0, reservedCredits: 60 },
      prepaid: { availableCredits: 80, reservedCredits: 20 },
    })
  })

  it('rejects promotional expiration that is not after the grant time', () => {
    expect(() => issuePrepaidCredits({
      ...identity,
      credits: 100,
      reason: 'Invalid promotion',
      issuedBy: 'Carl Farrington',
      expiresAt: july.now,
      idempotencyKey: 'owner-grant:expired',
      now: july.now,
    })).toThrow('expiresAt must be after now')
  })

  it('reserves from subscription first and uses prepaid only for the remainder', () => {
    grantSubscription()
    purchasePrepaid()

    const reserved = reserveWalletCredits({
      ...identity,
      credits: 140,
      service: 'ai-receptionist',
      sku: 'voice.minute',
      idempotencyKey: 'call:1:reserve',
      now: july.now,
    })
    const repeated = reserveWalletCredits({
      ...identity,
      credits: 140,
      service: 'ai-receptionist',
      sku: 'voice.minute',
      idempotencyKey: 'call:1:reserve',
      now: july.now,
    })

    expect(reserved).toMatchObject({ ok: true, decision: 'reserved', idempotent: false })
    expect(reserved.reservation.childReservations).toEqual([
      expect.objectContaining({ pool: 'subscription', reservedCredits: 100, status: 'reserved' }),
      expect.objectContaining({ pool: 'prepaid', reservedCredits: 40, status: 'reserved' }),
    ])
    expect(reserved.wallet).toMatchObject({
      availableCredits: 210,
      reservedCredits: 140,
      subscription: { availableCredits: 0, reservedCredits: 100 },
      prepaid: { availableCredits: 210, reservedCredits: 40 },
    })
    expect(repeated.idempotent).toBe(true)
    expect(repeated.reservation.id).toBe(reserved.reservation.id)
  })

  it('does not create a partial reservation when the combined balance is too small', () => {
    grantSubscription({ credits: 40 })
    purchasePrepaid({ credits: 10 })

    const denied = reserveWalletCredits({
      ...identity,
      credits: 51,
      idempotencyKey: 'job:too-large',
      now: july.now,
    })
    const repeated = reserveWalletCredits({
      ...identity,
      credits: 51,
      idempotencyKey: 'job:too-large',
      now: july.now,
    })

    expect(denied).toMatchObject({
      ok: false,
      decision: 'blocked',
      code: 'insufficient_credits',
      idempotent: false,
      wallet: { availableCredits: 50, reservedCredits: 0 },
    })
    expect(repeated).toMatchObject({ idempotent: true })
    expect(getCreditWallet({ ...identity, now: july.now })).toMatchObject({
      availableCredits: 50,
      reservedCredits: 0,
    })
  })

  it('commits no more than reserved and releases unused child allocations', () => {
    grantSubscription({ credits: 100 })
    purchasePrepaid({ credits: 100 })
    const reserved = reserveWalletCredits({
      ...identity,
      credits: 150,
      idempotencyKey: 'research:1:reserve',
      now: july.now,
    })

    expect(() => commitWalletReservation({
      ...identity,
      reservationId: reserved.reservation.id,
      credits: 151,
      idempotencyKey: 'research:1:commit-too-high',
      now: july.now,
    })).toThrow('Committed credits cannot exceed reserved credits')

    const committed = commitWalletReservation({
      ...identity,
      reservationId: reserved.reservation.id,
      credits: 120,
      idempotencyKey: 'research:1:commit',
      now: july.now,
    })

    expect(committed).toMatchObject({ ok: true, decision: 'committed' })
    expect(committed.reservation.childReservations).toEqual([
      expect.objectContaining({
        pool: 'subscription',
        reservedCredits: 100,
        committedCredits: 100,
        releasedCredits: 0,
        status: 'committed',
      }),
      expect.objectContaining({
        pool: 'prepaid',
        reservedCredits: 50,
        committedCredits: 20,
        releasedCredits: 30,
        status: 'partially_committed',
      }),
    ])
    expect(committed.wallet).toMatchObject({
      availableCredits: 80,
      reservedCredits: 0,
      spentCredits: 120,
      subscription: { availableCredits: 0, spentCredits: 100 },
      prepaid: { availableCredits: 80, spentCredits: 20 },
    })
  })

  it('releases every child reservation without spending either pool', () => {
    grantSubscription({ credits: 30 })
    purchasePrepaid({ credits: 30 })
    const reserved = reserveWalletCredits({
      ...identity,
      credits: 50,
      idempotencyKey: 'automation:1:reserve',
      now: july.now,
    })

    const released = releaseWalletReservation({
      ...identity,
      reservationId: reserved.reservation.id,
      reason: 'provider_failed',
      idempotencyKey: 'automation:1:release',
      now: july.now,
    })

    expect(released).toMatchObject({ ok: true, decision: 'released' })
    expect(released.reservation.childReservations).toEqual([
      expect.objectContaining({ pool: 'subscription', releasedCredits: 30, status: 'released' }),
      expect.objectContaining({ pool: 'prepaid', releasedCredits: 20, status: 'released' }),
    ])
    expect(released.wallet).toMatchObject({ availableCredits: 60, reservedCredits: 0, spentCredits: 0 })
  })

  it('expires unused subscription credits but carries prepaid credits forward forever', () => {
    grantSubscription({ credits: 75 })
    purchasePrepaid({ credits: 25 })

    expect(getCreditWallet({
      ...identity,
      now: '2026-08-15T12:00:00.000Z',
    })).toMatchObject({
      availableCredits: 25,
      subscription: { periodId: null, availableCredits: 0 },
      prepaid: { availableCredits: 25, expiresAt: null },
    })
  })

  it('isolates identical account and idempotency ids by tenant', () => {
    purchasePrepaid({ credits: 20 })
    purchasePrepaid({
      tenantId: 'tenant-other',
      accountId: identity.accountId,
      credits: 90,
    })

    expect(getCreditWallet({ ...identity, now: july.now }).availableCredits).toBe(20)
    expect(getCreditWallet({
      tenantId: 'tenant-other',
      accountId: identity.accountId,
      now: july.now,
    }).availableCredits).toBe(90)
  })

  it('rejects reusing an idempotency key with different purchase details', () => {
    purchasePrepaid({ credits: 20 })

    expect(() => purchasePrepaid({ credits: 21 })).toThrow('idempotencyKey was already used with different input')
  })

  it('commits or rolls back a SQLite data mutation as one transaction', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-wallet-sqlite-'))
    const previousDataDir = process.env.CRM_DATA_DIR
    let sqlite
    try {
      process.env.CRM_DATA_DIR = dataDir
      vi.resetModules()
      sqlite = await import('../lib/dataStoreSqlite')
      sqlite.writeDataSqlite('atomic-wallet.json', { balance: 10 })

      const result = sqlite.mutateDataSqlite('atomic-wallet.json', current => ({
        data: { balance: current.balance + 5 },
        result: 'updated',
      }))
      expect(result).toBe('updated')
      expect(sqlite.readDataSqlite('atomic-wallet.json')).toEqual({ balance: 15 })

      expect(() => sqlite.mutateDataSqlite('atomic-wallet.json', () => {
        throw new Error('abort wallet update')
      })).toThrow('abort wallet update')
      expect(sqlite.readDataSqlite('atomic-wallet.json')).toEqual({ balance: 15 })
    } finally {
      sqlite?.closeAllSqlite()
      if (previousDataDir === undefined) delete process.env.CRM_DATA_DIR
      else process.env.CRM_DATA_DIR = previousDataDir
      fs.rmSync(dataDir, { recursive: true, force: true })
      vi.resetModules()
    }
  })
})
