import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ rows: [] }))
vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(() => state.rows),
  saveAll: vi.fn((_type, rows) => { state.rows = rows }),
  genId: vi.fn(() => 'rs_1'),
}))

import { getReleaseSummary, saveReleaseSummary } from '../lib/release-summaries'

describe('Orca release summary cache', () => {
  beforeEach(() => { state.rows = [] })

  it('caches one Orca result per platform release id', () => {
    const saved = saveReleaseSummary({ platformId: 'getfound3', releaseId: 'rel_live', previousReleaseId: 'rel_old', summary: 'Two guarded changes.', runId: 'orca_1' })
    expect(saved).toMatchObject({ id: 'rs_1', releaseId: 'rel_live', summary: 'Two guarded changes.' })
    expect(getReleaseSummary('getfound3', 'rel_live')).toEqual(saved)

    saveReleaseSummary({ platformId: 'getfound3', releaseId: 'rel_live', previousReleaseId: 'rel_old', summary: 'Updated summary.', runId: 'orca_2' })
    expect(state.rows).toHaveLength(1)
    expect(getReleaseSummary('getfound3', 'rel_live')).toMatchObject({ summary: 'Updated summary.', runId: 'orca_2' })
  })
})
