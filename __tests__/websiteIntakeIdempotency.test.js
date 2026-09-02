import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  seq: 0,
  stores: {
    leads: [],
    opportunities: [],
    accounts: [],
    contacts: [],
    activities: [],
    pipelines: [{
      id: 'farrington_dev',
      stages: [{ id: 'discovery', terminal: false }],
    }],
  },
}))

vi.mock('@/lib/entityStore', () => ({
  loadAll: (type) => state.stores[type] || [],
  create: (type, record) => {
    const now = new Date().toISOString()
    const created = { id: `${type}_${++state.seq}`, createdAt: now, updatedAt: now, ...record }
    state.stores[type].push(created)
    return created
  },
  update: (type, id, patch) => {
    const current = state.stores[type].find(item => item.id === id)
    Object.assign(current, patch, { updatedAt: new Date().toISOString() })
    return current
  },
  findAccountMatches: () => [],
  findContactByEmail: (email) => state.stores.contacts.find(contact => contact.email === email) || null,
  logActivity: (activity) => {
    const created = { id: `activities_${++state.seq}`, createdAt: new Date().toISOString(), ...activity }
    state.stores.activities.push(created)
    return created
  },
}))

import { POST } from '@/app/api/website/intake/route'
import { insertLeadFromChannel } from '@/lib/inboundChannels/leadInsert'

function requestFor(overrides = {}) {
  return new Request('http://localhost/api/website/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Caleb Example',
      company: 'Example Company',
      email: 'caleb@example.com',
      phone: '555-0100',
      source: 'fd-website-book-demo',
      productOpportunity: 'Command Center Demo',
      serviceLine: 'Automation Services',
      submissionId: 'fd-demo-stable-123',
      ...overrides,
    }),
  })
}

describe('website intake idempotency', () => {
  beforeEach(() => {
    state.seq = 0
    for (const [type, records] of Object.entries(state.stores)) {
      if (type !== 'pipelines') records.length = 0
    }
    vi.stubEnv('RESEND_API_KEY', '')
  })

  it('creates one CRM graph when the same website submission is replayed', async () => {
    const first = await POST(requestFor())
    const replay = await POST(requestFor())

    expect(await first.json()).toMatchObject({ ok: true, deduplicated: false })
    expect(await replay.json()).toMatchObject({
      ok: true,
      deduplicated: true,
      submissionId: 'fd-demo-stable-123',
    })
    expect(state.stores.leads).toHaveLength(1)
    expect(state.stores.accounts).toHaveLength(1)
    expect(state.stores.contacts).toHaveLength(1)
    expect(state.stores.opportunities).toHaveLength(1)
    expect(state.stores.leads[0]).toMatchObject({
      submissionId: 'fd-demo-stable-123',
      externalId: 'fd-demo-stable-123',
      bookingId: 'fd-demo-stable-123',
    })
  })

  it('makes any legacy secondary intake skip the same submission', async () => {
    await POST(requestFor())

    const result = await insertLeadFromChannel({
      channel: {
        id: 'legacy_fd_inquiries',
        label: 'Legacy Farrington inquiries',
        autoCreateOpportunity: true,
        targetPipelineId: 'farrington_dev',
        targetStageId: 'discovery',
      },
      payload: {
        name: 'Caleb Example',
        company: 'Example Company',
        email: 'caleb@example.com',
      },
      externalId: 'fd-demo-stable-123',
    })

    expect(result).toEqual({ skipped: true, reason: 'duplicate' })
    expect(state.stores.leads).toHaveLength(1)
    expect(state.stores.opportunities).toHaveLength(1)
  })

  it('suppresses rapid legacy replays even when an old client sends no ID', async () => {
    const withoutId = { submissionId: undefined }
    const first = await POST(requestFor(withoutId))
    const replay = await POST(requestFor(withoutId))

    expect(await first.json()).toMatchObject({ ok: true, deduplicated: false })
    expect(await replay.json()).toMatchObject({ ok: true, deduplicated: true })
    expect(state.stores.leads).toHaveLength(1)
    expect(state.stores.opportunities).toHaveLength(1)
  })

})
