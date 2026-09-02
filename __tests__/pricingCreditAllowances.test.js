import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_CREDIT_ALLOWANCES, creditAllowanceForTier } from '../lib/usage-pricing'

describe('subscription credit allowances', () => {
  it('gives every paid tier an auditable monthly allowance', () => {
    for (const [tierId, allowance] of Object.entries(SUBSCRIPTION_CREDIT_ALLOWANCES)) {
      expect(allowance, tierId).toMatchObject({
        rateVersion: '2026-07-16',
        resetsWithPaidBillingPeriod: true,
        exhaustionPolicy: 'prepaid_then_pause',
      })
      expect(Number.isInteger(allowance.includedCredits), tierId).toBe(true)
      expect(allowance.includedCredits, tierId).toBeGreaterThan(0)
    }
  })

  it('aligns Receptionist capacity with its included voice and email quantities', () => {
    expect(creditAllowanceForTier({ id: 'receptionist' })?.includedCredits).toBe(8500)
  })
})
