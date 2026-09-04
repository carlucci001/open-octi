import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { isOpenOcti } from './edition'
import { readData } from './dataStore'

export const OPENOCTI_MODEL_PROVIDERS = Object.freeze([
  { id: 'anthropic', name: 'Anthropic', vaultNames: ['Anthropic'], envKeys: ['ANTHROPIC_API_KEY'], testUrl: 'https://api.anthropic.com/v1/models', openclawId: 'anthropic', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6', modelName: 'Claude Sonnet 4.6', contextWindow: 200000, maxTokens: 8192, input: ['text', 'image'] },
  { id: 'openai', name: 'OpenAI', vaultNames: ['OpenAI'], envKeys: ['OPENAI_API_KEY'], testUrl: 'https://api.openai.com/v1/models', openclawId: 'openai', api: 'openai-completions', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', modelName: 'GPT-4.1', contextWindow: 128000, maxTokens: 8192, input: ['text', 'image'] },
  { id: 'gemini', name: 'Google Gemini', vaultNames: ['Google Gemini', 'Gemini', 'Google'], envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], testUrl: 'https://generativelanguage.googleapis.com/v1beta/models', openclawId: 'google', api: 'openai-completions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', modelName: 'Gemini 2.5 Flash', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'] },
  { id: 'openrouter', name: 'OpenRouter', vaultNames: ['OpenRouter'], envKeys: ['OPENROUTER_API_KEY'], testUrl: 'https://openrouter.ai/api/v1/auth/key', openclawId: 'openrouter', api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', modelName: 'OpenRouter Auto', contextWindow: 128000, maxTokens: 8192, input: ['text'] },
  { id: 'elevenlabs', name: 'ElevenLabs', vaultNames: ['ElevenLabs'], envKeys: ['ELEVENLABS_API_KEY'], testUrl: 'https://api.elevenlabs.io/v1/user' },
])

const STORE_VERSION = 1
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const MANAGED_OPENCLAW_PROVIDERS = new Set(OPENOCTI_MODEL_PROVIDERS.map(item => item.openclawId).filter(Boolean))

function providerFor(id) {
  const provider = OPENOCTI_MODEL_PROVIDERS.find(item => item.id === String(id || '').trim().toLowerCase())
  if (!provider) throw new Error('Unsupported model provider')
  return provider
}

function configured(value) {
  const text = String(value || '').trim()
  return Boolean(text) && !['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(text.toLowerCase())
}

function credentialVaultKey(provider, readCredentials) {
  let credentials = []
  try {
    credentials = readCredentials('credentials.json')?.credentials || []
  } catch {}
  const names = (provider.vaultNames || [provider.name]).map(name => String(name).trim().toLowerCase())
  const exact = credentials.find(credential => names.includes(String(credential?.name || '').trim().toLowerCase()))
  const partial = exact || credentials.find(credential => {
    const name = String(credential?.name || '').trim().toLowerCase()
    return names.some(candidate => name.includes(candidate))
  })
  const fields = Array.isArray(partial?.fields) ? partial.fields : []
  const preferred = fields.find(field => /^api\s*key$/i.test(String(field?.label || '').trim()))
  const fallback = preferred || fields.find(field => /api|key|token/i.test(String(field?.label || '')))
  return configured(fallback?.value) ? String(fallback.value).trim() : ''
}

export function openOctiKeyStorePath(env = process.env) {
  return path.join(String(env.CRM_DATA_DIR || path.join(process.cwd(), 'data')), 'openocti-keys.json')
}

function encryptionKey(env) {
  const secret = String(env.CRM_SESSION_SECRET || '').trim()
  if (!secret) throw new Error('CRM_SESSION_SECRET is required to protect model keys')
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('openocti-model-key-store-v1', 'utf8'),
    Buffer.from('aes-256-gcm', 'utf8'),
    32,
  ))
}

function emptyStore() {
  return { version: STORE_VERSION, algorithm: ALGORITHM, keys: {} }
}

function readStore(env) {
  try {
    const parsed = JSON.parse(fs.readFileSync(openOctiKeyStorePath(env), 'utf8'))
    if (parsed?.version !== STORE_VERSION || parsed?.algorithm !== ALGORITHM || !parsed.keys) return emptyStore()
    return parsed
  } catch {
    return emptyStore()
  }
}

function writeStore(store, env) {
  const file = openOctiKeyStorePath(env)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temp, file)
    try { fs.chmodSync(file, 0o600) } catch {}
  } finally {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp) } catch {}
  }
}

function encryptKey(value, env) {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(env), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

function decryptKey(record, env) {
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(env), Buffer.from(record.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function getStoredOpenOctiKey(providerId, env = process.env) {
  if (!isOpenOcti(env)) return ''
  const record = readStore(env).keys?.[providerFor(providerId).id]
  if (!record) return ''
  try { return decryptKey(record, env) } catch { return '' }
}

export function resolveProviderKey(providerId, env = process.env, { readCredentials = readData } = {}) {
  const provider = providerFor(providerId)
  const appKey = getStoredOpenOctiKey(provider.id, env)
  if (configured(appKey)) return { key: appKey, source: 'app', envKey: provider.envKeys[0] }
  for (const envKey of provider.envKeys) {
    if (configured(env[envKey])) return { key: String(env[envKey]).trim(), source: 'env', envKey }
  }
  const vaultKey = credentialVaultKey(provider, readCredentials)
  if (vaultKey) return { key: vaultKey, source: 'vault', envKey: provider.envKeys[0] }
  return { key: '', source: null, envKey: provider.envKeys[0] }
}

export function listOpenOctiKeyStatus(env = process.env) {
  const store = isOpenOcti(env) ? readStore(env) : emptyStore()
  return OPENOCTI_MODEL_PROVIDERS.map(provider => {
    const resolved = resolveProviderKey(provider.id, env)
    const record = store.keys?.[provider.id]
    return {
      id: provider.id,
      name: provider.name,
      envKey: provider.envKeys[0],
      status: resolved.key ? 'configured' : 'not_configured',
      source: resolved.source,
      last4: resolved.source === 'app' ? String(record?.last4 || '') : '',
      savedAt: resolved.source === 'app' ? String(record?.savedAt || '') : '',
    }
  })
}

export function effectiveProviderEnv(env = process.env) {
  if (!isOpenOcti(env)) return env
  const effective = { ...env }
  for (const provider of OPENOCTI_MODEL_PROVIDERS) {
    const resolved = resolveProviderKey(provider.id, env)
    if (resolved.key) effective[provider.envKeys[0]] = resolved.key
  }
  return effective
}

export async function validateOpenOctiProviderKey(providerId, value, { fetchImpl = fetch } = {}) {
  const provider = providerFor(providerId)
  const key = String(value || '').trim()
  if (!key) throw new Error('API key is required')
  const headers = { Accept: 'application/json' }
  if (provider.id === 'anthropic') {
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
  } else if (provider.id === 'gemini') headers['x-goog-api-key'] = key
  else if (provider.id === 'elevenlabs') headers['xi-api-key'] = key
  else headers.Authorization = `Bearer ${key}`

  let response
  try {
    response = await fetchImpl(provider.testUrl, { method: 'GET', headers, signal: AbortSignal.timeout(12_000) })
  } catch {
    throw new Error(`${provider.name} could not be reached to test this key`)
  }
  if (!response.ok) throw new Error(`${provider.name} rejected this key (HTTP ${response.status})`)
  return { ok: true, provider: provider.id }
}

export function storeOpenOctiProviderKey(providerId, value, env = process.env) {
  if (!isOpenOcti(env)) throw new Error('OpenOcti key storage is unavailable in this edition')
  const provider = providerFor(providerId)
  const key = String(value || '').trim()
  if (!key) throw new Error('API key is required')
  const store = readStore(env)
  store.keys[provider.id] = {
    ...encryptKey(key, env),
    last4: key.slice(-4),
    savedAt: new Date().toISOString(),
  }
  writeStore(store, env)
  return listOpenOctiKeyStatus(env).find(item => item.id === provider.id)
}

export function removeOpenOctiProviderKey(providerId, env = process.env) {
  if (!isOpenOcti(env)) throw new Error('OpenOcti key storage is unavailable in this edition')
  const provider = providerFor(providerId)
  const store = readStore(env)
  delete store.keys[provider.id]
  writeStore(store, env)
  return listOpenOctiKeyStatus(env).find(item => item.id === provider.id)
}

function openClawRegistration(provider, key) {
  return {
    api: provider.api,
    baseUrl: provider.baseUrl,
    apiKey: key,
    models: [{
      id: provider.model,
      name: provider.modelName,
      reasoning: false,
      input: provider.input,
      contextWindow: provider.contextWindow,
      maxTokens: provider.maxTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
  }
}

export function syncOpenOctiKeysToOpenClaw(env = process.env) {
  const configPath = String(env.OPENCLAW_CONFIG_PATH || '').trim()
  if (!configPath || !fs.existsSync(configPath)) return { updated: false, reason: 'config-not-found' }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const existing = { ...(config.models?.providers || {}) }
  for (const id of MANAGED_OPENCLAW_PROVIDERS) delete existing[id]

  let selected = null
  for (const provider of OPENOCTI_MODEL_PROVIDERS.filter(item => item.openclawId)) {
    const resolved = resolveProviderKey(provider.id, env)
    if (!resolved.key) continue
    existing[provider.openclawId] = openClawRegistration(provider, resolved.key)
    if (!selected) selected = { id: provider.openclawId, model: `${provider.openclawId}/${provider.model}` }
  }
  config.models = { ...(config.models || {}), providers: existing }
  if (selected) {
    config.agents = config.agents || {}
    config.agents.defaults = { ...(config.agents.defaults || {}), model: { primary: selected.model, fallbacks: [] } }
    if (Array.isArray(config.agents.list)) {
      config.agents.list = config.agents.list.map(agent => ({ ...agent, model: { primary: selected.model, fallbacks: [] } }))
    }
  }

  const temp = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    fs.renameSync(temp, configPath)
  } finally {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp) } catch {}
  }
  return {
    updated: true,
    reload: 'automatic-file-watch',
    provider: selected?.id || null,
    agents: Array.isArray(config.agents?.list) ? config.agents.list.map(agent => agent.id).filter(Boolean) : [],
  }
}
