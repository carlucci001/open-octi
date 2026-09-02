import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Regression guard for 2026-07-29: ending a conversation by SPEAKING
// ("thanks" / "stop" / "goodbye") ran hardStopVoiceSession with the default
// disarmListening=true, which called setWakeOn(false) and killed the wake word.
// Carl then had to click "Go Live" to talk again. Always-listening is the
// designed behaviour, so the conversational end paths must never disarm.
const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'app/components/VoiceSession.js'),
  'utf-8',
)

// Each marker is the `reason:` string INSIDE its call, so walk BACKWARD to the
// opening brace of the enclosing call and forward to its close. Searching
// forward instead would silently grab the next call in the file and pass for
// the wrong reason.
function callContaining(marker) {
  const at = SOURCE.indexOf(marker)
  if (at === -1) throw new Error(`marker not found in VoiceSession.js: ${marker}`)
  const open = SOURCE.lastIndexOf('hardStopVoiceSession({', at)
  if (open === -1) throw new Error(`no enclosing hardStopVoiceSession call for: ${marker}`)
  const close = SOURCE.indexOf('})', at)
  if (close === -1) throw new Error(`unterminated hardStopVoiceSession call for: ${marker}`)
  return SOURCE.slice(open, close + 2)
}

describe('wake word survives a conversational session end', () => {
  it('spoken end-intent does not disarm listening', () => {
    const call = callContaining('voice ended by spoken')
    expect(call).toMatch(/disarmListening:\s*false/)
  })

  it('spoken end-intent does not speak a browser-TTS farewell', () => {
    // window.speechSynthesis uses the OS voice, not the agent's — it sounded
    // like a second person answering when Carl closed Maggie out.
    const call = callContaining('voice ended by spoken')
    expect(call).not.toMatch(/farewell:/)
  })

  it('the agent hanging up does not disarm listening', () => {
    const call = callContaining('voice call ended by agent')
    expect(call).toMatch(/disarmListening:\s*false/)
  })

  it('the max-duration safety timeout does not disarm listening', () => {
    const call = callContaining('voice session auto-stopped after')
    expect(call).toMatch(/disarmListening:\s*false/)
  })

  it('still disarms on explicit user stops, and logs when it does', () => {
    // The panic hangup / spacebar / Stop control SHOULD turn the ear off.
    expect(SOURCE).toMatch(/stage:\s*'wake-disarmed'/)
    expect(SOURCE).toMatch(/if \(disarmListening\) \{/)
  })

  it('logs when wake is switched off while idle', () => {
    // The silent return that made this invisible in prod for weeks.
    expect(SOURCE).toMatch(/stage:\s*'wake-off-idle'/)
    expect(SOURCE).toMatch(/logWakeOffIdle\(\)/)
  })
})
