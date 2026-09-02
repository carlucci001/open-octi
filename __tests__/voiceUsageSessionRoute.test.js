import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readData: vi.fn(() => ({ events: [] })),
  writeData: vi.fn(),
  recordUsageEvent: vi.fn(),
  buildRealtimeVoiceUsageEvent: vi.fn(input => ({ ...input, source: 'voice' })),
}))

vi.mock('@/lib/dataStore', () => ({ readData: mocks.readData, writeData: mocks.writeData }))
vi.mock('@/lib/permissions', () => ({ requireCapability: vi.fn(async () => ({ user: { id: 'owner' } })) }))
vi.mock('@/lib/usage-events', () => ({ recordUsageEvent: mocks.recordUsageEvent, buildRealtimeVoiceUsageEvent: mocks.buildRealtimeVoiceUsageEvent }))

import { POST } from '../app/api/voice/transfer-log/route'

describe('realtime voice usage session logging', () => {
  beforeEach(() => vi.clearAllMocks())

  it('turns an ended realtime session into a minute-rated usage event', async () => {
    const response = await POST(new Request('http://localhost/api/voice/transfer-log', {
      method: 'POST',
      body: JSON.stringify({ stage: 'realtime-session-ended', provider: 'openai', model: 'gpt-realtime-2', agentId: 'victoria', clientId: 'c1', runId: 'voice-1', elapsedMs: 90_000 }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.buildRealtimeVoiceUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', agentId: 'victoria', clientId: 'c1', durationSeconds: 90 }))
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'voice' }))
  })
})
