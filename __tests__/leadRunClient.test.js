import { describe, expect, it, vi } from 'vitest'
import { normalizeLeadClientRequestId, startTrackedLeadRun } from '../lib/lead-run-client'

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('lead run client', () => {
  it('retries a lost acknowledgement with the same idempotency key', async () => {
    const seen = []
    const fetchImpl = vi.fn(async (url, options) => {
      seen.push(JSON.parse(options.body))
      if (seen.length === 1) throw new TypeError('network connection reset')
      return response({ ok: true, run: { id: 'lsr_safe', status: 'running' }, replayed: true })
    })

    const result = await startTrackedLeadRun({
      url: '/api/leads/farrington-sweep',
      payload: { category: 'computer-stores' },
      clientRequestId: 'lead-click-123',
      fetchImpl,
      sleep: async () => {},
    })

    expect(result.run.id).toBe('lsr_safe')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(seen[0].clientRequestId).toBe('lead-click-123')
    expect(seen[1].clientRequestId).toBe('lead-click-123')
  })

  it('does not retry a validation or permission error', async () => {
    const fetchImpl = vi.fn(async () => response({ ok: false, error: 'Lead list is required' }, 400))

    await expect(startTrackedLeadRun({
      url: '/api/leads/organization-campaign',
      payload: {},
      clientRequestId: 'lead-click-400',
      fetchImpl,
      sleep: async () => {},
    })).rejects.toThrow(/Lead list is required.*1 attempt/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('sanitizes a request id before it can reach logs or storage', () => {
    expect(normalizeLeadClientRequestId(' lead click/<123> ')).toBe('leadclick123')
  })
})
