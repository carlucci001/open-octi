import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Provider registrations OpenClaw 2026.6.x understands (shape verified against a working install):
// an OpenAI-compatible completions endpoint plus an explicit model catalog entry. Without this block
// the gateway answers "Unknown model: <id>" even when the key is present.
const PROVIDER_CATALOG = {
  anthropic: { envKey: 'ANTHROPIC_API_KEY', api: 'openai-completions', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, maxTokens: 8192, input: ['text', 'image'] },
  openai: { envKey: 'OPENAI_API_KEY', api: 'openai-completions', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 128000, maxTokens: 8192, input: ['text', 'image'] },
  google: { envKey: 'GEMINI_API_KEY', api: 'openai-completions', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'] },
  openrouter: { envKey: 'OPENROUTER_API_KEY', api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', name: 'OpenRouter Auto', contextWindow: 128000, maxTokens: 8192, input: ['text'] },
}

export function selectProviderModel(env = process.env) {
  for (const [provider, spec] of Object.entries(PROVIDER_CATALOG)) {
    if (String(env[spec.envKey] || '').trim()) return { provider, model: `${provider}/${spec.model}` }
  }
  return { provider: 'none', model: 'openai/gpt-4.1' }
}

export function providerRegistrations(env = process.env) {
  const providers = {}
  for (const [provider, spec] of Object.entries(PROVIDER_CATALOG)) {
    const key = String(env[spec.envKey] || '').trim()
    if (!key) continue
    providers[provider] = {
      api: spec.api,
      baseUrl: spec.baseUrl,
      apiKey: key,
      models: [{ id: spec.model, name: spec.name, reasoning: false, input: spec.input, contextWindow: spec.contextWindow, maxTokens: spec.maxTokens, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    }
  }
  return providers
}

function replaceProfileTokens(value, profile) {
  let result = String(value)
  if (profile.businessName) result = result.replaceAll('{{business_name}}', profile.businessName)
  if (profile.ownerName) result = result.replaceAll('{{owner_name}}', profile.ownerName)
  return result
}

export function configureSeed(stateDir, env = process.env) {
  const configPath = path.join(stateDir, 'openclaw.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const selected = selectProviderModel(env)
  const agents = config.agents || (config.agents = {})
  agents.defaults = agents.defaults || {}
  agents.defaults.model = { primary: selected.model, fallbacks: [] }
  for (const agent of agents.list || []) agent.model = { primary: selected.model, fallbacks: [] }

  // Register the provider(s) whose keys are present so the model ids above are known to the gateway.
  const registrations = providerRegistrations(env)
  if (Object.keys(registrations).length) {
    config.models = config.models || {}
    config.models.providers = Object.assign({}, config.models.providers || {}, registrations)
  }

  // Gateway: OpenClaw 2026.6.x refuses to start without gateway.mode. Inside compose the gateway must
  // bind beyond loopback so the app container can reach it; token auth stays on. Verified shape
  // (exit test 2026-09-02): mode local + bind lan + auth token → "gateway ready", app reaches it.
  const gatewayToken = String(env.OPENCLAW_GATEWAY_TOKEN || '').trim() || 'openocti-local-only'
  config.gateway = Object.assign({}, config.gateway || {}, {
    mode: 'local',
    port: Number(env.OPENCLAW_PORT || 18789),
    bind: String(env.OPENCLAW_BIND || 'lan'),
    auth: { mode: 'token', token: gatewayToken },
    controlUi: Object.assign(
      {
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
        // The app container calls the gateway across the compose network; without its origin here
        // the gateway answers "origin not allowed" and the app silently falls back to a direct provider.
        allowedOrigins: Array.from(new Set([
          'http://localhost:18789', 'http://127.0.0.1:18789', 'http://openclaw:18789',
          'http://app:3000', 'http://localhost:3000', 'http://127.0.0.1:3000',
          String(env.PUBLIC_APP_URL || '').trim(),
        ].filter(Boolean))),
      },
      (config.gateway || {}).controlUi || {},
    ),
    nodes: Object.assign({ denyCommands: ['camera.snap'] }, (config.gateway || {}).nodes || {}),
  })

  // Substitute the seed's ${VAR} placeholders (plugin apiKey etc.) from the environment.
  const substituted = JSON.stringify(config).replace(/\$\{([A-Z0-9_]+)\}/g, (match, name) => {
    if (name === 'OPENCLAW_GATEWAY_TOKEN') return gatewayToken
    const value = String(env[name] || '').trim()
    return value || (name === 'OPENCLAW_API_KEY' ? 'openocti-local-only' : match)
  })
  fs.writeFileSync(configPath, `${JSON.stringify(JSON.parse(substituted), null, 2)}\n`)

  const profile = {
    businessName: String(env.OPENOCTI_BUSINESS_NAME || '').trim(),
    ownerName: String(env.OPENOCTI_OWNER_NAME || '').trim(),
  }
  const workspaceRoot = path.join(stateDir, 'workspace')
  if (fs.existsSync(workspaceRoot)) {
    const pending = [workspaceRoot]
    while (pending.length) {
      const current = pending.pop()
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const file = path.join(current, entry.name)
        if (entry.isDirectory()) pending.push(file)
        else if (entry.name.endsWith('.md')) {
          const source = fs.readFileSync(file, 'utf8')
          fs.writeFileSync(file, replaceProfileTokens(source, profile))
        }
      }
    }
  }
  return selected
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const stateDir = process.argv[2]
  if (!stateDir) throw new Error('OpenClaw state directory is required')
  const selected = configureSeed(stateDir)
  console.log(`OpenOcti starter agents configured for provider: ${selected.provider}`)
}
