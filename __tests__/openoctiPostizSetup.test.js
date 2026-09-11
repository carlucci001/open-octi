// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
vi.mock('../lib/dataStore', () => ({ readData: () => null }))
import { inspectPostiz } from '../lib/postiz-diagnostics'
import { getPostizConfig, effectivePostizEnv } from '../lib/postiz-config'
import { readOpenOctiPostizSettings, saveOpenOctiPostizSettings } from '../lib/openocti-postiz-settings'
import { preparePostizEnvironment } from '../scripts/setup-openocti-postiz.mjs'
import { testIntegrationConnection } from '../lib/integration-probes'

const folders = []
const temp = () => { const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-postiz-test-')); folders.push(folder); return folder }
afterEach(() => { vi.unstubAllGlobals(); for (const folder of folders.splice(0)) { if (path.dirname(folder) !== os.tmpdir() || !path.basename(folder).startsWith('openocti-postiz-test-')) throw new Error('Unsafe test cleanup'); fs.rmSync(folder, { recursive: true, force: true }) } })
const env = () => ({ FCC_EDITION: 'openocti', CRM_DATA_DIR: temp(), CRM_SESSION_SECRET: 'isolated-test-secret', POSTIZ_API_URL: 'http://postiz:5000/api/public/v1', POSTIZ_API_KEY: 'test-only-key' })
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('Postiz installation and sanitized diagnostics', () => {
  it('creates different installation secrets and preserves them on repeated setup', () => {
    const root = temp()
    fs.writeFileSync(path.join(root, '.env'), 'UNRELATED=value\nPOSTIZ_JWT_SECRET=\n')
    expect(preparePostizEnvironment(root).created).toBe(3)
    const before = fs.readFileSync(path.join(root, '.env'), 'utf8')
    expect(before).toContain('UNRELATED=value')
    expect(new Set([...before.matchAll(/POSTIZ_\w+=([a-f0-9]{64})/g)].map(match => match[1])).size).toBe(3)
    expect(preparePostizEnvironment(root).created).toBe(0)
    expect(fs.readFileSync(path.join(root, '.env'), 'utf8')).toBe(before)
  })
  it('encrypts the key, can read it after a new call, and resolves it for actual publishing', () => {
    const installation = env()
    const settings = { base: 'http://postiz:5000/api/public/v1', publicUrl: 'http://localhost:4007', key: 'saved-test-key' }
    saveOpenOctiPostizSettings(settings, installation)
    expect(fs.readFileSync(path.join(installation.CRM_DATA_DIR, 'openocti-postiz.json'), 'utf8')).not.toContain(settings.key)
    expect(readOpenOctiPostizSettings(installation)).toEqual(settings)
    expect(getPostizConfig(installation)).toEqual(settings)
    saveOpenOctiPostizSettings({ ...settings, key: '' }, installation)
    expect(getPostizConfig(installation).key).toBe(settings.key)
  })
  it('never falls back to an environment key after stored ciphertext is corrupted', () => {
    const installation = env()
    fs.writeFileSync(path.join(installation.CRM_DATA_DIR, 'openocti-postiz.json'), '{broken')
    expect(getPostizConfig(installation)).toHaveProperty('error')
    expect(effectivePostizEnv(installation).POSTIZ_API_KEY).toBe('')
  })
  it('does not read another edition’s saved Postiz settings', () => {
    const installation = { ...env(), FCC_EDITION: 'commandcenter' }
    expect(() => saveOpenOctiPostizSettings({ key: 'unused' }, installation)).toThrow('unavailable')
    expect(readOpenOctiPostizSettings(installation)).toBeNull()
  })
  it('does not probe an unconfigured installation', async () => {
    const fetchImpl = vi.fn()
    const state = await inspectPostiz({ FCC_EDITION: 'openocti', CRM_DATA_DIR: temp() }, { fetchImpl })
    expect(state.state).toBe('not_configured'); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([[[], 'no_channels', 0], [[{ id: 'one', disabled: false }, { id: 'two', disabled: true }], 'channels_connected', 1]])('distinguishes a valid empty API response from connected channels', async (channels, state, count) => {
    const fetchImpl = vi.fn(async () => response(channels))
    const result = await inspectPostiz(env(), { fetchImpl })
    expect(result).toMatchObject({ state, channelCount: count, scheduled: 'not_verified', published: 'not_verified' })
    expect(JSON.stringify(result)).not.toMatch(/test-only-key|http:\/\/postiz|"one"|"two"/)
    expect(fetchImpl).toHaveBeenCalledWith('http://postiz:5000/api/public/v1/integrations', expect.objectContaining({ headers: { Authorization: 'test-only-key' }, redirect: 'error' }))
  })
  it.each([401, 403])('reports rejected keys without upstream body contents (%s)', async status => {
    const result = await inspectPostiz(env(), { fetchImpl: async () => response({ secret: 'upstream-secret' }, status) })
    expect(result.state).toBe('invalid_key'); expect(JSON.stringify(result)).not.toContain('upstream-secret')
  })
  it('reports HTML and unreachability without reflecting remote errors', async () => {
    expect((await inspectPostiz(env(), { fetchImpl: async () => new Response('<html>login</html>') })).state).toBe('invalid_response')
    const result = await inspectPostiz(env(), { fetchImpl: async () => { throw new Error('secret internal endpoint') } })
    expect(result.state).toBe('unreachable'); expect(JSON.stringify(result)).not.toContain('secret internal endpoint')
  })
  it('preserves the 1.2.4 complete API path and raw authorization format', async () => {
    const fetchImpl = vi.fn(async () => response([])); vi.stubGlobal('fetch', fetchImpl)
    expect(await testIntegrationConnection('postiz', env())).toMatchObject({ ok: true, message: expect.stringContaining('Publishing has not been tested') })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://postiz:5000/api/public/v1/integrations')
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('test-only-key')
  })
})
