import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreditGrantManager from '../app/products/CreditGrantManager'

const clients = [{
  leaseId: 'lease_acme',
  accountId: 'account_acme',
  accountName: 'Acme Heating',
  tierName: 'Receptionist',
  availableCredits: 8500,
  includedCredits: 8500,
  issuedCredits: 0,
}]

describe('CreditGrantManager', () => {
  let fetchMock

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/credit-grants' && !options.method) {
        return { ok: true, json: async () => ({ ok: true, clients }) }
      }
      if (url === '/api/admin/credit-grants' && options.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            clients: [{ ...clients[0], availableCredits: 11000, issuedCredits: 2500 }],
            grant: {
              credits: 2500,
              reason: 'Launch and demonstration capacity',
              createdAt: '2026-07-16T17:00:00.000Z',
            },
          }),
        }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('issues audited non-expiring credits to the selected client', async () => {
    render(<CreditGrantManager />)

    expect(await screen.findByText('Acme Heating · Receptionist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Issue 2,500 credits' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, options]) => options.method === 'POST')
      expect(JSON.parse(call[1].body)).toMatchObject({
        leaseId: 'lease_acme',
        credits: 2500,
        reason: 'Launch and demonstration capacity',
        expiration: 'never',
        requestId: expect.any(String),
      })
    })
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Acme Heating'))
    expect(await screen.findByText(/2,500 credits issued to Acme Heating/)).toBeInTheDocument()
  })

  it('lets the owner choose a 30-day promotional expiration', async () => {
    render(<CreditGrantManager />)

    expect(await screen.findByText('Acme Heating · Receptionist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }))
    fireEvent.click(screen.getByRole('button', { name: 'Issue 2,500 credits' }))

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')
      expect(JSON.parse(calls.at(-1)[1].body)).toMatchObject({ expiration: '30_days' })
    })
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('expire after 30 days'))
  })
})
