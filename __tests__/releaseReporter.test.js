import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ releases: [] }))

vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(() => state.releases),
  saveAll: vi.fn((_type, releases) => { state.releases = releases }),
  genId: vi.fn(() => 'rel_new'),
}))

import { normalizeReleaseReport, recordRelease } from '../lib/releases'

describe('release reporting', () => {
  beforeEach(() => { state.releases = [] })

  it('parses and normalizes the release reporter payload', () => {
    expect(normalizeReleaseReport({
      version: ' 2.4.0 ',
      commit: ' 621180b1234567890 ',
      deployer: ' codex ',
      deployedAt: '2026-08-22T20:00:00.000Z',
      status: 'live',
    })).toEqual({
      version: '2.4.0',
      commit: '621180b1234567890',
      deployer: 'codex',
      deployedAt: '2026-08-22T20:00:00.000Z',
      status: 'live',
    })
  })

  it('rejects malformed releases before any write', () => {
    expect(() => normalizeReleaseReport({ version: '', commit: 'not a sha', deployer: '', status: 'done' })).toThrow(/version/i)
  })

  it('moves the old live release to previous when a new live release arrives', () => {
    state.releases = [{ id: 'rel_old', version: '2.3.0', commit: '1111111', deployer: 'carl', deployedAt: '2026-08-21T20:00:00.000Z', status: 'live' }]

    const result = recordRelease({ version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live' })

    expect(result.created).toBe(true)
    expect(state.releases).toHaveLength(2)
    expect(state.releases.find(row => row.id === 'rel_old')?.status).toBe('previous')
    expect(state.releases[0]).toMatchObject({ id: 'rel_new', version: '2.4.0', commit: '2222222', status: 'live' })
  })

  it('is idempotent when a deploy hook retries the same release', () => {
    state.releases = [{ id: 'rel_existing', version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live' }]

    const result = recordRelease({ version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live' })

    expect(result).toMatchObject({ created: false, release: { id: 'rel_existing' } })
    expect(state.releases).toHaveLength(1)
  })
})
