import { describe, expect, it } from 'vitest'
import {
  normalizeUsageEvent,
  buildRealtimeVoiceUsageEvent,
  rollupUsageEvents,
  summarizeUsageRows,
} from '../lib/usage-events'

describe('usage events', () => {
  it('normalizes the required event shape and preserves optional attribution', () => {
    const event = normalizeUsageEvent({
      agentId: 'nadia',
      provider: 'google',
      model: 'gemini-2.5-pro',
      promptTokens: 1200,
      completionTokens: 300,
      estCostUsd: 0.0045,
      clientId: 'client-7',
      productId: 'research',
      requestId: 'ticket-9',
      runId: 'run-11',
      source: 'deerflow',
    }, { id: 'ue_test', ts: '2026-08-22T12:00:00.000Z' })

    expect(event).toEqual({
      id: 'ue_test',
      ts: '2026-08-22T12:00:00.000Z',
      agentId: 'nadia',
      provider: 'google',
      model: 'gemini-2.5-pro',
      promptTokens: 1200,
      completionTokens: 300,
      estCostUsd: 0.0045,
      clientId: 'client-7',
      productId: 'research',
      requestId: 'ticket-9',
      runId: 'run-11',
      source: 'deerflow',
      unknown: false,
    })
  })

  it('rolls up by day, agent, client, product, and provider', () => {
    const rows = rollupUsageEvents([
      normalizeUsageEvent({ agentId: 'nadia', provider: 'google', model: 'gemini', promptTokens: 100, completionTokens: 20, estCostUsd: 0.01, clientId: 'c1', productId: 'research', source: 'deerflow' }, { id: 'a', ts: '2026-05-01T01:00:00.000Z' }),
      normalizeUsageEvent({ agentId: 'nadia', provider: 'google', model: 'gemini', promptTokens: 300, completionTokens: 40, estCostUsd: 0.03, clientId: 'c1', productId: 'research', source: 'deerflow' }, { id: 'b', ts: '2026-05-01T12:00:00.000Z' }),
      normalizeUsageEvent({ agentId: 'nadia', provider: 'google', model: 'unknown-model', promptTokens: 50, completionTokens: 10, estCostUsd: 0, clientId: 'c2', productId: 'research', source: 'deerflow', unknown: true }, { id: 'c', ts: '2026-05-01T13:00:00.000Z' }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ day: '2026-05-01', agentId: 'nadia', clientId: 'c1', productId: 'research', provider: 'google', events: 2, promptTokens: 400, completionTokens: 60, estCostUsd: 0.04, unknownEvents: 0 })
    expect(rows[1]).toMatchObject({ clientId: 'c2', events: 1, unknownEvents: 1, unknown: true })
  })

  it('groups raw and rolled-up rows without losing unknown-cost state', () => {
    const summary = summarizeUsageRows([
      { agentId: 'nadia', clientId: 'c1', productId: 'research', provider: 'google', events: 2, promptTokens: 400, completionTokens: 60, estCostUsd: 0.04, unknownEvents: 0 },
      { agentId: 'orca', clientId: 'c1', productId: 'research', provider: 'orcarouter', promptTokens: 10, completionTokens: 5, estCostUsd: 0, unknown: true },
    ], 'client')

    expect(summary).toEqual([
      expect.objectContaining({ key: 'c1', events: 3, promptTokens: 410, completionTokens: 65, estCostUsd: 0.04, unknownEvents: 1, unknown: true }),
    ])
  })

  it('prices realtime voice sessions by elapsed minutes', () => {
    expect(buildRealtimeVoiceUsageEvent({ provider: 'openai', model: 'gpt-realtime-2', durationSeconds: 120, agentId: 'victoria', clientId: 'c1', runId: 'voice-1' })).toMatchObject({
      agentId: 'victoria', clientId: 'c1', provider: 'openai', model: 'gpt-realtime-2', estCostUsd: 0.09024, runId: 'voice-1', source: 'voice', unknown: false,
    })
  })
})
