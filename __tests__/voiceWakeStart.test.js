import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { buildWakeStartOptions } from '../lib/voiceWakeStart'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('voice wake starts', () => {
  it('starts named wake phrases with an audible pickup', () => {
    expect(buildWakeStartOptions()).toEqual({ initialText: '', silent: false })
    expect(buildWakeStartOptions({ initialText: 'create a task' })).toEqual({
      initialText: 'create a task',
      silent: false,
    })
  })

  it('keeps Maggie, Craig, and Sasha on the wake-word path', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain("'maggie': ['maggie'")
    expect(voice).toContain("'craig': ['craig'")
    expect(voice).toContain("'sasha': ['sasha'")
    expect(voice).toContain('buildWakeStartOptions({ initialText })')
    expect(voice).not.toContain("startRef.current?.(matched?.id || null, { initialText, silent: true })")
  })

  it('does not let stale desktop PWA storage keep wake listening off after reload', () => {
    const voice = read('app/components/VoiceSession.js')

    expect(voice).toContain('return !isMobileOrTabletDevice()')
    expect(voice).not.toContain("const saved = localStorage.getItem('fcc-wake-word-on')")
  })

  it('keeps the installed PWA runtime at or after the voice wake hotfix', () => {
    // Date-prefix ratchet: the 2026-06-23 hotfix must never regress, but later
    // version bumps (which happen on every SW change) keep passing.
    const HOTFIX = '2026-06-23'
    const versionDate = (src) => (src.match(/\b(20\d{2}-\d{2}-\d{2})[\w-]*/) || [])[1] || ''
    expect(versionDate(read('app/components/PWARegister.js')) >= HOTFIX).toBe(true)
    expect(versionDate(read('public/sw.js')) >= HOTFIX).toBe(true)
  })
})
