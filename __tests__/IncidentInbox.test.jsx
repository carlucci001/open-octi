import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import IncidentInbox from '../app/ops/incidents/IncidentInbox'

const incident = {
  id: 'inc_preview', platformId: 'getfound3', platformName: 'GetFound3', fingerprint: 'preview-injected',
  title: 'Injected preview failure', level: 'error', count: 1,
  firstSeen: '2026-08-22T19:59:00.000Z', lastSeen: '2026-08-22T20:00:00.000Z',
  status: 'open', taskId: null, notes: [], public: false, countHistory: [],
}

describe('Incident Inbox UI', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('turns an injected platform error into a Carl task and resolves it cleanly', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/ops/incidents' && !options.method) return Response.json({ incidents: [incident], platforms: [{ platformId: 'getfound3', name: 'GetFound3', status: 'ok' }], pollIntervalMs: 60_000 })
      if (url === '/api/ops/incidents' && options.method === 'POST') {
        const body = JSON.parse(options.body)
        if (body.action === 'create-task') return Response.json({ ok: true, taskId: 'tk_1', incident: { ...incident, taskId: 'tk_1' } })
        if (body.action === 'resolve') return Response.json({ ok: true, incident: { ...incident, taskId: 'tk_1', status: 'resolved' } })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<IncidentInbox />)

    expect(await screen.findByText('Injected preview failure')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Create task for Injected preview failure/i }))
    expect(await screen.findByText('Task tk_1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Resolve Injected preview failure/i }))
    await waitFor(() => expect(screen.getByText('resolved')).toBeInTheDocument())
  })

  it('uses Orca for a drafting-only client-safe status note', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/ops/incidents') return Response.json({ incidents: [incident], platforms: [], pollIntervalMs: 60_000 })
      if (url === '/api/agent/handoff') return Response.json({ ok: true, run: { status: 'done', result: 'We are investigating a service delay and will share another update shortly.' } })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<IncidentInbox />)

    fireEvent.click(await screen.findByRole('button', { name: /Draft status note for Injected preview failure/i }))
    expect(await screen.findByDisplayValue(/We are investigating a service delay/)).toBeInTheDocument()
    const handoff = fetchMock.mock.calls.find(([url]) => url === '/api/agent/handoff')
    const body = JSON.parse(handoff[1].body)
    expect(body).toMatchObject({ fromAgentId: 'incident-inbox', complexity: 'light' })
    expect(body.task).toMatch(/Command Center/)
    expect(body.task).toMatch(/Carl will decide whether to post it/)
  })
})
