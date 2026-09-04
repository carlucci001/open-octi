import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOpenOctiExcluded } from '../scripts/openocti-excludes.mjs'

const root = process.cwd()
const clips = [
  'welcome-morning.mp3',
  'welcome-afternoon.mp3',
  'welcome-evening.mp3',
  'welcome-hello.mp3',
  'welcome-first-run.mp3',
]

describe('OpenOcti welcome audio', () => {
  it('ships every prerecorded welcome clip through the exporter', () => {
    for (const clip of clips) {
      const relative = `public/audio/openocti-welcome/${clip}`
      expect(fs.statSync(path.join(root, relative)).size, clip).toBeGreaterThan(10_000)
      expect(isOpenOctiExcluded(relative), clip).toBe(false)
    }
  })

  it('never speaks through browser speech synthesis in the OpenOcti edition', () => {
    const login = fs.readFileSync(path.join(root, 'app/login/loginWelcomeAudio.js'), 'utf8')
    const session = fs.readFileSync(path.join(root, 'app/components/VoiceSession.js'), 'utf8')
    const ops = fs.readFileSync(path.join(root, 'app/ops/OpsManager.js'), 'utf8')
    expect(login).not.toContain('speechSynthesis')
    expect(session).toContain("farewellText && typeof window !== 'undefined' && !isOpenOcti()")
    expect(ops).toContain("const supported = !isOpenOcti() && typeof window !== 'undefined'")
  })

  it('routes first login to Models and Keys after persisting completion', () => {
    const source = fs.readFileSync(path.join(root, 'app/login/loginWelcomeAudio.js'), 'utf8')
    expect(source).toContain("openOctiWelcomeClipFor({ setupIncomplete: true })")
    expect(source).toContain("body: JSON.stringify({ action: 'complete-first-login' })")
    expect(source).toContain("window.location.assign('/settings/models')")
  })
})
