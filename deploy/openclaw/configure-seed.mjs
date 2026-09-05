import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveMachineSecrets, waitForMachineSecrets } from '../machine-secrets.mjs'

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

function restrictiveAgentTools(tools = {}) {
  const configured = Array.isArray(tools.allow)
    ? tools.allow
    : Array.isArray(tools.alsoAllow) ? tools.alsoAllow : []
  const allow = Array.from(new Set(configured
    .map(name => String(name || '').trim())
    .filter(name => /^fcc_[a-z0-9_]+$/.test(name) && name !== 'fcc_call')))
  if (!allow.includes('fcc_list_tools')) allow.push('fcc_list_tools')
  const hardened = { ...tools, profile: 'full', allow }
  delete hardened.alsoAllow
  return hardened
}

export function hardenOpenOctiToolPolicies(config) {
  config.tools = { ...(config.tools || {}), profile: 'minimal' }
  delete config.tools.allow
  delete config.tools.alsoAllow
  for (const agent of config.agents?.list || []) {
    agent.tools = restrictiveAgentTools(agent.tools)
  }
  return config
}

export function configureSeed(stateDir, env = process.env) {
  const secrets = resolveMachineSecrets(path.join(stateDir, 'machine-secrets.json'), env)
  const configPath = path.join(stateDir, 'openclaw.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const selected = selectProviderModel(env)
  const agents = config.agents || (config.agents = {})
  agents.defaults = agents.defaults || {}
  agents.defaults.model = { primary: selected.model, fallbacks: [] }
  for (const agent of agents.list || []) agent.model = { primary: selected.model, fallbacks: [] }
  hardenOpenOctiToolPolicies(config)

  // Register the provider(s) whose keys are present so the model ids above are known to the gateway.
  const registrations = providerRegistrations(env)
  if (Object.keys(registrations).length) {
    config.models = config.models || {}
    config.models.providers = Object.assign({}, config.models.providers || {}, registrations)
  }

  // Gateway: OpenClaw 2026.6.x refuses to start without gateway.mode. Inside compose the gateway must
  // bind beyond loopback so the app container can reach it; token auth stays on. Verified shape
  // (exit test 2026-09-02): mode local + bind lan + auth token → "gateway ready", app reaches it.
  const gatewayToken = secrets.OPENCLAW_GATEWAY_TOKEN
  const apiKey = secrets.OPENCLAW_API_KEY
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

  // Set the plugin key on every boot, including already-substituted legacy configs.
  const plugin = config.plugins?.entries?.openocti
  if (plugin) plugin.config = { ...(plugin.config || {}), apiKey }
  // Substitute string values structurally so quotes in overrides cannot alter JSON.
  function substitute(value) {
    if (typeof value === 'string') return value.replace(/\$\{([A-Z0-9_]+)\}/g,
      (match, name) => secrets[name] || String(env[name] || '').trim() || match)
    if (Array.isArray(value)) return value.map(substitute)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, substitute(child)]))
    return value
  }
  fs.writeFileSync(configPath, `${JSON.stringify(substitute(config), null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(configPath, 0o600)

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
  try {
    const secrets = await waitForMachineSecrets(path.join(stateDir, 'machine-secrets.json'))
    const selected = configureSeed(stateDir, { ...process.env, ...secrets })
    console.log(`OpenOcti starter agents configured for provider: ${selected.provider}`)
  } catch {
    console.error('OpenOcti gateway setup failed; check the shared machine secrets file and app startup')
    process.exitCode = 1
  }
}
