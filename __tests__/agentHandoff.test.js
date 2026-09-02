import { describe, expect, it } from 'vitest'
import { buildAgentHandoffPayload } from '../lib/agent-handoff'

describe('agent handoff payloads', () => {
  it('routes Craig transfers to the Ops workspace', () => {
    const payload = buildAgentHandoffPayload({ id: 'coding', firstName: 'Craig' }, 'check the repo')
    expect(payload.tab).toBe('ops')
    expect(payload.title).toBe('Craig Handoff')
    expect(payload.reason).toBe('check the repo')
  })

  it('routes Doreen transfers to Feed activity context', () => {
    const payload = buildAgentHandoffPayload({ firstName: 'Doreen', role: 'Receptionist' })
    expect(payload.tab).toBe('feed')
    expect(payload.preview).toMatch(/recent calls/i)
  })

  it('routes every named house agent to a configured handoff', () => {
    const agents = [
      ['Matilda', 'dashboard'],
      ['Maggie', 'dashboard'],
      ['Craig', 'ops'],
      ['Frank', 'finance'],
      ['Sasha', 'media'],
      ['Linda', 'documents'],
      ['Cameron', 'feed'],
      ['Mark', 'media'],
      ['Doreen', 'feed'],
      ['Diane', 'feed'],
    ]

    for (const [firstName, tab] of agents) {
      const payload = buildAgentHandoffPayload({ firstName })
      expect(payload.tab).toBe(tab)
      expect(payload.agentName).toBe(firstName)
    }
  })

  it('leaves the current screen for unknown configured agents', () => {
    const payload = buildAgentHandoffPayload({ id: 'custom-agent', name: 'Custom Agent' })
    expect(payload.tab).toBe('')
    expect(payload.agentName).toBe('Custom Agent')
  })

  it('routes morning brief aliases to Diane in Feed', () => {
    for (const agent of [
      { id: 'morning-brief', name: 'Diane' },
      { firstName: 'Dian' },
      { role: 'Morning Brief' },
    ]) {
      const payload = buildAgentHandoffPayload(agent)
      expect(payload.tab).toBe('feed')
      expect(payload.title).toBe('Diane Handoff')
      expect(payload.intent).toBe('Morning brief and status')
    }
  })
})
