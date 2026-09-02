import { describe, expect, it } from 'vitest'
import { getAutomationRunner } from '../lib/automation-runners'

describe('automation runner registry — fulfillment.handler resolution', () => {
  it('resolves the campaign publish runner by fulfillment.handler', () => {
    const runner = getAutomationRunner({ fulfillment: { handler: 'campaign-publish-v1' } })
    expect(runner?.id).toBe('campaign-publish-v1')
    expect(runner?.label).toBe('Campaign Publish Automation v1')
    expect(typeof runner?.run).toBe('function')
  })

  it('resolves the lead sweep runner by fulfillment.handler', () => {
    const runner = getAutomationRunner({ fulfillment: { handler: 'lead-sweep-v1' } })
    expect(runner?.id).toBe('lead-sweep-v1')
    expect(runner?.label).toBe('Lead Sweep Automation v1')
    expect(typeof runner?.run).toBe('function')
  })

  it('resolves the Riley follow-up runner by fulfillment.handler', () => {
    const runner = getAutomationRunner({ fulfillment: { handler: 'riley-follow-up-v1' } })
    expect(runner?.id).toBe('riley-follow-up-v1')
    expect(runner?.label).toBe('Riley Follow-up Watchdog v1')
    expect(typeof runner?.run).toBe('function')
  })

  it('still resolves by templateId and runnerId (unchanged behavior)', () => {
    expect(getAutomationRunner({ templateId: 'lead-sweep-v1' })?.id).toBe('lead-sweep-v1')
    expect(getAutomationRunner({ runnerId: 'campaign-publish-v1' })?.id).toBe('campaign-publish-v1')
    expect(getAutomationRunner({ runnerId: 'riley-follow-up-v1' })?.id).toBe('riley-follow-up-v1')
  })

  it('returns null for an unrecognized automation', () => {
    expect(getAutomationRunner({ fulfillment: { handler: 'unknown-v1' } })).toBeNull()
    expect(getAutomationRunner(null)).toBeNull()
  })
})
