import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  recordRelease: vi.fn(),
  notifyFailedRelease: vi.fn(),
}))

vi.mock('../lib/releases', () => ({ recordRelease: state.recordRelease }))
vi.mock('../lib/ship-desk-alerts', () => ({ notifyFailedRelease: state.notifyFailedRelease }))

import { middleware } from '../middleware'
import { POST } from '../app/api/releases/report/route'

function releaseRequest(authorization) {
  const headers = { 'Content-Type': 'application/json' }
  if (authorization) headers.Authorization = authorization
  return new NextRequest('https://openocti.local/api/releases/report', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      version: '2026-08-22-ship-desk-v78',
      commit: '2222222',
      deployer: 'codex',
      deployedAt: '2026-08-22T20:00:00.000Z',
      status: 'live',
    }),
  })
}

async function dispatchThroughMiddleware(request) {
  const middlewareResponse = await middleware(request)
  if (middlewareResponse.headers.get('x-middleware-next') !== '1') return middlewareResponse
  return POST(request)
}

describe('release reporter middleware boundary', () => {
  beforeEach(() => {
    process.env.FCC_RELEASE_REPORT_TOKEN = 'release-secret'
    state.recordRelease.mockReset()
    state.notifyFailedRelease.mockReset()
    state.recordRelease.mockReturnValue({ created: true, release: { id: 'rel_1', status: 'live' } })
  })

  it('lets a valid server-to-server bearer request reach the release route', async () => {
    const response = await dispatchThroughMiddleware(releaseRequest('Bearer release-secret'))

    expect(response.status).toBe(201)
    expect(state.recordRelease).toHaveBeenCalledOnce()
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'Bearer wrong-secret'],
  ])('lets a %s bearer request reach the route and receive its 401', async (_label, authorization) => {
    const response = await dispatchThroughMiddleware(releaseRequest(authorization))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized.' })
    expect(state.recordRelease).not.toHaveBeenCalled()
  })
})
