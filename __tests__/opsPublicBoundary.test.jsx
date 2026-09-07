import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ poll: vi.fn(), money: vi.fn(), save: vi.fn(), blocked: false }))
vi.mock('../lib/money-console', () => ({ pollMoneyConsole: mocks.money, getMoneySettings: vi.fn(), saveMoneySettings: mocks.save }))
vi.mock('../lib/incident-poller', () => ({ pollIncidentSources: mocks.poll }))
vi.mock('../lib/incidents', () => ({ listIncidents: () => [{ id: 'saved-incident', title: 'Saved incident' }], readIncidentStatusState: vi.fn(), createIncidentTask: vi.fn(), updateIncidentAction: vi.fn() }))
vi.mock('../lib/entityStore', () => ({ findById: vi.fn() }))
vi.mock('../lib/permissions', () => ({ requireCrmRead: () => mocks.blocked ? { error: new Response(null, { status: 401 }) } : {}, requireCrmWrite: () => ({}) }))
import MoneyConsole from '../app/ops/money/MoneyConsole'
import MoneyPage from '../app/ops/money/page'
import { GET as moneyGet, POST as moneyPost } from '../app/api/ops/money/route'
import { GET as incidentsGet } from '../app/api/ops/incidents/route'
import { POST as incidentsPoll } from '../app/api/ops/incidents/poll/route'

beforeEach(() => { vi.stubEnv('FCC_EDITION', 'openocti'); vi.stubEnv('FCC_INCIDENT_POLL_TOKEN', 'synthetic-test-token'); vi.stubGlobal('fetch', vi.fn()); vi.clearAllMocks(); mocks.blocked = false })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([MoneyConsole, MoneyPage])('keeps portfolio monitoring from polling excluded functions at either mount', Component => {
  render(<Component />)
  expect(screen.getByRole('status').textContent).toContain('not included')
  expect(screen.getByRole('link', { name: 'Open Finance' }).getAttribute('href')).toBe('/?tab=finance')
  expect(fetch).not.toHaveBeenCalled()
})
it('gates portfolio reads while retaining local money settings', async () => {
  expect((await moneyGet(new Request('http://local/api/ops/money'))).status).toBe(503)
  expect(mocks.money).not.toHaveBeenCalled()
  await moneyPost(new Request('http://local/api/ops/money', { method: 'POST', body: JSON.stringify({ dunningProposalDays: 8 }) }))
  expect(mocks.save).toHaveBeenCalledWith({ dunningProposalDays: 8 })
})
it('returns saved incidents with an explicit unavailable telemetry state', async () => {
  const response = await incidentsGet(new Request('http://local/api/ops/incidents'))
  expect(await response.json()).toMatchObject({ telemetryAvailable: false, generatedAt: null, platforms: [], incidents: [{ id: 'saved-incident' }], warning: expect.stringContaining('not included') })
  expect(mocks.poll).not.toHaveBeenCalled()
})
it('authenticates before availability and never polls through the cron route', async () => {
  mocks.blocked = true
  expect((await moneyGet(new Request('http://local/api/ops/money'))).status).toBe(401)
  expect((await incidentsGet(new Request('http://local/api/ops/incidents'))).status).toBe(401)
  expect((await incidentsPoll(new Request('http://local/api/ops/incidents/poll'))).status).toBe(401)
  const response = await incidentsPoll(new Request('http://local/api/ops/incidents/poll', { headers: { authorization: 'Bearer synthetic-test-token' } }))
  expect(response.status).toBe(503)
  expect(mocks.poll).not.toHaveBeenCalled()
})
