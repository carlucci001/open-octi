import { describe, expect, it } from 'vitest'
import { applyFailedReleasePoll, applyHealthPoll, emptyShipDeskAlertState } from '../lib/ship-desk-alerts'

describe('Ship Desk alert debounce', () => {
  it('alerts only after more than two consecutive degraded/down polls', () => {
    let state = emptyShipDeskAlertState()

    let result = applyHealthPoll(state, { platformId: 'getfound3', name: 'GetFound3', status: 'degraded' })
    state = result.state
    expect(result.effects).toEqual([])

    result = applyHealthPoll(state, { platformId: 'getfound3', name: 'GetFound3', status: 'down' })
    state = result.state
    expect(result.effects).toEqual([])

    result = applyHealthPoll(state, { platformId: 'getfound3', name: 'GetFound3', status: 'down' })
    state = result.state
    expect(result.effects).toEqual([expect.objectContaining({ kind: 'health', platformId: 'getfound3', badPolls: 3 })])

    result = applyHealthPoll(state, { platformId: 'getfound3', name: 'GetFound3', status: 'down' })
    expect(result.effects).toEqual([])
  })

  it('resets the debounce after a healthy poll', () => {
    let state = emptyShipDeskAlertState()
    for (let i = 0; i < 3; i += 1) state = applyHealthPoll(state, { platformId: 'fcc', name: 'Command Center', status: 'degraded' }).state
    state = applyHealthPoll(state, { platformId: 'fcc', name: 'Command Center', status: 'ok' }).state

    const firstBad = applyHealthPoll(state, { platformId: 'fcc', name: 'Command Center', status: 'down' })
    expect(firstBad.effects).toEqual([])
    expect(firstBad.state.health.fcc.badPolls).toBe(1)
  })

  it('alerts once for a failed release even when later polls repeat it', () => {
    let state = emptyShipDeskAlertState()
    let result = applyFailedReleasePoll(state, { platformId: 'getfound3', name: 'GetFound3', release: { id: 'rel_failed', version: '2.4.0', status: 'failed' } })
    state = result.state
    expect(result.effects).toHaveLength(1)
    expect(applyFailedReleasePoll(state, { platformId: 'getfound3', name: 'GetFound3', release: { id: 'rel_failed', version: '2.4.0', status: 'failed' } }).effects).toEqual([])
  })
})
