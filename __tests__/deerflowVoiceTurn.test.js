import { describe, expect, it } from 'vitest'
import {
  extractDeerFlowResearchTarget,
  inferDeerFlowFollowUpTarget,
  resolveDeerFlowResearchTarget,
} from '../lib/deerflow-voice-turn'

describe('DeerFlow voice follow-up handling', () => {
  it('keeps the research intent when the target arrives in the next voice turn', () => {
    const messages = [
      { role: 'user', content: 'deep dive' },
      { role: 'assistant', content: 'Who or what should I research?' },
      { role: 'user', content: 'we the people.com' },
    ]

    expect(resolveDeerFlowResearchTarget('we the people.com', messages)).toBe('we the people.com')
  })

  it('still extracts a target supplied in the original request', () => {
    expect(extractDeerFlowResearchTarget('Run a deep dive on Acme.example')).toBe('Acme.example')
  })

  it('does not turn unrelated standalone speech into a research target', () => {
    expect(inferDeerFlowFollowUpTarget('we the people.com', [
      { role: 'assistant', content: 'How can I help?' },
    ])).toBe('')
  })

  it('does not treat a cancellation as the requested target', () => {
    expect(inferDeerFlowFollowUpTarget('cancel', [
      { role: 'user', content: 'deep dive' },
      { role: 'assistant', content: 'Who or what should I research?' },
    ])).toBe('')
  })
})
