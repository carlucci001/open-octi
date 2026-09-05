import { capabilityStatus } from './feature-manifest'
import { OPENOCTI_MODEL_PROVIDERS, validateOpenOctiProviderKey } from './openocti-keys'

const remote = (url, init = {}) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) })
const bearer = key => ({ Authorization: `Bearer ${key}` })

function configuredValue(env, names) {
  return names.map(name => String(env[name] || '').trim()).find(Boolean) || ''
}

async function checkedFetch(label, url, init) {
  try {
    const response = await remote(url, init)
    if (!response.ok) return { ok: false, message: `${label} rejected the connection (${response.status}).` }
    return { ok: true, message: `${label} connection verified.` }
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? 'timed out' : 'could not be reached'
    return { ok: false, message: `${label} ${reason}.` }
  }
}

async function testModelProvider(id, env) {
  const provider = OPENOCTI_MODEL_PROVIDERS.find(item => item.id === id && item.openclawId)
  if (provider) {
    try {
      await validateOpenOctiProviderKey(id, configuredValue(env, provider.envKeys))
      return { ok: true, message: `${provider.name} key authentication verified. Model execution was not tested.` }
    } catch (error) {
      return { ok: false, message: error.message }
    }
  }
  const providers = {
    deepseek: ['DeepSeek', 'https://api.deepseek.com/models', env.DEEPSEEK_API_KEY],
    kimi: ['Kimi', 'https://api.moonshot.ai/v1/models', env.KIMI_API_KEY],
  }
  const row = providers[id]
  return row ? checkedFetch(row[0], row[1], { headers: bearer(row[2]) }) : null
}

export async function testIntegrationConnection(id, env = process.env) {
  const capability = capabilityStatus(id, env)
  if (!capability) return { ok: false, status: 'unknown', message: 'Unknown integration capability.' }
  if (capability.status !== 'configured') {
    return { ok: false, status: 'not_configured', message: 'Add the required environment values before testing.', keys: capability.missing }
  }

  if (id === 'models') {
    const provider = ['openai', 'anthropic', 'gemini', 'openrouter', 'deepseek', 'kimi', 'orcarouter', 'huggingface', 'nvidia'].find(candidate => capabilityStatus(candidate, env)?.status === 'configured')
    return provider ? testIntegrationConnection(provider, env) : { ok: false, status: 'not_configured', message: 'Connect any supported model provider.' }
  }
  const modelResult = await testModelProvider(id, env)
  if (modelResult) return modelResult
  if (id === 'daily') return checkedFetch('Daily', 'https://api.daily.co/v1/', { headers: bearer(env.DAILY_API_KEY) })
  if (id === 'elevenlabs') return checkedFetch('ElevenLabs', 'https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } })
  if (id === 'resend') return checkedFetch('Resend', 'https://api.resend.com/domains', { headers: bearer(env.RESEND_API_KEY) })
  if (id === 'twilio') {
    const secret = configuredValue(env, ['TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SECRET'])
    const username = env.TWILIO_AUTH_TOKEN ? env.TWILIO_ACCOUNT_SID : configuredValue(env, ['TWILIO_API_KEY_SID', 'TWILIO_ACCOUNT_SID'])
    return checkedFetch('Twilio', `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}.json`, { headers: { Authorization: `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}` } })
  }
  if (id === 'stripe') return checkedFetch('Stripe', 'https://api.stripe.com/v1/account', { headers: bearer(env.STRIPE_SECRET_KEY) })
  if (id === 'vercel') return checkedFetch('Vercel', 'https://api.vercel.com/v2/user', { headers: bearer(configuredValue(env, ['VERCEL_TOKEN', 'VERCEL_API_TOKEN'])) })
  if (id === 'cloudflare') return checkedFetch('Cloudflare', 'https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: bearer(env.CLOUDFLARE_API_TOKEN) })
  if (id === 'godaddy') return checkedFetch('GoDaddy', 'https://api.godaddy.com/v1/domains?limit=1', { headers: { Authorization: `sso-key ${env.GODADDY_API_KEY}:${env.GODADDY_API_SECRET}` } })
  if (id === 'postiz') {
    const base = String(env.POSTIZ_API_URL || '').replace(/\/$/, '')
    return checkedFetch('Postiz', `${base}/api/public/v1/integrations`, { headers: bearer(env.POSTIZ_API_KEY) })
  }
  if (id === 'nylas') return checkedFetch('Nylas', 'https://api.us.nylas.com/v3/grants?limit=1', { headers: bearer(configuredValue(env, ['NYLAS_API_KEY', 'NYLAS_KEY'])) })
  return { ok: true, message: 'Required configuration is present. This integration has no remote validation probe.' }
}
