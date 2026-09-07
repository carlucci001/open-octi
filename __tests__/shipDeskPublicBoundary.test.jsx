import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), save: vi.fn(), read: vi.fn(), blocked: false }))
vi.mock('../lib/ship-desk-snapshot', () => ({ buildShipDeskSnapshot: mocks.snapshot }))
vi.mock('../lib/release-summaries', () => ({ getReleaseSummary: mocks.read, saveReleaseSummary: mocks.save }))
vi.mock('../lib/release-annotations', () => ({ deleteReleaseAnnotation: mocks.save, saveReleaseAnnotation: mocks.save }))
vi.mock('../lib/permissions', () => ({ requireCrmRead: () => mocks.blocked ? { error: new Response(null, { status: 401 }) } : {}, requireCrmWrite: () => ({}) }))
import ShipDesk from '../app/build/ship/ShipDesk'
import ShipDeskPage from '../app/build/ship/page'
import { GET } from '../app/api/build/ship/route'
import { GET as summaryGet, POST as summaryPost } from '../app/api/build/ship/summaries/route'

beforeEach(() => { vi.stubEnv('FCC_EDITION', 'openocti'); vi.stubGlobal('fetch', vi.fn()); vi.clearAllMocks(); mocks.blocked = false })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([ShipDesk, ShipDeskPage])('shows honest availability at each mount without polling an excluded backend', Component => {
  render(<Component />)
  expect(screen.getByRole('status').textContent).toContain('not included in this OpenOcti build')
  expect(screen.getByRole('link').getAttribute('href')).toBe('/?tab=repository')
  expect(fetch).not.toHaveBeenCalled()
})
it('returns structured unavailable responses before snapshot or annotation calls', async () => {
  const request = new Request('http://local/api/build/ship')
  for (const handler of [GET, summaryGet, summaryPost]) {
    const response = await handler(request)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, error: 'capability_unavailable', capability: 'ship-desk' })
  }
  expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled()
})
it('keeps authentication ahead of the public availability response', async () => {
  mocks.blocked = true
  expect((await GET(new Request('http://local/api/build/ship'))).status).toBe(401)
})
