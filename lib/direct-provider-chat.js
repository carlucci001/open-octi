import { effectiveProviderEnv } from './openocti-keys'

const DEFAULT_MODELS = Object.freeze({
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-20250514',
})

function configured(value) {
  const text = String(value || '').trim()
  return text && !['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(text.toLowerCase())
}

export function resolveDirectProvider(env = process.env) {
  const effectiveEnv = effectiveProviderEnv(env)
  if (configured(effectiveEnv.OPENAI_API_KEY)) {
    return { provider: 'openai', key: effectiveEnv.OPENAI_API_KEY, model: effectiveEnv.OPENAI_MODEL || DEFAULT_MODELS.openai }
  }
  if (configured(effectiveEnv.ANTHROPIC_API_KEY)) {
    return { provider: 'anthropic', key: effectiveEnv.ANTHROPIC_API_KEY, model: effectiveEnv.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic }
  }
  return null
}

export async function directProviderChat({ message, system = '', env = process.env, fetchImpl = fetch } = {}) {
  const selected = resolveDirectProvider(env)
  if (!selected) {
    const error = new Error('No direct model provider is configured')
    error.code = 'not_configured'
    error.needs = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']
    throw error
  }

  const prompt = String(message || '').trim()
  if (!prompt) throw new Error('Message is required')
  let response
  if (selected.provider === 'openai') {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
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
      method: 'POST',
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
  const text = selected.provider === 'openai'
    ? body.choices?.[0]?.message?.content
    : body.content?.filter(item => item?.type === 'text').map(item => item.text).join('\n')
  if (!String(text || '').trim()) throw new Error(`${selected.provider} returned an empty response`)
  return { text: String(text).trim(), provider: selected.provider, model: selected.model }
}
