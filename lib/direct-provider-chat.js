import { effectiveProviderEnv } from './openocti-keys'
import { isOpenOcti } from './edition'

const DEFAULT_MODELS = Object.freeze({
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-4.1-mini',
})

function configured(value) {
  const text = String(value || '').trim()
  return text && !['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(text.toLowerCase())
}

export function resolveDirectProvider(env = process.env) {
  const effectiveEnv = effectiveProviderEnv(env)
  if (isOpenOcti(env) && configured(effectiveEnv.ORCAROUTER_API_KEY)) {
    return { provider: 'orcarouter', key: effectiveEnv.ORCAROUTER_API_KEY, model: effectiveEnv.ORCAROUTER_MODEL || 'orcarouter/free' }
  }
  if (configured(effectiveEnv.OPENAI_API_KEY)) {
    return { provider: 'openai', key: effectiveEnv.OPENAI_API_KEY, model: effectiveEnv.OPENAI_MODEL || DEFAULT_MODELS.openai }
  }
  if (configured(effectiveEnv.ANTHROPIC_API_KEY)) {
    return { provider: 'anthropic', key: effectiveEnv.ANTHROPIC_API_KEY, model: effectiveEnv.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic }
  }
  if (configured(effectiveEnv.GEMINI_API_KEY || effectiveEnv.GOOGLE_API_KEY)) {
    return { provider: 'gemini', key: effectiveEnv.GEMINI_API_KEY || effectiveEnv.GOOGLE_API_KEY, model: effectiveEnv.GEMINI_MODEL || DEFAULT_MODELS.gemini }
  }
  if (configured(effectiveEnv.OPENROUTER_API_KEY)) {
    return { provider: 'openrouter', key: effectiveEnv.OPENROUTER_API_KEY, model: effectiveEnv.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter }
  }
  return null
}

export async function directProviderChat({ message, system = '', env = process.env, fetchImpl = fetch } = {}) {
  const selected = resolveDirectProvider(env)
  if (!selected) {
    const error = new Error('No direct model provider is configured')
    error.code = 'not_configured'
    error.needs = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'ORCAROUTER_API_KEY']
    throw error
  }

  const prompt = String(message || '').trim()
  if (!prompt) throw new Error('Message is required')
  let response
  if (selected.provider !== 'anthropic') {
    const endpoint = selected.provider === 'orcarouter' ? 'https://api.orcarouter.ai/v1/chat/completions' : selected.provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : selected.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
    response = await fetchImpl(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${selected.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selected.model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(45000),
    })
  } else {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', redirect: 'error',
      headers: { 'x-api-key': selected.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selected.model,
        system: system || undefined,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(45000),
    })
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${selected.provider} request failed with status ${response.status}`)
  const text = selected.provider !== 'anthropic'
    ? body.choices?.[0]?.message?.content
    : body.content?.filter(item => item?.type === 'text').map(item => item.text).join('\n')
  if (!String(text || '').trim()) throw new Error(`${selected.provider} returned an empty response`)
  return { text: String(text).trim(), provider: selected.provider, model: selected.model }
}
