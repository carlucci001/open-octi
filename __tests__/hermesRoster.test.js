import { describe, expect, it } from 'vitest'
import { addHermesAgents, HERMES_AGENT_RECORDS } from '@/scripts/register-hermes-agents.mjs'

const DESCRIPTIONS = {
  foreman: 'Orchestrator for the internal Hermes crew. Decomposes goals onto the kanban board, assigns to the others, tracks and reports. Never does the work itself.',
  nightwatch: 'Read-only nightly production auditor: backups, disk, services, cert, DB integrity on a copy. Alerts ntfy only when something is wrong. Runs 3:30 AM ET.',
  checker: 'Fact-verification gate. Verifies every claim in a deliverable with cited sources — pass / fail / unverifiable. Enforces the Command-Center-never-Farrington brand rule.',
  scribe: 'Process librarian. Distills completed procedures into skills and keeps them current — the runbook that writes itself.',
  ledger: 'Sandboxed data analyst. Weekly numbers brief from CRM exports (Mondays). Works only on copies, never live systems.',
}

describe('Hermes CRM roster registration', () => {
  it('adds exactly the five internal agents without changing existing records', () => {
    const existing = { name: 'Existing agent', nested: { untouched: true }, runtimeProvider: 'openclaw-hetzner' }
    const source = { __version: 7, agents: { existing }, lastUpdated: 'old' }

    const result = addHermesAgents(source, '2026-08-15T13:00:00.000Z')

    expect(result.added).toEqual(['foreman', 'nightwatch', 'checker', 'scribe', 'ledger'])
    expect(result.data.agents.existing).toEqual(existing)
    expect(result.data.__version).toBe(7)
    expect(result.data.lastUpdated).toBe('2026-08-15T13:00:00.000Z')
    expect(Object.keys(HERMES_AGENT_RECORDS)).toEqual(['foreman', 'nightwatch', 'checker', 'scribe', 'ledger'])
    for (const [id, description] of Object.entries(DESCRIPTIONS)) {
      expect(result.data.agents[id]).toMatchObject({
        name: id[0].toUpperCase() + id.slice(1),
        description,
        category: 'operations',
        runtimeProvider: 'hermes-hetzner',
        tenantId: 'farrington-development',
        disabled: false,
      })
      expect(result.data.agents[id]).not.toHaveProperty('schedule')
    }
  })

  it('is idempotent and leaves existing Hermes records unchanged', () => {
    const first = addHermesAgents({ agents: {} }, '2026-08-15T13:00:00.000Z')
    const serialized = JSON.stringify(first.data)
    const second = addHermesAgents(first.data, '2026-08-15T14:00:00.000Z')

    expect(second.added).toEqual([])
    expect(JSON.stringify(second.data)).toBe(serialized)
  })
})
