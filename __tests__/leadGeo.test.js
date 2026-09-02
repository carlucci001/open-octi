// Offline lead-geo resolver — the permanent fix for run lsr_msrqawbkuhbcol
// (2026-08-13), where "Asheville" and "North Carolina" both refused because
// the old network resolver failed / had no state support.
import { describe, it, expect } from 'vitest'
import { resolveLocationToZips, sampleZips, suggest, stateAbbrevOf, STATE_NAMES } from '../lib/lead-geo'

const noDefault = { defaultState: '' }

describe('lead-geo offline resolver', () => {
  // --- the two inputs that failed on 2026-08-13 ---
  it('resolves "Asheville" (the exact failing input)', () => {
    const geo = resolveLocationToZips('Asheville', noDefault)
    expect(geo).not.toBeNull()
    expect(geo.stateAbbrev).toBe('NC')
    expect(geo.zips.length).toBe(11)
    expect(geo.zips.every(z => z.startsWith('288'))).toBe(true)
  })
  it('resolves "North Carolina" (the exact failing input)', () => {
    const geo = resolveLocationToZips('North Carolina', noDefault)
    expect(geo).not.toBeNull()
    expect(geo.zips.length).toBe(1091)
    expect(geo.city).toBe('')
    expect(geo.stateAbbrev).toBe('NC')
  })

  // --- ZIP pass-through ---
  it('passes through a bare ZIP', () => {
    expect(resolveLocationToZips('28801', noDefault).zips).toEqual(['28801'])
  })
  it('passes through a ZIP list', () => {
    expect(resolveLocationToZips('28801, 28803', noDefault).zips).toEqual(['28801', '28803'])
  })
  it('drops invalid ZIPs from a list, with a note', () => {
    const geo = resolveLocationToZips('28801, 00000', noDefault)
    expect(geo.zips).toEqual(['28801'])
    expect(geo.note).toMatch(/00000/)
  })
  it('returns null for an all-invalid ZIP list', () => {
    expect(resolveLocationToZips('00000', noDefault)).toBeNull()
  })

  // --- city + state, every format ---
  it('resolves "Asheville, NC"', () => {
    expect(resolveLocationToZips('Asheville, NC', noDefault).zips.length).toBe(11)
  })
  it('resolves "Asheville, North Carolina"', () => {
    expect(resolveLocationToZips('Asheville, North Carolina', noDefault).zips.length).toBe(11)
  })
  it('resolves "Asheville North Carolina" (no comma)', () => {
    expect(resolveLocationToZips('Asheville North Carolina', noDefault).zips.length).toBe(11)
  })
  it('is case-insensitive', () => {
    expect(resolveLocationToZips('aShEvIlLe, nc', noDefault).zips.length).toBe(11)
  })

  it('ignores a trailing ZIP in "City, ST 28801"', () => {
    expect(resolveLocationToZips('Asheville, NC 28801', noDefault).zips.length).toBe(11)
  })

  // --- states ---
  it('resolves a state abbreviation ("NC")', () => {
    expect(resolveLocationToZips('NC', noDefault).zips.length).toBe(1091)
  })
  it('resolves lowercase full state name', () => {
    expect(resolveLocationToZips('north carolina', noDefault).zips.length).toBe(1091)
  })
  it('resolves other states too ("TX")', () => {
    expect(resolveLocationToZips('TX', noDefault).zips.length).toBeGreaterThan(1000)
  })

  // --- ambiguous bare cities: never refuse a real US city ---
  it('"Greenville" prefers LEAD_DEFAULT_STATE when set', () => {
    const geo = resolveLocationToZips('Greenville', { defaultState: 'NC' })
    expect(geo.stateAbbrev).toBe('NC')
    expect(geo.note).toMatch(/exists in \d+ states/)
  })
  it('"Greenville" without a default still resolves (largest wins)', () => {
    const geo = resolveLocationToZips('Greenville', noDefault)
    expect(geo).not.toBeNull()
    expect(geo.zips.length).toBeGreaterThan(0)
    expect(geo.note).toMatch(/used [A-Z]{2}/)
  })
  it('city+state wins over ambiguity ("Greenville, SC")', () => {
    const geo = resolveLocationToZips('Greenville, SC', noDefault)
    expect(geo.stateAbbrev).toBe('SC')
    expect(geo.note).toBeUndefined()
  })

  // --- true no-match + did-you-mean ---
  it('returns null only for a true no-match', () => {
    expect(resolveLocationToZips('Xyzzyville', noDefault)).toBeNull()
    expect(resolveLocationToZips('', noDefault)).toBeNull()
  })
  it('suggest() offers a did-you-mean for a typo', () => {
    const s = suggest('Ashvile')
    expect(s).toMatch(/Ashe?ville \(/)
  })
  it('suggest() stays quiet when the city exists', () => {
    expect(suggest('Asheville')).toBeNull()
  })

  // --- cap + helpers ---
  it('LEAD_GEO_MAX_ZIPS caps output with a note', () => {
    const geo = resolveLocationToZips('North Carolina', { defaultState: '', maxZips: 500 })
    expect(geo.zips.length).toBe(500)
    expect(geo.note).toMatch(/sampled 500 of 1091/)
    expect(stateAbbrevOf('North Carolina')).toBe('NC')
    expect(STATE_NAMES.NC).toBe('North Carolina')
  })

  it('sampleZips spreads a capped list across the whole range, not one corner', () => {
    const all = resolveLocationToZips('North Carolina', noDefault).zips
    const sampled = sampleZips(all, 100)
    expect(sampled.length).toBe(100)
    expect(new Set(sampled).size).toBe(100)
    // First and last ZIPs of the state's range are both represented — an
    // even stride keeps statewide coverage (slice(0,100) would not).
    expect(sampled[0]).toBe(all[0])
    expect(Number(sampled[99])).toBeGreaterThan(Number(all[Math.floor(all.length * 0.9)]) - 1000)
    // Under the cap it passes through untouched.
    expect(sampleZips(['28801'], 100)).toEqual(['28801'])
  })
})
