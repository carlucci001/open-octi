export const IMAGE_GENERATION_PROVIDER_OPTIONS = [
  {
    id: 'openai',
    label: 'OpenAI / ChatGPT',
    detail: 'Current preferred route for Sasha and branded social image work.',
    model: 'gpt-image-1',
  },
  {
    id: 'auto',
    label: 'Auto Route',
    detail: 'Uses the Command Center default, currently OpenAI/ChatGPT.',
    model: 'gpt-image-1',
  },
  {
    id: 'imagen',
    label: 'Google Imagen',
    detail: 'Selectable alternate route when Carl explicitly wants Google Imagen.',
    model: 'imagen-4.0-generate-001',
  },
  {
    id: 'gemini',
    label: 'Gemini Image',
    detail: 'Selectable alternate for Gemini/Nano Banana style image work.',
    model: 'gemini-2.5-flash-image',
  },
  {
    id: 'fal',
    label: 'Fal.ai / Flux Pro',
    detail: 'Selectable alternate for Flux/Fal image generation.',
    model: 'fal-ai/flux-pro/v1.1-ultra',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter / Flux',
    detail: 'Selectable alternate through OpenRouter image models.',
    model: 'flux-1.1-pro',
  },
  {
    id: 'pexels',
    label: 'Pexels Stock',
    detail: 'Stock image search when generation is not needed.',
    model: 'pexels-stock',
  },
]

export const DEFAULT_IMAGE_GENERATION_PREFERENCE = {
  provider: 'openai',
  model: 'gpt-image-1',
  attachBrandLogo: true,
  socialGuardrails: true,
}

const IMAGE_GENERATION_PROVIDER_IDS = new Set(IMAGE_GENERATION_PROVIDER_OPTIONS.map(option => option.id))

export function normalizeImageGenerationProvider(provider) {
  const normalized = String(provider || '').trim().toLowerCase()
  if (normalized === 'google-imagen') return 'imagen'
  if (normalized === 'nano-banana') return 'gemini'
  if (normalized === 'stock') return 'pexels'
  return IMAGE_GENERATION_PROVIDER_IDS.has(normalized) ? normalized : DEFAULT_IMAGE_GENERATION_PREFERENCE.provider
}

export function imageGenerationProviderOption(provider) {
  const id = normalizeImageGenerationProvider(provider)
  return IMAGE_GENERATION_PROVIDER_OPTIONS.find(option => option.id === id) || IMAGE_GENERATION_PROVIDER_OPTIONS[0]
}

export function normalizeImageGenerationPreference(value = {}) {
  const provider = normalizeImageGenerationProvider(value.provider)
  const option = imageGenerationProviderOption(provider)
  return {
    ...DEFAULT_IMAGE_GENERATION_PREFERENCE,
    ...value,
    provider,
    model: String(value.model || option.model || DEFAULT_IMAGE_GENERATION_PREFERENCE.model),
    attachBrandLogo: value.attachBrandLogo !== false,
    socialGuardrails: value.socialGuardrails !== false,
  }
}
