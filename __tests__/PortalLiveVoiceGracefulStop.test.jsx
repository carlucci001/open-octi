import { describe, expect, it } from 'vitest'
import { canFinishPendingVoiceStop, shouldDeferVoiceStop } from '../app/portal/components/PortalLiveVoice'

describe('PortalLiveVoice graceful stop policy', () => {
  it('defers a client or limit stop while Cheryl is still speaking', () => {
    expect(shouldDeferVoiceStop({ state: 'speaking', outputSourceCount: 0, turnCompletePending: false })).toBe(true)
    expect(canFinishPendingVoiceStop({ pendingStopReason: 'session_limit', outputSourceCount: 0, turnCompletePending: false })).toBe(false)
  })

  it('finishes the pending stop only after the completed sentence has no audio left', () => {
    expect(canFinishPendingVoiceStop({ pendingStopReason: 'session_limit', outputSourceCount: 1, turnCompletePending: true })).toBe(false)
    expect(canFinishPendingVoiceStop({ pendingStopReason: 'session_limit', outputSourceCount: 0, turnCompletePending: true })).toBe(true)
  })

  it('ends immediately while listening when no sentence is in flight', () => {
    expect(shouldDeferVoiceStop({ state: 'listening', outputSourceCount: 0, turnCompletePending: false })).toBe(false)
  })
})
