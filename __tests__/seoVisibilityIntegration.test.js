import { describe, expect, it } from 'vitest'

import { verifyVisibilitySignature } from '@/lib/seo-visibility-signature'

describe('SEO Visibility integration receiver', () => {
  it('accepts a current valid HMAC and rejects a modified payload', () => {
    const secret = ['test', 'webhook', 'secret'].join('-')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const rawBody = JSON.stringify({ id: 'event_1', type: 'audit.completed' })
    const crypto = require('node:crypto')
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64url')

    expect(
      verifyVisibilitySignature({
        secret,
        timestamp,
        rawBody,
        supplied: `v1=${signature}`,
      }),
    ).toBe(true)
    expect(
      verifyVisibilitySignature({
        secret,
        timestamp,
        rawBody: `${rawBody} `,
        supplied: `v1=${signature}`,
      }),
    ).toBe(false)
  })
})
