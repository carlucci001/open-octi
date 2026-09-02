import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { signingConfiguration } from '../lib/documentSignatures'

const root = process.cwd()
const templatesRoot = path.join(root, 'data-demo/document-templates')
const notice = 'This document is a draft for discussion and is not legal advice. Have it reviewed by a licensed attorney in your jurisdiction before use.'

describe('OpenOcti Linda documents and e-signature', () => {
  it('ships the complete business-neutral Linda starter pack', () => {
    const index = JSON.parse(fs.readFileSync(path.join(templatesRoot, '_index.json'), 'utf8')).templates
    expect(index.map(template => template.name)).toEqual([
      'Mutual NDA',
      'Master Services Agreement',
      'Statement of Work',
      'Consulting Agreement',
      'Independent Contractor Agreement',
      'Website Privacy Policy',
      'Website Terms of Service',
      'Simple Invoice Terms',
    ])
    for (const template of index) {
      const body = fs.readFileSync(path.join(templatesRoot, template.file), 'utf8').trim()
      expect(body.endsWith(notice), template.name).toBe(true)
      expect(body).not.toMatch(/Farrington|Newsroom|WNCT|MyVTC|Carl/i)
    }
  })

  it('teaches Linda the shipped pack by name', () => {
    const prompt = fs.readFileSync(path.join(root, 'deploy/openclaw/seed/workspace/legal/AGENTS.md'), 'utf8')
    for (const name of ['Mutual NDA', 'Master Services Agreement', 'Statement of Work', 'Consulting Agreement', 'Independent Contractor Agreement', 'Website Privacy Policy', 'Website Terms of Service', 'Simple Invoice Terms']) {
      expect(prompt).toContain(name)
    }
  })

  it('reports the exact missing e-signature configuration without exposing values', () => {
    expect(signingConfiguration({})).toEqual({
      configured: false,
      status: 'not_configured',
      missing: ['SIGNING_PUBLIC_URL', 'RESEND_API_KEY'],
      message: 'Not configured — add SIGNING_PUBLIC_URL and RESEND_API_KEY to enable e-signature.',
    })
    expect(signingConfiguration({ SIGNING_PUBLIC_URL: 'https://example.com', RESEND_API_KEY: 'test-only' })).toMatchObject({ configured: true, status: 'configured', missing: [] })
  })

  it('gates both document and agent signing paths and renders the setup state', () => {
    const documentsRoute = fs.readFileSync(path.join(root, 'app/api/documents/route.js'), 'utf8')
    const agentRoute = fs.readFileSync(path.join(root, 'app/api/agent/execute/route.js'), 'utf8')
    const manager = fs.readFileSync(path.join(root, 'app/documents/DocumentsManager.js'), 'utf8')
    expect(documentsRoute).toContain('if (isOpenOcti() && !eSign.configured)')
    expect(agentRoute).toContain('if (isOpenOcti() && !eSign.configured) throw new Error(eSign.message)')
    expect(manager).toContain('Add <code>SIGNING_PUBLIC_URL</code> and <code>RESEND_API_KEY</code> to enable e-signature.')
  })

  it('provides the first-run business and owner prompt on the dashboard', () => {
    const dashboard = fs.readFileSync(path.join(root, 'app/dashboard/Dashboard.js'), 'utf8')
    const firstRun = fs.readFileSync(path.join(root, 'app/dashboard/OpenOctiFirstRun.js'), 'utf8')
    expect(dashboard).toContain('<OpenOctiFirstRun />')
    expect(firstRun).toContain('Business name')
    expect(firstRun).toContain('Owner name')
    expect(firstRun).toContain('/api/openocti/setup')
  })
})
