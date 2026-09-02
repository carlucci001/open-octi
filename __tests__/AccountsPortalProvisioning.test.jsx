import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EnablePortalButton } from '../app/accounts/AccountsManager'

describe('account portal provisioning controls', () => {
  let fetchMock
  let responseBody

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    responseBody = { ok: true, leaseId: 'lease-acme', complimentary: true }
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => responseBody,
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps portal, comp, promotional credits, and voice as separate owner choices', async () => {
    const onEnabled = vi.fn()
    render(<EnablePortalButton account={{ id: 'account-acme', name: 'Acme Heating' }} onEnabled={onEnabled} />)

    fireEvent.click(screen.getByRole('button', { name: 'Configure portal access for Acme Heating' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Complimentary account/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Grant promotional credits/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Include premium Cheryl voice allowance/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enable portal' }))

    await waitFor(() => expect(onEnabled).toHaveBeenCalled())
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload).toMatchObject({
      accountId: 'account-acme',
      complimentary: true,
      complimentaryDuration: '30_days',
      complimentaryReason: '30-day concierge introduction',
      promotionalCreditGrant: {
        enabled: true,
        credits: 10000,
        expiration: '30_days',
        reason: '30-day concierge trial',
        requestId: expect.any(String),
      },
      conciergeVoice: {
        enabled: true,
        dailySeconds: 900,
        maxSessionSeconds: 600,
        idleTimeoutSeconds: 90,
        warningThresholds: [50, 75, 90, 100],
      },
    })
  })

  it('shows portal-enabled credit-failed as a partial success and prevents a duplicate submit', async () => {
    responseBody = {
      ok: true,
      portalEnabled: true,
      creditGrantFailed: true,
      creditGrantMessage: 'Portal access was enabled, but promotional credits were not issued. Review the credit ledger before retrying.',
      grant: null,
    }
    const onEnabled = vi.fn()
    render(<EnablePortalButton account={{ id: 'account-acme', name: 'Acme Heating' }} onEnabled={onEnabled} />)

    fireEvent.click(screen.getByRole('button', { name: 'Configure portal access for Acme Heating' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Grant promotional credits/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enable portal' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Portal access was enabled')
    expect(screen.getByRole('status')).toHaveTextContent('Review the credit ledger before retrying')
    expect(screen.queryByRole('button', { name: 'Enable portal' })).not.toBeInTheDocument()
    expect(onEnabled).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh account' }))
    expect(onEnabled).toHaveBeenCalledTimes(1)
  })
})
