import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const state = vi.hoisted(() => ({
  entities: { leads: [] },
  message: null,
  activities: [],
}))

vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(type => state.entities[type] || []),
  create: vi.fn((type, record) => {
    const created = { id: `${type}_${(state.entities[type] || []).length + 1}`, ...record }
    state.entities[type] = [created, ...(state.entities[type] || [])]
    return created
  }),
  logActivity: vi.fn(activity => state.activities.push(activity)),
  update: vi.fn(),
}))

vi.mock('../lib/calendarEvents', () => ({
  createAppointmentEvent: vi.fn(),
}))

vi.mock('../lib/myvtc/channel', () => ({
  ensureMyvtcChannel: vi.fn(() => ({
    id: 'myvtc_contact',
    label: 'MyVTC contact form',
    type: 'webhook',
    enabled: true,
    targetCampaign: 'myvtc',
    autoCreateOpportunity: false,
  })),
}))

vi.mock('../lib/myvtc/client', () => ({
  MyvtcApiError: class MyvtcApiError extends Error {
    constructor(code, options = {}) { super(code); this.code = code; this.status = options.status }
  },
  fetchContactMessage: vi.fn(async () => state.message),
}))

import {
  contactToLeadPayload,
  ingestContact,
  verifyMyvtcSignature,
} from '../lib/myvtc/webhook'

beforeEach(() => {
  state.entities = { leads: [] }
  state.activities = []
  state.message = {
    id: 'contact-1',
    name: 'Alex Example',
    email: 'alex@example.com',
    topic: 'partnership',
    subject: 'Partner with us',
    message: 'Please call me.',
    createdAt: '2026-08-30T12:00:00.000Z',
  }
})

describe('MyVTC webhook logic', () => {
  it('accepts a valid signature and rejects tampering, stale timestamps, and malformed headers', () => {
    const secret = 'fake_signing_secret'
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'contact.received' })
    const now = 1_800_000_000
    const signature = createHmac('sha256', secret).update(`${now}.${rawBody}`).digest('hex')
    const header = `t=${now},v1=${signature}`

    expect(verifyMyvtcSignature(secret, rawBody, header, now)).toBe(true)
    expect(verifyMyvtcSignature(secret, `${rawBody} `, header, now)).toBe(false)
    expect(verifyMyvtcSignature(secret, rawBody, header, now + 301)).toBe(false)
    expect(verifyMyvtcSignature(secret, rawBody, `t=${now},v1=xyz`, now)).toBe(false)
    expect(verifyMyvtcSignature(secret, rawBody, 'not-a-signature', now)).toBe(false)
  })

  it('creates a new MyVTC lead with the source, brand, external id, tags, and notes required by the contract', async () => {
    await expect(ingestContact('contact-1')).resolves.toEqual({ leadId: 'leads_1' })
    expect(state.entities.leads).toHaveLength(1)
    expect(state.entities.leads[0]).toMatchObject({
      source: 'myvtc_contact',
      brandContext: 'myvtc',
      externalId: 'myvtc:contact-1',
      status: 'new',
      tags: expect.arrayContaining(['myvtc', 'partnership']),
      legacy: { campaign: 'myvtc', lt: '' },
    })
    expect(state.entities.leads[0].notes).toContain('Partner with us')
    expect(state.entities.leads[0].notes).toContain('Please call me.')
    expect(state.entities.leads[0].notes).toContain('Topic: partnership')
    expect(state.entities.opportunities || []).toHaveLength(0)
  })

  it('maps funeral-home contacts to the funeral home partnership opportunity', () => {
    const result = contactToLeadPayload({ ...state.message, topic: 'funeral-home' })
    expect(result.sourceMeta.productOpportunity).toBe('MyVTC - Funeral home partnership')
    expect(result.payload.tags).toEqual(['myvtc', 'funeral-home'])
  })
})
