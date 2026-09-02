import { describe, expect, it } from 'vitest'
import {
  findRosterAgent,
  isDirectTransferPhrase,
  resolveTransferTarget,
} from '../lib/voiceAgentRouting'

const roster = [
  { id: 'matilda', firstName: 'Matilda', name: 'Matilda' },
  { id: 'main', firstName: 'Maggie', name: 'Maggie' },
  { id: 'coding', firstName: 'Craig', name: 'Craig' },
  { id: 'finance-manager', firstName: 'Frank', name: 'Frank' },
  { id: 'social-media', firstName: 'Sasha', name: 'Sasha' },
  { id: 'legal', firstName: 'Linda', name: 'Linda' },
  { id: 'communications', firstName: 'Cameron', name: 'Cameron' },
  { id: 'newsroomaios-promoter', firstName: 'Mark', name: 'Mark' },
  { id: 'receptionist', firstName: 'Doreen', name: 'Doreen' },
  { id: 'morning-brief', firstName: 'Diane', name: 'Diane' },
]

describe('voice agent routing', () => {
  it('finds every roster agent by first name and id', () => {
    for (const agent of roster) {
      expect(findRosterAgent(roster, agent.firstName)?.id).toBe(agent.id)
      expect(findRosterAgent(roster, agent.id)?.id).toBe(agent.id)
    }
  })

  it('resolves transfer target after the transfer cue, not the active agent name', () => {
    expect(resolveTransferTarget(roster, 'Craig, transfer me to Sasha', { activeAgentId: 'coding' })?.id).toBe('social-media')
    expect(resolveTransferTarget(roster, 'Maggie send me to Craig', { activeAgentId: 'main' })?.id).toBe('coding')
    expect(resolveTransferTarget(roster, 'Sasha connect me with Linda', { activeAgentId: 'social-media' })?.id).toBe('legal')
  })

  it('recognizes natural business transfer language', () => {
    for (const phrase of [
      'transfer me to Sasha',
      'connect me with Craig',
      'put me through to Maggie',
      'let me talk to Linda',
      'I need to speak to Cameron',
      'route me over to Frank',
    ]) {
      expect(isDirectTransferPhrase(phrase)).toBe(true)
    }
  })
})
