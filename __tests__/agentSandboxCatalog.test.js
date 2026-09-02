import { describe, expect, it } from 'vitest'
import {
  PRODUCT_MODULES,
  SANDBOX_STAGES,
  THIRD_PARTY_AGENT_TEMPLATES,
  findProductModuleForAgent,
  getSandboxMetrics,
} from '../lib/agent-sandbox-catalog'

describe('agent sandbox catalog', () => {
  it('keeps imported templates quarantined by default', () => {
    expect(THIRD_PARTY_AGENT_TEMPLATES.length).toBeGreaterThan(0)

    for (const agent of THIRD_PARTY_AGENT_TEMPLATES) {
      expect(agent.defaultRuntime).toBe('sandbox-only')
      expect(agent.sourceRepo).toBeTruthy()
      expect(agent.license).toBeTruthy()
      expect(agent.toolPolicy).toMatch(/read|no|disabled|sanitized|sandbox/i)
    }
  })

  it('maps candidate agents to product modules', () => {
    const mapped = THIRD_PARTY_AGENT_TEMPLATES.filter(agent => findProductModuleForAgent(agent.id))

    expect(PRODUCT_MODULES.length).toBeGreaterThan(0)
    expect(mapped.length).toBe(THIRD_PARTY_AGENT_TEMPLATES.length)
  })

  it('reports stage metrics from the shared stage list', () => {
    const metrics = getSandboxMetrics()
    const stageIds = new Set(SANDBOX_STAGES.map(stage => stage.id))

    expect(metrics.total).toBe(THIRD_PARTY_AGENT_TEMPLATES.length)
    expect(metrics.byStage.every(stage => stageIds.has(stage.id))).toBe(true)
    expect(metrics.byStage.reduce((sum, stage) => sum + stage.count, 0)).toBe(metrics.total)
    expect(metrics.averageReadiness).toBeGreaterThan(0)
  })
})
