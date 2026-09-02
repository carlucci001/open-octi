import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null }))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => structuredClone(state.data[filename] || null)),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = structuredClone(value)
  }),
}))

import { GET, PATCH } from '../app/api/portal/documents/route'

const session = {
  sessionId: 'session-acme',
  accountId: 'account-acme',
  leaseId: 'lease-acme',
  tenantId: 'tenant-acme',
}

function request(query = '') {
  return new Request(`http://localhost/api/portal/documents${query}`)
}

function patchRequest(body) {
  return new Request('http://localhost/api/portal/documents', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function document(id, overrides = {}) {
  return {
    id,
    clientId: 'account-acme',
    portalVisible: true,
    title: `Document ${id}`,
    templateName: 'Client report',
    status: 'complete',
    body: `Body for ${id}`,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('portal documents API', () => {
  beforeEach(() => {
    state.session = { ...session }
    state.data = { 'documents.json': { documents: [] } }
  })

  it('requires a signed-in portal session', async () => {
    state.session = null

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it('excludes another account documents from the list and detail route', async () => {
    state.data['documents.json'].documents = [
      document('owned'),
      document('other', { clientId: 'account-other' }),
    ]

    const list = await (await GET(request())).json()
    const detailResponse = await GET(request('?id=other'))

    expect(list.documents.map(item => item.id)).toEqual(['owned'])
    expect(detailResponse.status).toBe(404)
  })

  it('hides documents that are not explicitly shared and accepts linkedTo account matches', async () => {
    state.data['documents.json'].documents = [
      document('shared'),
      document('unset', { portalVisible: undefined }),
      document('not-shared', { portalVisible: false }),
      document('truthy-not-true', { portalVisible: 'yes' }),
      document('linked', { clientId: '', linkedTo: { accountId: 'account-acme' } }),
      document('linked-other', { clientId: '', linkedTo: { accountId: 'account-other' } }),
    ]

    const list = await (await GET(request())).json()

    expect(list.documents.map(item => item.id).sort()).toEqual(['linked', 'shared'])
    expect((await GET(request('?id=unset'))).status).toBe(404)
    expect((await GET(request('?id=not-shared'))).status).toBe(404)
    expect((await GET(request('?id=truthy-not-true'))).status).toBe(404)
    expect((await GET(request('?id=linked-other'))).status).toBe(404)
    expect((await PATCH(patchRequest({ id: 'not-shared', action: 'archive' }))).status).toBe(404)
    expect((await PATCH(patchRequest({ id: 'linked', action: 'archive' }))).status).toBe(200)
  })

  it('projects only client-safe fields for list and detail responses', async () => {
    state.data['documents.json'].documents = [document('owned', {
      internalNotes: 'hidden',
      storagePath: '/private/path',
      tenantId: 'tenant-acme',
    })]

    const list = await (await GET(request())).json()
    const detail = await (await GET(request('?id=owned'))).json()

    expect(Object.keys(list.documents[0]).sort()).toEqual(['archivedAt', 'createdAt', 'id', 'status', 'templateName', 'title', 'updatedAt'])
    expect(Object.keys(detail.document).sort()).toEqual(['archivedAt', 'body', 'createdAt', 'id', 'status', 'title', 'updatedAt'])
  })

  it('filters by search text, status, and inclusive updated date range', async () => {
    state.data['documents.json'].documents = [
      document('match', { title: 'July performance report', status: 'complete', updatedAt: '2026-07-10T12:00:00.000Z' }),
      document('wrong-status', { title: 'July performance report', status: 'draft', updatedAt: '2026-07-10T12:00:00.000Z' }),
      document('wrong-text', { title: 'Signed agreement', status: 'complete', updatedAt: '2026-07-10T12:00:00.000Z' }),
      document('too-early', { title: 'July performance report', status: 'complete', updatedAt: '2026-07-01T23:59:59.000Z' }),
      document('too-late', { title: 'July performance report', status: 'complete', updatedAt: '2026-07-17T00:00:00.000Z' }),
    ]

    const response = await GET(request('?q=performance&status=complete&from=2026-07-02&to=2026-07-16'))
    const json = await response.json()

    expect(json.documents.map(item => item.id)).toEqual(['match'])
    expect(json.pagination.totalItems).toBe(1)
  })

  it('builds status metadata from all account documents before filtering', async () => {
    state.data['documents.json'].documents = [
      document('complete', { status: 'complete' }),
      document('draft', { status: 'draft' }),
      document('blank', { status: '' }),
      document('other-account', { clientId: 'account-other', status: 'internal_only' }),
    ]

    const response = await GET(request('?status=complete'))
    const json = await response.json()

    expect(json.meta.statuses).toEqual(['complete', 'draft'])
    expect(json.documents.map(item => item.id)).toEqual(['complete'])
  })

  it('filters active and archived records without hiding archived documents by default', async () => {
    state.data['documents.json'].documents = [
      document('active'),
      document('archived', { archivedAt: '2026-07-15T12:00:00.000Z' }),
    ]

    const all = await (await GET(request())).json()
    const active = await (await GET(request('?archiveState=active'))).json()
    const archived = await (await GET(request('?archiveState=archived'))).json()

    expect(all.documents.map(item => item.id).sort()).toEqual(['active', 'archived'])
    expect(active.documents.map(item => item.id)).toEqual(['active'])
    expect(archived.documents.map(item => item.id)).toEqual(['archived'])
  })

  it('uses allowlisted stable sorting and falls back to updated date descending', async () => {
    state.data['documents.json'].documents = [
      document('b', { title: 'Same', updatedAt: '2026-07-10T12:00:00.000Z' }),
      document('a', { title: 'Same', updatedAt: '2026-07-10T12:00:00.000Z' }),
      document('c', { title: 'Zulu', updatedAt: '2026-07-11T12:00:00.000Z' }),
    ]

    const ascending = await (await GET(request('?sortBy=title&sortOrder=asc'))).json()
    const invalid = await (await GET(request('?sortBy=storagePath&sortOrder=sideways'))).json()

    expect(ascending.documents.map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(invalid.documents.map(item => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('paginates with validated page and pageSize values', async () => {
    state.data['documents.json'].documents = Array.from({ length: 35 }, (_, index) => document(`document-${String(index).padStart(2, '0')}`, {
      updatedAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    }))

    const pageTwo = await (await GET(request('?page=2&pageSize=10'))).json()
    const clamped = await (await GET(request('?page=-2&pageSize=500'))).json()

    expect(pageTwo.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 35, totalPages: 4 })
    expect(pageTwo.documents).toHaveLength(10)
    expect(clamped.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 35, totalPages: 1 })
    expect(clamped.documents).toHaveLength(35)
  })

  it('preserves the prior all-documents list when pagination parameters are absent', async () => {
    state.data['documents.json'].documents = Array.from({ length: 30 }, (_, index) => document(`document-${index}`, {
      updatedAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    }))

    const response = await GET(request())
    const json = await response.json()

    expect(json.documents).toHaveLength(30)
    expect(json.pagination).toEqual({ page: 1, pageSize: 30, totalItems: 30, totalPages: 1 })
  })

  it('clamps an out-of-range page to the final available page', async () => {
    state.data['documents.json'].documents = Array.from({ length: 12 }, (_, index) => document(`document-${index}`, {
      updatedAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
    }))

    const response = await GET(request('?page=99&pageSize=5'))
    const json = await response.json()

    expect(json.pagination).toEqual({ page: 3, pageSize: 5, totalItems: 12, totalPages: 3 })
    expect(json.documents).toHaveLength(2)
  })

  it('downloads only an account-owned document with safe attachment headers', async () => {
    state.data['documents.json'].documents = [
      document('owned', { title: 'July / Client Report', body: '# Safe client report' }),
      document('other', { clientId: 'account-other', body: 'private' }),
    ]

    const response = await GET(request('?id=owned&download=1'))
    const denied = await GET(request('?id=other&download=1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="July-Client-Report.md"')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('# Safe client report')
    expect(denied.status).toBe(404)
  })

  it('archives and restores a document without changing signed content or signature data', async () => {
    const signature = { status: 'signed', documentHash: 'unchanged-hash' }
    state.data['documents.json'].documents = [document('owned', { signature, body: 'Signed terms' })]

    const archivedResponse = await PATCH(patchRequest({ id: 'owned', action: 'archive' }))
    const archived = await archivedResponse.json()

    expect(archivedResponse.status).toBe(200)
    expect(archived.document.archivedAt).toBeTruthy()
    expect(state.data['documents.json'].documents[0]).toMatchObject({
      id: 'owned',
      body: 'Signed terms',
      signature,
      archivedAt: archived.document.archivedAt,
    })

    const restoredResponse = await PATCH(patchRequest({ id: 'owned', action: 'restore' }))
    const restored = await restoredResponse.json()

    expect(restoredResponse.status).toBe(200)
    expect(restored.document.archivedAt).toBeNull()
    expect(state.data['documents.json'].documents[0]).toMatchObject({ body: 'Signed terms', signature })
  })

  it('rejects invalid archive operations and another account document', async () => {
    state.data['documents.json'].documents = [document('other', { clientId: 'account-other' })]

    expect((await PATCH(patchRequest({ id: 'other', action: 'archive' }))).status).toBe(404)
    expect((await PATCH(patchRequest({ id: 'other', action: 'delete' }))).status).toBe(400)
  })

  it('returns safe stored version metadata plus the current revision without exposing historical bodies', async () => {
    state.data['documents.json'].documents = [document('owned', {
      version: 3,
      internalNotes: 'hidden current note',
      versions: [
        { id: 'v1', version: 1, label: 'Original', createdAt: '2026-07-01T12:00:00.000Z', body: 'historical secret body', internalNotes: 'hidden' },
        { id: 'v2', version: 2, title: 'Reviewed', updatedAt: '2026-07-05T12:00:00.000Z', body: 'another historical body' },
      ],
    })]

    const response = await GET(request('?id=owned&versions=1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.versions.map(item => item.id)).toEqual(['current', 'v2', 'v1'])
    expect(json.versions[0]).toMatchObject({ label: 'Current revision', version: 3, current: true })
    expect(Object.keys(json.versions[1]).sort()).toEqual(['createdAt', 'current', 'id', 'label', 'version'])
    expect(JSON.stringify(json)).not.toContain('historical body')
    expect(JSON.stringify(json)).not.toContain('internalNotes')
  })
})
