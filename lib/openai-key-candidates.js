import { readData } from './dataStore'

function clean(value) {
  return String(value || '').trim()
}

export function redactedKeyMeta(candidate = {}) {
  const key = clean(candidate.key)
  return {
    source: candidate.source || 'unknown',
    label: candidate.label || '',
    present: Boolean(key),
    prefix: key.slice(0, 7),
    suffix: key.length > 6 ? key.slice(-6) : '',
    len: key.length,
  }
}

export function getOpenAIKeyCandidates(env = process.env) {
  const candidates = []
  const seen = new Set()
  const add = (source, label, key) => {
    const value = clean(key)
    if (!value || seen.has(value)) return
    seen.add(value)
    candidates.push({ source, label, key: value })
  }

  try {
    const data = readData('credentials.json') || { credentials: [] }
    for (const cred of data.credentials || []) {
      if (!/openai/i.test(cred?.name || '')) continue
      for (const field of cred.fields || []) {
        if (/key|token|api|codex/i.test(field?.label || '')) {
          add('vault', `${cred.name || 'OpenAI'}:${field.label || 'key'}`, field.value)
        }
      }
    }
  } catch {}

  add('env', 'OPENAI_API_KEY', env.OPENAI_API_KEY)
  add('env', 'OPENAI_ADMIN_KEY', env.OPENAI_ADMIN_KEY)

  return candidates
}
