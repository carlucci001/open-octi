import { describe, expect, it } from 'vitest'
import { resolveOpenOctiAssistant } from '@/lib/openocti-assistant'

const configured = (...ids) => ids.map(id => ({ id, status: 'configured' }))
describe('setup assistant provider selection', () => {
  it('uses OpenAI voice automatically and defaults to English', () => {
    const assistant = resolveOpenOctiAssistant(configured('openai'))
    expect(assistant.voice).toMatchObject({ provider: 'openai', voice: 'ballad' })
    expect(assistant.language).toBe('en')
  })
  it('uses Gemini voice when it is the available voice provider', () => {
    expect(resolveOpenOctiAssistant(configured('anthropic', 'gemini')).voice.provider).toBe('gemini')
  })
  it('prefers OpenAI when both live voice providers are configured', () => {
    expect(resolveOpenOctiAssistant(configured('gemini', 'openai')).voice.provider).toBe('openai')
  })
  it.each(['anthropic', 'openrouter', 'orcarouter'])('keeps expert text setup available with %s alone', provider => {
    const assistant = resolveOpenOctiAssistant(configured(provider))
    expect(assistant.textProvider).toBe(provider)
    expect(assistant.voice).toBeNull()
    expect(assistant.message).toContain('expert setup assistant is ready in text')
    expect(assistant.message).toContain('continue setup now')
  })
  it('uses OrcaRouter for text and OpenAI for voice when both keys are entered', () => {
    const assistant = resolveOpenOctiAssistant(configured('orcarouter', 'openai'))
    expect(assistant.textProvider).toBe('orcarouter')
    expect(assistant.voice.provider).toBe('openai')
  })
  it('does not promise chat or live voice from an ElevenLabs key alone', () => {
    const assistant = resolveOpenOctiAssistant(configured('elevenlabs'))
    expect(assistant.textProvider).toBeNull()
    expect(assistant.voice).toBeNull()
  })
})
