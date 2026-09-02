import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import manifest from '../app/manifest.js'

describe('Builder PWA continuity', () => {
  it('extends the Command Center PWA scope to the Builder origin', () => {
    const pwa = manifest()

    expect(pwa.id).toBe('/')
    expect(pwa.scope).toBe('/')
    expect(pwa.theme_color).toBe('#020711')
    expect(pwa.scope_extensions).toEqual([
      {
        type: 'origin',
        origin: 'https://builder.farringtondevelopment.com',
      },
    ])
  })

  it('uses theme backgrounds for PWA chrome instead of the orange accent', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'app/layout.js'), 'utf8')
    const pageSource = readFileSync(resolve(process.cwd(), 'app/page.js'), 'utf8')

    for (const source of [layoutSource, pageSource]) {
      expect(source).toContain("command: '#020711'")
      expect(source).toContain("codex: '#F4F1EA'")
      expect(source).toContain("'codex-blue': '#eef1f6'")
      expect(source).not.toContain("codex: '#C15F3C'")
    }
  })

  it('keeps normal Builder launches in the installed PWA window', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/builder/BuilderWorkspace.jsx'), 'utf8')

    expect(source).toContain('window.location.assign(result.url)')
    expect(source).not.toContain("window.open('about:blank', '_blank')")
  })

  it('uses a reserved Builder app window instead of unloading an active video call', () => {
    const builderSource = readFileSync(resolve(process.cwd(), 'app/builder/BuilderWorkspace.jsx'), 'utf8')
    const pageSource = readFileSync(resolve(process.cwd(), 'app/page.js'), 'utf8')

    expect(builderSource).toContain('window.__fccCallActive || window.__fccConferenceActive')
    expect(builderSource).toContain("window.open('about:blank', 'fcc-builder'")
    expect(builderSource).toContain('launchWindow.popup.location.replace(result.url)')
    expect(pageSource).toContain('data-fcc-communications-keepalive="true"')
    expect(pageSource).toContain("aria-hidden={!(tab === 'phone' || tab === 'conference')}")
    expect(pageSource).toContain("communicationsKeepaliveRef.current.inert = !(tab === 'phone' || tab === 'conference')")
    expect(pageSource).toContain("left: '-200vw'")
  })
})
