// Platforms M1 — nav migration acceptance: the getfound3 section is gone,
// platforms exists, and every legacy GetFound3 alias resolves to platforms
// so voice navigation and deep links stay unbroken (ruling spec).
import { describe, expect, it } from 'vitest'
import { COMMAND_CENTER_SECTIONS, resolveCommandCenterTab } from '../lib/commandCenterNavigation'

const LEGACY_GETFOUND3_ALIASES = [
  'getfound3',
  'get found 3',
  'get found three',
  'visibility reports',
  'seo reports',
  'aeo reports',
  'geo reports',
  'website visibility',
  'remediation reports',
]

describe('Platforms navigation migration', () => {
  it('removes the getfound3 section entirely', () => {
    expect(COMMAND_CENTER_SECTIONS.some(section => section.id === 'getfound3')).toBe(false)
  })

  it('registers a platforms section', () => {
    const platforms = COMMAND_CENTER_SECTIONS.find(section => section.id === 'platforms')
    expect(platforms).toBeTruthy()
    expect(platforms.label).toBe('Platforms')
  })

  it.each(LEGACY_GETFOUND3_ALIASES)('routes legacy alias "%s" to platforms', (alias) => {
    expect(resolveCommandCenterTab(alias)).toBe('platforms')
  })

  it('routes the new platform aliases to platforms', () => {
    expect(resolveCommandCenterTab('platforms')).toBe('platforms')
    expect(resolveCommandCenterTab('platform manager')).toBe('platforms')
    expect(resolveCommandCenterTab('take me to platforms')).toBe('platforms')
  })

  it('does not disturb neighboring sections', () => {
    expect(resolveCommandCenterTab('agents')).toBe('agents')
    expect(resolveCommandCenterTab('accounts')).toBe('accounts')
    expect(resolveCommandCenterTab('pipelines')).toBe('pipelines')
  })
})
