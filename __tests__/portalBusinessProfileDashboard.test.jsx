import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app/portal/PortalNav', () => ({ default: () => <nav>Portal</nav> }))
vi.mock('../app/portal/components/PortalConciergePanel', () => ({
  default: ({ profileConfirmedCount }) => <div>Concierge confirmed facts: {profileConfirmedCount}</div>,
}))
vi.mock('../app/portal/components/CreditWalletSummary', () => ({ default: () => <div>Wallet</div> }))
vi.mock('../app/portal/components/ConciergeCardRail', () => ({ default: () => <div>Cards</div> }))
vi.mock('../app/portal/components/concierge-core', () => ({ useConciergeConversation: () => ({}) }))
vi.mock('../lib/portal-client-name', () => ({ portalClientFirstName: () => 'Jamie' }))

import ConciergeHome from '../app/portal/dashboard/page'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('portal dashboard business profile summary', () => {
  it('uses business-profile completion metadata instead of a hardcoded field total', async () => {
    const fetchMock = vi.fn(async url => {
      const results = {
        '/api/portal/me': { ok: true, user: { companyName: 'Acme', firstName: 'Jamie' }, lease: {} },
        '/api/portal/business-profile': {
          ok: true,
          profile: {
            fields: {
              businessName: { value: 'Acme', status: 'suggested' },
              offerings: { value: 'Construction', status: 'confirmed' },
            },
            completion: { completed: 4, total: 36, percent: 11, sections: [] },
            navigation: { continueSectionId: 'qualifiedLeads' },
          },
        },
        '/api/portal/billing/wallet': { ok: true, wallet: {} },
        '/api/portal/support': { ok: true, tickets: [] },
        '/api/portal/documents': { ok: true, documents: [] },
      }
      return { ok: true, json: async () => results[url] }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ConciergeHome />)

    expect(await screen.findByText(/4 of 36 useful details added/i)).toBeInTheDocument()
    expect(screen.getByText(/Concierge confirmed facts: 1/i)).toBeInTheDocument()
    expect(screen.queryByText(/of 13/i)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/business-profile', { cache: 'no-store' })
    expect(screen.getByRole('link', { name: 'Continue profile' })).toHaveAttribute('href', '/portal/profile?section=qualifiedLeads')
  })
})
