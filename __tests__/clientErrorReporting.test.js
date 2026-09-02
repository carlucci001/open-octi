import { describe, expect, it } from 'vitest'

import { signatureOf } from '@/lib/client-error'

describe('client crash reporting', () => {
  it('groups repeats of the same fault by message + first stack frame', () => {
    const a = {
      message: "Cannot read properties of undefined (reading 'emails')",
      stack: 'TypeError\n    at ActivityPulseCard (Dashboard.js:228:60)\n    at renderWithHooks',
    }
    const b = {
      message: "Cannot read properties of undefined (reading 'emails')",
      stack: 'TypeError\n    at ActivityPulseCard (Dashboard.js:228:60)\n    at somewhereElse',
    }
    expect(signatureOf(a)).toBe(signatureOf(b))
  })

  it('separates different faults so one cooldown cannot mask another', () => {
    const a = { message: 'Boom', stack: 'Error\n    at A (x.js:1:1)' }
    const b = { message: 'Boom', stack: 'Error\n    at B (y.js:2:2)' }
    expect(signatureOf(a)).not.toBe(signatureOf(b))
  })

  it('never throws on a malformed report', () => {
    expect(() => signatureOf(undefined)).not.toThrow()
    expect(() => signatureOf({})).not.toThrow()
    expect(signatureOf({})).toBe('::')
  })
})
