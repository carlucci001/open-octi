import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { data: {} }
vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(f => state.data[f]),
  writeData: vi.fn((f, d) => { state.data[f] = d }),
}))
vi.mock('../lib/ai-lab', () => ({ runAiModel: vi.fn() }))

const mod = await import('../lib/orca-handoff')
const { tiersFor, classifyError, createRun, executeRun, getRun, ensureOrcaAgent, loadRuns, isAgentEnabled, setAgentEnabled, setMode, getHandoffSettings, TIER_MODELS, MAX_RUNS } = mod

beforeEach(() => { state.data = {} })

describe('orca tiers', () => {
  it('never spends when paid fallback is off', () => {
    expect(tiersFor('light', { paid: false })).toEqual(['free'])
    expect(tiersFor('standard', { paid: false })).toEqual(['free'])
    expect(tiersFor('heavy', { paid: false })).toEqual(['free'])
  })
  it('escalates when paid fallback is on', () => {
    expect(tiersFor('standard', { paid: true })).toEqual(['free', 'cheap'])
    expect(tiersFor('heavy', { paid: true })).toEqual(['cheap', 'quality'])
  })
  it('classifies 429s per OrcaRouter guidance', () => {
    expect(classifyError(new Error('OrcaRouter 429 retry-after 12'))).toBe('rate_limited')
    expect(classifyError(new Error('OrcaRouter 429: prompt too large'))).toBe('free_cap')
    expect(classifyError(new Error('401 bad api key'))).toBe('auth')
  })
})

describe('orca runs', () => {
  it('registers the Orca agent once', () => {
    expect(ensureOrcaAgent()).toBe(true)
    expect(ensureOrcaAgent()).toBe(false)
    expect(state.data['agents.json'].agents.orca.runtimeProvider).toBe('orcarouter')
  })

  it('completes on the free router and records the resolved model', async () => {
    const run = vi.fn(async ({ modelId }) => ({ text: 'REPORT', model: 'orcarouter/free', route: { resolvedModel: 'qwen/qwen3.8-27b-free', router: 'free' }, usage: { total_tokens: 10 } }))
    const rec = createRun({ fromAgentId: 'main', task: 'summarize', complexity: 'light' })
    const out = await executeRun(rec.id, { run, paid: false })
    expect(out.status).toBe('done')
    expect(out.tier).toBe('free')
    expect(out.resolvedModel).toBe('qwen/qwen3.8-27b-free')
    expect(out.result).toBe('REPORT')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0].modelId).toBe(TIER_MODELS.free)
  })

  it('classifies complexity with a free call when not given', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ text: 'heavy' })
      .mockResolvedValueOnce({ text: 'done', model: 'x' })
    const rec = createRun({ fromAgentId: 'coding', task: 'big analysis' })
    const out = await executeRun(rec.id, { run, paid: false })
    expect(out.complexity).toBe('heavy')
    expect(out.downgraded).toBe(true)
    expect(out.tier).toBe('free')
  })

  it('reports free_cap and does not retry unchanged', async () => {
    const run = vi.fn(async () => { throw new Error('OrcaRouter 429: prompt exceeds cap') })
    const rec = createRun({ fromAgentId: 'main', task: 'huge', complexity: 'standard' })
    const out = await executeRun(rec.id, { run, paid: false })
    expect(out.status).toBe('failed')
    expect(out.error).toMatch(/free_cap/)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('falls from free to cheap when paid fallback is on', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('OrcaRouter 429: cap'))
      .mockResolvedValueOnce({ text: 'ok', model: 'openai/gpt-4o-mini' })
    const rec = createRun({ fromAgentId: 'main', task: 't', complexity: 'standard' })
    const out = await executeRun(rec.id, { run, paid: true })
    expect(out.status).toBe('done')
    expect(out.tier).toBe('cheap')
    expect(out.attempts).toHaveLength(2)
  })

  it('prunes to MAX_RUNS', () => {
    for (let i = 0; i < MAX_RUNS + 5; i++) createRun({ fromAgentId: 'x', task: 't' })
    expect(loadRuns().length).toBe(MAX_RUNS)
    expect(getRun(loadRuns()[0].id)).toBeTruthy()
  })
})

describe('orca switches', () => {
  it('defaults to per-agent mode with office agents on and phone agents off', () => {
    expect(getHandoffSettings().mode).toBe('per-agent')
    expect(isAgentEnabled('main')).toBe(true)
    expect(isAgentEnabled('receptionist')).toBe(false)
  })
  it('per-agent toggle works and survives run writes', () => {
    setAgentEnabled('receptionist', true)
    createRun({ fromAgentId: 'x', task: 't' })
    expect(isAgentEnabled('receptionist')).toBe(true)
    setAgentEnabled('main', false)
    expect(isAgentEnabled('main')).toBe(false)
  })
  it('master switch overrides the list both ways', () => {
    setMode('all')
    expect(isAgentEnabled('super-demo')).toBe(true)
    setMode('off')
    expect(isAgentEnabled('main')).toBe(false)
    setMode('per-agent')
    expect(isAgentEnabled('main')).toBe(true)
    expect(() => setMode('bogus')).toThrow()
  })
})
