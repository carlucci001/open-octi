import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  data: {},
  clients: [{ id: 'cl_acme', name: 'Acme Outdoor', type: 'client', industry: 'Outdoor retail' }],
  agents: [{ id: 'sasha', name: 'Sasha', title: 'Media operator', enabled: true, draft: false, brain: { modelId: 'openai/gpt-5', fallbacks: [] } }],
  modelCalls: [],
  mediaCalls: [],
  researchCalls: [],
  modelFailure: false,
}))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

vi.mock('@/lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => ({ user: { id: 'usr_owner' }, error: null })),
  requireCrmWrite: vi.fn(async () => ({ user: { id: 'usr_owner' }, error: null })),
}))

vi.mock('@/lib/clients', () => ({
  findClient: vi.fn(id => state.clients.find(client => client.id === id) || null),
}))

vi.mock('@/lib/agents-store', () => ({
  listAgents: vi.fn(async () => ({ ok: true, agents: state.agents })),
}))

vi.mock('@/lib/media-gen', () => ({
  describeImageGen: vi.fn(() => ({ label: 'Test image model', vendor: 'test', costPerImage: 0.04 })),
  generateMedia: vi.fn(async input => {
    state.mediaCalls.push(input)
    return { id: 'media_generated_1', title: input.title, url: '/api/media/file/generated.png', mediaType: 'image', provider: input.provider }
  }),
}))

vi.mock('@/lib/ai-lab', () => ({
  runAiModel: vi.fn(async input => {
    state.modelCalls.push(input)
    if (state.modelFailure) throw new Error('provider unavailable')
    const supported = ['BlueSky', 'LinkedIn', 'Facebook', 'Instagram', 'X', 'TikTok']
    const platforms = supported.filter(platform => input.prompt.includes(`- ${platform}:`))
    return {
      text: JSON.stringify({
        variants: platforms.map(platform => ({
          platform,
          hook: `${platform} client update`,
          body: `Acme Outdoor generated copy for ${platform}.`,
          cta: 'Learn more.',
          assetBrief: `Create a grounded ${platform} visual.`,
          altText: `Acme Outdoor ${platform} campaign visual`,
        })),
      }),
      provider: 'openai',
      model: 'gpt-5',
      modelId: 'openai/gpt-5',
      usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
      cost: { estimatedUsd: 0.00365 },
    }
  }),
}))

vi.mock('@/lib/social-trend-research', () => {
  class SocialTrendResearchError extends Error {
    constructor(message, { code = 'trend_research_failed', status = 502, details = null } = {}) {
      super(message)
      this.code = code
      this.status = status
      this.details = details
    }
  }
  return {
    SocialTrendResearchError,
    researchSocialTrends: vi.fn(async input => {
      state.researchCalls.push(input)
      return {
        content: 'Local trail clinics are drawing interest this week according to cited public sources.',
        citations: ['https://example.com/current-trail-report'],
        usage: { prompt_tokens: 300, completion_tokens: 120, total_tokens: 420 },
        provenance: { provider: 'perplexity', requestedModel: 'sonar-pro', model: 'sonar-pro', citationCount: 1 },
      }
    }),
  }
})

import { GET, POST } from '../app/api/campaign-studio/route'

function request(body) {
  return new Request('https://openocti.local/api/campaign-studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Campaign Studio Social Operator API', () => {
  beforeEach(() => {
    state.data = { 'campaign-studio.json': { campaigns: [], socialOperatorBudgets: {} } }
    state.clients = [{ id: 'cl_acme', name: 'Acme Outdoor', type: 'client', industry: 'Outdoor retail' }]
    state.agents = [{ id: 'sasha', name: 'Sasha', title: 'Media operator', enabled: true, draft: false, brain: { modelId: 'openai/gpt-5', fallbacks: [] } }]
    state.modelCalls = []
    state.mediaCalls = []
    state.researchCalls = []
    state.modelFailure = false
  })

  it('advertises the operator platform, approval, and client budget contract', async () => {
    const response = await GET(new Request('https://openocti.local/api/campaign-studio'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.socialOperator.platforms.map(platform => platform.id)).toContain('Instagram')
    expect(body.socialOperator.approvalRules.map(rule => rule.id)).toEqual(['approval_required', 'guarded_auto'])
    expect(body.socialOperator.budgets).toEqual({})
  })

  it('resolves canonical client and agent records before saving a job', async () => {
    const response = await POST(request({
      action: 'create_social_operator_job',
      job: {
        clientId: 'cl_acme',
        clientName: 'Forged client name',
        agentId: 'sasha',
        agentName: 'Forged agent name',
        topic: 'Launch the Saturday trail clinic',
        platforms: ['Instagram', 'LinkedIn'],
        approvalRule: 'approval_required',
        budgetLimit: 8,
        tenantId: 'acme',
        channels: [{ id: 'postiz_instagram', name: 'Acme Instagram', tenantId: 'acme' }],
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.campaign).toMatchObject({
      kind: 'social_operator',
      socialOperator: {
        client: { id: 'cl_acme', name: 'Acme Outdoor' },
        agent: { id: 'sasha', name: 'Sasha' },
        jobStatus: 'awaiting_approval',
        generation: { provider: 'openai', model: 'gpt-5' },
      },
    })
    expect(body.campaign.posts.every(post => post.operatorVariant.source === 'model')).toBe(true)
    expect(body.budget).toMatchObject({ limit: 8, used: 2, reserved: 0 })
    expect(state.modelCalls).toHaveLength(1)
  })

  it('stops a job at the persisted client limit with a structured 409 response', async () => {
    const base = {
      clientId: 'cl_acme',
      agentId: 'sasha',
      topic: 'Share an update',
      approvalRule: 'guarded_auto',
      budgetLimit: 2,
    }
    await POST(request({ action: 'create_social_operator_job', job: { ...base, platforms: ['BlueSky'] } }))
    const response = await POST(request({ action: 'create_social_operator_job', job: { ...base, platforms: ['Facebook', 'Instagram'] } }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ ok: false, code: 'budget_limit_exceeded' })
    expect(body.details).toMatchObject({ estimated: 2, available: 1, limit: 2, used: 1 })
    expect(state.data['campaign-studio.json'].campaigns).toHaveLength(1)
    expect(state.modelCalls).toHaveLength(1)
  })

  it('requires a live agent for guarded automatic work', async () => {
    state.agents[0] = { ...state.agents[0], offlineRuntime: true }
    const response = await POST(request({
      action: 'create_social_operator_job',
      job: {
        clientId: 'cl_acme',
        agentId: 'sasha',
        topic: 'Share an update',
        platforms: ['BlueSky'],
        approvalRule: 'guarded_auto',
        budgetLimit: 4,
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('agent_not_ready')
    expect(state.data['campaign-studio.json'].campaigns).toHaveLength(0)
  })

  it('generates one shared campaign image through the assigned agent provider and meters it', async () => {
    state.agents[0] = { ...state.agents[0], imageGeneration: { provider: 'openai', model: 'gpt-image-1' } }
    const response = await POST(request({
      action: 'create_social_operator_job',
      job: {
        clientId: 'cl_acme',
        agentId: 'sasha',
        topic: 'Share an image update',
        platforms: ['Instagram'],
        approvalRule: 'approval_required',
        mediaMode: 'generate_one',
        budgetLimit: 40,
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(state.mediaCalls).toHaveLength(1)
    expect(state.mediaCalls[0]).toMatchObject({ provider: 'openai', folder: 'client-cl_acme' })
    expect(body.campaign.posts[0]).toMatchObject({
      assetMediaId: 'media_generated_1',
      assetProvider: 'openai',
      assetStatus: 'attached',
    })
    expect(body.campaign.socialOperator).toMatchObject({
      mediaMode: 'generate_one',
      creditBreakdown: { textVariants: 1, research: 0, media: 25 },
    })
    expect(body.budget).toMatchObject({ used: 26, reserved: 0, remaining: 14 })
  })

  it('adds current cited trend research to the Wizard context and persists provenance', async () => {
    const response = await POST(request({
      action: 'create_social_operator_job',
      job: {
        clientId: 'cl_acme',
        agentId: 'sasha',
        topic: 'Find a timely trail clinic angle',
        platforms: ['LinkedIn'],
        approvalRule: 'approval_required',
        researchMode: 'trend_research',
        budgetLimit: 20,
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(state.researchCalls).toHaveLength(1)
    expect(state.modelCalls[0].context).toContain('CURRENT PUBLIC-SOURCE RESEARCH')
    expect(state.modelCalls[0].context).toContain('https://example.com/current-trail-report')
    expect(body.campaign.socialOperator).toMatchObject({
      researchMode: 'trend_research',
      creditBreakdown: { textVariants: 1, research: 10, media: 0 },
      research: {
        citations: ['https://example.com/current-trail-report'],
        provenance: { provider: 'perplexity', model: 'sonar-pro' },
      },
    })
    expect(body.budget).toMatchObject({ used: 11, reserved: 0, remaining: 9 })
  })

  it('releases customer credits and saves no campaign when all configured models fail', async () => {
    state.modelFailure = true
    const response = await POST(request({
      action: 'create_social_operator_job',
      job: {
        clientId: 'cl_acme',
        agentId: 'sasha',
        topic: 'Share an update',
        platforms: ['BlueSky'],
        approvalRule: 'approval_required',
        budgetLimit: 4,
      },
    }))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.code).toBe('social_generation_failed')
    expect(state.data['campaign-studio.json'].campaigns).toHaveLength(0)
    expect(state.data['usage-ledger.json'].events.map(event => event.type)).toEqual(['configure', 'reserve', 'release'])
  })

  it('does not allow generic post updates to bypass operator approval', async () => {
    const createdResponse = await POST(request({
      action: 'create_social_operator_job',
      job: {
        clientId: 'cl_acme',
        agentId: 'sasha',
        topic: 'Share an update',
        platforms: ['BlueSky'],
        approvalRule: 'approval_required',
        budgetLimit: 4,
      },
    }))
    const created = (await createdResponse.json()).campaign
    const response = await POST(request({
      action: 'update_post',
      campaignId: created.id,
      postId: created.posts[0].id,
      patch: { status: 'approved', body: 'Approved-looking copy' },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.campaign.posts[0]).toMatchObject({ status: 'draft', body: 'Approved-looking copy' })
    expect(body.campaign.socialOperator.jobStatus).toBe('awaiting_approval')
  })
})
