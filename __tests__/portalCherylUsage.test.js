import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(name => structuredClone(state.data[name] || null)),
  mutateData: vi.fn((name, mutator) => {
    const outcome = mutator(structuredClone(state.data[name] || null))
    state.data[name] = structuredClone(outcome.data)
    return structuredClone(outcome.result)
  }),
}))

import {
  DEFAULT_CHERYL_VOICE_POLICY,
  closeCherylVoiceSession,
  heartbeatCherylVoiceSession,
  openCherylVoiceSession,
  resolveCherylVoicePolicy,
} from '../lib/portal-cheryl-usage'

const identity = {
  accountId: 'account-acme',
  tenantId: 'tenant-acme',
  leaseId: 'lease-acme',
}

describe('portal Cheryl premium voice usage policy', () => {
  beforeEach(() => {
    state.data = {}
  })

  it('uses safe defaults and accepts bounded owner overrides from the active lease', () => {
    expect(resolveCherylVoicePolicy({})).toEqual(DEFAULT_CHERYL_VOICE_POLICY)
    expect(resolveCherylVoicePolicy({
      conciergeVoice: {
        enabled: true,
        dailySeconds: 1_800,
        maxSessionSeconds: 420,
        idleTimeoutSeconds: 90,
        warningThresholds: [75, 0.5, 90, 90, 400],
      },
    })).toMatchObject({
      enabled: true,
      dailySeconds: 1_800,
      maxSessionSeconds: 420,
      idleTimeoutSeconds: 90,
      warningThresholds: [0.5, 0.75, 0.9],
    })
  })

  it('allows only one active premium session per account while allowing the same browser to resume it', () => {
    const now = new Date('2026-08-26T14:00:00.000Z')
    const first = openCherylVoiceSession({ identity, lease: {}, clientKey: 'browser-one', now })
    expect(first.ok).toBe(true)
    expect(first.resumed).toBe(false)

    const blocked = openCherylVoiceSession({ identity, lease: {}, clientKey: 'browser-two', now: new Date(now.getTime() + 1_000) })
    expect(blocked).toMatchObject({ ok: false, code: 'active_session' })

    const resumed = openCherylVoiceSession({
      identity,
      lease: {},
      clientKey: 'browser-one',
      resumeSessionId: first.session.id,
      now: new Date(now.getTime() + 2_000),
    })
    expect(resumed).toMatchObject({ ok: true, resumed: true })
    expect(resumed.session.id).toBe(first.session.id)
  })

  it('treats a replacement lease as the same account for the one-session ceiling', () => {
    const now = new Date('2026-08-26T14:00:00.000Z')
    openCherylVoiceSession({ identity, lease: {}, clientKey: 'browser-one', now })
    const replacementLeaseIdentity = { ...identity, leaseId: 'lease-replacement' }

    expect(openCherylVoiceSession({ identity: replacementLeaseIdentity, lease: {}, clientKey: 'browser-two', now: new Date(now.getTime() + 1_000) }))
      .toMatchObject({ ok: false, code: 'active_session' })
  })

  it('meters server-bounded seconds, emits threshold events, and enforces the daily ceiling', () => {
    const lease = { conciergeVoice: { dailySeconds: 120, maxSessionSeconds: 90, idleTimeoutSeconds: 30, warningThresholds: [0.5, 0.9] } }
    const startedAt = new Date('2026-08-26T14:00:00.000Z')
    const opened = openCherylVoiceSession({ identity, lease, clientKey: 'browser-one', now: startedAt })

    const heartbeat = heartbeatCherylVoiceSession({
      identity,
      sessionId: opened.session.id,
      clientKey: 'browser-one',
      elapsedSeconds: 50,
      eventCount: 4,
      now: new Date(startedAt.getTime() + 50_000),
    })
    expect(heartbeat).toMatchObject({ ok: true, usedSeconds: 50, warning: { threshold: 0.5 } })

    const ended = closeCherylVoiceSession({
      identity,
      sessionId: opened.session.id,
      clientKey: 'browser-one',
      elapsedSeconds: 90,
      eventCount: 8,
      reason: 'session_limit',
      now: new Date(startedAt.getTime() + 90_000),
    })
    expect(ended).toMatchObject({ ok: true, usedSeconds: 90, reason: 'session_limit' })

    const second = openCherylVoiceSession({ identity, lease, clientKey: 'browser-two', now: new Date(startedAt.getTime() + 100_000) })
    expect(second.ok).toBe(true)
    expect(second.allowance.sessionSeconds).toBe(30)

    closeCherylVoiceSession({
      identity,
      sessionId: second.session.id,
      clientKey: 'browser-two',
      elapsedSeconds: 30,
      eventCount: 2,
      reason: 'session_limit',
      now: new Date(startedAt.getTime() + 130_000),
    })
    expect(openCherylVoiceSession({ identity, lease, clientKey: 'browser-three', now: new Date(startedAt.getTime() + 140_000) }))
      .toMatchObject({ ok: false, code: 'daily_limit' })

    const ledger = state.data['portal-cheryl-usage.json']
    expect(ledger.events.some(event => event.type === 'session_started' && event.tenantId === 'tenant-acme')).toBe(true)
    expect(ledger.events.some(event => event.type === 'warning' && event.accountId === 'account-acme')).toBe(true)
    expect(ledger.events.some(event => event.type === 'session_ended' && event.seconds === 90)).toBe(true)
    expect(ledger.events.some(event => event.type === 'session_blocked' && event.reason === 'daily_limit')).toBe(true)
  })

  it('rejects cross-tenant heartbeats and close attempts without changing the session', () => {
    const opened = openCherylVoiceSession({ identity, lease: {}, clientKey: 'browser-one', now: new Date('2026-08-26T14:00:00.000Z') })
    const otherIdentity = { ...identity, tenantId: 'tenant-rival' }

    expect(heartbeatCherylVoiceSession({ identity: otherIdentity, sessionId: opened.session.id, clientKey: 'browser-one', elapsedSeconds: 10 }))
      .toMatchObject({ ok: false, code: 'not_found' })
    expect(closeCherylVoiceSession({ identity: otherIdentity, sessionId: opened.session.id, clientKey: 'browser-one', elapsedSeconds: 10 }))
      .toMatchObject({ ok: false, code: 'not_found' })
    expect(state.data['portal-cheryl-usage.json'].sessions[0].endedAt).toBeNull()
  })
})
