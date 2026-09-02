import { beforeEach, describe, expect, it, vi } from 'vitest'

// Synthetic only: the Apify sweep is mocked with a promise this file controls,
// so no keys, no network, no prod data.
const store = vi.hoisted(() => ({
  data: {},
}))

const auth = vi.hoisted(() => ({
  user: { id: 'usr_test', email: 'redacted@example.invalid', role: 'owner' },
  writeDenied: false,
  readDenied: false,
}))

const mocks = vi.hoisted(() => ({
  runFarringtonLeadSweep: vi.fn(),
  listFarringtonLeadVerticals: vi.fn(() => [
    {
      id: 'roofing',
      rank: 1,
      label: 'Roofing',
      serviceLine: 'getfound3',
      offer: 'Local visibility rebuild',
      caveat: 'Seasonal',
      leadWith: 'Storm season backlog',
      internalOnly: 'should not be exposed',
    },
  ]),
}))

function denied(message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

vi.mock('@/lib/permissions', () => ({
  requireCrmWrite: vi.fn(async () =>
    auth.writeDenied ? { user: null, error: denied('permission denied') } : { user: auth.user, error: null }
  ),
  requireCrmRead: vi.fn(async () =>
    auth.readDenied ? { user: null, error: denied('permission denied') } : { user: auth.user, error: null }
  ),
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => store.data[filename] ?? null),
  writeData: vi.fn((filename, value) => {
    store.data[filename] = JSON.parse(JSON.stringify(value))
  }),
  mutateData: vi.fn((filename, mutator) => {
    const current = store.data[filename] ? JSON.parse(JSON.stringify(store.data[filename])) : null
    const outcome = mutator(current)
    store.data[filename] = JSON.parse(JSON.stringify(outcome.data))
    return outcome.result
  }),
}))

// The sweep engine must never reach Apify in unit tests.
vi.mock('@/lib/apify-farrington-lead-sweep', () => ({
  runFarringtonLeadSweep: mocks.runFarringtonLeadSweep,
  listFarringtonLeadVerticals: mocks.listFarringtonLeadVerticals,
}))

const FILE = 'lead-sweep-runs.json'

function storedRuns() {
  return store.data[FILE]?.runs || []
}

function storedRun(id) {
  return storedRuns().find(entry => entry.id === id)
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function sweepRequest(body) {
  return new Request('https://openocti.local/api/leads/farrington-sweep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function runsRequest(query = '') {
  return new Request(`https://openocti.local/api/leads/sweep-runs${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  store.data = {}
  auth.writeDenied = false
  auth.readDenied = false
  mocks.runFarringtonLeadSweep.mockImplementation(async () => ({ created: 0, leads: [] }))
  mocks.listFarringtonLeadVerticals.mockImplementation(() => [
    {
      id: 'roofing',
      rank: 1,
      label: 'Roofing',
      serviceLine: 'getfound3',
      offer: 'Local visibility rebuild',
      caveat: 'Seasonal',
      leadWith: 'Storm season backlog',
      internalOnly: 'should not be exposed',
    },
  ])
})

describe('POST /api/leads/farrington-sweep', () => {
  it('rejects a caller without crm:write and never starts a run', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')
    auth.writeDenied = true

    const response = await POST(sweepRequest({ category: 'roofing' }))

    expect(response.status).toBe(403)
    expect(mocks.runFarringtonLeadSweep).not.toHaveBeenCalled()
    expect(storedRuns()).toHaveLength(0)
  })

  it('returns 400 when no category is supplied', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const response = await POST(sweepRequest({ location: 'Asheville, NC', limit: 5 }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({ ok: false, error: 'Category is required' })
    expect(mocks.runFarringtonLeadSweep).not.toHaveBeenCalled()
    expect(storedRuns()).toHaveLength(0)
  })

  it('returns 400 on a malformed JSON body', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const response = await POST(sweepRequest('{not json'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid JSON')
    expect(mocks.runFarringtonLeadSweep).not.toHaveBeenCalled()
  })

  it('answers 202 with a running run BEFORE the sweep finishes', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const pending = deferred()
    let sweepSettled = false
    pending.promise.then(
      () => {
        sweepSettled = true
      },
      () => {
        sweepSettled = true
      }
    )
    mocks.runFarringtonLeadSweep.mockImplementation(() => pending.promise)

    const response = await POST(
      sweepRequest({ category: 'roofing', location: 'Asheville, NC', limit: 5, campaign: 'aug-push' })
    )
    const body = await response.json()

    // The whole point of the rewrite: the HTTP response is already back while
    // the sweep promise is still pending, so Cloudflare's 100s cap can't bite.
    expect(sweepSettled).toBe(false)
    expect(response.status).toBe(202)
    expect(body.ok).toBe(true)
    expect(body.run.id).toMatch(/^lsr_/)
    expect(body.run.status).toBe('running')
    expect(body.run.kind).toBe('vertical')
    expect(body.run.stepsTotal).toBe(5)
    expect(body.run.startedBy).toBe('redacted@example.invalid')
    expect(body.run.params).toEqual({
      category: 'roofing',
      location: 'Asheville, NC',
      limit: 5,
      campaign: 'aug-push',
      provider: 'apify',
      maxPaidBatches: 1,
      clientRequestId: null,
      // Replay metadata for "Run again". This request sent no form state, so
      // it persists as null rather than being absent.
      form: null,
    })
    expect(body.run.finishedAt).toBeNull()

    // The engine got the assembled data source, not the raw body.
    expect(mocks.runFarringtonLeadSweep).toHaveBeenCalledTimes(1)
    const [automation, options] = mocks.runFarringtonLeadSweep.mock.calls[0]
    expect(automation.dataSource).toMatchObject({
      category: 'roofing',
      verticalId: 'roofing',
      location: 'Asheville, NC',
      limit: 5,
    })
    expect(typeof options.onProgress).toBe('function')

    // onProgress is wired straight into the run record.
    options.onProgress({ phase: 'places', phaseLabel: 'Searching places...', step: 1 })
    expect(storedRun(body.run.id)).toMatchObject({ phase: 'places', step: 1, status: 'running' })

    pending.resolve({ created: 1, leads: [{ id: 'lead_x' }] })
    await vi.waitFor(() => expect(sweepSettled).toBe(true))
  })

  it('replays the original run for a repeated client request id without starting another vendor job', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')
    const pending = deferred()
    mocks.runFarringtonLeadSweep.mockImplementation(() => pending.promise)
    const payload = {
      category: 'roofing',
      location: 'Asheville, NC',
      clientRequestId: 'lead-click-safe-123',
      vendor: { provider: 'apollo', maxPaidBatches: 99 },
    }

    const firstResponse = await POST(sweepRequest(payload))
    const first = await firstResponse.json()
    const replayResponse = await POST(sweepRequest(payload))
    const replay = await replayResponse.json()

    expect(firstResponse.status).toBe(202)
    expect(replayResponse.status).toBe(200)
    expect(replay.replayed).toBe(true)
    expect(replay.run.id).toBe(first.run.id)
    expect(first.run.params).toMatchObject({
      clientRequestId: 'lead-click-safe-123',
      provider: 'apollo',
      maxPaidBatches: 6,
    })
    expect(mocks.runFarringtonLeadSweep.mock.calls[0][0].dataSource.vendor).toMatchObject({
      provider: 'apollo',
      maxPaidBatches: 6,
    })
    expect(mocks.runFarringtonLeadSweep).toHaveBeenCalledTimes(1)
    expect(storedRuns()).toHaveLength(1)

    pending.resolve({ created: 1, returned: 1, leads: [{ id: 'lead_x' }] })
  })

  it('defaults location and limit when the body omits them', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const response = await POST(sweepRequest({ verticalId: 'roofing' }))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body.run.params).toMatchObject({ category: 'roofing', location: 'United States', limit: 10, campaign: null })
    const [automation] = mocks.runFarringtonLeadSweep.mock.calls[0]
    expect(automation.dataSource.location).toBe('United States')
    expect(automation.dataSource.limit).toBe(10)
    expect(automation.delivery.recipients).toEqual([])
  })

  it('drives the run record to completed with the sweep result', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const pending = deferred()
    mocks.runFarringtonLeadSweep.mockImplementation(() => pending.promise)

    const body = await (await POST(sweepRequest({ category: 'roofing', limit: 3 }))).json()
    expect(body.run.status).toBe('running')

    const result = { created: 3, skipped: 1, leadIds: ['lead_a', 'lead_b', 'lead_c'] }
    pending.resolve(result)

    await vi.waitFor(() => expect(storedRun(body.run.id).status).toBe('completed'))
    const finished = storedRun(body.run.id)
    expect(finished.result).toEqual(result)
    expect(finished.error).toBeNull()
    expect(finished.phase).toBe('done')
    expect(finished.finishedAt).toEqual(expect.any(String))
  })

  it('drives the run record to failed with the error message when the sweep throws', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const pending = deferred()
    mocks.runFarringtonLeadSweep.mockImplementation(() => pending.promise)

    const body = await (await POST(sweepRequest({ category: 'roofing' }))).json()
    expect(body.run.status).toBe('running')

    pending.reject(new Error('Apify actor run failed: 402 payment required'))

    await vi.waitFor(() => expect(storedRun(body.run.id).status).toBe('failed'))
    const failed = storedRun(body.run.id)
    expect(failed.error).toBe('Apify actor run failed: 402 payment required')
    expect(failed.result).toBeNull()
    expect(failed.phaseLabel).toBe('Failed')
    expect(failed.finishedAt).toEqual(expect.any(String))
  })

  it('records a fallback message when the sweep rejects without one', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const pending = deferred()
    mocks.runFarringtonLeadSweep.mockImplementation(() => pending.promise)
    const body = await (await POST(sweepRequest({ category: 'roofing' }))).json()

    pending.reject(new Error(''))

    await vi.waitFor(() => expect(storedRun(body.run.id).status).toBe('failed'))
    expect(storedRun(body.run.id).error).toBe('Lead sweep failed')
  })
})

// `params.form` is replay metadata for Leads Lab's "Run again": the operator's
// form state, stored verbatim so a past run can repopulate the form. The
// pipeline must never read it, so these tests pin both halves of that contract
// — it survives the round trip intact, and it never reaches the engine.
describe('POST /api/leads/farrington-sweep — form replay metadata', () => {
  const richForm = {
    category: 'roofing',
    location: 'Asheville, NC',
    limit: 5,
    campaign: 'aug-push',
    recipientEmail: 'redacted@example.invalid',
    notes: '',
    scheduledFor: null,
    dryRun: false,
    tags: ['storm', 'insurance'],
    emptyList: [],
    advanced: {
      radiusMiles: 25,
      includeChains: false,
      minRating: 4.2,
      excludedDomains: ['example.com'],
      nested: { deep: { value: 'kept' } },
    },
  }

  it('stores an object form verbatim — every field, nested value and order kept', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const body = await (await POST(sweepRequest({ category: 'roofing', form: richForm }))).json()

    expect(body.run.params.form).toEqual(richForm)
    // toEqual is order-insensitive; serialising pins field order and proves no
    // key was silently added or dropped on the way through the store.
    expect(JSON.stringify(body.run.params.form)).toBe(JSON.stringify(richForm))
    expect(Object.keys(body.run.params.form)).toEqual(Object.keys(richForm))
    expect(body.run.params.form.advanced.nested.deep.value).toBe('kept')

    // Same for the persisted record, not just the response echo.
    expect(storedRun(body.run.id).params.form).toEqual(richForm)

    // The form does not displace the real params.
    expect(body.run.params).toMatchObject({ category: 'roofing', location: 'United States', limit: 10 })
  })

  it('persists an empty object form as an empty object, not null', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const body = await (await POST(sweepRequest({ category: 'roofing', form: {} }))).json()

    expect(body.run.params.form).toEqual({})
    expect(body.run.params.form).not.toBeNull()
  })

  it('rejects a non-object form to null', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    for (const form of ['roofing', '', 42, 0, true, false, null]) {
      const body = await (await POST(sweepRequest({ category: 'roofing', form }))).json()
      expect(body.run.params.form, `form: ${JSON.stringify(form)}`).toBeNull()
      expect(storedRun(body.run.id).params.form).toBeNull()
    }
  })

  // An array is `typeof 'object'`, so the guard explicitly excludes it. Without
  // that check "Run again" would hand the Leads Lab form an array where it
  // expects a field map, and the break would surface in the UI, not the API.
  it('rejects an array form to null rather than storing it', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const body = await (await POST(sweepRequest({ category: 'roofing', form: ['roofing', 5] }))).json()

    expect(body.run.params.form).toBeNull()
    expect(storedRun(body.run.id).params.form).toBeNull()

    const emptyBody = await (await POST(sweepRequest({ category: 'roofing', form: [] }))).json()
    expect(emptyBody.run.params.form).toBeNull()
    expect(storedRun(emptyBody.run.id).params.form).toBeNull()
  })

  it('never hands the form payload to the sweep engine', async () => {
    const { POST } = await import('@/app/api/leads/farrington-sweep/route')

    const sentinel = 'FORM_ONLY_SENTINEL_9f3a'
    const form = { ...richForm, marker: sentinel, advanced: { ...richForm.advanced, marker: sentinel } }

    const body = await (await POST(sweepRequest({ category: 'roofing', location: 'Asheville, NC', form }))).json()
    expect(body.run.params.form.marker).toBe(sentinel)

    expect(mocks.runFarringtonLeadSweep).toHaveBeenCalledTimes(1)
    const [automation, options] = mocks.runFarringtonLeadSweep.mock.calls[0]

    expect(automation.form).toBeUndefined()
    expect(automation.dataSource.form).toBeUndefined()
    expect(options.form).toBeUndefined()
    expect(Object.keys(automation).sort()).toEqual(['dataSource', 'delivery'])
    expect(Object.keys(automation.dataSource).sort()).toEqual([
      'campaign',
      'category',
      // The Leads Lab list picker (body.leadListId, falling back to
      // form.selectedLeadListId) — the one form-derived VALUE the pipeline
      // reads; the form OBJECT itself still never reaches the engine.
      'leadListId',
      'limit',
      'location',
      'query',
      'spec',
      // Per-run lead vendor choice (apify/Places vs apollo/people), normalized
      // so the run record and engine share the same paid-search ceiling.
      'vendor',
      'verticalId',
    ])
    expect(automation.dataSource.vendor).toEqual({ provider: 'apify', maxPaidBatches: 1 })
    expect(Object.keys(options).sort()).toEqual(['onProgress', 'recipientEmail'])

    // Nothing anywhere in what the engine received carries the form payload,
    // at any depth.
    expect(JSON.stringify({ automation, options })).not.toContain(sentinel)
  })
})

describe('GET /api/leads/farrington-sweep', () => {
  it('returns the vertical catalogue without internal fields', async () => {
    const { GET } = await import('@/app/api/leads/farrington-sweep/route')

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.verticals).toHaveLength(1)
    expect(body.verticals[0]).toEqual({
      id: 'roofing',
      rank: 1,
      label: 'Roofing',
      serviceLine: 'getfound3',
      offer: 'Local visibility rebuild',
      caveat: 'Seasonal',
      leadWith: 'Storm season backlog',
    })
  })
})

describe('GET /api/leads/sweep-runs', () => {
  it('returns 404 for an unknown run id', async () => {
    const { GET } = await import('@/app/api/leads/sweep-runs/route')

    const response = await GET(runsRequest('?id=lsr_does_not_exist'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toMatchObject({ ok: false, error: 'Run not found' })
  })

  it('returns a single run by id and the list without one', async () => {
    const sweep = await import('@/app/api/leads/farrington-sweep/route')
    const runs = await import('@/app/api/leads/sweep-runs/route')

    const started = await (await sweep.POST(sweepRequest({ category: 'roofing' }))).json()

    const single = await (await runs.GET(runsRequest(`?id=${started.run.id}`))).json()
    expect(single.ok).toBe(true)
    expect(single.run.id).toBe(started.run.id)

    const listed = await (await runs.GET(runsRequest('?kind=vertical&limit=5'))).json()
    expect(listed.ok).toBe(true)
    expect(listed.runs.map(r => r.id)).toContain(started.run.id)

    const otherKind = await (await runs.GET(runsRequest('?kind=organization'))).json()
    expect(otherKind.runs).toEqual([])
  })

  it('rejects a caller without crm:read', async () => {
    const { GET } = await import('@/app/api/leads/sweep-runs/route')
    auth.readDenied = true

    const response = await GET(runsRequest('?id=lsr_anything'))
    expect(response.status).toBe(403)
  })
})
