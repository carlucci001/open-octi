const MODEL_KEY_ANCHORS = Object.freeze({
  ANTHROPIC_API_KEY: 'anthropic',
  OPENAI_API_KEY: 'openai',
  GEMINI_API_KEY: 'gemini',
  GOOGLE_API_KEY: 'gemini',
  OPENROUTER_API_KEY: 'openrouter',
  ELEVENLABS_API_KEY: 'elevenlabs',
  ORCAROUTER_API_KEY: 'orcarouter',
  DAILY_API_KEY: 'daily',
})

export function settingsAnchorIdForNeed(need) {
  return `env-${String(need || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function settingsAnchorForNeed(need) {
  const key = String(need || '').trim().toUpperCase()
  if (['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PK'].includes(key)) return '/?tab=settings&settings=stripe'
  const provider = MODEL_KEY_ANCHORS[key]
  if (provider) return `/settings/models#${provider}`
  return `/settings#${settingsAnchorIdForNeed(key)}`
}

export function settingsLinksForNeeds(needs = []) {
  return [...new Set((Array.isArray(needs) ? needs : []).map(need => String(need || '').trim()).filter(Boolean))]
    .map(need => ({ need, href: settingsAnchorForNeed(need) }))
}
