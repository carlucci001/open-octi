import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ poll: vi.fn() }))
vi.mock('../lib/incident-poller', () => ({ pollIncidentSources: state.poll }))

import { POST } from '../app/api/ops/incidents/poll/route'

function request(token = 'incident-secret') {
  return new Request('https://openocti.local/api/ops/incidents/poll', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe('POST /api/ops/incidents/poll', () => {
  beforeEach(() => {
    process.env.FCC_INCIDENT_POLL_TOKEN = 'incident-secret'
    state.poll.mockReset()
    state.poll.mockResolvedValue({ generatedAt: '2026-08-22T20:00:00.000Z', incidents: [{ id: 'inc_1' }], platforms: [{ platformId: 'getfound3', name: 'GetFound3', status: 'ok' }] })
  })

  it('fails closed before polling when the dedicated bearer is absent or wrong', async () => {
    expect((await POST(request('wrong'))).status).toBe(401)
    delete process.env.FCC_INCIDENT_POLL_TOKEN
    expect((await POST(request())).status).toBe(503)
    expect(state.poll).not.toHaveBeenCalled()
  })

  it('returns sanitized platform health to an authenticated Nightwatch caller', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      generatedAt: '2026-08-22T20:00:00.000Z',
      incidentCount: 1,
      platforms: [{ platformId: 'getfound3', name: 'GetFound3', status: 'ok' }],
    })
  })
})
