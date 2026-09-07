import { expect, it } from 'vitest'
import { openOctiVoiceProfile, openOctiVoiceAgent, OPENOCTI_VOICE_STARTERS, OPENOCTI_REALTIME_MODEL } from '@/lib/openocti-voice-routing'
import { OPENAI_REALTIME_VOICES, GEMINI_VOICES } from '@/lib/realtime-voice-tools'

it('chooses OpenAI voice for Maggie with the same saved key used by Octi', () => {
  const profile = openOctiVoiceProfile([{ id: 'openai', status: 'configured' }], 'main')
  expect(profile).toMatchObject({ provider: 'openai', openaiVoice: 'marin', providerReady: true })
  expect(openOctiVoiceAgent('main', { name: 'Maggie', voice: { provider: 'elevenlabs' } })).toMatchObject({ name: 'Maggie', voice: { provider: 'openai' } })
})
it('uses Gemini if it is the available voice provider', () => {
  expect(openOctiVoiceProfile([{ id: 'gemini', status: 'configured' }])).toMatchObject({ provider: 'gemini', providerReady: true })
})
it('uses Craig\'s distinct voice consistently in the roster and actual session', () => {
  const providers = [{ id: 'openai', status: 'configured' }]
  expect(openOctiVoiceProfile(providers, 'coding')).toMatchObject({ openaiVoice: 'cedar', voiceName: 'cedar' })
  expect(openOctiVoiceAgent('coding', { voice: { openaiVoice: 'marin' } })).toMatchObject({ firstName: 'Craig', voice: { openaiVoice: 'cedar' } })
  expect(openOctiVoiceProfile(providers, 'main')).toMatchObject({ openaiVoice: 'marin' })
  expect(openOctiVoiceProfile([{ id: 'gemini', status: 'configured' }], 'coding')).toMatchObject({ geminiVoice: 'Puck', voiceName: 'Puck' })
})
it('does not advertise live voice from a text-only key', () => {
  expect(openOctiVoiceProfile([{ id: 'anthropic', status: 'configured' }])).toMatchObject({ provider: 'none', liveReady: false })
})

it('gives every shipped assistant a unique supported voice matching its session', () => {
  for (const provider of ['openai', 'gemini']) {
    const voices = OPENOCTI_VOICE_STARTERS.map(({ id }) => {
      const profile = openOctiVoiceProfile([{ id: provider, status: 'configured' }], id)
      const agent = openOctiVoiceAgent(id)
      expect(profile.voiceName).toBe(agent.voice[provider === 'openai' ? 'openaiVoice' : 'geminiVoice'])
      if (provider === 'openai') {
        expect(OPENAI_REALTIME_VOICES).toContain(profile.voiceName)
        expect(profile.openaiModel).toBe(OPENOCTI_REALTIME_MODEL)
      } else {
        expect(GEMINI_VOICES.map(voice => voice.id)).toContain(profile.voiceName)
      }
      return profile.voiceName
    })
    expect(new Set(voices).size).toBe(OPENOCTI_VOICE_STARTERS.length)
  }
})
