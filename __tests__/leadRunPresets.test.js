import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

// Synthetic fixtures only: no network, no credentials, no prod data. Permissions
// are mocked at the gate; the real entityStore runs on top of an in-memory
// dataStore so the ownership rules are exercised against real CRUD semantics.
const state = vi.hoisted(() => ({
  data: {},
  user: null,
  readError: null,
  writeError: null,
}))

vi.mock('@/lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => (
    state.readError ? { user: null, error: state.readError } : { user: state.user, error: null }
  )),
  requireCrmWrite: vi.fn(async () => (
    state.writeError ? { user: null, error: state.writeError } : { user: state.user, error: null }
  )),
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => (state.data[filename] ? structuredClone(state.data[filename]) : null)),
  writeData: vi.fn((filename, value) => { state.data[filename] = structuredClone(value) }),
}))

import { GET, POST } from '@/app/api/lead-run-presets/route'

const FILE = 'lead-run-presets.json'
const ALICE = { id: 'usr_alice', username: 'alice', email: 'redacted@example.invalid' }
const BOB = { id: 'usr_bob', username: 'bob', email: 'redacted@example.invalid' }

function stored() {
  return state.data[FILE]?.leadRunPresets || []
}

function seed(records) {
  state.data[FILE] = { lastUpdated: '2026-08-01T00:00:00.000Z', leadRunPresets: records }
}

function preset(id, overrides = {}) {
  return {
    id,
    ownerUserId: ALICE.id,
    slot: 'named',
    name: id,
    config: { mode: 'vertical', category: 'roofing' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function getRequest() {
  return new Request('https://openocti.local/api/lead-run-presets')
}

function postRequest(body) {
  return new Request('https://openocti.local/api/lead-run-presets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function get() {
  const response = await GET(getRequest())
  return { response, body: await response.json() }
}

async function post(payload) {
  const response = await POST(postRequest(payload))
  return { response, body: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.data = {}
  state.user = ALICE
  state.readError = null
  state.writeError = null
})

describe('lead run presets route — reading', () => {
  it('returns only the caller\'s own saved setups', async () => {
    seed([
      preset('lrp_alice_1', { name: 'Asheville roofers' }),
      preset('lrp_bob_1', { ownerUserId: BOB.id, name: 'Bob private sweep' }),
      preset('lrp_bob_2', { ownerUserId: BOB.id, name: 'Bob other sweep' }),
      preset('lrp_alice_2', { name: 'Boone contractors' }),
    ])

    const { response, body } = await get()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.leadRunPresets).toHaveLength(2)
    const ids = body.leadRunPresets.map(record => record.id)
    expect(ids).toEqual(['lrp_alice_1', 'lrp_alice_2'])
    // The privacy guarantee, stated plainly: nothing of Bob's leaks into Alice's list.
    expect(ids).not.toContain('lrp_bob_1')
    expect(ids).not.toContain('lrp_bob_2')
    expect(JSON.stringify(body)).not.toContain('Bob private sweep')
  })

  it('splits the slot:last record into lastUsed and sorts the named list by name', async () => {
    seed([
      preset('lrp_c', { name: 'Charlie' }),
      preset('lrp_a', { name: 'Alpha' }),
      preset('lrp_last', {
        slot: 'last',
        name: '',
        config: { mode: 'organization', category: 'hvac', count: 25 },
      }),
      preset('lrp_b', { name: 'Bravo' }),
      // Another operator's "last" must not become Alice's lastUsed.
      preset('lrp_bob_last', { ownerUserId: BOB.id, slot: 'last', name: '', config: { mode: 'bob-only' } }),
    ])

    const { body } = await get()

    expect(body.leadRunPresets.map(record => record.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(body.leadRunPresets.map(record => record.id)).not.toContain('lrp_last')
    expect(body.lastUsed).toEqual({ mode: 'organization', category: 'hvac', count: 25 })
  })

  it('answers with an empty list and a null lastUsed when the operator has nothing saved', async () => {
    seed([preset('lrp_bob_1', { ownerUserId: BOB.id })])

    const { body } = await get()

    expect(body).toEqual({ ok: true, leadRunPresets: [], lastUsed: null })
  })
})

describe('lead run presets route — save', () => {
  it('creates a named setup, then updates it in place when saved again under the same name in different case', async () => {
    const created = await post({
      action: 'save',
      name: 'Roofing sweep',
      config: { mode: 'vertical', category: 'roofing', count: 10 },
    })

    expect(created.response.status).toBe(200)
    expect(created.body.ok).toBe(true)
    expect(created.body.updated).toBeUndefined()
    expect(stored()).toHaveLength(1)
    const originalId = created.body.leadRunPreset.id
    expect(originalId).toMatch(/^lrp_/)

    const updated = await post({
      action: 'save',
      name: 'ROOFING SWEEP',
      config: { mode: 'vertical', category: 'gutters', count: 25 },
    })

    expect(updated.response.status).toBe(200)
    expect(updated.body.updated).toBe(true)
    expect(updated.body.leadRunPreset.id).toBe(originalId)
    // Upsert, not duplicate: still exactly one record.
    expect(stored()).toHaveLength(1)
    expect(stored()[0].name).toBe('ROOFING SWEEP')
    expect(stored()[0].config).toEqual({ mode: 'vertical', category: 'gutters', count: 25 })
    expect(stored()[0].ownerUserId).toBe(ALICE.id)
    expect(stored()[0].slot).toBe('named')
  })

  it('treats "update" as an alias for save and targets by id when one is supplied', async () => {
    seed([preset('lrp_alice_1', { name: 'Original name' })])

    const { response, body } = await post({
      action: 'update',
      id: 'lrp_alice_1',
      name: 'Renamed setup',
      config: { mode: 'organization', location: 'Asheville, NC' },
    })

    expect(response.status).toBe(200)
    expect(body.updated).toBe(true)
    expect(stored()).toHaveLength(1)
    expect(stored()[0].id).toBe('lrp_alice_1')
    expect(stored()[0].name).toBe('Renamed setup')
  })

  it('still updates in place and reports updated when the id is one the caller owns', async () => {
    seed([
      preset('lrp_alice_1', { name: 'Owned setup', config: { mode: 'vertical', category: 'roofing' } }),
      preset('lrp_alice_2', { name: 'Other setup' }),
    ])

    const { response, body } = await post({
      action: 'save',
      id: 'lrp_alice_1',
      name: 'Owned setup',
      config: { mode: 'organization', category: 'hvac', count: 30 },
    })

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(true)
    expect(body.leadRunPreset.id).toBe('lrp_alice_1')
    // In place: no new record, and the sibling is untouched.
    expect(stored()).toHaveLength(2)
    expect(stored().find(record => record.id === 'lrp_alice_1').config)
      .toEqual({ mode: 'organization', category: 'hvac', count: 30 })
    expect(stored().find(record => record.id === 'lrp_alice_2').name).toBe('Other setup')
  })

  it('returns 404 and creates nothing when the supplied id matches nothing the caller owns', async () => {
    // The stale-tab case: the operator's selected preset was deleted elsewhere.
    seed([preset('lrp_alice_1', { name: 'Still here' })])

    const { response, body } = await post({
      action: 'save',
      id: 'lrp_deleted_in_another_tab',
      name: 'Stale selection',
      config: { mode: 'vertical', category: 'roofing' },
    })

    expect(response.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Saved setup not found')
    // No silent duplicate: the store is exactly as it was.
    expect(stored()).toHaveLength(1)
    expect(stored().map(record => record.name)).toEqual(['Still here'])
    expect(stored().some(record => record.name === 'Stale selection')).toBe(false)
  })

  it('returns 404 for a save whose id belongs to a different operator, touching nothing', async () => {
    seed([
      preset('lrp_bob_1', {
        ownerUserId: BOB.id,
        name: 'Bob private sweep',
        config: { mode: 'vertical', category: 'bob-only' },
      }),
      preset('lrp_alice_1', { name: 'Alice setup' }),
    ])

    const { response, body } = await post({
      action: 'save',
      id: 'lrp_bob_1',
      name: 'Hijack attempt',
      config: { mode: 'organization', category: 'stolen' },
    })

    expect(response.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Saved setup not found')

    // Bob's record is byte-for-byte what it was: not renamed, not reconfigured,
    // not reassigned.
    const bobRecord = stored().find(record => record.id === 'lrp_bob_1')
    expect(bobRecord.ownerUserId).toBe(BOB.id)
    expect(bobRecord.name).toBe('Bob private sweep')
    expect(bobRecord.config).toEqual({ mode: 'vertical', category: 'bob-only' })

    // And nothing was minted for the caller off the back of Bob's id.
    expect(stored()).toHaveLength(2)
    expect(stored().filter(record => record.ownerUserId === ALICE.id)).toHaveLength(1)
    expect(stored().some(record => record.name === 'Hijack attempt')).toBe(false)
  })

  it('still creates normally when no id is supplied, so the id guard cannot over-fire', async () => {
    seed([preset('lrp_alice_1', { name: 'Existing setup' })])

    const { response, body } = await post({
      action: 'save',
      name: 'Brand new setup',
      config: { mode: 'vertical', category: 'plumbing' },
    })

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.updated).toBeUndefined()
    expect(body.leadRunPreset.name).toBe('Brand new setup')
    expect(stored()).toHaveLength(2)
    expect(stored().some(record => record.name === 'Brand new setup')).toBe(true)

    // Falsy ids ('' / null) are treated as "no id supplied", not as a miss.
    const emptyId = await post({
      action: 'save',
      id: '',
      name: 'Another new setup',
      config: { mode: 'vertical', category: 'hvac' },
    })
    expect(emptyId.response.status).toBe(200)
    expect(stored()).toHaveLength(3)
  })

  it('rejects a save with no name', async () => {
    const { response, body } = await post({ action: 'save', config: { mode: 'vertical' } })

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/name/i)
    expect(stored()).toHaveLength(0)
  })

  it('rejects a save with no config', async () => {
    const missing = await post({ action: 'save', name: 'Nameless config' })
    expect(missing.response.status).toBe(400)
    expect(missing.body.error).toMatch(/nothing to save/i)

    const empty = await post({ action: 'save', name: 'Nameless config', config: {} })
    expect(empty.response.status).toBe(400)

    const junkOnly = await post({ action: 'save', name: 'Nameless config', config: { evilField: 'x' } })
    expect(junkOnly.response.status).toBe(400)

    expect(stored()).toHaveLength(0)
  })

  it('refuses to create the 41st named setup for one operator', async () => {
    const forty = Array.from({ length: 40 }, (_, index) => preset(`lrp_alice_${index}`, {
      name: `Setup ${String(index).padStart(2, '0')}`,
    }))
    // Bob's presets and Alice's own lastUsed slot must not count against the cap.
    seed([
      ...forty,
      preset('lrp_alice_last', { slot: 'last', name: '' }),
      preset('lrp_bob_1', { ownerUserId: BOB.id, name: 'Bob setup' }),
    ])

    const { response, body } = await post({
      action: 'save',
      name: 'One too many',
      config: { mode: 'vertical', category: 'plumbing' },
    })

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('40')
    expect(stored().filter(record => record.name === 'One too many')).toHaveLength(0)
    expect(stored()).toHaveLength(42)

    // At the cap, updating an existing setup still works.
    const overwrite = await post({
      action: 'save',
      name: 'Setup 00',
      config: { mode: 'vertical', category: 'plumbing' },
    })
    expect(overwrite.response.status).toBe(200)
    expect(overwrite.body.updated).toBe(true)
    expect(stored()).toHaveLength(42)
  })
})

describe('lead run presets route — cleanConfig whitelist', () => {
  it('drops fields outside the whitelist and truncates long strings to 400 characters', async () => {
    const longNote = 'n'.repeat(1200)

    const { response, body } = await post({
      action: 'save',
      name: 'Whitelist check',
      config: {
        mode: 'vertical',
        evilField: 'x',
        __proto__ignored: 'y',
        apiKey: ['sk', 'live', 'should', 'never', 'persist'].join('_'),
        notes: longNote,
        count: 12,
      },
    })

    expect(response.status).toBe(200)
    const savedConfig = stored()[0].config
    expect(savedConfig.mode).toBe('vertical')
    expect(savedConfig).not.toHaveProperty('evilField')
    expect(savedConfig).not.toHaveProperty('apiKey')
    expect(Object.keys(savedConfig).sort()).toEqual(['count', 'mode', 'notes'])
    expect(savedConfig.notes).toHaveLength(400)
    expect(savedConfig.notes).toBe('n'.repeat(400))
    // Numbers survive as numbers rather than being stringified.
    expect(savedConfig.count).toBe(12)
    expect(body.leadRunPreset.config).not.toHaveProperty('evilField')
    expect(JSON.stringify(state.data[FILE])).not.toContain('sk_live_should_never_persist')
  })
})

describe('lead run presets route — remember (last used)', () => {
  it('upserts a single slot:last record rather than accumulating one per run', async () => {
    const first = await post({
      action: 'remember',
      config: { mode: 'vertical', category: 'roofing', count: 10 },
    })
    expect(first.response.status).toBe(200)
    expect(first.body.ok).toBe(true)

    const second = await post({
      action: 'remember',
      config: { mode: 'organization', category: 'hvac', count: 50 },
    })
    expect(second.response.status).toBe(200)

    const lastRecords = stored().filter(record => record.slot === 'last' && record.ownerUserId === ALICE.id)
    expect(lastRecords).toHaveLength(1)
    expect(lastRecords[0].config).toEqual({ mode: 'organization', category: 'hvac', count: 50 })
    expect(stored()).toHaveLength(1)

    // And it surfaces through GET as lastUsed, never in the named list.
    const { body } = await get()
    expect(body.leadRunPresets).toHaveLength(0)
    expect(body.lastUsed).toEqual({ mode: 'organization', category: 'hvac', count: 50 })
  })

  it('does not touch another operator\'s last-used slot', async () => {
    seed([preset('lrp_bob_last', { ownerUserId: BOB.id, slot: 'last', name: '', config: { mode: 'bob-only' } })])

    await post({ action: 'remember', config: { mode: 'vertical' } })

    const bobRecord = stored().find(record => record.id === 'lrp_bob_last')
    expect(bobRecord.config).toEqual({ mode: 'bob-only' })
    expect(stored().filter(record => record.slot === 'last')).toHaveLength(2)
  })

  it('returns ok and creates nothing when the config is empty or absent', async () => {
    const absent = await post({ action: 'remember' })
    expect(absent.response.status).toBe(200)
    expect(absent.body).toEqual({ ok: true, skipped: true })

    const empty = await post({ action: 'remember', config: {} })
    expect(empty.response.status).toBe(200)
    expect(empty.body).toEqual({ ok: true, skipped: true })

    const junk = await post({ action: 'remember', config: { evilField: 'x' } })
    expect(junk.response.status).toBe(200)
    expect(junk.body).toEqual({ ok: true, skipped: true })

    expect(stored()).toHaveLength(0)
    expect(state.data[FILE]).toBeUndefined()
  })
})

describe('lead run presets route — remove', () => {
  it('removes a setup the caller owns', async () => {
    seed([preset('lrp_alice_1'), preset('lrp_alice_2')])

    const { response, body } = await post({ action: 'remove', id: 'lrp_alice_1' })

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, removed: true })
    expect(stored().map(record => record.id)).toEqual(['lrp_alice_2'])
  })

  it('returns 404 and deletes nothing when the setup belongs to a different operator', async () => {
    seed([
      preset('lrp_bob_1', { ownerUserId: BOB.id, name: 'Bob private sweep' }),
      preset('lrp_alice_1', { name: 'Alice setup' }),
    ])

    const { response, body } = await post({ action: 'delete', id: 'lrp_bob_1' })

    // The privacy guarantee: a cross-operator delete is indistinguishable from
    // "no such record", and Bob's setup is still on disk afterwards.
    expect(response.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Saved setup not found')
    expect(stored()).toHaveLength(2)
    expect(stored().find(record => record.id === 'lrp_bob_1')).toBeTruthy()
    expect(stored().find(record => record.id === 'lrp_bob_1').name).toBe('Bob private sweep')
  })

  it('returns 404 for an id that does not exist at all', async () => {
    seed([preset('lrp_alice_1')])

    const { response, body } = await post({ action: 'remove', id: 'lrp_nope' })

    expect(response.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(stored()).toHaveLength(1)
  })
})

describe('lead run presets route — guards', () => {
  it('rejects a GET without crm:read', async () => {
    state.readError = NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    seed([preset('lrp_alice_1')])

    const response = await GET(getRequest())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(body).not.toHaveProperty('leadRunPresets')
  })

  it('rejects a POST without crm:write and writes nothing', async () => {
    state.writeError = NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

    const response = await POST(postRequest({
      action: 'save',
      name: 'Should not persist',
      config: { mode: 'vertical' },
    }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.ok).toBe(false)
    expect(state.data[FILE]).toBeUndefined()
  })

  it('rejects a POST when the session carries no identifiable user', async () => {
    state.user = { role: 'owner' }

    const { response, body } = await post({ action: 'save', name: 'Anonymous', config: { mode: 'vertical' } })

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/identify/i)
    expect(stored()).toHaveLength(0)
  })

  it('rejects an unknown action', async () => {
    const { response, body } = await post({ action: 'obliterate', id: 'lrp_alice_1' })

    expect(response.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unknown action "obliterate"')
    expect(stored()).toHaveLength(0)
  })
})
