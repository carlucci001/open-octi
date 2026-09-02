import { describe, expect, it } from 'vitest'
import { getImageProviderChain } from '../lib/image-provider-chain'

describe('image provider fallback chain', () => {
  it('falls back to Fal when automatic OpenAI generation is unavailable', () => {
    expect(getImageProviderChain('auto')).toEqual(['openai', 'fal'])
  })

  it('keeps explicitly selected providers strict', () => {
    expect(getImageProviderChain('openai')).toEqual(['openai'])
    expect(getImageProviderChain('fal')).toEqual(['fal'])
  })

  it('preserves the Google and stock fallback routes', () => {
    expect(getImageProviderChain('gemini')).toEqual(['gemini', 'imagen', 'pexels'])
    expect(getImageProviderChain('pexels')).toEqual(['pexels'])
  })
})
