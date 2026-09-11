import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientAccountSetup, { ClientSetupAction } from '../app/accounts/ClientAccountSetup'

describe('OpenOcti client conversion', () => {
  let fetchMock
  beforeEach(() => {
    vi.stubEnv('FCC_EDITION', 'openocti')
    vi.stubEnv('NEXT_PUBLIC_FCC_EDITION', 'openocti')
    fetchMock = vi.fn(async (url, options) => ({ ok: true, json: async () => ({
      ...(options?.method === 'POST' ? { ok: true } : {}),
      account: { id: 'sample-account', name: 'Sample Company', type: options?.method === 'POST' ? 'client' : 'prospect' },
    }) }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('converts through the CRM API without portal calls or promises', async () => {
    const onChanged = vi.fn(), onClose = vi.fn()
    render(<ClientAccountSetup accountId="sample-account" opportunityId="sample-deal" onChanged={onChanged} onClose={onClose} />)
    await screen.findByRole('button', { name: 'Create client account' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/accounts?id=sample-account')
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.queryByText(/portal|complimentary|pay as you go|voice|credits/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create client account' }))
    expect(await screen.findByRole('heading', { name: 'Client account ready' })).toBeVisible()
    expect(fetchMock.mock.calls[1][0]).toBe('/api/accounts')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ action: 'promote_to_client', accountId: 'sample-account', opportunityId: 'sample-deal' })
    expect(screen.queryByRole('link', { name: /sign-in/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /portal/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens an existing client without offering another conversion', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ account: { id: 'sample-account', name: 'Sample Company', type: 'client' } }) })
    render(<ClientAccountSetup accountId="sample-account" onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Client account ready' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open account' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Create client account' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps API rejection visible without reporting success', async () => {
    render(<ClientAccountSetup accountId="sample-account" onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'Create client account' })
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Account no longer exists' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Create client account' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Account no longer exists'))
    expect(screen.queryByRole('heading', { name: 'Client account ready' })).not.toBeInTheDocument()
  })

  it('describes only the available client action', () => {
    render(<ClientSetupAction accountName="Sample Company" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Set up client account for Sample Company' })).toBeVisible()
  })
})
