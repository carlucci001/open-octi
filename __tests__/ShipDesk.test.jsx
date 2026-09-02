import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShipDesk from '../app/build/ship/ShipDesk'

const snapshot = {
  generatedAt: '2026-08-22T20:00:00.000Z',
  pollIntervalMs: 60_000,
  platforms: [{
    platformId: 'getfound3', name: 'GetFound3', url: 'https://getfound3.com',
    health: { status: 'ok', version: '2.4.0' },
    releases: [
      { id: 'live', version: '2.4.0', commit: '2222222', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live' },
      { id: 'old', version: '2.3.0', commit: '1111111', deployer: 'carl', deployedAt: '2026-08-21T20:00:00.000Z', status: 'previous' },
    ],
    liveRelease: { id: 'live', version: '2.4.0', commit: '2222222' },
    previousRelease: { id: 'old', version: '2.3.0', commit: '1111111' },
    commitMessages: ['Ship the release hook'],
    links: { gitea: '/api/repository/gitea/', github: 'https://github.com/carlucci001/getfound3' },
    rollback: { command: "git -C '/root/getfound3' checkout --detach '1111111' && npx vercel deploy --prod --yes", releasePolicy: 'CLI release.' },
    summary: null,
  }],
}

describe('Ship Desk UI', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to the release list, remembers the card toggle, and keeps links and rollback in labeled menus/details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(snapshot)))
    render(<ShipDesk />)

    expect((await screen.findAllByText('GetFound3')).length).toBeGreaterThan(0)
    expect(screen.getByTestId('ship-desk-list-view')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Card view' }))
    expect(screen.getByTestId('ship-desk-card-view')).toBeInTheDocument()
    expect(localStorage.getItem('fcc:ship-desk-view')).toBe('card')
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getAllByText('2.4.0').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1111111/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'GetFound3 2.4.0 actions' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Open GitHub' })).toHaveAttribute('href', 'https://github.com/carlucci001/getfound3')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'View release details' }))
    expect(screen.queryByRole('button', { name: /rollback/i })).not.toBeInTheDocument()
    expect(await screen.findByText(/git -C/)).toBeInTheDocument()
  })

  it('uses a light Orca handoff and caches the returned summary by release id', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/build/ship') return Response.json(snapshot)
      if (url === '/api/agent/handoff') return Response.json({ ok: true, runId: 'orca_1', run: { status: 'done', result: 'The release added a guarded deploy hook.' } })
      if (url === '/api/build/ship/summaries') return Response.json({ ok: true, summary: { summary: 'The release added a guarded deploy hook.', runId: 'orca_1' } })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ShipDesk />)

    fireEvent.click(await screen.findByRole('button', { name: 'GetFound3 2.4.0 actions' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Summarize live changes' }))
    expect(await screen.findByText('The release added a guarded deploy hook.')).toBeInTheDocument()
    const handoff = fetchMock.mock.calls.find(([url]) => url === '/api/agent/handoff')
    expect(JSON.parse(handoff[1].body)).toMatchObject({ action: 'start', complexity: 'light', fromAgentId: 'ship-desk' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/build/ship/summaries', expect.objectContaining({ method: 'POST' })))
  })

  it('creates an operator annotation separately from immutable release facts', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/build/ship' && !options.method) return Response.json(snapshot)
      if (url === '/api/build/ship/summaries') return Response.json({ ok: true, annotation: { platformId: 'getfound3', releaseId: 'live', notes: 'Verified production smoke test.' } })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ShipDesk />)

    fireEvent.click(await screen.findByRole('button', { name: 'GetFound3 2.4.0 actions' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Add operator annotation' }))
    fireEvent.change(screen.getByLabelText('Operator annotation'), { target: { value: 'Verified production smoke test.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/build/ship/summaries', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'save-annotation', platformId: 'getfound3', releaseId: 'live', notes: 'Verified production smoke test.' }),
    })))
  })

  it('deletes only the operator annotation after confirmation', async () => {
    const annotated = structuredClone(snapshot)
    annotated.platforms[0].releases[0].annotation = { notes: 'Temporary operator note.' }
    annotated.platforms[0].liveRelease.annotation = { notes: 'Temporary operator note.' }
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/build/ship' && !options.method) return Response.json(annotated)
      if (url === '/api/build/ship/summaries') return Response.json({ ok: true, result: { deleted: true } })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<ShipDesk />)

    fireEvent.click(await screen.findByRole('button', { name: 'GetFound3 2.4.0 actions' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Delete operator annotation' }))
    expect(confirm).toHaveBeenCalledWith('Delete this operator annotation? The immutable release record will remain unchanged.')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/build/ship/summaries', expect.objectContaining({
      body: JSON.stringify({ action: 'delete-annotation', platformId: 'getfound3', releaseId: 'live' }),
    })))
  })
})
