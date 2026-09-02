import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UsageAttribution from '../app/finance/UsageAttribution'

describe('API spend attribution view', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async request => {
      const url = String(request)
      const groupBy = new URL(url, 'http://localhost').searchParams.get('groupBy') || 'agent'
      return {
        ok: true,
        json: async () => ({
          ok: true,
          groupBy,
          groups: [{ key: groupBy === 'client' ? 'client-truk' : 'nadia', events: 3, promptTokens: 2000, completionTokens: 1000, estCostUsd: 1.25, unknown: false }],
          totals: { events: 3, estCostUsd: 1.25, unknown: false },
          settings: { agentMonthlyUsd: { nadia: 20 }, clientMonthlyUsd: { 'client-truk': 50 } },
        }),
      }
    }))
  })

  it('renders real grouped usage and switches among agent, client, and product attribution', async () => {
    render(<UsageAttribution />)
    expect(await screen.findByText('nadia')).toBeInTheDocument()
    expect(screen.getByText('$1.25')).toBeInTheDocument()
    expect(screen.getByLabelText('Attribution period')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Client' }))
    await waitFor(() => expect(screen.getByText('client-truk')).toBeInTheDocument())
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('groupBy=client'), expect.objectContaining({ cache: 'no-store' }))
  })
})
