import { duplicateLeadResponse, findExistingLeadMatch } from '@/lib/leadDedupe'

describe('lead dedupe', () => {
  const existing = [
    {
      id: 'ld_existing',
      name: 'Jane Smith',
      businessName: 'Acme Tourism',
      email: 'Jane@Example.com',
      phone: 'PHONE_REDACTED',
      web: 'https://www.acmetourism.com/',
      status: 'new',
      source: 'cold_list',
    },
  ]

  it('blocks a lead that was already drawn by email even if unused', () => {
    const match = findExistingLeadMatch({ email: 'jane@example.com', businessName: 'Different Name' }, existing)
    expect(match?.lead.id).toBe('ld_existing')
    expect(match?.reason).toBe('email already exists')
  })

  it('blocks a lead that was already drawn by phone', () => {
    const match = findExistingLeadMatch({ phone: '8285551212' }, existing)
    expect(match?.lead.id).toBe('ld_existing')
    expect(match?.reason).toBe('phone already exists')
  })

  it('blocks a lead that was already drawn by website', () => {
    const match = findExistingLeadMatch({ website: 'http://acmetourism.com' }, existing)
    expect(match?.lead.id).toBe('ld_existing')
    expect(match?.reason).toBe('website already exists')
  })

  it('returns a clear skipped response for duplicate creates', () => {
    const response = duplicateLeadResponse({ lead: existing[0], reason: 'email already exists' })
    expect(response.skipped).toBe(true)
    expect(response.reason).toBe('duplicate_lead')
    expect(response.existingLead.id).toBe('ld_existing')
  })
})
