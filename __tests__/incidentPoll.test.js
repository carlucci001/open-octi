import { describe, expect, it, vi } from 'vitest'
import { pollIncidentSources } from '../lib/incident-poller'

describe('Incident Inbox platform poll', () => {
  it('polls errors and health only for declared capabilities and ingests an injected error within one poll', async () => {
    const fetchResource = vi.fn(async (_platformId, resource) => {
      if (resource === 'health') return { status: 200, body: { status: 'ok', version: '2.4.0', checks: [], ts: '2026-08-22T20:00:00.000Z' } }
      return { status: 200, body: [{
        fingerprint: 'preview-injected',
        message: 'Injected preview failure',
        count: 1,
        firstSeen: '2026-08-22T19:59:00.000Z',
        lastSeen: '2026-08-22T20:00:00.000Z',
        level: 'error',
        sample: { route: '/preview', stack: 'must not persist' },
      }] }
    })
    const saveIncidents = vi.fn()
    const saveStatus = vi.fn()
    const processAlerts = vi.fn(async () => [])

    const result = await pollIncidentSources({
      platforms: [
        { platformId: 'getfound3', name: 'GetFound3', capabilities: ['errors', 'health'] },
        { platformId: 'legacy', name: 'Legacy', capabilities: ['customers'] },
      ],
      existingIncidents: [],
      fetchResource,
      saveIncidents,
      saveStatus,
      processAlerts,
      now: () => new Date('2026-08-22T20:00:00.000Z'),
      idFactory: () => 'inc_preview',
    })

    expect(fetchResource).toHaveBeenCalledTimes(2)
    expect(fetchResource).toHaveBeenCalledWith('getfound3', 'errors', { since: expect.any(String), limit: 100 }, { bypassCache: true })
    expect(fetchResource).toHaveBeenCalledWith('getfound3', 'health', {}, { bypassCache: true })
    expect(result.incidents).toEqual([expect.objectContaining({ id: 'inc_preview', platformId: 'getfound3', fingerprint: 'preview-injected', title: 'Injected preview failure' })])
    expect(JSON.stringify(result.incidents)).not.toContain('must not persist')
    expect(saveIncidents).toHaveBeenCalledWith(result.incidents)
    expect(saveStatus).toHaveBeenCalledWith(expect.objectContaining({ platforms: [expect.objectContaining({ platformId: 'getfound3', status: 'ok' })] }))
    expect(processAlerts).toHaveBeenCalledWith([expect.objectContaining({ fingerprint: 'preview-injected' })])
  })

  it('turns a failed health call into a sanitized health incident', async () => {
    const result = await pollIncidentSources({
      platforms: [{ platformId: 'getremedy3', name: 'GetRemedy3', capabilities: ['health'] }],
      existingIncidents: [],
      fetchResource: async () => ({ status: 502, body: { error: { message: 'upstream internals' } } }),
      saveIncidents: vi.fn(),
      saveStatus: vi.fn(),
      processAlerts: vi.fn(async () => []),
      now: () => new Date('2026-08-22T20:00:00.000Z'),
      idFactory: () => 'inc_health',
    })

    expect(result.incidents[0]).toMatchObject({ fingerprint: 'platform-health', level: 'error', title: 'GetRemedy3 health check failed' })
    expect(JSON.stringify(result)).not.toContain('upstream internals')
  })
})
