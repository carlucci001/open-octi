import { describe, expect, it, vi } from 'vitest'
import { createStreamAudioMeter, playRealtimeAudio } from '@/lib/realtime-audio'

describe('realtime audio playback and metering', () => {
  it('reads actual stream samples without adding a second audible output, and releases its context', () => {
    const analyser = { frequencyBinCount: 4, getByteFrequencyData: vi.fn(bytes => bytes.set([0, 80, 160, 20])), disconnect: vi.fn() }
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    const context = { createMediaStreamSource: vi.fn(() => source), createAnalyser: () => analyser, resume: vi.fn(), close: vi.fn(), destination: {} }
    const meter = createStreamAudioMeter({}, function () { return context })
    expect(Array.from(meter.read())).toEqual([0, 80, 160, 20])
    expect(source.connect).toHaveBeenCalledExactlyOnceWith(analyser)
    meter.close(); meter.close()
    expect(meter.read()).toBeNull()
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(source.disconnect).toHaveBeenCalledTimes(1)
  })

  it('keeps audio playback usable if visualisation is unavailable', () => {
    expect(createStreamAudioMeter({}, function () { throw new Error('unsupported') })).toBeNull()
  })

  it('reports blocked playback, but ignores a late failure from a replaced agent', async () => {
    const blocked = vi.fn()
    const audio = { play: vi.fn().mockRejectedValue(new Error('NotAllowedError')) }
    expect(await playRealtimeAudio(audio, { isCurrent: () => true }, blocked)).toBe(false)
    expect(blocked).toHaveBeenCalledWith(expect.stringContaining('Resume audio'))
    blocked.mockClear()
    expect(await playRealtimeAudio(audio, { isCurrent: () => false }, blocked)).toBe(false)
    expect(blocked).not.toHaveBeenCalled()
  })
})
