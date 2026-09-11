import { describe, expect, it, vi } from 'vitest'

import { buildFeatureManifest, capabilityStatus, capabilityForPath, requireCapability, requiredCapabilityReport } from '../lib/feature-manifest'
import { commandCenterSectionsFor } from '../lib/commandCenterNavigation'

describe('OpenOcti administration navigation', () => {
  it('resolves old route names and voice requests to the Admin label', async () => {
    vi.stubEnv('FCC_EDITION', 'openocti')
    vi.resetModules()
    try {
      const { resolveCommandCenterTab, labelForCommandCenterTab } = await import('../lib/commandCenterNavigation')
      for (const alias of ['control-services', 'control services', 'admin', 'settings']) {
        expect(resolveCommandCenterTab(alias)).toBe('settings')
        expect(labelForCommandCenterTab(alias)).toBe('System > Admin')
      }
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('keeps one Admin screen while retaining legacy service navigation aliases', () => {
    const sections = commandCenterSectionsFor({ FCC_EDITION: 'openocti' })
    expect(sections.filter(section => ['settings', 'control-services'].includes(section.id))).toHaveLength(1)
    expect(sections.find(section => section.id === 'settings')).toMatchObject({
      label: 'System > Admin',
      aliases: expect.arrayContaining(['admin', 'control-services', 'control services', 'service catalog']),
    })
    expect(commandCenterSectionsFor({ FCC_EDITION: 'commandcenter' }).some(section => section.id === 'control-services')).toBe(true)
  })
})

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

  it('recognizes the existing Command Center site-note connection without an endpoint override', () => {
    const env = { FCC_EDITION: 'commandcenter', SITE_NOTE_SECRET: 'private-test-secret' }
    const manifest = buildFeatureManifest(env)

    expect(manifest.configured).toContain('site-note')
    expect(capabilityStatus('site-note', env)).toMatchObject({ status: 'configured', missing: [] })
    expect(requireCapability('site-note', env)).toBeNull()
    expect(JSON.stringify(manifest)).not.toContain(env.SITE_NOTE_SECRET)
    expect(capabilityStatus('site-note', { FCC_EDITION: 'commandcenter' }).missing).toEqual(['SITE_NOTE_SECRET'])
  })

  it('requires an independent endpoint and secret for OpenOcti site notes', () => {
    const env = { FCC_EDITION: 'openocti', SITE_NOTE_SECRET: 'installation-test-secret' }

    expect(capabilityStatus('site-note', env)).toMatchObject({
      status: 'not_configured',
      missing: ['SITE_NOTE_ENDPOINT'],
    })
    expect(requireCapability('site-note', env)).toMatchObject({
      status: 503,
      body: { capability: 'site-note', error: 'not_configured' },
    })
    expect(capabilityStatus('site-note', { ...env, SITE_NOTE_ENDPOINT: 'https://notes.example.test' }).status).toBe('configured')
    expect(capabilityStatus('site-note', {
      FCC_EDITION: 'openocti', SITE_NOTE_ENDPOINT: 'https://notes.example.test',
    }).missing).toEqual(['SITE_NOTE_SECRET'])
  })

  it('maps every declared requirement to a real settings anchor', () => {
    const manifest = buildFeatureManifest({ CRM_SESSION_SECRET: 'test-only', FCC_EDITION: 'openocti' })
    for (const capability of manifest.capabilities) {
      for (const need of capability.needs) {
        const link = capability.settings.find(item => item.need === need)
        expect(link, `${capability.id}:${need}`).toBeTruthy()
        if (['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PK'].includes(need)) {
          expect(link.href).toBe('/?tab=settings&settings=stripe')
        } else if (['POSTIZ_API_URL', 'POSTIZ_API_KEY', 'NEXT_PUBLIC_POSTIZ_URL'].includes(need)) {
          expect(link.href).toBe('/settings/postiz')
        } else {
          expect(link.href, `${capability.id}:${need}`).toMatch(/^\/settings(?:\/models)?#[-a-z0-9]+$/)
        }
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

  it('does not treat a voice key as an AI model provider', () => {
    const voiceOnly = buildFeatureManifest({ FCC_EDITION: 'openocti' }, {
      providerStatuses: [{ id: 'elevenlabs', source: 'app', status: 'configured' }],
    })
    expect(voiceOnly.notConfigured).toContain('models')
    const modelReady = buildFeatureManifest({ FCC_EDITION: 'openocti' }, {
      providerStatuses: [{ id: 'openai', source: 'app', status: 'configured' }],
    })
    expect(modelReady.configured).toContain('models')
  })

  it('keeps stored communications, flow definitions, and non-AI agent tools available without unrelated provider keys', () => {
    for (const path of ['/api/comms', '/api/communications', '/api/orchestrations', '/api/agent/execute']) {
      expect(capabilityForPath(path)).toBeNull()
    }
    expect(capabilityForPath('/api/twilio/calls')).toBe('twilio')
  })

  it('returns the standard fail-closed 503 shape when a capability is missing', () => {
    expect(requireCapability('daily', { FCC_EDITION: 'commandcenter' })).toMatchObject({
      status: 503,
      body: {
        ok: false,
        error: 'not_configured',
        capability: 'daily',
        keys: ['DAILY_API_KEY', 'DAILY_SUBDOMAIN'],
      },
    })
    expect(requireCapability('daily', { DAILY_API_KEY: 'set', DAILY_SUBDOMAIN: 'team' })).toBeNull()
  })

  it('lets OpenOcti model routes perform their encrypted key-store check', () => {
    expect(requireCapability('models', { FCC_EDITION: 'openocti' })).toBeNull()
    expect(requireCapability('daily', { FCC_EDITION: 'openocti' })).toBeNull()
    expect(requireCapability('models', { FCC_EDITION: 'commandcenter' })).toMatchObject({
      status: 503,
      body: { capability: 'models', error: 'not_configured' },
    })
  })
})
