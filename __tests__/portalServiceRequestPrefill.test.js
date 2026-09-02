import { describe, expect, it } from 'vitest'
import { buildPortalServiceRequestDraft } from '../app/portal/components/portal-service-requests'

describe('Concierge service request prefill', () => {
  it('turns the research promotion into a complete support request draft', () => {
    const draft = buildPortalServiceRequestDraft('sales-research-deep-dive')

    expect(draft).toMatchObject({
      subject: 'Scope request: sales and competitor deep dive',
      category: 'automation_agent',
      priority: 'normal',
    })
    expect(draft.description).toContain('Target (competitor, company, prospect, or domain)')
    expect(draft.description).toContain('nothing will be charged until the scope, price, and delivery are confirmed')
  })

  it('turns an audited plan card into a tracked configuration request', () => {
    const draft = buildPortalServiceRequestDraft('managed-plan-receptionist')
    expect(draft.subject).toBe('Configuration review: Receptionist')
    expect(draft.description).toContain('no subscription or service is activated')
  })

  it('does not invent a request for an unknown service', () => {
    expect(buildPortalServiceRequestDraft('not-a-service')).toBeNull()
  })
})
