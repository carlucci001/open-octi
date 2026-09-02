import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import { appendVoiceTranscriptChunk, isVoiceEndIntent } from '../lib/voice-end-intent'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('isVoiceEndIntent', () => {
  it.each([
    'thanks',
    'Thank you.',
    'STOP!',
    'goodbye',
    'bye for now',
    "that's good for now",
    'that is all',
    "we're done",
    'end the call',
    'hang up now',
    'disconnect',
    'stop listening',
    "thanks, that's good for now",
    "thanks, that's good for now, goodbye",
    "that's good for now, goodbye",
  ])('recognizes a complete browser-agent ending: %s', transcript => {
    expect(isVoiceEndIntent(transcript)).toBe(true)
  })

  it.each([
    '',
    'stop that research',
    'stop the transcription',
    'thanks, now create a task',
    'thank you, send that email',
    'we are done reviewing the first account, open the next one',
    'disconnect the integration',
    'hang up the banner',
  ])('does not disconnect for an unfinished or task-bearing phrase: %s', transcript => {
    expect(isVoiceEndIntent(transcript)).toBe(false)
  })

  it('lets an active transcription capture save a bare stop while retaining explicit voice endings', () => {
    expect(isVoiceEndIntent('stop', { allowBareStop: false })).toBe(false)
    expect(isVoiceEndIntent('stop listening', { allowBareStop: false })).toBe(true)
    expect(isVoiceEndIntent('goodbye', { allowBareStop: false })).toBe(true)
  })

  it('buffers streaming transcript chunks without duplicating cumulative updates', () => {
    expect(appendVoiceTranscriptChunk('', 'thanks')).toBe('thanks')
    expect(appendVoiceTranscriptChunk('thanks', ', that is good for now')).toBe('thanks, that is good for now')
    expect(appendVoiceTranscriptChunk('thanks', 'thanks, that is good for now')).toBe('thanks, that is good for now')
  })
})

describe('browser-agent voice shutdown wiring', () => {
  it('checks every provider user-transcript path through the shared handler', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("userVoiceTranscriptHandlerRef.current(msg, { provider: 'elevenlabs' })")
    expect(voice).toContain("handleUserVoiceTranscript(msg.transcript, { provider: 'openai' })")
    expect(voice).toContain("handleUserVoiceTranscript(completedInput, { provider: 'gemini' })")
    expect(voice).toContain("handleUserVoiceTranscript(clean, { provider: 'chirp3' })")
  })

  it('waits for a complete Gemini turn before evaluating an end intent', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain('state.inputTranscript = appendVoiceTranscriptChunk')
    expect(voice).toContain('if (content?.turnComplete)')
    expect(voice).not.toContain("handleUserVoiceTranscript(content.inputTranscription.text, { provider: 'gemini' })")
  })

  it('reserves a bare stop for save-transcription while the capture screen is active', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("const allowBareStop = activeSection !== 'meeting-capture'")
    expect(voice).toContain('isVoiceEndIntent(transcript, { allowBareStop })')
  })

  it('routes the equalizer stop event through the hard browser-voice teardown', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("reason: 'voice stopped from equalizer'")
    expect(voice).toContain('setListenArmed(false)')
    expect(voice).toContain('setWakeOn(false)')
    expect(voice).toContain('wakeRecRef.current?.stop?.()')
  })

  it('hard-stops voice-owned audio without muting an unrelated Twilio or video element', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain('conversation.setVolume({ volume: 0 })')
    expect(voice).toContain('conversation.setVolume({ volume: 1 })')
    expect(voice).toContain('audio[data-fcc-openai-voice="1"], audio[data-fcc-chirp-voice="1"]')
    expect(voice).not.toContain("document.querySelectorAll('audio').forEach")
  })

  it('verifies provider shutdown before using the hard reload fallback', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("['connected', 'connecting'].includes(elevenStatusRef.current)")
    expect(voice).not.toContain('if (window.__fccVoiceActive) { try { window.location.reload() }')
  })

  it('stops every old provider before starting the selected browser agent', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("endLabLiveSession({ reason: 'switching browser voice provider' })")
  })

  it('does not expose account-wide Twilio termination to an unconfirmed browser agent tool', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).not.toContain('kill_all_calls')
  })

  it('makes the face and equalizer one stop target with a separate switch control', () => {
    const chatPanel = read('app/components/ChatPanel.js')
    const equalizer = read('app/components/MatildaEqualizer.js')

    expect(chatPanel).toContain('className={`ai-wizard-top-tab${open')
    expect(chatPanel).toContain('className="ai-wizard-tab-eq"')
    expect(chatPanel).toContain('aria-controls="ai-wizard-drawer"')
    expect(equalizer).toContain('aria-label="Stop browser agent"')
    expect(equalizer).toContain('Choose agent. Current agent:')
    expect(equalizer).toContain('Switch from ${agent.name}')
    expect(equalizer).not.toContain('e.stopPropagation()\n          if (hoverTimer.current)')
  })

  it('keeps red end-call UI phone-only while the browser-agent face remains reachable', () => {
    const voice = read('app/components/VoiceSession.js')
    const fullscreen = read('app/components/VoiceFullscreen.js')
    const equalizer = read('app/components/MatildaEqualizer.js')

    expect(voice).not.toContain('■ STOP')
    expect(fullscreen).not.toContain('End call')
    expect(fullscreen).not.toContain('onEnd')
    expect(equalizer).toContain('zIndex: 110')
  })
})
