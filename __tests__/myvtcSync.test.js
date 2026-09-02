import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {},
  pages: [],
  credential: { key: 'fake_platform_key' },
  seen: new Set(),
}))

const listContactMessages = vi.hoisted(() => vi.fn(async () => state.pages.shift() || { data: [], nextCursor: null }))
const ingestContactMessage = vi.hoisted(() => vi.fn(async message => {
  if (state.seen.has(message.id)) return { skipped: true }
  state.seen.add(message.id)
  return { leadId: `lead_${message.id}` }
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename] || null),
  writeData: vi.fn((filename, value) => { state.data[filename] = JSON.parse(JSON.stringify(value)) }),
}))

vi.mock('../lib/myvtc/client', () => ({
  myvtcCredential: vi.fn(() => state.credential),
  listContactMessages,
}))

vi.mock('../lib/myvtc/channel', () => ({
  ensureMyvtcChannel: vi.fn(() => ({ id: 'myvtc_contact' })),
}))

vi.mock('../lib/myvtc/webhook', () => ({ ingestContactMessage }))

import {
  maybeRunMyvtcContactSync,
  syncContactMessages,
} from '../lib/myvtc/sync'

beforeEach(() => {
  state.data = {}
  state.pages = []
  state.credential = { key: 'fake_platform_key' }
  state.seen = new Set(['existing'])
  listContactMessages.mockClear()
  ingestContactMessage.mockClear()
  delete globalThis[Symbol.for('fcc.myvtc-contact-sync')]
})

describe('MyVTC reconcile', () => {
  it('creates only missing leads and records the complete result', async () => {
    state.pages.push({ data: [{ id: 'existing' }, { id: 'new-1' }], nextCursor: null })
    const result = await syncContactMessages({ now: new Date('2026-08-30T12:00:00.000Z') })

    expect(result).toEqual({ scanned: 2, created: 1, skipped: 1, pages: 1, stoppedEarly: false })
    expect(state.data['myvtc-sync-state.json']).toEqual({
      lastRunAt: '2026-08-30T12:00:00.000Z',
      lastResult: result,
    })
  })

  it('caps a full scan at 40 pages', async () => {
    state.pages = Array.from({ length: 40 }, (_, index) => ({
      data: [{ id: `contact-${index}` }],
      nextCursor: `cursor-${index + 1}`,
    }))
    const result = await syncContactMessages()
    expect(result).toMatchObject({ scanned: 40, created: 40, pages: 40, stoppedEarly: true })
    expect(listContactMessages).toHaveBeenCalledTimes(40)
  })

  it('does not report an early stop when the fortieth page is the final page', async () => {
    state.pages = Array.from({ length: 40 }, (_, index) => ({
      data: [],
      nextCursor: index === 39 ? null : `cursor-${index + 1}`,
    }))
    const result = await syncContactMessages()
    expect(result).toMatchObject({ pages: 40, stoppedEarly: false })
  })

  it('runs at most once per hour and never throws when the sync fails', async () => {
    state.pages.push({ data: [], nextCursor: null })
    const first = await maybeRunMyvtcContactSync({ now: new Date('2026-08-30T12:00:00.000Z') })
    const second = await maybeRunMyvtcContactSync({ now: new Date('2026-08-30T12:30:00.000Z') })
    expect(first).toMatchObject({ scanned: 0, pages: 1 })
    expect(second).toEqual({ skipped: true, reason: 'not_due' })
    expect(listContactMessages).toHaveBeenCalledTimes(1)

    state.pages.push(null)
    listContactMessages.mockRejectedValueOnce(new Error('network'))
    await expect(maybeRunMyvtcContactSync({ now: new Date('2026-08-30T13:01:00.000Z') }))
      .resolves.toMatchObject({ skipped: true, reason: 'sync_failed' })
  })
})
