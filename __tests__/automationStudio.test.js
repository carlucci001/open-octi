import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('automation studio', () => {
  it('ships the first sellable service templates', () => {
    const templates = read('lib/automation-studio-templates.js')

    expect(templates).toContain("'client-deep-dive'")
    expect(templates).toContain("'deerflow-lead-enrichment'")
    expect(templates).toContain("'market-competitor-scan'")
    expect(templates).toContain("'reputation-risk-scan'")
    expect(templates).toContain("'follow-up-builder'")
  })

  it('keeps manual automation runs guarded until live runners are wired', () => {
    const store = read('lib/automations-store.js')

    expect(store).toContain('buildGuardedRunProof')
    expect(store).toContain('no external send, CRM write, scheduling, or spend action was executed')
    expect(store).toContain('approvalRequired')
  })

  it('exposes templates through the automations API and UI', () => {
    const route = read('app/api/automations/route.js')
    const manager = read('app/automations/AutomationsManager.js')

    expect(route).toContain('listAutomationTemplates')
    expect(route).toContain('createAutomationFromTemplate')
    expect(manager).toContain('Automation Studio')
    expect(manager).toContain('StudioBench')
  })
})
