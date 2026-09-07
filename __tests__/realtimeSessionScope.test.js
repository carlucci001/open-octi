import { describe, expect, it, vi } from 'vitest'
import { createRealtimeSessionScope, realtimeGreeting } from '@/lib/realtime-session-scope'

describe('voice session handoffs', () => {
  it('ignores queued Maggie callbacks after Craig takes over', () => {
    const owner = { current: null }
    const updateUi = vi.fn()
    const maggie = { agentId: 'main', dc: { readyState: 'open', send: vi.fn() } }
    const old = createRealtimeSessionScope(owner, maggie)
    const lateTranscript = old.guard(text => updateUi('Maggie', text))
    const lateClose = old.guard(() => updateUi('idle'))
    old.retire()
    const craig = { agentId: 'coding', dc: { readyState: 'open', send: vi.fn() } }
    const current = createRealtimeSessionScope(owner, craig)
    lateTranscript('I am Maggie')
    lateClose()
    current.guard(text => updateUi('Craig', text))('I am Craig')
    expect(updateUi.mock.calls).toEqual([['Craig', 'I am Craig']])
    expect(maggie.abortController.signal.aborted).toBe(true)
    expect(owner.current).toBe(craig)
  })

  it('does not request another Maggie response when her transfer tool finishes late', async () => {
    const owner = { current: null }
    const send = vi.fn()
    const old = createRealtimeSessionScope(owner, { dc: { readyState: 'open', send } })
    let completeTransfer
    const pending = new Promise(resolve => { completeTransfer = resolve })
    const finishTool = old.guard(async () => {
      await pending
      if (old.send({ type: 'conversation.item.create' })) old.send({ type: 'response.create' })
    })
    const result = finishTool()
    old.retire()
    createRealtimeSessionScope(owner, { dc: { readyState: 'open', send: vi.fn() } })
    completeTransfer()
    await result
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps the server persona and knowledge for every public agent greeting', () => {
    for (const agentId of ['main', 'coding', 'legal', 'social-media', 'matilda', 'octi-guide']) {
      const greeting = realtimeGreeting({ openOcti: true, agentId, firstMessage: 'Hi, I am Maggie' })
      expect(greeting).toEqual({ type: 'response.create', response: { tool_choice: 'none' } })
      expect(greeting.response).not.toHaveProperty('instructions')
    }
  })
})
