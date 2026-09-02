import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('Voice end-call guardrails', () => {
  it('exposes natural end-call tools to OpenAI Realtime', () => {
    const tools = read('lib/realtime-voice-tools.js')

    expect(tools).toContain("name: 'end_session'")
    expect(tools).toContain("name: 'end_call'")
    expect(tools).toContain('goodbye, bye, have a good day')
  })

  it('wires end-call aliases through the shared browser voice client', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("'end_session', 'end_call', 'hang_up'")
    expect(voice).toContain('const endVoiceSession = async')
    expect(voice).toContain('end_session: endVoiceSession')
    expect(voice).toContain('end_call: endVoiceSession')
    expect(voice).toContain('hang_up: endVoiceSession')
    expect(voice).toContain('hardStopVoiceSession({ reloadFallback: false')
    expect(voice).toContain('All right, goodbye.')
    expect(voice).toContain('jobDescription')
    expect(voice).toContain('This prevents stored provider prompts from asking Carl for a transfer reason.')
    expect(voice).toContain('const overridesPayload = { agent: { firstMessage, prompt: { prompt: promptOverride } } }')
    expect(voice).not.toContain('const isMatilda = !agentIdOpt')
    expect(voice).not.toContain('clientTools.end_session')
  })

  it('queues in-page voice transfer until the previous session is idle', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain('pendingVoiceTransferRef.current')
    expect(voice).toContain('startRef.current?.(next.agentId)')
    expect(voice).toContain('setTimeout(() => { transferInFlightRef.current = false }, 1500)')
    expect(voice).toContain('transferInFlightRef.current = false')
    expect(voice).toContain('sessionStorage.setItem(PENDING_VOICE_TRANSFER_KEY')
    expect(voice).toContain('window.__fccVoiceStarting = false')
    expect(voice).toContain('aggressive: true')
    expect(voice).toContain("stage: 'fast-start'")
    expect(voice).toContain("stage: 'reload-fallback'")
    expect(voice).toContain("stage: 'start-recovery-reload'")
    expect(voice).toContain('}, 900)')
    expect(voice).toContain('}, 1100)')
    expect(voice).toContain('}, 4500)')
    expect(voice).toContain('window.setTimeout(recoverStart, 7000)')
    expect(voice).toContain('window.location.reload()')
  })

  it('records transfer timing telemetry for production diagnosis', () => {
    const voice = read('app/components/VoiceSession.js')
    const route = read('app/api/voice/transfer-log/route.js')

    expect(voice).toContain('function logVoiceTransferEvent')
    expect(voice).toContain('/api/voice/transfer-log')
    expect(voice).toContain("stage: 'audio-released'")
    expect(voice).toContain("stage: 'signed-url-ready'")
    expect(voice).toContain("stage: 'provider-started'")
    expect(voice).toContain("stage: 'provider-start-slow'")
    expect(route).toContain("const FILE = 'voice-transfer-log.json'")
    expect(route).toContain("requireCapability(request, 'voice:use')")
    expect(route).toContain("console.info('[voice-transfer]'")
  })

  it('uses the current session identity when deciding and logging transfers', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain('if (resolved?.id === match.id)')
    expect(voice).toContain("const sourceName = resolved?.firstName || resolved?.name || 'current agent'")
    expect(voice).not.toContain('if (activeAgent?.id === match.id) return `Already connected')
    expect(voice).not.toContain("const sourceName = activeAgent?.firstName")
  })

  it('provides a manual live transfer control when voice recognition does not fire the tool', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain('manualTransferTargetId')
    expect(voice).toContain('const manualTransfer = useCallback')
    expect(voice).toContain('Manual Command Center transfer control.')
    expect(voice).toContain('Force-transfer this live voice session')
    expect(voice).toContain('Transfer')
  })

  it('carries the rule through session prompts and ElevenLabs agent sync', () => {
    const conduct = read('lib/agentOfficeConduct.js')
    const openai = read('app/api/voice/openai/session/route.js')
    const sync = read('app/api/elevenlabs/agent-sync/route.js')
    const roster = read('app/api/voice/roster/route.js')
    const signedUrl = read('app/api/voice/signed-url/route.js')

    for (const source of [conduct, openai, sync]) {
      expect(source).toContain('Never say only Carl can end the call')
    }
    expect(roster).toContain('jobDescription')
    expect(signedUrl).toContain('jobDescription')
  })

  it('documents the voice end-call protocol and verification path', () => {
    const doc = read('docs/archive/voice-and-board-guardrails-2026-05-17.md')

    expect(doc).toContain('Natural Voice Call Ending')
    expect(doc).toContain('ElevenLabs')
    expect(doc).toContain('npm test')
    expect(doc).toContain('__tests__/voiceEndCall.test.js')
  })
})
