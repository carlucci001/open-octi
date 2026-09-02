import { describe, expect, it } from 'vitest'
import {
  extractManifestCapabilities,
  PLATFORM_ADMIN_CAPABILITIES,
  validatePlatformManifest,
} from '../lib/platforms/manifest'

function manifest(overrides = {}) {
  return {
    schemaVersion: '2.0',
    platform: {
      id: 'example',
      name: 'Example',
      version: '1.0.0',
      adminApiBasePath: '/api/platform-admin/v1',
    },
    capabilities: [...PLATFORM_ADMIN_CAPABILITIES],
    ...overrides,
  }
}

describe('Platform Admin v2 manifest capabilities', () => {
  it('accepts the canonical v2 capability array and returns a stable unique list', () => {
    const value = manifest({
      capabilities: ['customers', 'subscriptions', 'health', 'customers', 'releases', 'errors'],
    })
    expect(validatePlatformManifest(value)).toEqual([])
    expect(extractManifestCapabilities(value)).toEqual([
      'customers',
      'subscriptions',
      'health',
      'releases',
      'errors',
    ])
  })

  it('normalizes the v1 capability object so legacy products keep working', () => {
    const value = manifest({
      schemaVersion: '1.0',
      capabilities: {
        health: { read: true },
        customers: { read: true },
        actions: false,
      },
    })
    expect(validatePlatformManifest(value)).toEqual([])
    expect(extractManifestCapabilities(value)).toEqual(['health', 'customers'])
  })

  it('rejects malformed capability declarations without treating them as permissions', () => {
    const value = manifest({ capabilities: 'health,releases' })
    expect(validatePlatformManifest(value)).toContain('capabilities must be an array of strings or a v1 capability object.')
    expect(extractManifestCapabilities(value)).toEqual([])
  })
})
