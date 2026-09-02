import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: { annotations: [] } }))
vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(() => state.data),
  writeData: vi.fn((_file, data) => { state.data = data }),
}))

import { deleteReleaseAnnotation, getReleaseAnnotation, saveReleaseAnnotation } from '../lib/release-annotations'

describe('Ship Desk release annotations', () => {
  beforeEach(() => { state.data = { annotations: [] } })

  it('creates, updates, reads, and deletes notes without changing release facts', () => {
    const created = saveReleaseAnnotation({ platformId: 'fcc', releaseId: 'rel_1', notes: 'Verified live.' }, '2026-08-23T12:00:00.000Z')
    expect(created).toMatchObject({ platformId: 'fcc', releaseId: 'rel_1', notes: 'Verified live.' })
    expect(getReleaseAnnotation('fcc', 'rel_1')).toEqual(created)

    const updated = saveReleaseAnnotation({ platformId: 'fcc', releaseId: 'rel_1', notes: 'Verified live and checked voice.' }, '2026-08-23T12:05:00.000Z')
    expect(updated).toMatchObject({ notes: 'Verified live and checked voice.', createdAt: '2026-08-23T12:00:00.000Z', updatedAt: '2026-08-23T12:05:00.000Z' })
    expect(state.data.annotations).toHaveLength(1)

    expect(deleteReleaseAnnotation({ platformId: 'fcc', releaseId: 'rel_1' }).deleted).toBe(true)
    expect(getReleaseAnnotation('fcc', 'rel_1')).toBeNull()
  })
})
