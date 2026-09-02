import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'scripts/rapid-live-release.ps1'), 'utf8')

describe('rapid live release safety gates', () => {
  it('requires clean GitHub-aligned local and production trees', () => {
    expect(source).toContain("$ExpectedOrigin = 'https://github.com/carlucci001/farrington-command-center.git'")
    expect(source).toContain("$ExpectedProductionOrigin = 'redacted@example.invalid:carlucci001/farrington-command-center.git'")
    expect(source).toContain('git status --porcelain')
    expect(source).toContain('$localHead -ne $Commit -or $githubHead -ne $Commit')
    expect(source).toContain("$ciRun.conclusion -ne 'success'")
  })

  it('builds successfully before restarting and verifies the deployed SHA', () => {
    expect(source.indexOf("echo 'BUILD=passed'")).toBeLessThan(source.indexOf('systemctl restart farrington-crm.service'))
    expect(source).toContain('DEPLOYED_SHA=')
    expect(source).toContain('DIRTY_COUNT=0')
    expect(source).toContain('https://openocti.local/api/pricing')
    expect(source).toContain('https://openocti.local/api/build-info')
  })

  it('does not bypass Git history or deploy directly from Gitea', () => {
    expect(source).not.toContain('reset --hard')
    expect(source).not.toContain('git clean')
    expect(source).not.toContain('gitea')
    expect(source).toContain('git merge --ff-only')
  })
})
