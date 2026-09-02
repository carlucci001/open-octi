import { describe, expect, it } from 'vitest'
import { normalizeVoiceProfile } from '../lib/voiceProfile'

describe('voice profile normalization', () => {
  it('normalizes an OpenAI local agent voice while preserving realtime fields', () => {
    const profile = normalizeVoiceProfile({
      id: 'lab-agent',
      voice: {
        provider: 'openai',
        openaiModel: 'gpt-realtime',
        openaiVoice: 'marin',
        tier: 'demo',
        marginPercent: '35',
      },
    })

    expect(profile.provider).toBe('openai')
    expect(profile.model).toBe('gpt-realtime')
    expect(profile.voiceName).toBe('marin')
    expect(profile.openaiModel).toBe('gpt-realtime')
    expect(profile.openaiVoice).toBe('marin')
    expect(profile.liveMode).toBe(true)
    expect(profile.tier).toBe('demo')
    expect(profile.marginPercent).toBe(35)
    expect(profile.openAiReady).toBe(true)
    expect(profile.readiness.providerReady).toBe(true)
  })

  it('normalizes an ElevenLabs roster binding without dropping binding ids', () => {
    const profile = normalizeVoiceProfile({
      agentId: 'eleven-agent-123',
      voiceId: 'voice-456',
      voiceName: 'Matilda',
      model: 'eleven_turbo_v2_5',
    })

    expect(profile.provider).toBe('elevenlabs')
    expect(profile.model).toBe('eleven_turbo_v2_5')
    expect(profile.voiceName).toBe('Matilda')
    expect(profile.agentId).toBe('eleven-agent-123')
    expect(profile.voiceId).toBe('voice-456')
    expect(profile.liveMode).toBe(true)
    expect(profile.elevenLabsReady).toBe(true)
    expect(profile.openAiReady).toBe(false)
    expect(profile.readiness.hasVoiceId).toBe(true)
  })

  it('normalizes Gemini fields and marks the Gemini Live route ready', () => {
    const profile = normalizeVoiceProfile({
      provider: 'google',
      geminiModel: 'gemini-2.5-flash-preview-tts',
      geminiVoice: 'Kore',
      fallbackProvider: 'elevenlabs',
    })

    expect(profile.provider).toBe('gemini')
    expect(profile.model).toBe('gemini-2.5-flash-preview-tts')
    expect(profile.voiceName).toBe('Kore')
    expect(profile.geminiModel).toBe('gemini-2.5-flash-preview-tts')
    expect(profile.geminiVoice).toBe('Kore')
    expect(profile.fallbackProvider).toBe('elevenlabs')
    expect(profile.geminiReady).toBe(true)
    expect(profile.liveReady).toBe(true)
  })

  it('normalizes VibeVoice as an internal self-hosted voice provider', () => {
    const profile = normalizeVoiceProfile({
      provider: 'vibe-voice',
      model: 'microsoft/VibeVoice-Realtime-0.5B',
    })

    expect(profile.provider).toBe('vibevoice')
    expect(profile.model).toBe('microsoft/VibeVoice-Realtime-0.5B')
    expect(profile.voiceName).toBe('default')
    expect(profile.providerReady).toBe(true)
    expect(profile.liveReady).toBe(false)
  })
})
