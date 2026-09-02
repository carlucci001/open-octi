import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApiSpendMonitor from '../app/finance/ApiSpendMonitor'

describe('API spend provider filter', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        fetchedAt: new Date().toISOString(),
        results: [
          { id: 'twilio', provider: 'Twilio', status: 'active', usage: { meterAvailable: true, costToday: 1.25 } },
          { id: 'unused', provider: 'Unused Provider', status: 'configured', usage: { meterAvailable: false } },
        ],
      }),
    })))
  })

  it('defaults to active providers and supports inactive and all without a page-length list', async () => {
    render(<ApiSpendMonitor mode="panel" />)
    const providers = await screen.findByRole('region', { name: 'API providers' })

    expect(within(providers).getByText('Twilio')).toBeInTheDocument()
    expect(within(providers).queryByText('Unused Provider')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Inactive providers/i }))
    await waitFor(() => expect(within(providers).getByText('Unused Provider')).toBeInTheDocument())
    expect(within(providers).queryByText('Twilio')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /All providers/i }))
    expect(within(providers).getByText('Twilio')).toBeInTheDocument()
    expect(within(providers).getByText('Unused Provider')).toBeInTheDocument()
  })
})
