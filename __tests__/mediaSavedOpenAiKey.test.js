import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const credentials = vi.hoisted(() => ({ vault: {}, key: '', source: 'none' }))
vi.mock('../lib/agent-creds', () => ({ getCred: name => credentials.vault[name] || null }))
vi.mock('../lib/openocti-keys', () => ({
  resolveProviderKey: vi.fn(() => ({ key: credentials.key, source: credentials.source })),
}))
vi.mock('../lib/image-provider-chain', () => ({ getImageProviderChain: () => ['openai'] }))
vi.mock('@fal-ai/client', () => ({ fal: {} }))

let temporaryRoot
let generateMedia
let providerFetch
const request = { prompt: 'A simple blue circle on white.', provider: 'openai', quality: 'low', useBrandReferences: false }

beforeEach(async () => {
  vi.resetModules()
  credentials.vault = {}
  credentials.key = 'test-app-model-key'
  credentials.source = 'app'
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-media-key-test-'))
  vi.stubEnv('CRM_DATA_DIR', temporaryRoot)
  for (const name of ['OPENAI_API_KEY', 'OPENAI_IMAGE_API_KEY', 'OPENAI_IMAGES_API_KEY']) vi.stubEnv(name, '')
  providerFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('synthetic-provider-image').toString('base64') }] }), { status: 200 }))
  vi.stubGlobal('fetch', providerFetch)
  ;({ generateMedia } = await import('../lib/media-gen'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
  if (temporaryRoot?.startsWith(path.join(os.tmpdir(), 'openocti-media-key-test-'))) fs.rmSync(temporaryRoot, { recursive: true, force: true })
})

describe('Media uses the saved OpenAI model key', () => {
  it('generates and saves an image when only the app model key is configured', async () => {
    const item = await generateMedia(request)
    expect(item.provider).toBe('openai')
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(providerFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-app-model-key')
    expect(fs.existsSync(path.join(temporaryRoot, 'media', item.file))).toBe(true)
  })

  it('uses the common resolver ahead of generic environment and legacy vault keys', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-general-environment-key')
    credentials.vault.openai = { key: 'test-general-vault-key' }
    await generateMedia(request)
    expect(providerFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-app-model-key')
  })

  it('preserves an explicitly configured image-only key override', async () => {
    vi.stubEnv('OPENAI_IMAGE_API_KEY', 'test-dedicated-image-key')
    await generateMedia(request)
    expect(providerFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-dedicated-image-key')
  })

  it('picks up a newly saved key on the next request without restarting', async () => {
    await generateMedia(request)
    credentials.key = 'test-newly-saved-key'
    await generateMedia(request)
    expect(providerFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer test-newly-saved-key')
  })
})
