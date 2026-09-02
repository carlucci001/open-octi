import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {} }))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  writeData: vi.fn((filename, value) => {
    state.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

vi.mock('@/lib/permissions', () => ({
  requireCapability: vi.fn(async () => ({ user: { id: 'usr_owner' }, error: null })),
}))

import {
  approveSocialOperatorCampaign,
  createSocialOperatorCampaign,
  getCampaign,
} from '../lib/campaign-studio'
import { POST } from '../app/api/postiz/publish/route'

const client = { id: 'cl_acme', name: 'Acme Outdoor', industry: 'Outdoor retail' }
const agent = { id: 'sasha', name: 'Sasha', title: 'Media operator' }

function publishRequest(campaign, post, overrides = {}) {
  return new Request('https://openocti.local/api/postiz/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: campaign.id,
      postId: post.id,
      content: 'FORGED COPY',
      tenantId: 'forged-tenant',
      channels: ['postiz_instagram'],
      publishAt: '2026-07-16T14:00:00.000Z',
      ...overrides,
    }),
  })
}

describe('Social Operator Postiz reference handoff', () => {
  beforeEach(() => {
    state.data = {
      'campaign-studio.json': { campaigns: [], socialOperatorBudgets: {} },
      'postiz-channel-tenants.json': {
        map: { postiz_instagram: 'acme' },
        defaultTenantId: 'farrington-development',
      },
    }
    vi.stubEnv('POSTIZ_API_URL', 'https://postiz.example/api/public/v1')
    vi.stubEnv('POSTIZ_API_KEY', 'postiz_test_key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function createJob(approvalRule = 'approval_required', overrides = {}) {
    return createSocialOperatorCampaign({
      topic: 'Announce the Saturday trail clinic',
      sourceText: 'The clinic starts at 9 AM.',
      platforms: ['Instagram'],
      approvalRule,
      budgetLimit: 5,
      tenantId: 'acme',
      channels: [{ id: 'postiz_instagram', name: 'Acme Instagram', identifier: 'instagram', tenantId: 'acme' }],
      ...overrides,
    }, { client, agent })
  }

  it('blocks an unapproved job before any Postiz request is made', async () => {
    const campaign = createJob()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(publishRequest(campaign, campaign.posts[0]))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ ok: false, code: 'approval_required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores forged copy and tenant, sends one persisted variant, and records the delivery', async () => {
    const created = createJob()
    const campaign = approveSocialOperatorCampaign(created.id)
    const post = campaign.posts[0]
    const fetchMock = vi.fn(async (_url, init) => new Response(JSON.stringify([
      { postId: 'postiz_post_1', group: 'group_1', integration: { id: 'postiz_instagram' } },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(publishRequest(campaign, post))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      postId: 'postiz_post_1',
      count: 1,
      integrationIds: ['postiz_instagram'],
      operatorDeliveryRecorded: true,
      recordWarning: null,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://postiz.example/api/public/v1/posts')
    const dto = JSON.parse(init.body)
    expect(dto.posts).toHaveLength(1)
    expect(dto.posts[0].value[0].content).toContain('Acme Outdoor')
    expect(dto.posts[0].value[0].content).toContain('Saturday trail clinic')
    expect(dto.posts[0].value[0].content).not.toContain('FORGED COPY')
    expect(getCampaign(campaign.id).posts[0]).toMatchObject({
      status: 'scheduled',
      postiz: { postId: 'postiz_post_1', integrationIds: ['postiz_instagram'] },
    })
  })

  it('requires one channel per platform variant', async () => {
    const campaign = createJob('guarded_auto')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(publishRequest(campaign, campaign.posts[0], {
      channels: ['postiz_instagram', 'postiz_other'],
    }))

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks a second handoff after Postiz already accepted the variant', async () => {
    const campaign = createJob('guarded_auto')
    const post = campaign.posts[0]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { postId: 'postiz_post_1', group: 'group_1', integration: { id: 'postiz_instagram' } },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    expect((await POST(publishRequest(campaign, post))).status).toBe(200)
    const duplicate = await POST(publishRequest(campaign, post))
    const body = await duplicate.json()

    expect(duplicate.status).toBe(409)
    expect(body).toMatchObject({ ok: false, code: 'variant_already_handed_off' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a saved Postiz account that belongs to another platform', async () => {
    const campaign = createJob('guarded_auto', {
      channels: [{ id: 'postiz_instagram', name: 'Acme LinkedIn', identifier: 'linkedin', tenantId: 'acme' }],
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(publishRequest(campaign, campaign.posts[0]))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ ok: false, code: 'channel_platform_mismatch' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows a current Postiz account shape when no platform metadata is available', async () => {
    const campaign = createJob('guarded_auto', {
      channels: [{ id: 'postiz_instagram', name: 'Acme Main Account', tenantId: 'acme' }],
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { postId: 'postiz_post_unknown_shape', integration: { id: 'postiz_instagram' } },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(publishRequest(campaign, campaign.posts[0]))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects saved account metadata assigned to another client', async () => {
    const campaign = createJob('guarded_auto', {
      channels: [{ id: 'postiz_instagram', name: 'Other Client Instagram', identifier: 'instagram', tenantId: 'acme', clientId: 'cl_other' }],
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(publishRequest(campaign, campaign.posts[0]))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toMatchObject({ ok: false, code: 'channel_client_mismatch' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
