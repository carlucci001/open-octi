import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AgentPlanVisual from '../app/portal/components/AgentPlanVisual'
import ConciergePlanCard from '../app/portal/components/ConciergePlanCard'

vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }))

const tier = {
  id: 'receptionist', name: 'Receptionist', monthlyFee: 99,
  tagline: 'Managed call intake and CRM handoff.', capabilities: ['Call intake'], conditions: ['Verified phone line'],
  creditAllowance: { includedCredits: 8500 },
  commerce: { label: 'Managed setup', ctaLabel: 'Request plan review' },
  requestHref: '/portal/support?service=managed-plan-receptionist#new-support-request',
}

describe('Concierge agent presentation', () => {
  it('shows the verified existing agent face while keeping the request-only action', () => {
    render(<ConciergePlanCard tier={tier} />)
    expect(screen.getByAltText('Doreen, Receptionist')).toHaveAttribute('src', '/avatars/receptionist-1777668904398.png')
    expect(screen.getByText('Request only')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Request plan review/i })).toHaveAttribute('href', tier.requestHref)
    expect(screen.queryByRole('button', { name: /order/i })).not.toBeInTheDocument()
  })

  it('uses an avatar stack for the multi-agent Full Team Suite', () => {
    render(<AgentPlanVisual tierId="full-suite" title="Full Team Suite" />)
    expect(screen.getByLabelText('7 verified agents')).toBeInTheDocument()
    expect(screen.getByAltText('Cameron, Communications Coordinator')).toBeInTheDocument()
    expect(screen.getByLabelText('2 additional verified agents')).toBeInTheDocument()
  })

  it('uses a branded capability visual when no verified face mapping exists', () => {
    const { container } = render(<AgentPlanVisual tierId="specialist-product-manager" title="Product Manager" />)
    expect(container.querySelector('[data-agent-visual="capability"]')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the verified DeerFlow research roster on research service cards', () => {
    render(<AgentPlanVisual serviceKey="research" title="Deep research" compact />)
    expect(screen.getByAltText('Nadia, Client Due Diligence')).toHaveAttribute('src', '/avatars/deerflow-nadia.svg')
    expect(screen.getByAltText('Mason, Competitor Intelligence')).toHaveAttribute('src', '/avatars/deerflow-mason.svg')
  })
})
