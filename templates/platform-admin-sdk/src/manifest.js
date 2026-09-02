import { PLATFORM_ADMIN_CAPABILITIES } from './contract.js'

export function buildPlatformManifest({ id, name, version, adminApiBasePath = '/api/platform-admin/v1', capabilities = PLATFORM_ADMIN_CAPABILITIES, audience } = {}) {
  if (!String(id || '').trim() || !String(name || '').trim() || !String(version || '').trim()) {
    throw new Error('id, name, and version are required')
  }
  return {
    schemaVersion: '2.0',
    platform: { id: String(id), name: String(name), version: String(version), adminApiBasePath },
    authentication: { methods: ['bearer'], ...(audience ? { audience: String(audience) } : {}) },
    capabilities: [...new Set(capabilities.filter(value => PLATFORM_ADMIN_CAPABILITIES.includes(value)))],
  }
}
