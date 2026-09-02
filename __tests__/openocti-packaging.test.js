import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOpenOctiExcluded, OPENOCTI_EXCLUDES } from '../scripts/openocti-excludes.mjs'

const root = process.cwd()

describe('OpenOcti package boundary', () => {
  it('excludes closed and private paths while retaining public CRM paths', () => {
    expect(OPENOCTI_EXCLUDES.length).toBeGreaterThan(20)
    expect(isOpenOctiExcluded('data/accounts.json')).toBe(true)
    expect(isOpenOctiExcluded('data-demo')).toBe(true)
    expect(isOpenOctiExcluded('app/portal')).toBe(true)
    expect(isOpenOctiExcluded('app/portal/page.js')).toBe(true)
    expect(isOpenOctiExcluded('app/api/stripe/route.js')).toBe(true)
    expect(isOpenOctiExcluded('lib/deerflow-client.js')).toBe(true)
    expect(isOpenOctiExcluded('scripts/export-agent-pack.mjs')).toBe(true)
    expect(isOpenOctiExcluded('.env.local')).toBe(true)
    expect(isOpenOctiExcluded('.openclaw-plugin-staging/index.ts')).toBe(true)
    expect(isOpenOctiExcluded('app/leads/page.js')).toBe(false)
    expect(isOpenOctiExcluded('app/api/platform-admin/v1/route.js')).toBe(false)
  })

  it('ships the public OpenOcti plugin and excludes its private staging predecessor', () => {
    expect(fs.existsSync(path.join(root, 'deploy/openclaw/openocti-plugin/openclaw.plugin.json'))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'deploy/openclaw/openocti-plugin/openclaw.plugin.json'), 'utf8'))
    expect(manifest).toMatchObject({ id: 'openocti', name: 'OpenOcti' })
  })

  it('ships only pattern-clean demo data', () => {
    const files = fs.readdirSync(path.join(root, 'data-demo')).filter((name) => name.endsWith('.json'))
    expect(files.length).toBeGreaterThan(10)
    const content = files.map((name) => fs.readFileSync(path.join(root, 'data-demo', name), 'utf8')).join('\n')
    expect(content).not.toMatch(/@|\+1|sk-|\bAC[0-9a-f]{32}\b/i)
    expect(content).not.toMatch(/["'](?:access_?token|refresh_?token|auth_?token|api_?token)["']\s*:/i)
  })

  it('documents every environment variable referenced by runtime code', () => {
    const roots = ['app', 'lib', 'server', 'scripts']
    const codeFiles = []
    const walk = (directory) => {
      for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        const relative = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(relative)
        else if (/\.(?:c?js|mjs|tsx?|jsx)$/.test(entry.name)) codeFiles.push(relative)
      }
    }
    roots.forEach(walk)
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
    const declared = new Set([...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]))
    const referenced = new Set()
    const pattern = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g
    for (const relative of codeFiles) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8')
      for (const match of source.matchAll(pattern)) referenced.add(match[1] || match[2])
    }
    expect([...referenced].filter((name) => !declared.has(name))).toEqual([])
  })

  it('includes the complete AGPL license and required public documents', () => {
    const license = fs.readFileSync(path.join(root, 'openocti', 'LICENSE'), 'utf8')
    expect(license).toContain('GNU AFFERO GENERAL PUBLIC LICENSE')
    expect(license).toContain('END OF TERMS AND CONDITIONS')
    expect(license.length).toBeGreaterThan(30000)
    for (const relative of ['README.md', 'LICENSE-COMMERCIAL.md', 'CLA.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'docs/INSTALL.md', '.github/workflows/ci.yml']) {
      expect(fs.existsSync(path.join(root, 'openocti', relative))).toBe(true)
    }
  })
})
