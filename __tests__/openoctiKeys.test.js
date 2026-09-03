import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFeatureManifest } from '../lib/feature-manifest'
import {
  effectiveProviderEnv,
  listOpenOctiKeyStatus,
  openOctiKeyStorePath,
  removeOpenOctiProviderKey,
  resolveProviderKey,
  storeOpenOctiProviderKey,
  syncOpenOctiKeysToOpenClaw,
  validateOpenOctiProviderKey,
} from '../lib/openocti-keys'

const temporaryDirs = []

function testEnv(extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-keys-'))
  temporaryDirs.push(directory)
  return {
    FCC_EDITION: 'openocti',
    CRM_DATA_DIR: directory,
    CRM_SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    ...extra,
  }
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('OpenOcti encrypted provider keys', () => {
  it('exposes only owner/admin management UI and never serializes plaintext keys', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/openocti/keys/route.js'), 'utf8')
    const page = fs.readFileSync(path.join(process.cwd(), 'app/settings/OpenOctiModelsSettings.js'), 'utf8')
    expect(route).toContain("requireCapability(request, 'system:manage')")
    expect(route).toContain('listOpenOctiKeyStatus()')
    expect(route).not.toMatch(/key:\s*key[,}]/)
    for (const provider of ['anthropic', 'openai', 'gemini', 'openrouter', 'elevenlabs']) {
      expect(page).toContain(`${provider}:`)
    }
    expect(page).toContain('Save & test')
    expect(page).toContain('Talk to Craig')
    for (const agent of ['Maggie', 'Craig', 'Sasha', 'Linda', 'Matilda', 'Octi']) {
      expect(route).toContain(`name: '${agent}'`)
    }
  })

  it('stores ciphertext, resolves app before env, and exposes only masked status', () => {
    const env = testEnv({ OPENAI_API_KEY: 'environment-fallback-value' })
    const appKey = 'application-provider-value-4827'
    storeOpenOctiProviderKey('openai', appKey, env)

    const raw = fs.readFileSync(openOctiKeyStorePath(env), 'utf8')
    expect(raw).not.toContain(appKey)
    expect(raw).toContain('aes-256-gcm')
    expect(resolveProviderKey('openai', env)).toMatchObject({ key: appKey, source: 'app' })
    expect(effectiveProviderEnv(env).OPENAI_API_KEY).toBe(appKey)

    const status = listOpenOctiKeyStatus(env).find(item => item.id === 'openai')
    expect(status).toMatchObject({ status: 'configured', source: 'app', last4: '4827' })
    expect(JSON.stringify(status)).not.toContain(appKey)
    expect(buildFeatureManifest(env, { providerStatuses: listOpenOctiKeyStatus(env) }).capabilities.find(item => item.id === 'openai')).toMatchObject({ status: 'configured', source: 'app' })

    removeOpenOctiProviderKey('openai', env)
    expect(resolveProviderKey('openai', env)).toMatchObject({ key: 'environment-fallback-value', source: 'env' })
  })

  it.each(['anthropic', 'openai', 'gemini', 'openrouter', 'elevenlabs'])('validates %s with a read-only request', async provider => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(validateOpenOctiProviderKey(provider, 'test-provider-value', { fetchImpl })).resolves.toEqual({ ok: true, provider })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET')
  })

  it('writes the provider block and agent model for OpenClaw file-watch reload', () => {
    const env = testEnv()
    const configPath = path.join(env.CRM_DATA_DIR, 'openclaw.json')
    env.OPENCLAW_CONFIG_PATH = configPath
    fs.writeFileSync(configPath, JSON.stringify({
      models: { providers: { custom: { api: 'custom' } } },
      agents: { defaults: {}, list: [{ id: 'main' }, { id: 'coding' }] },
    }))
    storeOpenOctiProviderKey('anthropic', 'application-provider-value', env)

    expect(syncOpenOctiKeysToOpenClaw(env)).toMatchObject({
      updated: true,
      reload: 'automatic-file-watch',
      provider: 'anthropic',
      agents: ['main', 'coding'],
    })
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    expect(config.models.providers.custom).toEqual({ api: 'custom' })
    expect(config.models.providers.anthropic).toMatchObject({
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
    })
    expect(config.models.providers.anthropic.apiKey).toBe('application-provider-value')
    expect(config.agents.defaults.model.primary).toBe('anthropic/claude-sonnet-4-6')
    expect(config.agents.list.every(agent => agent.model.primary === 'anthropic/claude-sonnet-4-6')).toBe(true)
  })
})
