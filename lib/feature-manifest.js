import { editionFor, isOpenOcti } from './edition'

function definition(id, label, requirementGroups, routes = []) {
  return Object.freeze({ id, label, requirementGroups, routes })
}

// Each inner array is an alternative set (one value is enough). Every inner
// array must be satisfied for the capability to be configured.
export const EXTERNAL_CAPABILITIES = Object.freeze([
  definition('anthropic', 'Anthropic models', [['ANTHROPIC_API_KEY']]),
  definition('openai', 'OpenAI models', [['OPENAI_API_KEY']]),
  definition('gemini', 'Google Gemini models', [['GEMINI_API_KEY', 'GOOGLE_API_KEY']]),
  definition('openrouter', 'OpenRouter models', [['OPENROUTER_API_KEY']]),
  definition('perplexity', 'Perplexity research', [['PERPLEXITY_API_KEY']]),
  definition('nvidia', 'NVIDIA models', [['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY', 'NGC_API_KEY']]),
  definition('mindstudio', 'MindStudio', [['MINDSTUDIO_API_KEY']]),
  definition('elevenlabs', 'ElevenLabs voice', [['ELEVENLABS_API_KEY']], ['/api/elevenlabs']),
  definition('twilio', 'Twilio telephony', [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SECRET']]),
  definition('resend', 'Resend email', [['RESEND_API_KEY']]),
  definition('nylas', 'Nylas email', [['NYLAS_API_KEY', 'NYLAS_KEY'], ['NYLAS_GRANT_ID', 'NYLAS_GRANT_IDS']]),
  definition('stripe', 'Stripe billing', [['STRIPE_SECRET_KEY']], ['/api/payments', '/api/admin/stripe-catalog-sync']),
  definition('cloudflare', 'Cloudflare', [['CLOUDFLARE_API_TOKEN'], ['CLOUDFLARE_ACCOUNT_ID']], ['/api/cloudflare']),
  definition('godaddy', 'GoDaddy domains', [['GODADDY_API_KEY'], ['GODADDY_API_SECRET']], ['/api/domains']),
  definition('vercel', 'Vercel', [['VERCEL_TOKEN', 'VERCEL_API_TOKEN']], ['/api/vercel']),
  definition('daily', 'Daily video', [['DAILY_API_KEY'], ['DAILY_SUBDOMAIN']], ['/api/daily']),
  definition('postiz', 'Postiz publishing', [['POSTIZ_API_URL'], ['POSTIZ_API_KEY']], ['/api/postiz']),
  definition('SearchSuite3', 'SearchSuite3', [['SearchSuite3_API_URL'], ['SearchSuite3_API_KEY']], ['/api/SearchSuite3']),
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

const OPENOCTI_CLOSED_CAPABILITY_IDS = new Set(['SearchSuite3', 'newsroom'])

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
    missing,
    status: missing.length ? 'not_configured' : 'configured',
  }
}

export function buildFeatureManifest(env = process.env) {
  const definitions = isOpenOcti(env)
    ? EXTERNAL_CAPABILITIES.filter(item => !OPENOCTI_CLOSED_CAPABILITY_IDS.has(item.id))
    : EXTERNAL_CAPABILITIES
  const capabilities = definitions.map(item => capabilityStatus(item.id, env))
  return {
    edition: editionFor(env),
    capabilities,
    configured: capabilities.filter(item => item.status === 'configured').map(item => item.id),
    notConfigured: capabilities.filter(item => item.status === 'not_configured').map(item => item.id),
  }
}

export function capabilityForPath(pathname) {
  const path = String(pathname || '').split('?')[0]
  const match = EXTERNAL_CAPABILITIES.find(item => item.routes.some(prefix => path === prefix || path.startsWith(`${prefix}/`)))
  return match?.id || null
}

export function notConfiguredPayload(id, env = process.env) {
  const capability = capabilityStatus(id, env)
  if (!capability || capability.status === 'configured') return null
  return { error: 'not_configured', needs: capability.missing }
}
