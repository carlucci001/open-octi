import { describe, expect, it } from 'vitest'
import { COMMAND_CENTER_SECTIONS, resolveCommandCenterTab } from '../lib/commandCenterNavigation'

describe('Incident Inbox navigation', () => {
  it('registers the Operations lane destination and voice aliases', () => {
    expect(COMMAND_CENTER_SECTIONS.find(section => section.id === 'incident-inbox')).toMatchObject({ label: 'Operations > Incident Inbox' })
    expect(resolveCommandCenterTab('incident inbox')).toBe('incident-inbox')
    expect(resolveCommandCenterTab('show platform errors')).toBe('incident-inbox')
  })
})
