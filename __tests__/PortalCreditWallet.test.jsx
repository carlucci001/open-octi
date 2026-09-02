import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreditWalletSummary from '../app/portal/components/CreditWalletSummary'
import CreditPurchaseSheet from '../app/portal/components/CreditPurchaseSheet'

const stripeMocks = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  confirmSetup: vi.fn(),
}))

vi.mock('lucide-react', () => {
  const Icon = ({ 'aria-hidden': ariaHidden }) => <svg aria-hidden={ariaHidden} />
  return {
    CalendarClock: Icon,
    Check: Icon,
    ChevronLeft: Icon,
    CircleDollarSign: Icon,
    Infinity: Icon,
    LockKeyhole: Icon,
    Plus: Icon,
    Receipt: Icon,
    ShieldCheck: Icon,
    Sparkles: Icon,
    X: Icon,
  }
})

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div aria-label="Secure Stripe payment form" />,
  useElements: () => ({}),
  useStripe: () => ({
    confirmPayment: stripeMocks.confirmPayment,
    confirmSetup: stripeMocks.confirmSetup,
  }),
}))

const wallet = {
  combined: { availableCredits: 7500, reservedCredits: 0 },
  subscription: {
    includedCredits: 5000,
    availableCredits: 2500,
    usedCredits: 2500,
    reservedCredits: 0,
    resetsAt: '2026-07-31T00:00:00.000Z',
  },
  prepaid: {
    purchasedCredits: 5000,
    availableCredits: 5000,
    usedCredits: 0,
    reservedCredits: 0,
    neverExpires: true,
  },
  recent: [
    {
      id: 'ledger_1',
      type: 'settlement',
      credits: -750,
      service: 'competitor_research',
      description: 'Competitor deep dive',
      createdAt: '2026-07-16T12:00:00.000Z',
    },
  ],
}

const packs = [
  { id: 'credits-2500', name: 'Everyday', credits: 2500, priceUsd: 25, popular: false },
  { id: 'credits-5000', name: 'Growth', credits: 5000, priceUsd: 50, popular: false },
  { id: 'credits-10000', name: 'Business', credits: 10000, priceUsd: 100, popular: true },
  { id: 'credits-25000', name: 'Scale', credits: 25000, priceUsd: 250, popular: false },
]

describe('Portal credit wallet', () => {
  let fetchMock

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PK', 'pk_test_portal_wallet')
    fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/portal/billing/top-up-intent' && options.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            clientSecret: 'pi_wallet_secret_example',
            pack: packs[1],
          }),
        }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows one available balance with a clear included and purchased split', () => {
    render(<CreditWalletSummary wallet={wallet} onAddCredits={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Available balance' })).toBeInTheDocument()
    expect(screen.getByText('$75.00')).toBeInTheDocument()
    expect(screen.getByText('Included with your plan')).toBeInTheDocument()
    expect(screen.getByText('Purchased balance')).toBeInTheDocument()
    expect(screen.getByText(/Resets Jul 31/)).toBeInTheDocument()
    expect(screen.getByText('Never expire')).toBeInTheDocument()
    expect(screen.getByText('Competitor deep dive')).toBeInTheDocument()
    expect(screen.getByText('-$7.50')).toBeInTheDocument()
  })

  it('normalizes the production wallet ledger response without hiding balances', () => {
    render(
      <CreditWalletSummary
        wallet={{
          availableCredits: 7500,
          reservedCredits: 0,
          subscription: {
            grantedCredits: 5000,
            availableCredits: 2500,
            spentCredits: 2500,
            endsAt: '2026-07-31T00:00:00.000Z',
          },
          prepaid: {
            grantedCredits: 5000,
            availableCredits: 5000,
            spentCredits: 0,
            expiresAt: null,
          },
          recent: [],
        }}
      />,
    )

    expect(screen.getByText('$75.00')).toBeInTheDocument()
    expect(screen.getByText(/Resets Jul 31/)).toBeInTheDocument()
    expect(screen.getByText('Never expire')).toBeInTheDocument()
  })

  it('keeps pack selection and Stripe PaymentElement inside the billing portal', async () => {
    render(
      <CreditPurchaseSheet
        open
        packs={packs}
        theme="light"
        onClose={() => {}}
        onPurchased={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Add funds' })).toBeInTheDocument()
    expect(screen.getByText('Most flexible')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Growth/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))

    expect(await screen.findByLabelText('Secure Stripe payment form')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Purchase for $50.00' })).toBeInTheDocument()

    await waitFor(() => {
      const intentCall = fetchMock.mock.calls.find(([url]) => url === '/api/portal/billing/top-up-intent')
      expect(intentCall).toBeTruthy()
      expect(JSON.parse(intentCall[1].body)).toMatchObject({
        packId: 'credits-5000',
        requestId: expect.any(String),
      })
    })

    expect(stripeMocks.confirmPayment).not.toHaveBeenCalled()
  })
})
