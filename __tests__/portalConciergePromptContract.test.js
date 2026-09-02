// The text concierge's tools and its prompt are declared in different files
// that nothing forced to agree. That drift is exactly how card surfacing sat
// dead in text chat: surface_service_cards was declared to Gemini, but the
// prompt whitelisted "the four account tools" by name and never mentioned it,
// so the model — correctly obeying its instructions — never called it, and
// the rail beside the conversation stayed blank (found 2026-08-25).
//
// These tests pin prompt <-> tool agreement, plus the login-greeting copy.
import { describe, expect, it } from 'vitest'
import { buildPortalConciergePrompt } from '@/lib/portal-concierge'
import { CONCIERGE_TOOL_NAMES } from '@/lib/portal-concierge-tool-schemas'
import { PORTAL_LIVE_TOOL_DECLARATIONS } from '@/lib/portal-live-tools'
import { getPortalCapabilityRuntime } from '@/lib/portal-capability-runtime'
import { buildGreetingText } from '@/lib/portal-greeting'

function samplePrompt() {
  return buildPortalConciergePrompt({
    session: { accountId: 'ac_test', tenantId: 'tenant_test', email: 'client@example.com' },
    account: { id: 'ac_test', name: 'Test Account', website: 'https://example.com' },
    profile: { fields: {} },
    message: 'I want help finding leads',
    recentMessages: [],
    capabilityRuntime: getPortalCapabilityRuntime({ accountId: 'ac_test' }),
  })
}

describe('portal concierge prompt <-> tool contract', () => {
  it('names every declared concierge tool, so no tool can be silently suppressed by the prompt', () => {
    const prompt = samplePrompt()
    for (const name of CONCIERGE_TOOL_NAMES) {
      expect(prompt, `prompt must mention declared tool ${name}`).toContain(name)
    }
    // The text chat now declares the live-tool set (nav included); the prompt
    // must acknowledge every declared tool or the model will suppress it.
    for (const tool of PORTAL_LIVE_TOOL_DECLARATIONS) {
      expect(prompt, `prompt must mention declared tool ${tool.name}`).toContain(tool.name)
    }
  })

  it('instructs card surfacing beside the conversation', () => {
    const prompt = samplePrompt()
    expect(prompt).toMatch(/surface_service_cards as soon as/i)
  })

  it("carries Carl's never-say-no rule: unmatched needs become work orders, never refusals", () => {
    const prompt = samplePrompt()
    expect(prompt).toMatch(/There is nothing Farrington does not offer/i)
    expect(prompt).toMatch(/call create_work_order/i)
    expect(prompt).toMatch(/Carl will get with them personally/i)
    expect(prompt).toMatch(/Never quote a price or delivery date for custom work/i)
  })
})

describe('portal login greeting', () => {
  it('greets by first name only, and offers both chat and the live voice button', () => {
    const text = buildGreetingText({ firstName: 'Carl', hour: 9 })
    expect(text).toContain('Good morning, Carl.')
    expect(text).toMatch(/chat/i)
    expect(text).toMatch(/live voice button/i)
  })

  it('greets gracefully with no first name on file', () => {
    const text = buildGreetingText({ firstName: '', hour: 20 })
    expect(text.startsWith('Good evening.')).toBe(true)
    expect(text).not.toContain(', .')
  })
})
