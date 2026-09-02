import { describe, expect, it } from 'vitest'
import {
  CREDIT_RETAIL_USD,
  CREDIT_TOP_UP,
  CREDIT_TOP_UP_PACKS,
  MANAGED_SOCIAL_PLANS,
  USAGE_ACTION_CATALOG,
  creditAllowanceForTier,
  creditsFromUsd,
  quoteUsageCredits,
} from '../lib/usage-pricing'

describe('usage pricing', () => {
  it('converts provider cost to integer credits at the default 75% gross margin', () => {
    expect(CREDIT_RETAIL_USD).toBe(0.01)
    expect(creditsFromUsd(0.04)).toBe(16)
    expect(creditsFromUsd(0.06)).toBe(24)
    expect(creditsFromUsd(0)).toBe(0)
  })

  it('applies the configured action floor after cost conversion', () => {
    expect(quoteUsageCredits({ action: 'text', actualUsd: 0 })).toBe(0)
    expect(quoteUsageCredits({ action: 'standard_image', actualUsd: 0.04 })).toBe(25)
    expect(quoteUsageCredits({ action: 'premium_image', actualUsd: 0.10 })).toBe(70)
    expect(quoteUsageCredits({ action: 'research', actualUsd: 0.001 })).toBe(10)
    expect(quoteUsageCredits({ action: 'automation_run', actualUsd: 0.001 })).toBe(10)
  })

  it('uses the Receptionist per-minute voice rate and keeps the result integral', () => {
    expect(quoteUsageCredits({ action: 'voice', units: 1 })).toBe(40)
    expect(quoteUsageCredits({ action: 'voice', units: 1.5 })).toBe(60)
    expect(Number.isInteger(quoteUsageCredits({ action: 'voice', units: 1.01 }))).toBe(true)
  })

  it('requires a provider quote for video and converts that quote to credits', () => {
    expect(() => quoteUsageCredits({ action: 'video' })).toThrow('provider quote')
    expect(quoteUsageCredits({ action: 'video', quotedProviderUsd: 2.50 })).toBe(1000)
  })

  it('scales action floors by units and never accepts negative values', () => {
    expect(quoteUsageCredits({ action: 'standard_image', units: 3, actualUsd: 0.12 })).toBe(75)
    expect(() => creditsFromUsd(-0.01)).toThrow('non-negative')
    expect(() => quoteUsageCredits({ action: 'research', units: -1 })).toThrow('non-negative')
  })

  it('publishes only explicitly provisional catalog and managed-plan metadata', () => {
    expect(Object.values(USAGE_ACTION_CATALOG).every(item => item.provisional === true && item.verified === false)).toBe(true)
    expect(MANAGED_SOCIAL_PLANS.map(plan => [plan.id, plan.monthlyPriceUsd, plan.includedCredits])).toEqual([
      ['operator', 597, 1250],
      ['growth', 997, 5000],
      ['authority', 1997, 28000],
    ])
    expect(MANAGED_SOCIAL_PLANS.every(plan => plan.provisional === true && plan.verified === false)).toBe(true)
    expect(CREDIT_TOP_UP).toMatchObject({ credits: 2500, priceUsd: 25, provisional: false, verified: true })
    expect(CREDIT_TOP_UP_PACKS.map(pack => pack.priceUsd)).toEqual([25, 50, 100, 250])
  })

  it('applies plan allowances to existing SQLite tier records that predate the wallet', () => {
    expect(creditAllowanceForTier({ id: 'receptionist' })).toMatchObject({
      includedCredits: 8500,
      resetsWithPaidBillingPeriod: true,
    })
    expect(creditAllowanceForTier({ id: 'complimentary' })).toBeNull()
  })
})
