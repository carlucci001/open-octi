import { describe, expect, it } from 'vitest'
import { applyLoginFailure, LOGIN_RATE_LIMITS, normalizeLoginIdentifier } from '../lib/login-rate-limit.js'

describe('login rate limiting', () => {
  it('normalizes login identifiers before counting attempts', () => {
    expect(normalizeLoginIdentifier(' redacted@example.invalid ')).toBe('redacted@example.invalid')
  })

  it('locks temporarily only after the configured username failure threshold', () => {
    const at = Date.parse('2026-05-30T19:30:00Z')
    let record = null

    for (let i = 1; i < LOGIN_RATE_LIMITS.userLimit; i += 1) {
      record = applyLoginFailure(record, LOGIN_RATE_LIMITS.userLimit, at + i)
      expect(record.lockedUntil).toBeNull()
      expect(record.failures).toBe(i)
    }

    record = applyLoginFailure(record, LOGIN_RATE_LIMITS.userLimit, at + LOGIN_RATE_LIMITS.userLimit)
    expect(record.failures).toBe(LOGIN_RATE_LIMITS.userLimit)
    expect(record.lockedUntil).toBe(at + LOGIN_RATE_LIMITS.userLimit + LOGIN_RATE_LIMITS.lockMs)
  })

  it('starts a fresh window after the failed-attempt window expires', () => {
    const at = Date.parse('2026-05-30T19:30:00Z')
    let record = applyLoginFailure(null, LOGIN_RATE_LIMITS.userLimit, at)

    record = applyLoginFailure(record, LOGIN_RATE_LIMITS.userLimit, at + LOGIN_RATE_LIMITS.windowMs + 1)
    expect(record.failures).toBe(1)
    expect(record.lockedUntil).toBeNull()
  })
})
