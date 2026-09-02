import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  recordRelease: vi.fn(),
  notifyFailedRelease: vi.fn(async () => ({ alerted: true })),
}))

vi.mock('../lib/releases', () => ({ recordRelease: state.recordRelease }))
vi.mock('../lib/ship-desk-alerts', () => ({ notifyFailedRelease: state.notifyFailedRelease }))

import { POST } from '../app/api/releases/report/route'

function request(body, token = 'release-secret') {
  return new Request('https://crm.example.com/api/releases/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

describe('POST /api/releases/report', () => {
  beforeEach(() => {
    process.env.FCC_RELEASE_REPORT_TOKEN = 'release-secret'
    state.recordRelease.mockReset()
    state.notifyFailedRelease.mockReset()
    state.recordRelease.mockReturnValue({ created: true, release: { id: 'rel_1', status: 'live' } })
  })

  it('fails closed when the reporter token is missing or wrong', async () => {
    expect((await POST(request({}, 'wrong'))).status).toBe(401)
    delete process.env.FCC_RELEASE_REPORT_TOKEN
    expect((await POST(request({}))).status).toBe(503)
    expect(state.recordRelease).not.toHaveBeenCalled()
  })

  it('records an authenticated release and returns its row', async () => {
    const body = { version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live' }
    const response = await POST(request(body))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ ok: true, created: true, release: { id: 'rel_1' } })
    expect(state.recordRelease).toHaveBeenCalledWith(body)
    expect(state.notifyFailedRelease).not.toHaveBeenCalled()
  })

  it('immediately sends the failed-release alert path', async () => {
    state.recordRelease.mockReturnValue({ created: true, release: { id: 'rel_failed', version: '2.4.0', status: 'failed' } })
    await POST(request({ version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'failed' }))
    expect(state.notifyFailedRelease).toHaveBeenCalledWith('farrington-command-center', expect.objectContaining({ id: 'rel_failed' }))
  })
})
