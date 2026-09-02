import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AgentSandbox from '../app/agent-labs/AgentSandbox'

vi.mock('../app/components/PageHeader', () => ({
  default: ({ title, subtitle, actions }) => (
    <header>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {actions}
    </header>
  ),
}))

vi.mock('../app/components/PageShell', () => ({
  default: ({ children }) => <main>{children}</main>,
}))

describe('AgentSandbox', () => {
  it('renders the sandbox workbench sections', () => {
    render(<AgentSandbox />)

    expect(screen.getByRole('heading', { name: 'Agent Sandbox' })).toBeInTheDocument()
    expect(screen.getByText('Import inventory')).toBeInTheDocument()
    expect(screen.getByText('Quarantine gates')).toBeInTheDocument()
    expect(screen.getByText('Product module packs')).toBeInTheDocument()
    expect(screen.getAllByText('Pipeline Analyst').length).toBeGreaterThan(0)
  })
})
