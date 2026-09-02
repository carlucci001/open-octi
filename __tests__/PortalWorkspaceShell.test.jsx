import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PortalWorkspaceShell from '../app/portal/components/PortalWorkspaceShell'

const navigation = vi.hoisted(() => ({
  pathname: '/portal/documents',
  search: 'service=sales-research-deep-dive',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('../app/portal/PortalNav', () => ({
  default: () => <header data-testid="portal-nav" />,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  navigation.pathname = '/portal/documents'
  navigation.search = 'service=sales-research-deep-dive'
})

describe('Concierge Portal workspace shell', () => {
  it('adds a contextual, accurately labeled Documents service rail with real actions', () => {
    render(
      <PortalWorkspaceShell>
        <header>Navigation</header>
        <main>Document library</main>
      </PortalWorkspaceShell>,
    )

    expect(screen.getByRole('complementary', { name: 'Move the next priority forward' })).toBeInTheDocument()
    expect(screen.getByText('Competitor and market intelligence')).toBeInTheDocument()
    expect(screen.getByText('Company or prospect background')).toBeInTheDocument()
    expect(screen.getByText('Domain and public-footprint review')).toBeInTheDocument()
    expect(screen.getByText('Scoped service')).toBeInTheDocument()
    expect(screen.getByText('Configuration review')).toBeInTheDocument()
    expect(screen.getByText('Pilot review')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Request a scoped deep dive/i })).toHaveAttribute(
      'href',
      '/portal/support?service=sales-research-deep-dive#new-support-request',
    )
    expect(screen.getByRole('link', { name: /Request workflow review/i })).toHaveAttribute(
      'href',
      '/portal/support?service=document-automation#new-support-request',
    )
    expect(screen.getByRole('link', { name: /Request campaign setup/i })).toHaveAttribute('href', '/portal/support?service=campaign-pilot#new-support-request')
  })

  it.each([
    'activity',
    'documents',
    'campaign-assistant',
    'marketplace',
    'billing',
    'upgrade',
    'support',
    'cancel',
  ])('provides contextual discovery on the authenticated %s page', section => {
    navigation.pathname = `/portal/${section}`
    render(<PortalWorkspaceShell><main>{section}</main></PortalWorkspaceShell>)
    expect(screen.getByRole('complementary', { name: 'Move the next priority forward' })).toBeInTheDocument()
  })

  it('leaves the concierge Home free of the promo rail so the conversation leads', () => {
    navigation.pathname = '/portal/dashboard'
    render(<PortalWorkspaceShell><main>Concierge home</main></PortalWorkspaceShell>)
    expect(screen.getByText('Concierge home')).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('keeps public sign-in and demo surfaces free of authenticated promotions', () => {
    navigation.pathname = '/portal/login'
    render(<PortalWorkspaceShell><main>Client sign in</main></PortalWorkspaceShell>)
    expect(screen.getByText('Client sign in')).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

})
