import fs from 'node:fs'
import path from 'node:path'

import { assertStarterPackSafe, STARTER_AGENT_IDS, STARTER_AGENTS } from '../scripts/export-agent-pack.mjs'

const seedRoot = path.join(process.cwd(), 'data-demo')

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(seedRoot, name), 'utf8'))
}

describe('OpenOcti starter agent pack', () => {
  const agentsSeed = readSeed('agents.json')
  const voiceRoster = readSeed('voice-agent-roster.json')
  const voiceAgent = readSeed('voice-agent.json')

  it('keeps the synthetic guide and ships exactly the five named starter definitions', () => {
    expect(agentsSeed.agents['octi-guide']?.name).toBe('Octi Guide')
    expect(STARTER_AGENTS.map((name) => agentsSeed.agents[STARTER_AGENT_IDS[name]]?.name)).toEqual(STARTER_AGENTS)
  })

  it('keeps required runtime and voice preferences without provider object ids', () => {
    expect(agentsSeed.agents.coding.runtimeProvider).toBe('openclaw-hetzner')
    expect(agentsSeed.agents.matilda.runtimeProvider).toBe('gemini-live')
    expect(agentsSeed.agents.matilda.voice).toMatchObject({
      provider: 'gemini',
      geminiModel: 'gemini-live-2.5-flash-preview',
    })

    for (const id of ['main', 'social-media', 'legal']) {
      expect(agentsSeed.agents[id].channels).toContain('voice')
      expect(agentsSeed.agents[id].voice.provider).toBe('elevenlabs')
      expect(voiceRoster[id]).toMatchObject({ agentId: '', voiceId: '' })
    }
    expect(voiceAgent).toMatchObject({ name: 'Maggie', agentId: '', voiceId: '' })
  })

  it('contains no private terms, contact details, URLs, secrets, or provider object ids', () => {
    expect(() => assertStarterPackSafe({ agentsSeed, voiceRoster, voiceAgent })).not.toThrow()

    const text = JSON.stringify({ agentsSeed, voiceRoster, voiceAgent }).toLowerCase()
    const privateTerms = [
      ['car', 'l'],
      ['farring', 'ton'],
      ['wn', 'ct'],
      ['news', 'room'],
      ['my', 'vtc'],
    ].map((parts) => parts.join(''))
    for (const term of privateTerms) expect(text).not.toContain(term)
  })
})
