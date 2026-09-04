import { describe, expect, it } from 'vitest'

import { buildFeatureManifest, capabilityStatus, requiredCapabilityReport } from '../lib/feature-manifest'

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

  it('maps every declared requirement to a real settings anchor', () => {
    const manifest = buildFeatureManifest({ CRM_SESSION_SECRET: 'test-only', FCC_EDITION: 'openocti' })
    for (const capability of manifest.capabilities) {
      for (const need of capability.needs) {
        const link = capability.settings.find(item => item.need === need)
        expect(link, `${capability.id}:${need}`).toBeTruthy()
        expect(link.href, `${capability.id}:${need}`).toMatch(/^\/settings(?:\/models)?#[-a-z0-9]+$/)
      }
    }
  })

  it('declares ElevenLabs as required for Command Center and reports it unresolved', () => {
    const report = requiredCapabilityReport({ FCC_EDITION: 'commandcenter' })

    expect(report.edition).toBe('commandcenter')
    expect(report.required.map(item => item.id)).toEqual(['elevenlabs'])
    expect(report.unresolved.map(item => item.id)).toEqual(['elevenlabs'])
  })

  it('accepts required provider capabilities resolved from env or vault', () => {
    expect(requiredCapabilityReport({ FCC_EDITION: 'commandcenter', ELEVENLABS_API_KEY: 'configured-in-env' }).unresolved).toEqual([])
    expect(requiredCapabilityReport(
      { FCC_EDITION: 'commandcenter' },
      { providerStatuses: [{ id: 'elevenlabs', status: 'configured', source: 'vault' }] },
    )).toMatchObject({
      unresolved: [],
      required: [{ id: 'elevenlabs', status: 'configured', source: 'vault', required: true }],
    })
  })

  it('does not require a provider before OpenOcti BYOK setup is complete', () => {
    expect(requiredCapabilityReport({ FCC_EDITION: 'openocti' })).toMatchObject({
      edition: 'openocti',
      required: [],
      unresolved: [],
    })
  })
})
