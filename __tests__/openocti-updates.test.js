import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearReleaseCacheForTests,
  compareVersions,
  fetchLatestRelease,
  normalizeVersion,
  readInstalledVersion,
  updateConfiguration,
} from '@/lib/openocti-updates.mjs'

afterEach(() => clearReleaseCacheForTests())

describe('OpenOcti update metadata', () => {
  it('normalizes and compares stable semantic versions', () => {
    expect(normalizeVersion('v1.4.2')).toBe('1.4.2')
    expect(normalizeVersion('1.5.0-beta.1')).toBe('1.5.0')
    expect(normalizeVersion('latest')).toBeNull()
    expect(compareVersions('1.5.0', '1.4.9')).toBe(1)
    expect(compareVersions('1.4.2', 'v1.4.2')).toBe(0)
    expect(compareVersions('1.3.9', '1.4.0')).toBe(-1)
  })

  it('reads the packaged version without exposing installation data', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-version-'))
    fs.writeFileSync(path.join(root, 'VERSION.json'), JSON.stringify({ version: '2.3.4' }))
    expect(readInstalledVersion(root, {})).toBe('2.3.4')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('uses an edition-configurable product and repository', () => {
    expect(updateConfiguration({
      OPENOCTI_UPDATE_PRODUCT: 'Example Edition',
      OPENOCTI_UPDATE_REPOSITORY: 'example/example-edition',
      OPENOCTI_UPDATER_SOCKET: '/tmp/example.sock',
      OPENOCTI_UPDATER_TOKEN: 'private-token',
    })).toEqual({ product: 'Example Edition', repository: 'example/example-edition', socketPath: '/tmp/example.sock', token: 'private-token' })
  })

  it('accepts only the latest official semantic release response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v1.5.0', name: 'OpenOcti 1.5.0', published_at: '2026-09-27T00:00:00Z', html_url: 'https://github.com/carlucci001/open-octi/releases/tag/v1.5.0' }),
    }))
    const release = await fetchLatestRelease({ repository: 'carlucci001/open-octi', fetchImpl })
    expect(release.version).toBe('1.5.0')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects an untrusted repository name before making a request', async () => {
    const fetchImpl = vi.fn()
    await expect(fetchLatestRelease({ repository: 'example/../escape', fetchImpl })).rejects.toThrow('invalid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
