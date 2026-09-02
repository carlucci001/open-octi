import { describe, expect, it } from 'vitest'

import { buildFeatureManifest, capabilityStatus } from '../lib/feature-manifest'

describe('external capability manifest', () => {
  it('boots with only the required CRM session secret and reports providers as not configured', () => {
    const manifest = buildFeatureManifest({ CRM_SESSION_SECRET: 'test-only' })

    expect(manifest.capabilities.length).toBeGreaterThan(20)
    expect(manifest.capabilities.every(item => item.status === 'not_configured')).toBe(true)
    expect(manifest.notConfigured).toContain('openai')
    expect(manifest.notConfigured).toContain('anthropic')
    expect(manifest.notConfigured).toContain('openclaw')
    expect(manifest.notConfigured).toContain('stripe')
  })

  it('does not expose values and supports alternative credential names', () => {
    const env = {
      OPENAI_API_KEY: 'must-not-appear',
      VERCEL_TOKEN: 'must-not-appear-either',
    }
    const manifest = buildFeatureManifest(env)
    const serialized = JSON.stringify(manifest)

    expect(capabilityStatus('openai', env).status).toBe('configured')
    expect(capabilityStatus('vercel', env).status).toBe('configured')
    expect(serialized).not.toContain(env.OPENAI_API_KEY)
    expect(serialized).not.toContain(env.VERCEL_TOKEN)
  })
})
