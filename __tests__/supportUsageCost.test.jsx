import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sanitizeTicket } from '../lib/supportTickets'
import { TicketDetail } from '../app/support/SupportManager'

const ticket = {
  id: 'st-1',
  ticketNumber: 'SUP-1',
  subject: 'Scope request: sales and competitor deep dive',
  description: 'Research Acme',
  category: 'automation_agent',
  status: 'new',
  priority: 'normal',
  portalVisible: true,
  estCostUsd: 1.25,
  usageUnknown: true,
  usageEventCount: 3,
  comments: [],
}

describe('research request usage cost', () => {
  it('keeps attributed cost in the internal ticket and strips it from the portal shape', () => {
    expect(sanitizeTicket(ticket)).toMatchObject({ estCostUsd: 1.25, usageUnknown: true, usageEventCount: 3 })
    expect(sanitizeTicket(ticket, { portal: true })).not.toHaveProperty('estCostUsd')
    expect(sanitizeTicket(ticket, { portal: true })).not.toHaveProperty('usageUnknown')
  })

  it('shows attributed cost on the internal request detail', () => {
    render(<TicketDetail ticket={ticket} comment="" setComment={vi.fn()} saving={false} onComment={vi.fn()} onEdit={vi.fn()} onResolve={vi.fn()} onClose={vi.fn()} onReopen={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Attributed AI cost')).toBeInTheDocument()
    expect(screen.getByText('$1.25 + unknown')).toBeInTheDocument()
  })
})
