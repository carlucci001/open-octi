import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

describe('Repository Codex Dark guardrails', () => {
  it('opens the embedded Gitea frame with an explicit theme handoff', () => {
    const source = read('app/gitea/GiteaWorkspace.js')

    expect(source).toContain("const repositoryFrameTheme = ['command', 'codex-blue', 'codex', 'codex-dark'].includes(theme)")
    expect(source).toContain('repositoryFrameDark = repositoryFrameTheme === \'command\' || repositoryFrameTheme === \'codex-dark\'')
    expect(source).toContain('fccTheme=${encodeURIComponent(repositoryFrameTheme)}&fccThemeVersion=2')
    expect(source).toContain('repository-workspace')
    expect(source).toContain('repository-frame-header')
  })

  it('injects and persists the dark Gitea frame theme through the proxy', () => {
    const source = read('app/api/repository/gitea/[[...path]]/route.js')

    expect(source).toContain('function repositoryTheme(request)')
    expect(source).toContain('incoming.searchParams.delete(\'fccTheme\')')
    expect(source).toContain('fcc_gitea_theme=${theme}')
    expect(source).toContain('fcc-gitea-dark-frame')
    expect(source).toContain("command: {")
    expect(source).toContain("base: '#0b0f17'")
    expect(source).toContain("const darkFrame = theme === 'command' || theme === 'codex-dark'")
    expect(source).toContain("color-scheme: ${darkFrame ? 'dark' : 'light'} !important")
  })

  it('keeps the Command Center repository wrapper dark under Codex Dark', () => {
    const source = read('app/globals.css')

    expect(source).toContain('.repository-workspace')
    expect(source).toContain('.repository-workspace .repository-frame-header')
    expect(source).toContain('background: var(--surface2) !important')
  })
})
