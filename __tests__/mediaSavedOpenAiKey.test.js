import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const credentials = vi.hoisted(() => ({ vault: {}, key: '', source: 'none', documents: {}, chain: ['openai'] }))
const references = vi.hoisted(() => ({ fetch: vi.fn(), website: vi.fn() }))
vi.mock('../lib/safe-url-fetch', () => ({ safeFetchBuffer: references.fetch }))
vi.mock('../lib/website-creative-reference', () => ({ readWebsiteReference: references.website }))
vi.mock('../lib/dataStore', () => ({
  readData: name => structuredClone(credentials.documents[name] || null),
  writeData: (name, data) => { credentials.documents[name] = structuredClone(data) },
  mutateData: (name, fn) => { const outcome = fn(structuredClone(credentials.documents[name] || null)); credentials.documents[name] = outcome.data; return outcome.result },
}))
vi.mock('../lib/agent-creds', () => ({ getCred: name => credentials.vault[name] || null }))
vi.mock('../lib/openocti-keys', () => ({
  resolveProviderKey: vi.fn(() => ({ key: credentials.key, source: credentials.source })),
}))
vi.mock('../lib/image-provider-chain', () => ({ getImageProviderChain: () => credentials.chain }))
vi.mock('@fal-ai/client', () => ({ fal: {} }))

let temporaryRoot
let generateMedia
let providerFetch
const request = { prompt: 'A simple blue circle on white.', provider: 'openai', quality: 'low', useBrandReferences: false }

beforeEach(async () => {
  vi.resetModules()
  credentials.vault = {}
  credentials.documents = {}
  credentials.chain = ['openai']
  credentials.key = 'test-app-model-key'
  credentials.source = 'app'
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-media-key-test-'))
  vi.stubEnv('CRM_DATA_DIR', temporaryRoot)
  for (const name of ['OPENAI_API_KEY', 'OPENAI_IMAGE_API_KEY', 'OPENAI_IMAGES_API_KEY']) vi.stubEnv(name, '')
  const pixels = Buffer.from([255,0,0,0,255,0,0,0,255,255,255,255])
  const png = await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } }).png().toBuffer()
  providerFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 }))
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
  it('keeps reference images when falling back directly to Gemini', async () => {
    credentials.chain = ['openai', 'gemini']
    credentials.vault.gemini = { key: 'test-google-key' }
    const pixels = Buffer.from([255,0,0,0,255,0,0,0,255,255,255,255])
    const png = await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } }).png().toBuffer()
    references.fetch.mockResolvedValue({ buffer: png, finalUrl: 'https://example.com/reference.png' })
    providerFetch.mockImplementation(async url => String(url).includes('api.openai.com')
      ? new Response(JSON.stringify({ error: { code: 'unavailable' } }), { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: png.toString('base64') } }] } }] })))
    const item = await generateMedia({ ...request, referenceImageUrl: 'https://example.com/reference.png' })
    expect(item.provider).toBe('gemini')
    const google = providerFetch.mock.calls.find(([url]) => String(url).includes('googleapis.com'))
    expect(JSON.parse(google[1].body).contents[0].parts[1].inlineData.data).toBe(png.toString('base64'))
    expect(String(google[0])).not.toContain('test-google-key')
  })
  it('stops before a paid request when a required logo has no verified source', async () => {
    await expect(generateMedia({ ...request, logoRequired: true })).rejects.toThrow(/Logo check/)
    expect(providerFetch).not.toHaveBeenCalled()
    expect(credentials.documents['media.json']?.items || []).toHaveLength(0)
  })
  it('supplies the authentic website logo and saves the complete composition without stamping a duplicate', async () => {
    const logo = await sharp({ create: { width: 10, height: 5, channels: 3, background: '#ff00ff' } }).png().toBuffer()
    const canvas = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).composite([{ input: logo, left: 50, top: 50 }]).png().toBuffer()
    references.website.mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Example business', description: '', logoCandidates: [{ url: 'https://example.com/logo.png' }] })
    references.fetch.mockResolvedValue({ buffer: logo, finalUrl: 'https://example.com/logo.png' })
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: canvas.toString('base64') }] })))
    const item = await generateMedia({ ...request, websiteUrl: 'https://example.com/', logoRequired: true })
    expect(item.logoCheck).toMatchObject({ required: true, status: 'reference_artwork_supplied', source: 'https://example.com/logo.png', requiresVisualReview: true })
    const sentRequest = JSON.parse(providerFetch.mock.calls[0][1].body)
    const sentLogo = Buffer.from(sentRequest.images[0].image_url.split(',')[1], 'base64')
    expect(await sharp(sentLogo).raw().toBuffer()).toEqual(await sharp(logo).raw().toBuffer())
    const sentPrompt = sentRequest.prompt
    expect(sentPrompt).toContain('Integrate it once')
    expect(sentPrompt).toContain('Continue the photograph, illustration or background naturally behind the logo')
    expect(sentPrompt).toContain('Do NOT create a separate footer, full-width blank band')
    expect(sentPrompt).not.toContain('quiet lower 20 percent')
    expect(fs.readFileSync(path.join(temporaryRoot, 'media', item.file))).toEqual(canvas)
  })
  it('does not generate branded content with a provider that cannot receive the logo', async () => {
    const logo = await sharp({ create: { width: 10, height: 5, channels: 3, background: '#ff00ff' } }).png().toBuffer()
    credentials.chain = ['imagen']
    references.fetch.mockResolvedValue({ buffer: logo, finalUrl: 'https://example.com/logo.png' })
    await expect(generateMedia({ ...request, logoRequired: true, logoImageUrl: 'https://example.com/logo.png' })).rejects.toThrow(/cannot use the verified logo reference/)
    expect(providerFetch).not.toHaveBeenCalled()
    expect(credentials.documents['media.json']?.items || []).toHaveLength(0)
  })
  it('generates and saves an image when only the app model key is configured', async () => {
    const item = await generateMedia(request)
    expect(item.provider).toBe('openai')
    expect(item.model).toBe('gpt-image-2')
    expect(item.width).toBe(2)
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(providerFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-app-model-key')
    expect(fs.existsSync(path.join(temporaryRoot, 'media', item.file))).toBe(true)
  })

  it('rejects a blank image without creating a media record', async () => {
    const blank = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer()
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: blank.toString('base64') }] })))
    await expect(generateMedia(request)).rejects.toThrow(/blank/)
    expect(credentials.documents['media.json']?.items || []).toHaveLength(0)
  })

  it('rejects a successful HTTP response containing invalid image bytes', async () => {
    providerFetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('<html>error</html>').toString('base64') }] })))
    await expect(generateMedia(request)).rejects.toThrow(/unreadable/)
    expect(credentials.documents['media.json']?.items || []).toHaveLength(0)
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

  it('uses the saved OpenAI API credential before a stale general server key', async () => {
    credentials.key = 'stale-server-key'
    credentials.vault['openai api'] = { key: 'working-vault-key' }
    await generateMedia(request)
    expect(providerFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer working-vault-key')
  })

  it('picks up a newly saved key on the next request without restarting', async () => {
    await generateMedia(request)
    credentials.key = 'test-newly-saved-key'
    await generateMedia(request)
    expect(providerFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer test-newly-saved-key')
  })
})
