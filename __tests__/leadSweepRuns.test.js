import { beforeEach, describe, expect, it, vi } from 'vitest'

// Synthetic only: no Apify keys, no network, no prod data. The run store is
// exercised against an in-memory stand-in for the sqlite-backed dataStore.
const store = vi.hoisted(() => ({
  data: {},
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => store.data[filename] ?? null),
  writeData: vi.fn((filename, value) => {
    store.data[filename] = JSON.parse(JSON.stringify(value))
  }),
  // Mirrors the JSON fallback in lib/dataStore: mutate a defensive clone, keep
  // the returned data, hand back the mutator's result.
  mutateData: vi.fn((filename, mutator) => {
    const current = store.data[filename] ? JSON.parse(JSON.stringify(store.data[filename])) : null
    const outcome = mutator(current)
    if (!outcome || typeof outcome !== 'object' || !Object.prototype.hasOwnProperty.call(outcome, 'data')) {
      throw new TypeError('mutator must return an object containing data')
    }
    store.data[filename] = JSON.parse(JSON.stringify(outcome.data))
    return outcome.result
  }),
}))

const FILE = 'lead-sweep-runs.json'
const THIRTY_ONE_MINUTES_MS = 31 * 60 * 1000

function storedRuns() {
  return store.data[FILE]?.runs || []
}

function ageRun(id, ms) {
  const run = storedRuns().find(entry => entry.id === id)
  run.updatedAt = new Date(Date.now() - ms).toISOString()
  return run
}

beforeEach(() => {
  vi.clearAllMocks()
  store.data = {}
})

describe('lead sweep run store', () => {
  it('creates a running run with an lsr_ id and echoes the params back', async () => {
    const { createSweepRun } = await import('@/lib/lead-sweep-runs')

    const params = { category: 'roofing', location: 'Asheville, NC', limit: 5, campaign: null }
    const run = createSweepRun({
      kind: 'vertical',
      params,
      startedBy: 'operator@example.test',
      stepsTotal: 5,
    })

    expect(run.id).toMatch(/^lsr_[a-z0-9]+$/)
    expect(run.status).toBe('running')
    expect(run.kind).toBe('vertical')
    expect(run.phase).toBe('starting')
    expect(run.step).toBe(0)
    expect(run.stepsTotal).toBe(5)
    expect(run.startedBy).toBe('operator@example.test')
    expect(run.params).toEqual(params)
    expect(run.result).toBeNull()
    expect(run.error).toBeNull()
    expect(run.finishedAt).toBeNull()

    // Persisted, newest-first, under the documented doc shape.
    expect(store.data[FILE]).toMatchObject({ runs: expect.any(Array) })
    expect(storedRuns()).toHaveLength(1)
    expect(storedRuns()[0].id).toBe(run.id)
    expect(store.data[FILE].lastUpdated).toBe(run.createdAt)
  })

  it('defaults kind, startedBy and stepsTotal when called bare', async () => {
    const { createSweepRun } = await import('@/lib/lead-sweep-runs')
    const run = createSweepRun()
    expect(run.kind).toBe('vertical')
    expect(run.startedBy).toBe('operator')
    expect(run.stepsTotal).toBe(4)
    expect(run.params).toEqual({})
  })

  it('reports progress into phase/step and bumps updatedAt', async () => {
    const { createSweepRun, reportSweepProgress, getSweepRun } = await import('@/lib/lead-sweep-runs')

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'))
      const run = createSweepRun({ kind: 'vertical', stepsTotal: 5 })
      expect(run.updatedAt).toBe('2026-08-04T12:00:00.000Z')

      vi.setSystemTime(new Date('2026-08-04T12:00:30.000Z'))
      const patched = reportSweepProgress(run.id, {
        phase: 'contacts',
        phaseLabel: 'Scraping contact details...',
        step: 2,
        stepsTotal: 5,
        note: 'contact actor running',
        ignoredKey: 'should not persist',
      })

      expect(patched.phase).toBe('contacts')
      expect(patched.phaseLabel).toBe('Scraping contact details...')
      expect(patched.step).toBe(2)
      expect(patched.note).toBe('contact actor running')
      expect(patched.ignoredKey).toBeUndefined()
      expect(patched.status).toBe('running')
      expect(new Date(patched.updatedAt).getTime()).toBeGreaterThan(new Date(run.createdAt).getTime())
      expect(patched.createdAt).toBe(run.createdAt)

      // And the change is readable back out of the store.
      const reread = getSweepRun(run.id)
      expect(reread.step).toBe(2)
      expect(reread.phase).toBe('contacts')
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns null for an empty progress update instead of writing', async () => {
    const { createSweepRun, reportSweepProgress } = await import('@/lib/lead-sweep-runs')
    const { mutateData } = await import('@/lib/dataStore')

    const run = createSweepRun({ kind: 'vertical' })
    const callsAfterCreate = mutateData.mock.calls.length

    expect(reportSweepProgress(run.id, {})).toBeNull()
    expect(reportSweepProgress(run.id, { nothingUseful: true })).toBeNull()
    expect(mutateData.mock.calls.length).toBe(callsAfterCreate)
  })

  it('finds the original run by client request id so a retried POST cannot duplicate it', async () => {
    const { createSweepRunOnce, getSweepRunByClientRequestId } = await import('@/lib/lead-sweep-runs')
    const first = createSweepRunOnce({
      kind: 'vertical',
      startedBy: 'operator@example.test',
      params: { clientRequestId: 'lead-click-123', category: 'computer-stores' },
    })
    const replay = createSweepRunOnce({
      kind: 'vertical',
      startedBy: 'operator@example.test',
      params: { clientRequestId: 'lead-click-123', category: 'computer-stores' },
    })

    expect(first.created).toBe(true)
    expect(replay.created).toBe(false)
    expect(replay.run.id).toBe(first.run.id)
    expect(storedRuns()).toHaveLength(1)
    expect(getSweepRunByClientRequestId('lead-click-123', { kind: 'vertical', startedBy: 'operator@example.test' })?.id).toBe(first.run.id)
    expect(getSweepRunByClientRequestId('lead-click-123', { startedBy: 'someone-else@example.test' })).toBeNull()
    expect(getSweepRunByClientRequestId('missing')).toBeNull()
    expect(getSweepRunByClientRequestId('')).toBeNull()
  })

  it('patching or reporting against an unknown id returns null and does not throw', async () => {
    const { createSweepRun, patchSweepRun, reportSweepProgress, finishSweepRun, getSweepRun } =
      await import('@/lib/lead-sweep-runs')

    createSweepRun({ kind: 'vertical' })

    expect(() => patchSweepRun('lsr_does_not_exist', { phase: 'contacts' })).not.toThrow()
    expect(patchSweepRun('lsr_does_not_exist', { phase: 'contacts' })).toBeNull()
    expect(reportSweepProgress('lsr_does_not_exist', { phase: 'contacts', step: 3 })).toBeNull()
    expect(finishSweepRun('lsr_does_not_exist', { status: 'completed', result: { leads: [] } })).toBeNull()
    expect(getSweepRun('lsr_does_not_exist')).toBeNull()
    expect(getSweepRun(null)).toBeNull()

    // The real run was left alone.
    expect(storedRuns()).toHaveLength(1)
    expect(storedRuns()[0].status).toBe('running')
  })

  it('finishes a run with status, result and finishedAt', async () => {
    const { createSweepRun, finishSweepRun, getSweepRun } = await import('@/lib/lead-sweep-runs')

    const run = createSweepRun({ kind: 'vertical', stepsTotal: 5 })
    const result = { created: 3, skipped: 1, leadIds: ['lead_a', 'lead_b', 'lead_c'] }
    const finished = finishSweepRun(run.id, { status: 'completed', result })

    expect(finished.status).toBe('completed')
    expect(finished.result).toEqual(result)
    expect(finished.error).toBeNull()
    expect(finished.phase).toBe('done')
    expect(finished.phaseLabel).toBe('Finished')
    expect(finished.finishedAt).toEqual(expect.any(String))
    expect(Number.isNaN(new Date(finished.finishedAt).getTime())).toBe(false)
    expect(getSweepRun(run.id).status).toBe('completed')
  })

  it('finishes a failed run with the error message and a Failed label', async () => {
    const { createSweepRun, finishSweepRun } = await import('@/lib/lead-sweep-runs')

    const run = createSweepRun({ kind: 'vertical' })
    const failed = finishSweepRun(run.id, { status: 'failed', error: 'Apify actor timed out' })

    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('Apify actor timed out')
    expect(failed.result).toBeNull()
    expect(failed.phase).toBe('failed')
    expect(failed.phaseLabel).toBe('Failed')
    expect(failed.finishedAt).toEqual(expect.any(String))
  })

  it('caps retention at 50 finished runs, keeping the newest first', async () => {
    const { createSweepRun, finishSweepRun } = await import('@/lib/lead-sweep-runs')

    const created = []
    for (let i = 0; i < 55; i += 1) {
      const run = createSweepRun({ kind: 'vertical', params: { seq: i } })
      created.push(run)
      // Only finished runs are eligible for eviction.
      finishSweepRun(run.id, { status: 'completed', result: { created: 0 } })
    }

    // Trimming happens at create time, and the run being created is still in
    // flight at that instant, so it is exempt from the cap: 50 finished + it.
    const runs = storedRuns()
    expect(runs).toHaveLength(51)
    expect(runs[0].id).toBe(created[54].id)
    expect(runs[0].params.seq).toBe(54)
    expect(runs.map(entry => entry.params.seq)).toEqual(
      Array.from({ length: 51 }, (_, i) => 54 - i)
    )

    const keptIds = new Set(runs.map(entry => entry.id))
    for (const dropped of created.slice(0, 4)) {
      expect(keptIds.has(dropped.id)).toBe(false)
    }
  })

  it('never evicts a run that is still in flight', async () => {
    const { createSweepRun, finishSweepRun, getSweepRun } = await import('@/lib/lead-sweep-runs')

    // A long sweep has to survive a burst of shorter ones started after it.
    // If the cap evicted it, its poller would 404 and the result of work that
    // actually ran would be lost -- the exact failure this rewrite prevents.
    const inFlight = createSweepRun({ kind: 'vertical', params: { seq: 'long' } })
    for (let i = 0; i < 60; i += 1) {
      const run = createSweepRun({ kind: 'vertical', params: { seq: i } })
      finishSweepRun(run.id, { status: 'completed', result: {} })
    }

    const survivor = getSweepRun(inFlight.id)
    expect(survivor).not.toBeNull()
    expect(survivor.status).toBe('running')
  })

  it('surfaces a silent running run as failed + stale without rewriting it', async () => {
    const { createSweepRun, getSweepRun } = await import('@/lib/lead-sweep-runs')
    const { mutateData } = await import('@/lib/dataStore')

    const run = createSweepRun({ kind: 'vertical' })
    ageRun(run.id, THIRTY_ONE_MINUTES_MS)
    const writesBeforeRead = mutateData.mock.calls.length

    const read = getSweepRun(run.id)
    expect(read.status).toBe('failed')
    expect(read.stale).toBe(true)
    expect(read.error).toContain('stopped reporting')

    // Staleness is a computed view: the stored record is untouched and the read
    // performed no write.
    expect(storedRuns()[0].status).toBe('running')
    expect(storedRuns()[0].stale).toBeUndefined()
    expect(mutateData.mock.calls.length).toBe(writesBeforeRead)

    // listSweepRuns applies the same view.
    const { listSweepRuns } = await import('@/lib/lead-sweep-runs')
    expect(listSweepRuns({ limit: 10 })[0]).toMatchObject({ status: 'failed', stale: true })
  })

  it('leaves an old completed run alone — terminal runs never go stale', async () => {
    const { createSweepRun, finishSweepRun, getSweepRun } = await import('@/lib/lead-sweep-runs')

    const run = createSweepRun({ kind: 'vertical' })
    finishSweepRun(run.id, { status: 'completed', result: { created: 2 } })
    ageRun(run.id, THIRTY_ONE_MINUTES_MS)

    const read = getSweepRun(run.id)
    expect(read.status).toBe('completed')
    expect(read.stale).toBeUndefined()
    expect(read.result).toEqual({ created: 2 })
    expect(storedRuns()[0].status).toBe('completed')
  })

  it('does not mark a run stale before the 30 minute window', async () => {
    const { createSweepRun, getSweepRun } = await import('@/lib/lead-sweep-runs')

    const run = createSweepRun({ kind: 'vertical' })
    ageRun(run.id, 29 * 60 * 1000)

    const read = getSweepRun(run.id)
    expect(read.status).toBe('running')
    expect(read.stale).toBeUndefined()
  })

  it('lists runs newest-first, filtered by kind and capped by limit', async () => {
    const { createSweepRun, listSweepRuns } = await import('@/lib/lead-sweep-runs')

    const verticalA = createSweepRun({ kind: 'vertical', params: { tag: 'v1' } })
    const orgA = createSweepRun({ kind: 'organization', params: { tag: 'o1' } })
    const verticalB = createSweepRun({ kind: 'vertical', params: { tag: 'v2' } })
    const orgB = createSweepRun({ kind: 'organization', params: { tag: 'o2' } })

    expect(listSweepRuns().map(r => r.id)).toEqual([orgB.id, verticalB.id, orgA.id, verticalA.id])
    expect(listSweepRuns({ kind: 'vertical' }).map(r => r.id)).toEqual([verticalB.id, verticalA.id])
    expect(listSweepRuns({ kind: 'organization' }).map(r => r.id)).toEqual([orgB.id, orgA.id])
    expect(listSweepRuns({ kind: 'nope' })).toEqual([])

    // limit is applied after the kind filter.
    expect(listSweepRuns({ limit: 2 }).map(r => r.id)).toEqual([orgB.id, verticalB.id])
    expect(listSweepRuns({ limit: 1, kind: 'vertical' }).map(r => r.id)).toEqual([verticalB.id])
  })

  it('exposes the terminal status helpers', async () => {
    const { isTerminal, TERMINAL_STATUSES } = await import('@/lib/lead-sweep-runs')
    expect(TERMINAL_STATUSES).toEqual(['completed', 'failed', 'cancelled'])
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('running')).toBe(false)
  })

  it('generates unique run ids', async () => {
    const { genSweepRunId } = await import('@/lib/lead-sweep-runs')
    const ids = new Set(Array.from({ length: 200 }, () => genSweepRunId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^lsr_[a-z0-9]+$/)
  })
})
