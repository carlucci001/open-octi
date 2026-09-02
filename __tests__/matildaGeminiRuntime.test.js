import fs from 'fs'
import path from 'path'

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('Matilda primary voice runtime', () => {
  test('uses Gemini Live for the primary Matilda roster entry and wake-word fallback', () => {
    const roster = read('app/api/voice/roster/route.js')
    const session = read('app/components/VoiceSession.js')

    expect(roster).toContain("id: 'matilda'")
    expect(roster).toContain("provider: 'gemini'")
    expect(roster).toContain("geminiModel: 'gemini-3.1-flash-live-preview'")
    expect(roster).toContain("geminiVoice: 'Kore'")
    expect(roster).not.toContain('geminiModel: matildaLocal.voice')
    expect(roster).toContain('if (seen.has(crmId)) continue')
    expect(roster).not.toContain("id: 'matilda-gemini'")

    const matildaFallback = session.slice(session.indexOf("id: 'matilda'"), session.indexOf("id: 'main'"))
    expect(matildaFallback).toContain("voiceProvider: 'gemini'")
    expect(matildaFallback).toContain("geminiModel: 'gemini-3.1-flash-live-preview'")
    expect(matildaFallback).not.toContain("voiceProvider: 'elevenlabs'")
  })

  test('gives Gemini Live the shared CRM discovery and execution tools', () => {
    const tokenRoute = read('app/api/voice/gemini-live-token/route.js')
    const tools = read('lib/realtime-voice-tools.js')
    expect(tokenRoute).toContain("import { GoogleGenAI } from '@google/genai'")
    expect(tokenRoute).toContain('liveConnectConstraints')
    expect(tokenRoute).toContain('v1beta.GenerativeService.BidiGenerateContentConstrained')
    expect(tokenRoute).toContain('toGeminiFunctionDeclarations()')
    expect(tools).toContain("name: 'crm_capabilities'")
    expect(tools).toContain("name: 'crm_action'")
  })

  test('gives Gemini dedicated guarded Build lane controls', () => {
    const tools = read('lib/realtime-voice-tools.js')
    const session = read('app/components/VoiceSession.js')
    const conduct = read('lib/agentOfficeConduct.js')

    expect(tools).toContain("name: 'build_automation'")
    expect(tools).toContain("name: 'build_automation_answer'")
    expect(tools).toContain("name: 'enable_automation_confirmed'")
    expect(tools).toContain("name: 'create_agent_draft'")
    expect(tools).toContain("name: 'create_platform_draft'")
    expect(tools).toContain("name: 'create_campaign_draft'")
    expect(tools).toContain('...GEMINI_BUILD_LANE_TOOLS')
    expect(session).toContain('VOICE_AUTOMATION_ACTIONS.has(name)')
    expect(session).toContain('VOICE_BUILD_DRAFT_ACTIONS.has(name)')
    expect(session).toContain("detail: 'automations'")
    expect(session).toContain("enabled: false, draft: true")
    expect(conduct).toContain('BUILD LANE OPERATOR')
    expect(conduct).toContain('ask one short question at a time')
    expect(conduct).toContain('Never treat agreement to design or save a draft as approval to enable or run it')
  })

  test('waits for Gemini setupComplete and records browser connection failures', () => {
    const session = read('app/components/VoiceSession.js')
    expect(session).toContain('const setupReady = new Promise')
    expect(session).toContain('await setupReady')
    expect(session).toContain("typeof event.data?.text === 'function'")
    expect(session).toContain('await event.data.text()')
    expect(session).toContain("stage: 'gemini-message-parse-error'")
    expect(session).toContain("stage: 'gemini-live-connected'")
    expect(session).toContain("stage: 'gemini-ws-closed'")
  })
})
