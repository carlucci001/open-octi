import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/lib/agent-presets'

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('DeepSeek Harness starter agent', () => {
  it('ships exactly one isolated Harness agent with Gemini voice and no production tools', () => {
    const agents = PRESETS.filter(preset => preset.runtimeProvider === 'deepseek-harness-local')

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: 'deepseek-lab-operator',
      name: 'Dax',
      runtimeProvider: 'deepseek-harness-local',
      channels: ['internal'],
      voice: {
        provider: 'gemini',
        geminiModel: 'gemini-3.1-flash-live-preview',
        geminiVoice: 'Kore',
      },
      schedule: { mode: 'on-demand' },
    })
    expect(agents[0].tools).toEqual([])
    expect(agents[0].labs).toMatchObject({ experimental: true, isolation: 'sidecar', tools: 'none' })
  })

  it('appears in the runtime dropdown and is included in the browser voice roster', () => {
    const manager = read('app/agents/AgentsManager.js')
    const roster = read('app/api/voice/roster/route.js')

    expect(manager).toContain("{ id: 'deepseek-harness-local', label: 'DeepSeek Harness' }")
    expect(manager).toContain("agent.runtimeProvider === 'deepseek-harness-local'")
    expect(roster).toContain("preset.runtimeProvider !== 'openclaw-hetzner'")
    expect(roster).toContain("['openai', 'gemini', 'chirp3', 'vibevoice'].includes(preset?.voice?.provider)")
  })

  it('keeps local runtime preset activation away from OpenClaw', () => {
    const store = read('lib/agents-store.js')

    expect(store).toContain("const localOnlyRuntime = runtimeProvider !== 'openclaw-hetzner'")
    expect(store).toContain('const result = localOnlyRuntime')
    expect(store).toContain('draft: localOnlyRuntime')
  })
})
