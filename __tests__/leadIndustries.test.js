// The Apollo actor's `industry` input is an enum of 318 exact strings; free
// text drew HTTP 400 on run lsr_mssdien1ehds9d (2026-08-13). mapIndustries
// translates Leads Lab's human phrasing onto allowed values.
import { describe, it, expect } from 'vitest'
import { mapIndustries, APOLLO_INDUSTRIES } from '../lib/lead-industries'

const allowed = new Set(APOLLO_INDUSTRIES)

describe('lead industry mapping', () => {
  it('maps the exact failing input (computer stores + contact-field noise)', () => {
    const { industries, unmatched } = mapIndustries(
      ['Computer stores', 'computer repair', 'owner', 'phone', 'website', 'email'],
    )
    expect(industries).toContain('IT Services and IT Consulting')
    expect(industries).toContain('Repair and Maintenance')
    expect(industries.every(v => allowed.has(v))).toBe(true)
    expect(unmatched).toEqual(expect.arrayContaining(['owner', 'phone', 'website', 'email']))
  })

  it('passes an exact enum value straight through, case-insensitively', () => {
    const { industries } = mapIndustries(['computer and network security'])
    expect(industries).toEqual(['Computer and Network Security'])
  })

  it('handles a whole vertical query string (no commas, location embedded)', () => {
    const { industries } = mapIndustries(
      ['Asheville HVAC plumbing electrical roofing garage door contractor owner phone website'],
    )
    expect(industries).toContain('Construction')
    expect(industries).toContain('Specialty Trade Contractors')
    expect(industries.every(v => allowed.has(v))).toBe(true)
  })

  it('covers the other core verticals with valid values', () => {
    for (const term of ['real estate team brokerage', 'med spa cosmetic dental practice',
      'independent insurance agency', 'auto repair dealer detailer', 'law firm intake',
      'chiropractor physical therapy veterinary urgent care clinic', 'restaurant catering hospitality']) {
      const { industries } = mapIndustries([term])
      expect(industries.length).toBeGreaterThan(0)
      expect(industries.every(v => allowed.has(v))).toBe(true)
    }
  })

  it('reports nothing-mapped with suggestions instead of inventing values', () => {
    const { industries, unmatched } = mapIndustries(['zzqx blorp'])
    expect(industries).toEqual([])
    expect(unmatched).toEqual(['zzqx blorp'])
  })
})
