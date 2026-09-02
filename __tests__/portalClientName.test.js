import { describe, expect, it } from 'vitest'
import { portalClientFirstName } from '../lib/portal-client-name'

describe('portal client greeting name', () => {
  it('prefers an explicitly provisioned first name', () => {
    expect(portalClientFirstName({
      account: { firstName: 'Marisol', name: 'Acme Heating' },
      profile: { fields: { primaryContactName: { value: 'Jordan Smith', status: 'confirmed' } } },
    })).toBe('Marisol')
  })

  it('uses the first word of a confirmed primary contact name', () => {
    expect(portalClientFirstName({
      account: { name: 'Acme Heating' },
      profile: { fields: { primaryContactName: { value: 'Jordan Smith', status: 'confirmed' } } },
    })).toBe('Jordan')
  })

  it('never guesses from a business name or unconfirmed contact', () => {
    expect(portalClientFirstName({
      account: { name: 'Acme Heating', email: 'jordan@example.com' },
      profile: { fields: { primaryContactName: { value: 'Jordan Smith', status: 'unconfirmed' } } },
    })).toBe('')
  })
})
