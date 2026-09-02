// lib/platforms/manifest.js
// Platform manifest fetch + validation (handoff doc §8).
// Every participating product exposes GET /.well-known/farrington-platform.json —
// descriptive, versioned, no secrets. The manifest advertises capabilities; it is
// never permission by itself, and it may NOT point the control plane at a
// different host than the registered one.

import { assertSafePlatformUrl, guardedFetch } from './ssrf'

export const PLATFORM_MANIFEST_PATH = '/.well-known/farrington-platform.json'
export const PLATFORM_ADMIN_CAPABILITIES = [
  'customers',
  'subscriptions',
  'actions',
  'health',
  'releases',
  'errors',
  'usage',
  'revenue',
]

export function extractManifestCapabilities(manifest) {
  const capabilities = manifest?.capabilities
  if (Array.isArray(capabilities)) {
    return [...new Set(capabilities.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))]
  }
  if (capabilities && typeof capabilities === 'object') {
    return Object.entries(capabilities)
      .filter(([, value]) => value === true || (value && typeof value === 'object' && (value.read === true || value.update === true || value.outbound === true)))
      .map(([name]) => name)
  }
  return []
}

export function validatePlatformManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Manifest must be a JSON object.']
  }
  const problems = []
  if (typeof manifest.schemaVersion !== 'string' || !manifest.schemaVersion.trim()) {
    problems.push('schemaVersion is missing.')
  }
  const platform = manifest.platform
  if (!platform || typeof platform !== 'object') {
    problems.push('platform block is missing.')
    return problems
  }
  if (!String(platform.id || '').trim()) problems.push('platform.id is missing.')
  if (!String(platform.name || '').trim()) problems.push('platform.name is missing.')
  if (platform.adminApiBasePath && !String(platform.adminApiBasePath).startsWith('/')) {
    problems.push('platform.adminApiBasePath must be a relative path.')
  }
  if (manifest.capabilities !== undefined) {
    const validArray = Array.isArray(manifest.capabilities) && manifest.capabilities.every(value => typeof value === 'string' && value.trim())
    const validLegacyObject = manifest.capabilities && typeof manifest.capabilities === 'object' && !Array.isArray(manifest.capabilities)
    if (!validArray && !validLegacyObject) {
      problems.push('capabilities must be an array of strings or a v1 capability object.')
    }
  }
  // The registered host is authoritative — a manifest may not redirect the
  // control plane elsewhere (handoff doc §11, last rule).
  for (const key of ['adminApiBaseUrl', 'baseUrl', 'host', 'url']) {
    if (platform[key] !== undefined) problems.push(`platform.${key} is not allowed — the registered host is authoritative.`)
  }
  return problems
}

// Returns { ok, status, note, manifest? }. Throws only on SSRF/URL violations
// (those are registration errors the caller should surface loudly).
export async function fetchPlatformManifest(baseUrl) {
  const url = await assertSafePlatformUrl(baseUrl)
  const manifestUrl = new URL(PLATFORM_MANIFEST_PATH, url.origin).toString()

  let response
  try {
    response = await guardedFetch(manifestUrl)
  } catch (error) {
    return { ok: false, status: 0, note: error.message || 'Manifest request failed.' }
  }
  if (!response.ok) {
    return { ok: false, status: response.status, note: `Manifest request returned HTTP ${response.status}. The platform may not publish a Farrington manifest yet.` }
  }
  if (!/json/i.test(response.contentType)) {
    return { ok: false, status: response.status, note: `Manifest content-type was "${response.contentType || 'unknown'}" — expected JSON.` }
  }
  let manifest
  try {
    manifest = JSON.parse(response.text)
  } catch {
    return { ok: false, status: response.status, note: 'Manifest was not valid JSON.' }
  }
  const problems = validatePlatformManifest(manifest)
  if (problems.length) {
    return { ok: false, status: response.status, note: `Manifest failed validation: ${problems.join(' ')}`, manifest }
  }
  return { ok: true, status: response.status, note: 'Manifest fetched and validated.', manifest }
}
