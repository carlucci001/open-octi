import { describe, expect, it } from 'vitest'
import {
  applyIncidentAction,
  applyIncidentAlertCandidate,
  buildPublicStatusSnapshot,
  reconcileIncidentEvents,
} from '../lib/incidents'

const NOW = '2026-08-22T20:00:00.000Z'

function errorEvent(overrides = {}) {
  return {
    platformId: 'getfound3',
    platformName: 'GetFound3',
    fingerprint: 'checkout-timeout',
    title: 'Checkout timed out',
    level: 'error',
    count: 3,
    firstSeen: '2026-08-22T19:00:00.000Z',
    lastSeen: '2026-08-22T19:55:00.000Z',
    source: 'errors',
    ...overrides,
  }
}

describe('Incident normalization and lifecycle', () => {
  it('deduplicates by platform and fingerprint while preserving count history', () => {
    const result = reconcileIncidentEvents([], [
      errorEvent({ count: 2, lastSeen: '2026-08-22T19:50:00.000Z' }),
      errorEvent({ count: 3, lastSeen: '2026-08-22T19:55:00.000Z' }),
      errorEvent({ platformId: 'getremedy3', platformName: 'GetRemedy3', count: 1 }),
    ], { now: NOW, idFactory: () => 'inc_test' })

    expect(result.incidents).toHaveLength(2)
    expect(result.incidents.find(row => row.platformId === 'getfound3')).toMatchObject({
      fingerprint: 'checkout-timeout',
      count: 3,
      status: 'open',
      notes: [],
    })
    expect(result.incidents.find(row => row.platformId === 'getfound3').countHistory.at(-1)).toEqual({
      ts: '2026-08-22T19:55:00.000Z',
      count: 3,
    })
    expect(result.alertCandidates).toHaveLength(2)
  })

  it('reopens a resolved incident only when the source reports a newer recurrence', () => {
    const resolved = {
      id: 'inc_1',
      ...errorEvent(),
      status: 'resolved',
      resolvedAt: '2026-08-22T19:57:00.000Z',
      resolvedCount: 3,
      notes: [],
      countHistory: [],
    }

    const unchanged = reconcileIncidentEvents([resolved], [errorEvent()], { now: NOW })
    expect(unchanged.incidents[0].status).toBe('resolved')
    expect(unchanged.alertCandidates).toEqual([])

    const recurring = reconcileIncidentEvents([resolved], [errorEvent({ count: 4, lastSeen: '2026-08-22T19:59:00.000Z' })], { now: NOW })
    expect(recurring.incidents[0].status).toBe('open')
    expect(recurring.incidents[0].notes.at(-1).body).toMatch(/reopened/i)
    expect(recurring.alertCandidates).toEqual([expect.objectContaining({ reason: 'reopened' })])
  })

  it('acknowledges, resolves, and mutes for exactly seven days', () => {
    const incident = { id: 'inc_1', ...errorEvent(), status: 'open', notes: [] }
    expect(applyIncidentAction(incident, 'acknowledge', { now: NOW }).status).toBe('acknowledged')

    const resolved = applyIncidentAction(incident, 'resolve', { now: NOW })
    expect(resolved).toMatchObject({ status: 'resolved', resolvedAt: NOW, resolvedCount: 3 })

    const muted = applyIncidentAction(incident, 'mute', { now: NOW })
    expect(muted.status).toBe('muted')
    expect(muted.mutedUntil).toBe('2026-08-29T20:00:00.000Z')
  })
})

describe('Incident alert suppression', () => {
  it('suppresses repeats for one hour and permits a later recurrence', () => {
    const candidate = { platformId: 'getfound3', fingerprint: 'checkout-timeout', level: 'error' }
    const first = applyIncidentAlertCandidate({}, candidate, { nowMs: Date.parse(NOW) })
    expect(first.shouldAlert).toBe(true)

    const repeat = applyIncidentAlertCandidate(first.state, candidate, { nowMs: Date.parse(NOW) + 59 * 60_000 })
    expect(repeat.shouldAlert).toBe(false)

    const later = applyIncidentAlertCandidate(repeat.state, candidate, { nowMs: Date.parse(NOW) + 60 * 60_000 })
    expect(later.shouldAlert).toBe(true)
  })

  it('never alerts for warning or informational incidents', () => {
    const result = applyIncidentAlertCandidate({}, { platformId: 'fcc', fingerprint: 'disk', level: 'warning' }, { nowMs: Date.parse(NOW) })
    expect(result.shouldAlert).toBe(false)
    expect(result.state).toEqual({})
  })
})

describe('Public status projection', () => {
  it('shows platform health and only Carl-public open incidents without internals', () => {
    const snapshot = buildPublicStatusSnapshot({
      statusState: {
        generatedAt: NOW,
        platforms: [{ platformId: 'getfound3', name: 'GetFound3', status: 'degraded', version: '2.4.0', detail: 'secret internal detail' }],
      },
      incidents: [
        { id: 'public', platformId: 'getfound3', title: 'Report generation delayed', level: 'warning', status: 'open', public: true, lastSeen: NOW, fingerprint: 'private-fingerprint', notes: [{ body: 'internal note' }] },
        { id: 'private', platformId: 'getfound3', title: 'Private stack trace', level: 'error', status: 'open', public: false, lastSeen: NOW },
        { id: 'done', platformId: 'getfound3', title: 'Resolved incident', level: 'error', status: 'resolved', public: true, lastSeen: NOW },
      ],
    })

    expect(snapshot.platforms[0]).toEqual({ platformId: 'getfound3', name: 'GetFound3', status: 'degraded', version: '2.4.0' })
    expect(snapshot.incidents).toEqual([{ id: 'public', platformId: 'getfound3', title: 'Report generation delayed', level: 'warning', status: 'open', lastSeen: NOW }])
    expect(JSON.stringify(snapshot)).not.toContain('fingerprint')
    expect(JSON.stringify(snapshot)).not.toContain('internal note')
  })
})
