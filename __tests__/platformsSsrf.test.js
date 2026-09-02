// Platforms M1 — SSRF guard acceptance: loopback, private, link-local, CGNAT,
// metadata, multicast, and mapped-IPv6 addresses are rejected; HTTP, embedded
// credentials, and off-policy ports are rejected; manifests may not override
// the registered host.
import { describe, expect, it } from 'vitest'
import { assertSafePlatformUrl, isPrivateAddress, isPrivateIPv4, parsePlatformUrl } from '../lib/platforms/ssrf'
import { validatePlatformManifest } from '../lib/platforms/manifest'
import { assertCredentialRef } from '../lib/platforms/registry'

describe('isPrivateIPv4', () => {
  it.each([
    '127.0.0.1', '10.0.0.8', '172.16.0.1', '172.31.255.255', '127.0.0.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
  ])('blocks %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '203.0.113.10', '104.16.132.229'])('allows public %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(false)
  })
})

describe('isPrivateAddress (IPv6)', () => {
  it.each(['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it('allows public IPv6', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false)
  })
})

describe('parsePlatformUrl', () => {
  it('rejects HTTP', () => {
    expect(() => parsePlatformUrl('http://example.com')).toThrow(/HTTPS/)
  })

  it('rejects embedded credentials', () => {
    expect(() => parsePlatformUrl('https://user:pass@example.com')).toThrow(/credentials/)
  })

  it('rejects off-policy ports', () => {
    expect(() => parsePlatformUrl('https://example.com:8080')).toThrow(/Port/)
  })

  it('rejects localhost and internal hostnames without DNS', () => {
    expect(() => parsePlatformUrl('https://localhost')).toThrow(/not reachable/)
    expect(() => parsePlatformUrl('https://metadata.google.internal')).toThrow(/not reachable/)
    expect(() => parsePlatformUrl('https://api.corp.internal')).toThrow(/not reachable/)
  })

  it('accepts a normal HTTPS URL', () => {
    expect(parsePlatformUrl('https://getfound3.com').hostname).toBe('getfound3.com')
    expect(parsePlatformUrl('https://example.com:8443').port).toBe('8443')
  })
})

describe('assertSafePlatformUrl (IP literals — no network needed)', () => {
  it.each([
    'https://127.0.0.1', 'https://10.1.2.3', 'https://169.254.169.254',
    'https://127.0.0.1', 'https://[::1]', 'https://[fd00::2]',
  ])('rejects %s', async (url) => {
    await expect(assertSafePlatformUrl(url)).rejects.toThrow()
  })

  it('accepts a public IP literal', async () => {
    const url = await assertSafePlatformUrl('https://203.0.113.10')
    expect(url.hostname).toBe('203.0.113.10')
  })
})

describe('validatePlatformManifest', () => {
  const good = {
    schemaVersion: '1.0',
    platform: { id: 'getfound3', name: 'GetFound3', version: '1.8.0', adminApiBasePath: '/api/platform-admin/v1' },
  }

  it('accepts a well-formed manifest', () => {
    expect(validatePlatformManifest(good)).toEqual([])
  })

  it('rejects a manifest that tries to override the registered host', () => {
    const hostile = { ...good, platform: { ...good.platform, baseUrl: 'https://evil.example.com' } }
    expect(validatePlatformManifest(hostile).join(' ')).toMatch(/registered host is authoritative/)
  })

  it('rejects an absolute adminApiBasePath', () => {
    const hostile = { ...good, platform: { ...good.platform, adminApiBasePath: 'https://evil.example.com/api' } }
    expect(validatePlatformManifest(hostile).join(' ')).toMatch(/relative path/)
  })

  it('rejects missing identity fields', () => {
    expect(validatePlatformManifest({ schemaVersion: '1.0', platform: {} }).length).toBeGreaterThan(0)
    expect(validatePlatformManifest(null).length).toBeGreaterThan(0)
  })
})

describe('assertCredentialRef', () => {
  it('accepts vault reference names', () => {
    expect(assertCredentialRef('GetFound3 Admin')).toBe('GetFound3 Admin')
    expect(assertCredentialRef('')).toBe('')
  })

  it('rejects raw-secret-shaped values', () => {
    expect(() => assertCredentialRef('sk-fakefakefake')).toThrow(/raw secret/)
    expect(() => assertCredentialRef('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toThrow(/raw secret/)
    expect(() => assertCredentialRef('x'.repeat(90))).toThrow(/raw secret/)
  })
})
