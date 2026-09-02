import { describe, expect, it, vi } from 'vitest'
import { buildShipDeskSnapshot } from '../lib/ship-desk-snapshot'

describe('Ship Desk snapshot', () => {
  it('loads every registered capable platform, bypasses the releases cache, and builds rollback context', async () => {
    const fetchResource = vi.fn(async (_platformId, resource) => resource === 'health'
      ? { status: 200, body: { status: 'ok', version: '2.4.0', checks: [], ts: '2026-08-22T20:00:00.000Z' } }
      : { status: 200, body: [
        { id: 'live', version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live' },
        { id: 'old', version: '2.3.0', commit: '1111111', deployer: 'carl', deployedAt: '2026-08-21T20:00:00.000Z', status: 'previous' },
      ] })
    const processAlerts = vi.fn(async () => [])

    const result = await buildShipDeskSnapshot({
      platforms: [{ platformId: 'getfound3', name: 'GetFound3', url: 'https://getfound3.com', capabilities: ['health', 'releases'] }],
      cicdItems: [{ platformId: 'getfound3', localPath: '/root/getfound3', deployCommand: 'npx vercel deploy --prod --yes', releasePolicy: 'CLI production release.', giteaUrl: 'https://gitea.example/carl/getfound3', githubUrl: 'https://github.com/carlucci001/getfound3' }],
      fetchResource,
      processAlerts,
      collectMessages: () => ['Ship the release hook'],
      getSummary: () => ({ summary: 'Cached change summary.', runId: 'orca_1' }),
      getAnnotation: (_platformId, releaseId) => releaseId === 'live' ? { notes: 'Operator verified smoke test.' } : null,
    })

    expect(fetchResource).toHaveBeenCalledWith('getfound3', 'releases', { limit: 20 }, { bypassCache: true })
    expect(result.platforms[0]).toMatchObject({
      platformId: 'getfound3',
      health: { status: 'ok' },
      liveRelease: { id: 'live', annotation: { notes: 'Operator verified smoke test.' } },
      previousRelease: { id: 'old' },
      commitMessages: ['Ship the release hook'],
      summary: { summary: 'Cached change summary.' },
      rollback: { command: "git -C '/root/getfound3' checkout --detach '1111111' && npx vercel deploy --prod --yes", releasePolicy: 'CLI production release.' },
    })
    expect(processAlerts).toHaveBeenCalledWith([expect.objectContaining({ platformId: 'getfound3', releases: expect.any(Array) })])
  })
})
