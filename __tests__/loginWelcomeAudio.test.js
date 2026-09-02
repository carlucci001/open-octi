import { describe, expect, it } from 'vitest'
import { buildLoginWelcomeText } from '../app/login/loginWelcomeAudio'

describe('login welcome audio', () => {
  it('uses Maggie welcome copy that offers help directly', () => {
    const text = buildLoginWelcomeText(
      { displayName: 'Carl Farrington' },
      'carl',
      new Date('2026-06-25T14:00:00-04:00'),
    )

    expect(text).toBe('Good afternoon Carl. Let me know if I can help you.')
  })
})
