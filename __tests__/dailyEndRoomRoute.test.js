import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const permissions = vi.hoisted(() => ({
  requireCrmWrite: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/permissions', () => permissions)

import { POST } from '../app/api/video/end-room/route.js'

describe('POST /api/video/end-room', () => {
  beforeEach(() => {
    permissions.requireCrmWrite.mockResolvedValue({ error: null })
    vi.stubEnv('DAILY_API_KEY', 'daily_test_key')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('ejects every participant from a managed Daily room without deleting the room', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 2,
          data: [{ id: 'participant-1' }, { id: 'participant-2' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ejectedIds: ['participant-1', 'participant-2'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 0, data: [] }),
      })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-client-review-abc123' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ejectedIds: ['participant-1', 'participant-2'] })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.daily.co/v1/rooms/ff-client-review-abc123/presence?limit=100',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer daily_test_key' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.daily.co/v1/rooms/ff-client-review-abc123/eject',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer daily_test_key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ ids: ['participant-1', 'participant-2'], ban: false }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.daily.co/v1/rooms/ff-client-review-abc123/presence?limit=100',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('waits through a bounded stale presence result before confirming the room is empty', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 1, data: [{ id: 'participant-1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ejectedIds: ['participant-1'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 1, data: [{ id: 'participant-1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 0, data: [] }),
      })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-eventual-room' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ejectedIds: ['participant-1'] })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('fails closed after bounded confirmation attempts while anyone remains', async () => {
    const presenceWithParticipant = {
      ok: true,
      status: 200,
      json: async () => ({ total_count: 1, data: [{ id: 'participant-1' }] }),
    }
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(presenceWithParticipant)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ejectedIds: ['participant-1'] }),
      })
      .mockResolvedValue(presenceWithParticipant)
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-still-live-room' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ ok: false, error: expect.stringContaining('still reports 1 participant') })
    // 1 initial presence + 1 eject + 6 bounded confirmation checks. The budget was
    // widened from 3 checks (~0.3s) to 6 with backoff (~3.8s) on 2026-07-29:
    // Daily's presence endpoint is eventually consistent, and the old budget
    // spuriously 409'd a call the operator was themselves sitting in. Still
    // strictly bounded, and still fails closed while anyone genuinely remains.
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it('treats a room Daily no longer knows about as already ended', async () => {
    // Ending an already-ended meeting is success. This used to surface as a 502
    // "Daily could not end the meeting" and left the CRM record stuck open when
    // the room had expired or was closed from the Daily tab first.
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not-found', info: 'room not found' }),
    })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-instant-4v67tj' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, alreadyEnded: true, ejectedIds: [] })
    // Never attempts an eject against a room that no longer exists.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not confirm shutdown from an incomplete post-eject presence payload', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 1, data: [{ id: 'participant-1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ejectedIds: ['participant-1'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-uncertain-room' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ ok: false, error: expect.stringContaining('presence response was incomplete') })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats an already empty managed room as ended without an invalid eject request', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ total_count: 0, data: [] }),
    })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-empty-room' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ejectedIds: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.daily.co/v1/rooms/ff-empty-room/presence?limit=100',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('fails closed when Daily presence is incomplete for a room over the eject limit', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ total_count: 101, data: Array.from({ length: 100 }, (_, i) => ({ id: `participant-${i}` })) }),
    })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-large-room' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ ok: false, error: expect.stringContaining('101 participants') })
  })

  it('rejects a missing room name before calling Daily', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires CRM write access before contacting Daily', async () => {
    permissions.requireCrmWrite.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })
    const fetchMock = vi.spyOn(global, 'fetch')
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-client-review-abc123' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not report success when Daily rejects the eject request', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 1, data: [{ id: 'participant-1' }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'forbidden', info: 'API access denied' }),
      })
    const request = new Request('https://openocti.local/api/video/end-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'ff-client-review-abc123' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toMatchObject({ ok: false, error: 'API access denied' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
