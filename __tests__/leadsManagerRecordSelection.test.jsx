import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeadsManager from '../app/leads/LeadsManager'

const greg = {
  id: 'lead_greg',
  name: 'Greg Example',
  businessName: 'Greg Example Consulting',
  status: 'new',
  source: 'manual',
  email: 'greg@example.com',
  phone: '+18285550123',
  website: 'https://greg.example.com',
  createdAt: '2026-08-19T12:00:00.000Z',
}

vi.mock('@/lib/useCachedData', () => ({
  useCachedData: vi.fn(url => ({
    data: url === '/api/leads' ? [greg] : [],
    refreshing: false,
    refresh: vi.fn(async () => {}),
  })),
}))

vi.mock('../app/components/ComponentSettings', () => ({
  default: () => null,
  useComponentSettings: () => ({ loaded: false, values: null }),
}))

describe('LeadsManager record selection', () => {
  beforeEach(() => {
    greg.status = 'new'
    localStorage.clear()
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ templates: [] }),
    })))
  })

  async function openLeadActions() {
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Greg Example Consulting' }))
    return screen.findByRole('menu')
  }

  it('opens the requested lead record from the global search selection event', async () => {
    render(<LeadsManager />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('fcc:select-record', {
        detail: { type: 'lead', id: greg.id },
      }))
    })

    expect(await screen.findByDisplayValue('Greg Example')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit Lead' })).toBeInTheDocument()
  })

  it('renders every state-appropriate row action as a labeled icon menu item', async () => {
    render(<LeadsManager />)

    expect(document.querySelector(`[data-lead-row="${greg.id}"]`)).toHaveStyle({ height: '76px', minHeight: '76px' })
    expect(document.querySelector(`[data-lead-actions="${greg.id}"]`)).toHaveStyle({ width: '114px', minWidth: '114px' })
    expect(document.querySelector(`[data-lead-actions="${greg.id}"]`)).toHaveClass('flex-nowrap')

    const menu = await openLeadActions()
    const expectedActions = [
      'Open lead',
      'Open website',
      'Open call scripts',
      'Email lead',
      'Convert to account',
      'Disqualify lead',
      'Delete lead',
    ]

    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(expectedActions)
    for (const label of expectedActions) {
      expect(within(menu).getByRole('menuitem', { name: label }).querySelector('svg')).toBeInTheDocument()
    }
    expect(within(menu).getByRole('menuitem', { name: 'Open website' })).toHaveAttribute('href', 'https://greg.example.com')
  })

  it('hides state-dependent actions inside the same menu without changing the action column', async () => {
    greg.status = 'unqualified'
    render(<LeadsManager />)

    const menu = await openLeadActions()
    expect(within(menu).queryByRole('menuitem', { name: 'Disqualify lead' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Convert to account' })).toBeInTheDocument()
    expect(document.querySelector(`[data-lead-actions="${greg.id}"]`)).toHaveStyle({ width: '114px', minWidth: '114px' })
  })

  it('keeps the existing open, email, and convert handlers behind the menu', async () => {
    let view = render(<LeadsManager />)
    fireEvent.click(within(await openLeadActions()).getByRole('menuitem', { name: 'Open lead' }))
    expect(await screen.findByRole('heading', { name: 'Edit Lead' })).toBeInTheDocument()

    view.unmount()
    view = render(<LeadsManager />)
    fireEvent.click(within(await openLeadActions()).getByRole('menuitem', { name: 'Email lead' }))
    expect(await screen.findByRole('heading', { name: 'Email Greg Example Consulting' })).toBeInTheDocument()

    view.unmount()
    render(<LeadsManager />)
    fireEvent.click(within(await openLeadActions()).getByRole('menuitem', { name: 'Convert to account' }))
    expect(await screen.findByRole('heading', { name: 'Convert Lead' })).toBeInTheDocument()
  })

  it('keeps status and delete mutations on their existing handlers and confirmation', async () => {
    const view = render(<LeadsManager />)
    fireEvent.click(within(await openLeadActions()).getByRole('menuitem', { name: 'Disqualify lead' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/leads', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'update', lead: { id: greg.id, status: 'unqualified' } }),
    })))

    view.unmount()
    vi.mocked(fetch).mockClear()
    render(<LeadsManager />)
    fireEvent.click(within(await openLeadActions()).getByRole('menuitem', { name: 'Delete lead' }))

    expect(confirm).toHaveBeenCalledWith('Delete this lead?')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/leads', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id: greg.id }),
    })))
  })
})
