import { editionFor, isOpenOcti } from './edition'
import { settingsLinksForNeeds } from './openocti-settings-links'

function definition(id, label, requirementGroups, routes = [], requiredEditions = []) {
  return Object.freeze({ id, label, requirementGroups, routes, requiredEditions })
}

// Each inner array is an alternative set (one value is enough). Every inner
// array must be satisfied for the capability to be configured.
export const EXTERNAL_CAPABILITIES = Object.freeze([
  definition('models', 'AI model provider', [['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY', 'ORCAROUTER_API_KEY', 'HUGGINGFACE_API_KEY', 'HF_TOKEN', 'NVIDIA_API_KEY']], ['/api/agent/chat']),
  definition('anthropic', 'Anthropic models', [['ANTHROPIC_API_KEY']]),
  definition('openai', 'OpenAI models', [['OPENAI_API_KEY']]),
  definition('gemini', 'Google Gemini models', [['GEMINI_API_KEY', 'GOOGLE_API_KEY']]),
  definition('openrouter', 'OpenRouter models', [['OPENROUTER_API_KEY']]),
  definition('deepseek', 'DeepSeek models', [['DEEPSEEK_API_KEY']]),
  definition('kimi', 'Kimi models', [['KIMI_API_KEY']]),
  definition('orcarouter', 'OrcaRouter models', [['ORCAROUTER_API_KEY']]),
  definition('huggingface', 'Hugging Face models', [['HUGGINGFACE_API_KEY', 'HF_TOKEN']]),
  definition('perplexity', 'Perplexity research', [['PERPLEXITY_API_KEY']]),
  definition('nvidia', 'NVIDIA models', [['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY', 'NGC_API_KEY']]),
  definition('mindstudio', 'MindStudio', [['MINDSTUDIO_API_KEY']]),
  definition('elevenlabs', 'ElevenLabs voice', [['ELEVENLABS_API_KEY']], ['/api/elevenlabs', '/api/voice/elevenlabs', '/api/voicemails/audio'], ['commandcenter']),
  definition('twilio', 'Twilio telephony', [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SECRET']], ['/api/twilio']),
  definition('resend', 'Resend email', [['RESEND_API_KEY']], ['/api/voicemails/email', '/api/sponsor-email']),
  definition('nylas', 'Nylas email', [['NYLAS_API_KEY', 'NYLAS_KEY'], ['NYLAS_GRANT_ID', 'NYLAS_GRANT_IDS']]),
  definition('stripe', 'Stripe billing', [['STRIPE_SECRET_KEY']], ['/api/payments', '/api/admin/stripe-catalog-sync']),
  definition('stripe-client', 'Stripe browser checkout', [['NEXT_PUBLIC_STRIPE_PK']]),
  definition('e-signature', 'E-signature delivery', [['SIGNING_PUBLIC_URL'], ['RESEND_API_KEY']]),
  definition('cloudflare', 'Cloudflare', [['CLOUDFLARE_API_TOKEN'], ['CLOUDFLARE_ACCOUNT_ID']], ['/api/cloudflare']),
  definition('godaddy', 'GoDaddy domains', [['GODADDY_API_KEY'], ['GODADDY_API_SECRET']], ['/api/domains']),
  definition('vercel', 'Vercel', [['VERCEL_TOKEN', 'VERCEL_API_TOKEN']], ['/api/vercel']),
  definition('daily', 'Daily video', [['DAILY_API_KEY'], ['DAILY_SUBDOMAIN', 'NEXT_PUBLIC_DAILY_SUBDOMAIN']], ['/api/daily', '/api/video', '/api/calendar/send-meet-link']),
  definition('postiz', 'Postiz publishing', [['POSTIZ_API_URL'], ['POSTIZ_API_KEY']], ['/api/postiz']),
  definition('SearchTools3', 'SearchTools3', [['SearchTools3_API_URL'], ['SearchTools3_API_KEY']], ['/api/SearchTools3']),
  definition('newsroom', 'Newsroom AIOS', [['NEWSROOM_AIOS_BASE_URL'], ['NEWSROOM_API_KEY', 'NEWSROOM_AIOS_API_KEY']]),
  definition('hermes', 'Hermes runtime', [['HERMES_API_URL', 'HERMES_API_BASE_URL'], ['HERMES_API_KEY', 'HERMES_API_SERVER_KEY']], ['/api/hermes']),
  definition('deepseek-harness', 'DeepSeek harness', [['DEEPSEEK_HARNESS_URL'], ['DEEPSEEK_HARNESS_BRIDGE_TOKEN', 'DEEPSEEK_HARNESS_BRIDGE_TOKEN_FILE']], ['/api/deepseek-harness']),
  definition('deerflow', 'DeerFlow research', [['DEERFLOW_API_BASE_URL', 'DEER_FLOW_API_BASE_URL', 'DEERFLOW_BASE_URL'], ['DEERFLOW_API_KEY', 'DEER_FLOW_API_KEY', 'DEERFLOW_INTERNAL_AUTH_TOKEN', 'DEER_FLOW_INTERNAL_AUTH_TOKEN']], ['/api/deerflow']),
  definition('openclaw', 'OpenClaw gateway', [['OPENCLAW_HOST'], ['OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_API_KEY']], []),
  definition('ntfy', 'ntfy notifications', [['NTFY_TOPIC']]),
  definition('firebase-oauth', 'Firebase OAuth', [['FIREBASE_OAUTH_CLIENT_ID'], ['FIREBASE_OAUTH_CLIENT_SECRET']]),
  definition('youtube-oauth', 'YouTube OAuth', [['YOUTUBE_OAUTH_CLIENT_ID'], ['YOUTUBE_OAUTH_CLIENT_SECRET']], ['/api/youtube']),
  definition('site-note', 'Site note bridge', [['SITE_NOTE_ENDPOINT'], ['SITE_NOTE_SECRET']], ['/api/site-note']),
  definition('jules', 'Jules coding agent', [['JULES_API_KEY']], ['/api/jules']),
  definition('apify', 'Apify lead sources', [['APIFY_ACTOR_ID', 'APIFY_TASK_ID'], ['APIFY_API_TOKEN']]),
  definition('vibevoice', 'VibeVoice', [['VIBEVOICE_ENDPOINT', 'VIBEVOICE_BASE_URL']]),
  definition('platform-admin', 'Platform Admin API', [['FCC_PLATFORM_ADMIN_API_KEY', 'PLATFORM_ADMIN_API_KEY']]),
])

const OPENOCTI_CLOSED_CAPABILITY_IDS = new Set(['SearchTools3', 'newsroom'])

function hasValue(env, name) {
  const value = String(env?.[name] || '').trim()
  return value.length > 0 && !['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(value.toLowerCase())
}

export function capabilityStatus(id, env = process.env) {
  const capability = EXTERNAL_CAPABILITIES.find(item => item.id === id)
  if (!capability) return null
  const missing = capability.requirementGroups
    .filter(group => !group.some(name => hasValue(env, name)))
    .map(group => group[0])
  return {
    id: capability.id,
    label: capability.label,
    needs: capability.requirementGroups.flat(),
    requirementGroups: capability.requirementGroups.map(group => [...group]),
    missing,
    status: missing.length ? 'not_configured' : 'configured',
    source: missing.length ? null : 'env',
    required: capability.requiredEditions.includes(editionFor(env)),
    settings: settingsLinksForNeeds(capability.requirementGroups.flat()),
  }
}

const OPENOCTI_APP_MANAGED_CAPABILITIES = new Set(['models', 'anthropic', 'openai', 'gemini', 'openrouter', 'elevenlabs'])
const MODEL_PROVIDER_IDS = new Set(['anthropic', 'openai', 'gemini', 'openrouter', 'deepseek', 'kimi', 'orcarouter', 'huggingface', 'nvidia'])

export function buildFeatureManifest(env = process.env, { providerStatuses = [] } = {}) {
  const definitions = isOpenOcti(env)
    ? EXTERNAL_CAPABILITIES.filter(item => !OPENOCTI_CLOSED_CAPABILITY_IDS.has(item.id))
    : EXTERNAL_CAPABILITIES
  const providerStatusById = new Map(providerStatuses.map(item => [item.id, item]))
  const capabilities = definitions.map(item => {
    if (item.id === 'models' && providerStatuses.some(status => MODEL_PROVIDER_IDS.has(status?.id) && status?.source)) {
      return { ...capabilityStatus(item.id, env), missing: [], status: 'configured', source: 'app' }
    }
    const status = providerStatusById.get(item.id)
    if (!status?.source) return capabilityStatus(item.id, env)
    return {
      ...capabilityStatus(item.id, env),
      missing: [],
      status: 'configured',
      source: status.source,
    }
  })
  return {
    edition: editionFor(env),
    capabilities,
    configured: capabilities.filter(item => item.status === 'configured').map(item => item.id),
    notConfigured: capabilities.filter(item => item.status === 'not_configured').map(item => item.id),
  }
}

export function requiredCapabilityReport(env = process.env, { providerStatuses = [] } = {}) {
  const manifest = buildFeatureManifest(env, { providerStatuses })
  const required = manifest.capabilities.filter(item => item.required)
  return {
    edition: manifest.edition,
    required,
    unresolved: required.filter(item => item.status !== 'configured'),
  }
}

export function capabilityForPath(pathname) {
  const path = String(pathname || '').split('?')[0]
  const match = EXTERNAL_CAPABILITIES.find(item => item.routes.some(prefix => path === prefix || path.startsWith(`${prefix}/`)))
  return match?.id || null
}

export function notConfiguredPayload(id, env = process.env) {
  // Edge middleware cannot read the encrypted on-disk key store. These
  // OpenOcti routes perform their own server-side check with app-stored keys.
  if (editionFor(env) === 'openocti' && OPENOCTI_APP_MANAGED_CAPABILITIES.has(id)) return null
  const capability = capabilityStatus(id, env)
  if (!capability || capability.status === 'configured') return null
  return {
    ok: false,
    error: 'not_configured',
    capability: id,
    keys: capability.missing,
    needs: capability.missing,
    settings: settingsLinksForNeeds(capability.missing),
  }
}

export function requireCapability(id, env = process.env) {
  const body = notConfiguredPayload(id, env)
  return body ? { status: 503, body } : null
}
