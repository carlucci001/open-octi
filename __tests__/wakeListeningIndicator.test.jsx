import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeListeningIndicator, WAKE_RESTART_GRACE_MS } from '@/lib/use-wake-listening-indicator'

vi.mock('next/dynamic', () => ({ default: () => () => null }))

import MatildaEqualizer from '@/app/components/MatildaEqualizer'
import ChatPanel from '@/app/components/ChatPanel'

let events
let onListening

beforeEach(() => {
  vi.useFakeTimers()
  window.__fccVoiceListening = false
  events = []
  onListening = event => events.push(event.detail)
  window.addEventListener('fcc:voice-listening', onListening)
})

afterEach(() => {
  cleanup()
  window.removeEventListener('fcc:voice-listening', onListening)
  delete window.__fccVoiceListening
  vi.unstubAllGlobals()
  window.localStorage.clear()
  vi.useRealTimers()
})

function startIndicator(props = { listening: false, enabled: true }) {
  return renderHook(values => useWakeListeningIndicator(values), { initialProps: props })
}

describe('established wake listening presentation', () => {
  it('never reports listening before a recognizer actually starts, including initial failure', () => {
    const { result, rerender } = startIndicator()
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(false)
    rerender({ listening: false, enabled: false })
    expect(events).toEqual([false])
    expect(window.__fccVoiceListening).toBe(false)
  })

  it('keeps the shared indicator steady through repeated automatic restarts', () => {
    const { result, rerender } = startIndicator()
    rerender({ listening: true, enabled: true })
    for (let restart = 0; restart < 4; restart += 1) {
      rerender({ listening: false, enabled: true })
      act(() => vi.advanceTimersByTime(75))
      expect(result.current).toBe(true)
      expect(window.__fccVoiceListening).toBe(true)
      rerender({ listening: true, enabled: true })
    }
    expect(events).toEqual([false, true])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('expires after one second without extending the grace on unrelated rerenders', () => {
    const { result, rerender } = startIndicator({ listening: true, enabled: true })
    rerender({ listening: false, enabled: true, unrelated: 0 })
    act(() => vi.advanceTimersByTime(600))
    rerender({ listening: false, enabled: true, unrelated: 1 })
    act(() => vi.advanceTimersByTime(399))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
    expect(window.__fccVoiceListening).toBe(false)
    expect(events.at(-1)).toBe(false)
  })

  it.each([true, false])('clears immediately when disabled, even while raw capture is %s', listening => {
    const { result, rerender } = startIndicator({ listening: true, enabled: true })
    rerender({ listening, enabled: true })
    act(() => vi.advanceTimersByTime(100))
    rerender({ listening, enabled: false })
    expect(result.current).toBe(false)
    expect(window.__fccVoiceListening).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    rerender({ listening: false, enabled: true })
    expect(result.current).toBe(false)
  })

  it('cancels an old deadline when capture resumes', () => {
    const { result, rerender } = startIndicator({ listening: true, enabled: true })
    rerender({ listening: false, enabled: true })
    act(() => vi.advanceTimersByTime(900))
    rerender({ listening: true, enabled: true })
    act(() => vi.advanceTimersByTime(WAKE_RESTART_GRACE_MS))
    expect(result.current).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending deadline and broadcasts off when the owner unmounts', () => {
    const { rerender, unmount } = startIndicator({ listening: true, enabled: true })
    rerender({ listening: false, enabled: true })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(window.__fccVoiceListening).toBe(false)
    expect(events.at(-1)).toBe(false)
    const count = events.length
    act(() => vi.advanceTimersByTime(5000))
    expect(events).toHaveLength(count)
  })

  it('keeps the real header and blue launcher from swapping during repeated recognizer renewals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ agents: [], roster: [], avatars: [], actions: [] })))
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.__fccVoiceActive = false
    window.__fccVoiceAgent = null
    window.__fccVoiceRoster = []
    window.__openOctiVoiceStatus = {}
    function HeaderHarness(props) {
      useWakeListeningIndicator(props)
      return <><MatildaEqualizer /><ChatPanel user={{ id: 'indicator-test', chatScope: 'indicator-test' }} /></>
    }
    let view
    await act(async () => { view = render(<HeaderHarness listening={false} enabled />) })
    const launcher = screen.getByRole('button', { name: /Open AI Wizard/ })
    expect(launcher).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Stop browser agent' })).toBeNull()

    view.rerender(<HeaderHarness listening enabled />)
    const equalizer = screen.getByRole('button', { name: 'Stop browser agent' })
    expect(equalizer).toBeVisible()
    expect(launcher).not.toBeVisible()
    for (let restart = 0; restart < 3; restart += 1) {
      view.rerender(<HeaderHarness listening={false} enabled />)
      act(() => vi.advanceTimersByTime(75))
      expect(screen.getByRole('button', { name: 'Stop browser agent' })).toBe(equalizer)
      expect(launcher).not.toBeVisible()
      view.rerender(<HeaderHarness listening enabled />)
    }

    view.rerender(<HeaderHarness listening={false} enabled={false} />)
    expect(screen.queryByRole('button', { name: 'Stop browser agent' })).toBeNull()
    expect(launcher).toBeVisible()
  })
})
