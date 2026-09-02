import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {},
  harnessAgents: [],
  summarySeq: 0,
}))

const openclawMocks = vi.hoisted(() => ({
  readOpenclawAgents: vi.fn(async () => ({ defaults: {}, list: state.harnessAgents, schemaUnknownKeys: [] })),
  patchOpenclawAgents: vi.fn(),
}))

const orcaMocks = vi.hoisted(() => ({
  createRun: vi.fn(input => ({ id: `oh_summary_${++state.summarySeq}`, ...input })),
  executeRun: vi.fn(async id => ({ id, status: 'done', result: 'This flow asks the onboarding questions and records the work that Phase 2 would perform.' })),
}))

vi.mock('@/lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => ({ user: { id: 'usr_test', role: 'owner' }, error: null })),
  requireCrmWrite: vi.fn(async () => ({ user: { id: 'usr_test', role: 'owner' }, error: null })),
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

vi.mock('@/lib/openclaw-config', () => openclawMocks)
vi.mock('@/lib/orca-handoff', () => orcaMocks)

function request(body) {
  return new Request('https://openocti.local/api/orchestrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function agent(id, name, extra = {}) {
  return { id, name, tools: { allow: [] }, ...extra }
}

async function post(body) {
  const { POST } = await import('@/app/api/orchestrations/route')
  const response = await POST(request(body))
  return { response, body: await response.json() }
}

async function getLibrary() {
  const { GET } = await import('@/app/api/orchestrations/route')
  const response = await GET(new Request('https://openocti.local/api/orchestrations'))
  return { response, body: await response.json() }
}

beforeEach(() => {
  state.summarySeq = 0
  state.data = {
    'orchestrations.json': {
      orchestrations: [{
        id: 'orc_legacy',
        name: 'Legacy graph',
        entryAgentId: 'main',
        nodes: ['main', 'coding'],
        edges: [{ from: 'main', to: 'coding', when: 'engineering is needed' }],
        runCount: 3,
      }],
      lastUpdated: null,
    },
    'agents.json': {
      agents: {
        main: { name: 'Maggie', role: 'Office command center', disabled: false },
        coding: { name: 'Craig', role: 'Engineering', disabled: false, tools: { allow: ['read_file'] } },
        legal: { name: 'Linda', role: 'Legal', disabled: false },
        'social-media': { name: 'Sasha', role: 'Media', disabled: false },
        disabled: { name: 'Disabled agent', role: 'Unavailable', disabled: true },
      },
    },
  }
  state.harnessAgents = [
    agent('main', 'Maggie', { tools: { allow: ['fcc_create_task'] } }),
    agent('coding', 'Craig', { tools: { allow: ['read_file'] } }),
    agent('legal', 'Linda', { tools: { allow: ['fcc_create_document'] } }),
    agent('social-media', 'Sasha', { tools: { allow: ['social_publish'] } }),
    agent('disabled', 'Disabled agent', { enabled: false }),
  ]
  openclawMocks.readOpenclawAgents.mockClear()
  openclawMocks.patchOpenclawAgents.mockClear()
  orcaMocks.createRun.mockClear()
  orcaMocks.executeRun.mockClear()
})

describe('orchestrations Phase 1 route', () => {
  it('loads the additive seed without changing the legacy flow shape', async () => {
    const { response, body } = await getLibrary()

    expect(response.status).toBe(200)
    expect(body.orchestrations.find(flow => flow.id === 'orc_legacy')).toEqual({
      id: 'orc_legacy',
      name: 'Legacy graph',
      entryAgentId: 'main',
      nodes: ['main', 'coding'],
      edges: [{ from: 'main', to: 'coding', when: 'engineering is needed' }],
      runCount: 3,
    })
    const seed = body.orchestrations.find(flow => flow.slug === 'carls-client-onboarding')
    expect(seed).toMatchObject({
      name: "Carl's client onboarding",
      enabled: true,
      runCount: 0,
      lastRunAt: null,
      tags: expect.arrayContaining(['onboarding', 'client']),
    })
    expect(seed.steps.find(step => step.id === 'draft-nda')).toMatchObject({
      type: 'action',
      kind: 'document',
      agentId: 'legal',
      footerNote: expect.stringMatching(/attorney.*review/i),
    })
    expect(seed.whatThisFlowDoes.text).toMatch(/asks/i)
  })

  it("keeps action:'run' as static validation and never calls an agent", async () => {
    const { response, body } = await post({ action: 'run', id: 'orc_legacy', input: 'Prepare a launch' })

    expect(response.status).toBe(200)
    expect(body.validation).toMatchObject({
      mode: 'static-validation',
      executed: false,
      status: 'valid',
      metrics: { agentsInFlow: 2, agentsReachable: 2, handoffsResolved: 1, unreachedAgents: 0 },
    })
    expect(body.validation.summary).toContain('No agents were invoked')
    expect(state.data['orchestration-runs.json']).toBeUndefined()
  })

  it('saves additive node fields and caches an Orca light summary for the flow version', async () => {
    const { response, body } = await post({
      action: 'create',
      name: 'Partner intake',
      enabled: true,
      tags: ['partner', 'intake'],
      inputs: [{ id: 'client', label: 'Client' }],
      steps: [
        { id: 'gate', type: 'gate', question: 'Continue?', options: [{ label: 'Yes', next: 'api', capture: { field: 'approval', prompt: 'Record approval detail' } }] },
        { id: 'api', type: 'action', kind: 'api_call', name: 'Partner API', method: 'POST', url: 'https://partner.test/intake', headers: { 'X-Request-Type': 'onboarding' }, bodyTemplate: '{client}', credRef: 'partner-api', captureAs: 'partnerResult' },
      ],
    })

    expect(response.status).toBe(200)
    expect(body.orchestration).toMatchObject({
      enabled: true,
      tags: ['partner', 'intake'],
      slug: 'partner-intake',
      version: 1,
      whatThisFlowDoes: { flowVersion: 1, source: 'orca' },
    })
    expect(body.orchestration.steps[0].options[0].capture).toEqual({ field: 'approval', prompt: 'Record approval detail' })
    expect(body.orchestration.steps[1]).toMatchObject({ method: 'POST', credRef: 'partner-api', captureAs: 'partnerResult' })
    expect(orcaMocks.createRun).toHaveBeenCalledWith(expect.objectContaining({ complexity: 'light', fromAgentId: 'orchestration-designer' }))
  })

  it('clones deeply with a fresh id and slug, disabled state, reset run metadata, and lineage', async () => {
    const library = await getLibrary()
    const seed = library.body.orchestrations.find(flow => flow.slug === 'carls-client-onboarding')
    const { body } = await post({ action: 'clone', id: seed.id })

    expect(body.orchestration).toMatchObject({
      name: "Carl's client onboarding (copy)",
      enabled: false,
      clonedFrom: seed.id,
      runCount: 0,
      lastRunAt: null,
    })
    expect(body.orchestration.id).not.toBe(seed.id)
    expect(body.orchestration.slug).not.toBe(seed.slug)

    const stored = state.data['orchestrations.json'].orchestrations
    const original = stored.find(flow => flow.id === seed.id)
    const clone = stored.find(flow => flow.id === body.orchestration.id)
    clone.steps[0].question = 'Changed only on clone'
    expect(original.steps[0].question).not.toBe('Changed only on clone')
  })

  it('previews and then applies reassignment with target harness warnings and server-side revalidation', async () => {
    // This test pins the Phase 1 no-SSH validation branch, which the route
    // selects with process.platform === 'win32'. CI runs on Linux, so force
    // the platform for the duration of this test — otherwise it can only
    // ever pass on a Windows dev machine (found via GitHub CI 2026-08-27).
    const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const seed = (await getLibrary()).body.orchestrations.find(flow => flow.slug === 'carls-client-onboarding')
      const clone = (await post({ action: 'clone', id: seed.id })).body.orchestration

      const preview = await post({ action: 'reassign_preview', id: clone.id, fromAgentId: 'legal', toAgentId: 'coding' })
      expect(preview.response.status).toBe(200)
      expect(preview.body).toMatchObject({ ok: true, preview: true, moved: 1 })
      expect(preview.body.validation.harness.checkedAgentId).toBe('coding')
      expect(preview.body.validation.harness.configSource).toBe('crm-roster-no-ssh')
      expect(preview.body.validation.warnings.join(' ')).toMatch(/fcc_create_document/)
      expect(state.data['orchestrations.json'].orchestrations.find(flow => flow.id === clone.id).steps.find(step => step.id === 'draft-nda').agentId).toBe('legal')

      const applied = await post({ action: 'reassign', id: clone.id, fromAgentId: 'legal', toAgentId: 'coding' })
      expect(applied.response.status).toBe(200)
      expect(applied.body.orchestration.steps.find(step => step.id === 'draft-nda').agentId).toBe('coding')
      expect(applied.body.validation.warnings.join(' ')).toMatch(/fcc_create_document/)
      expect(openclawMocks.readOpenclawAgents).not.toHaveBeenCalled()
      expect(openclawMocks.patchOpenclawAgents).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', realPlatform)
    }
  })

  it('refuses reassignment when the target harness config disables the agent', async () => {
    const seed = (await getLibrary()).body.orchestrations.find(flow => flow.slug === 'carls-client-onboarding')
    const result = await post({ action: 'reassign_preview', id: seed.id, fromAgentId: 'legal', toAgentId: 'disabled' })

    expect(result.response.status).toBe(400)
    expect(result.body.error).toMatch(/disabled/i)
    expect(openclawMocks.patchOpenclawAgents).not.toHaveBeenCalled()
  })

  it('imports one JSON flow with fresh identity, disabled state, and preserved additive schema', async () => {
    const imported = await post({ action: 'import', flow: {
      id: 'external-id',
      slug: 'external-slug',
      name: 'Imported procedure',
      enabled: true,
      tags: ['external'],
      steps: [{ id: 'mcp', type: 'action', kind: 'mcp_call', name: 'CRM lookup', agentId: 'main', mcpTool: 'fcc_search', instruction: 'Look up {client}', requiredTools: ['fcc_search'] }],
    } })

    expect(imported.response.status).toBe(200)
    expect(imported.body.orchestration.id).not.toBe('external-id')
    expect(imported.body.orchestration.slug).not.toBe('external-slug')
    expect(imported.body.orchestration).toMatchObject({ enabled: false, tags: ['external'], runCount: 0, lastRunAt: null })
    expect(imported.body.orchestration.steps[0]).toMatchObject({ mcpTool: 'fcc_search', requiredTools: ['fcc_search'] })
  })

  it('runs the cloned seed end-to-end through every displayed gate with an honest complete transcript', async () => {
    const seed = (await getLibrary()).body.orchestrations.find(flow => flow.slug === 'carls-client-onboarding')
    const clone = (await post({ action: 'clone', id: seed.id })).body.orchestration
    await post({ action: 'reassign', id: clone.id, fromAgentId: 'legal', toAgentId: 'coding' })

    const started = await post({ action: 'start', id: clone.id, input: 'Acme Hardware' })
    expect(started.response.status).toBe(200)
    expect(started.body.runId).toBe(started.body.run.id)
    expect(started.body.run).toMatchObject({ status: 'awaiting_answer', state: 'awaiting_answer(nda-gate)' })

    const nda = await post({ action: 'answer', runId: started.body.runId, gateId: 'nda-gate', choice: 'Yes' })
    expect(nda.body.run.state).toBe('awaiting_answer(domain-gate)')
    const domain = await post({ action: 'answer', runId: started.body.runId, gateId: 'domain-gate', choice: 'Has one', capturedValue: 'acmehardware.com' })
    expect(domain.body.run.state).toBe('awaiting_answer(hosting-gate)')
    const hosting = await post({ action: 'answer', runId: started.body.runId, gateId: 'hosting-gate', choice: 'Vercel' })
    expect(hosting.body.run.state).toBe('awaiting_answer(database-gate)')
    const database = await post({ action: 'answer', runId: started.body.runId, gateId: 'database-gate', choice: 'Firebase' })
    expect(database.body.run).toMatchObject({ status: 'completed', state: 'completed', executed: false })
    expect(database.body.run.context.domain).toBe('acmehardware.com')

    const status = await post({ action: 'status', runId: started.body.runId })
    expect(status.body.run.status).toBe('completed')
    expect(state.data['orchestration-runs.json'].runs[0].id).toBe(started.body.runId)
    expect(status.body.run.transcript.filter(event => event.type === 'gate_answered')).toHaveLength(4)
    const deferred = status.body.run.transcript.filter(event => event.type === 'action_deferred')
    expect(deferred).toHaveLength(4)
    expect(deferred.every(event => event.status === 'pending_phase_2')).toBe(true)
    expect(deferred.map(event => event.detail).join(' ')).toMatch(/would/i)
    expect(deferred.map(event => event.detail).join(' ')).not.toMatch(/\b(created|drafted|called|executed)\b/i)
    expect(status.body.run.transcript.at(-1).detail).toMatch(/0 actions executed/i)
  })

  it('renders agent, api_call, and mcp_call nodes as pending/would-call stubs without live execution', async () => {
    const created = await post({
      action: 'create',
      name: 'Stub contract',
      steps: [
        { id: 'agent', type: 'action', kind: 'agent', name: 'Craig planning', agentId: 'coding', instruction: 'Plan {client}' },
        { id: 'api', type: 'action', kind: 'api_call', name: 'Billing API', method: 'POST', url: 'https://billing.test/run' },
        { id: 'mcp', type: 'action', kind: 'mcp_call', name: 'CRM Search', agentId: 'main', mcpTool: 'fcc_search' },
      ],
    })
    const started = await post({ action: 'start', id: created.body.orchestration.id, input: 'Acme' })
    const events = started.body.run.transcript.filter(event => event.type === 'action_deferred')

    expect(started.body.run.status).toBe('completed')
    expect(events).toHaveLength(3)
    expect(events[0].detail).toMatch(/pending real agent execution \(Phase 2\)/i)
    expect(events[1].detail).toBe('would call Billing API')
    expect(events[2].detail).toBe('would call CRM Search')
    expect(state.data['tasks.json']).toBeUndefined()
  })

  it('cancels a parked interview through action:cancel', async () => {
    const seed = (await getLibrary()).body.orchestrations.find(flow => flow.slug === 'carls-client-onboarding')
    const started = await post({ action: 'start', id: seed.id, input: 'Cancel Co' })
    const cancelled = await post({ action: 'cancel', runId: started.body.runId })

    expect(cancelled.response.status).toBe(200)
    expect(cancelled.body.run).toMatchObject({ status: 'cancelled', state: 'cancelled' })
  })
})
