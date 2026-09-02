export function getImageProviderChain(provider = 'auto') {
  if (provider === 'imagen' || provider === 'google-imagen') return ['imagen', 'gemini', 'pexels']
  if (provider === 'fal') return ['fal']
  if (provider === 'openai') return ['openai']
  if (provider === 'openrouter') return ['openrouter']
  if (provider === 'pexels') return ['pexels']
  if (provider === 'gemini' || provider === 'nano-banana') return ['gemini', 'imagen', 'pexels']
  return ['openai', 'fal']
}
