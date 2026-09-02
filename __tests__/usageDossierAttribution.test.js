import { describe, expect, it } from 'vitest'
import { buildDeerFlowUsageEvent } from '../lib/usage-events'

describe('DeerFlow usage attribution', () => {
  it('attributes a dossier run to the requesting agent and client', () => {
    const event = buildDeerFlowUsageEvent({
      agentId: 'nadia',
      clientId: 'client-truk',
      productId: 'research',
      requestId: 'ticket-42',
      runId: 'df-9',
      model: 'gemini-2.5-pro',
      usage: { input_tokens: 2000, output_tokens: 1000 },
    })

    expect(event).toMatchObject({
      agentId: 'nadia',
      clientId: 'client-truk',
      productId: 'research',
      requestId: 'ticket-42',
      runId: 'df-9',
      provider: 'google',
      source: 'deerflow',
      unknown: false,
    })
    expect(event.estCostUsd).toBeGreaterThan(0)
  })
})
