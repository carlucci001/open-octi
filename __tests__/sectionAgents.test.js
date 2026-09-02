import { describe, expect, it } from 'vitest'
import { getSectionAgent, getWizardAgent, resolveWizardAgentSection } from '../lib/section-agents'

describe('AI Wizard section agent routing', () => {
  it('keeps ordinary Ops Lab work with Craig', () => {
    expect(resolveWizardAgentSection('ops', 'Check production and backups')).toBe('ops')
    expect(getWizardAgent('ops', 'Check production and backups').name).toBe('Craig')
  })

  it('routes finance intent to Frank even from Ops Lab', () => {
    expect(resolveWizardAgentSection('ops', 'Help me with an overdue invoice')).toBe('finance')
    expect(getWizardAgent('ops', 'Help me with an overdue invoice').agentId).toBe('finance-manager')
    expect(getWizardAgent('ops', 'Help me with an overdue invoice').name).toBe('Frank')
  })

  it('does not change the base Finance section owner', () => {
    expect(getSectionAgent('finance').name).toBe('Frank')
  })
})
