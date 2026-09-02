import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ files: {}, requireCrmRead: vi.fn(async () => ({ user: { id: 'owner' } })), requireCrmWrite: vi.fn(async () => ({ user: { id: 'owner' } })) }))
vi.mock('@/lib/dataStore', () => ({ readData: vi.fn(file => state.files[file] || null), writeData: vi.fn((file, value) => { state.files[file] = value }) }))
vi.mock('@/lib/permissions', () => ({ requireCrmRead: state.requireCrmRead, requireCrmWrite: state.requireCrmWrite }))

import { GET, POST } from '../app/api/comms-local/route'

describe('Comms approval drafts', () => {
  beforeEach(() => { state.files = {}; vi.clearAllMocks() })

  it('stores Money Console outreach as pending approval even if a caller requests otherwise', async () => {
    const response = await POST(new Request('https://openocti.local/api/comms-local', { method: 'POST', body: JSON.stringify({ action: 'create_draft', source: 'money-console', approvalRequired: false, to: 'owner@example.com', subject: 'Payment update', html: 'Please update payment.' }) }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.draft).toMatchObject({ source: 'money-console', approvalRequired: true, status: 'pending_approval' })
    expect(state.files['comms-local.json'].drafts).toHaveLength(1)
  })

  it('does not mark a draft sent until Comms records the approved send', async () => {
    state.files['comms-local.json'] = { archived: [], drafts: [{ id: 'draft-1', status: 'pending_approval', approvalRequired: true }] }
    const before = await GET(new Request('https://openocti.local/api/comms-local'))
    expect((await before.json()).drafts[0].status).toBe('pending_approval')

    await POST(new Request('https://openocti.local/api/comms-local', { method: 'POST', body: JSON.stringify({ action: 'mark_draft_sent', id: 'draft-1' }) }))
    expect(state.files['comms-local.json'].drafts[0].status).toBe('sent')
  })

  it('persists deleted email tombstones and removes them from archive', async () => {
    state.files['comms-local.json'] = { archived: ['junk-1', 'keep-1'], deleted: [], drafts: [] }

    const response = await POST(new Request('https://openocti.local/api/comms-local', { method: 'POST', body: JSON.stringify({ action: 'delete', ids: ['junk-1'] }) }))
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, archived: ['keep-1'], deleted: ['junk-1'] })
    expect(state.files['comms-local.json']).toMatchObject({ archived: ['keep-1'], deleted: ['junk-1'] })
    const readback = await GET(new Request('https://openocti.local/api/comms-local'))
    expect(await readback.json()).toMatchObject({ archived: ['keep-1'], deleted: ['junk-1'] })
  })
})
