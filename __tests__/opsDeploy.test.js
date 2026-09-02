// Ops Lab deploy runner — plan-level contract.
// The runner executes ONLY registry-registered commands, only inside the
// allowed deploy roots, and a Vercel entry deploys via its hook, never a
// local path. Execution itself is exercised on the host, not here.
import { describe, expect, it } from 'vitest'
import { planSteps, deployStatus, deployRootAllowed } from '../lib/opsDeploy'

describe('opsDeploy planSteps', () => {
  it('refuses a localPath outside the allowed deploy roots', () => {
    const plan = planSteps({ id: 'x', localPath: '/etc' })
    expect(plan.kind).toBe('invalid')
    expect(plan.steps).toHaveLength(0)
  })

  it('refuses an empty localPath with no deploy hook', () => {
    expect(planSteps({ id: 'x' }).kind).toBe('invalid')
    expect(deployRootAllowed('')).toBe('')
  })

  it('plans a Vercel hook entry without touching the filesystem', () => {
    const plan = planSteps({ id: 'v', deployHookUrl: 'https://api.vercel.com/v1/integrations/deploy/prj_abc/xyz' })
    expect(plan.kind).toBe('vercel-hook')
    expect(plan.steps[0].id).toBe('deploy-hook')
    expect(plan.steps[0].cmd).toContain('curl -fsS -X POST')
  })

  it('single-quotes hook URLs against shell injection', () => {
    const plan = planSteps({ id: 'v', deployHookUrl: "https://x/'; rm -rf /; '" })
    expect(plan.steps[0].cmd).toContain("'\\''")
  })
})

describe('opsDeploy deployStatus', () => {
  it('rejects an unknown or malformed runId', () => {
    expect(deployStatus('../../etc/passwd').ok).toBe(false)
    expect(deployStatus('does-not-exist').ok).toBe(false)
    expect(deployStatus('').ok).toBe(false)
  })
})
