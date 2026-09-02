import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APOLLO_PAID_SEARCHES,
  MAX_APOLLO_PAID_SEARCHES,
  buildLeadVendorRequest,
  normalizeApolloPaidSearches,
  paidSearchLimitFromConfig,
} from '../lib/lead-paid-search-limit'

describe('Apollo paid-search limit', () => {
  it('defaults to two paid searches', () => {
    expect(DEFAULT_APOLLO_PAID_SEARCHES).toBe(2)
    expect(normalizeApolloPaidSearches(undefined)).toBe(2)
    expect(normalizeApolloPaidSearches('not-a-number')).toBe(2)
  })

  it('accepts the operator choices and clamps untrusted input', () => {
    expect(normalizeApolloPaidSearches(1)).toBe(1)
    expect(normalizeApolloPaidSearches('2')).toBe(2)
    expect(normalizeApolloPaidSearches(6)).toBe(6)
    expect(normalizeApolloPaidSearches(0)).toBe(1)
    expect(normalizeApolloPaidSearches(99)).toBe(MAX_APOLLO_PAID_SEARCHES)
  })

  it('builds the exact vendor payload used by Lead Lab and the API route', () => {
    expect(buildLeadVendorRequest('apollo', 2)).toEqual({ provider: 'apollo', maxPaidBatches: 2 })
    expect(buildLeadVendorRequest('apollo', 99)).toEqual({ provider: 'apollo', maxPaidBatches: 6 })
    expect(buildLeadVendorRequest('apify', 6)).toEqual({ provider: 'apify', maxPaidBatches: 1 })
  })

  it('resets legacy saved setups without a cap to the approved default', () => {
    expect(paidSearchLimitFromConfig({ maxPaidBatches: 6 })).toBe(6)
    expect(paidSearchLimitFromConfig({ leadSource: 'apollo' })).toBe(2)
    expect(paidSearchLimitFromConfig(null)).toBe(2)
  })
})
