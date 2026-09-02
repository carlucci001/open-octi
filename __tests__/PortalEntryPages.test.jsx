import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PortalLogin from '../app/portal/login/page'
import PortalDemoPage from '../app/portal/demo/page'
import LegacyPortalSignupRedirect from '../app/portal/signup/page'

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
}))

vi.mock('lucide-react', () => {
  const Icon = (props) => <svg {...props} />
  return {
    ArrowLeft: Icon,
    ArrowRight: Icon,
    Building2: Icon,
    CalendarDays: Icon,
    CheckCircle2: Icon,
    Clock3: Icon,
    LockKeyhole: Icon,
    Mail: Icon,
    Phone: Icon,
    ShieldCheck: Icon,
    UserRound: Icon,
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/portal/login')
})

describe('Public portal entry', () => {
  it('keeps the old signup URL as a compatibility redirect only', () => {
    LegacyPortalSignupRedirect()
    expect(navigationMocks.redirect).toHaveBeenCalledWith('/portal/demo')
  })

  it('keeps client sign-in and demo scheduling as clearly separate paths', () => {
    render(<PortalLogin />)

    expect(screen.getByRole('heading', { name: 'Client sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Email my secure sign-in link/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Schedule a guided demo' })).toBeInTheDocument()

    const demoLink = screen.getByRole('link', { name: /Schedule a demo/i })
    expect(demoLink).toHaveAttribute('href', '/portal/demo')
    expect(screen.getByText(/creates a lead for Farrington Development only/i)).toBeInTheDocument()
    expect(screen.getByText(/does not create an account, portal access, services, billing, or credits/i)).toBeInTheDocument()
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/create demo portal/i)).not.toBeInTheDocument()
  })

  it('submits a demo scheduling request and confirms that only a lead was created', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<PortalDemoPage />)

    expect(screen.getByRole('heading', { name: 'Schedule a demo' })).toBeInTheDocument()
    expect(screen.getByText(/sends a lead directly to Farrington Development/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jamie Rivera' } })
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Rivera Services' } })
    fireEvent.change(screen.getByLabelText('Business email'), { target: { value: 'jamie@example.com' } })
    fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: '555-0102' } })
    fireEvent.change(screen.getByLabelText('Preferred day and time'), { target: { value: 'Tuesday at 2 PM Eastern' } })
    fireEvent.change(screen.getByLabelText(/What would you like to see/i), { target: { value: 'Receptionist and research agents' } })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule my demo' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/signup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: 'Jamie Rivera',
        company: 'Rivera Services',
        email: 'jamie@example.com',
        phone: '555-0102',
        preferredTime: 'Tuesday at 2 PM Eastern',
        message: 'Receptionist and research agents',
      }),
    }))

    expect(await screen.findByRole('heading', { name: 'Your demo request is in' })).toBeInTheDocument()
    expect(screen.getByText(/received your request as a new lead/i)).toBeInTheDocument()
    expect(screen.getByText(/No account, portal access, services, or billing were created/i)).toBeInTheDocument()
  })
})
