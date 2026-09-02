import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null,
  data: {},
  campaign: null,
}))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
}))

vi.mock('../lib/campaign-studio', () => ({
  getCampaign: vi.fn(id => state.campaign?.id === id ? state.campaign : null),
  updateCampaign: vi.fn((id, patch) => {
    if (state.campaign?.id !== id) return null
    state.campaign = { ...state.campaign, ...patch }
    return state.campaign
  }),
  updateCampaignPost: vi.fn((campaignId, postId, patch) => {
    if (state.campaign?.id !== campaignId) return null
    state.campaign = {
      ...state.campaign,
      posts: state.campaign.posts.map(post => post.id === postId ? { ...post, ...patch } : post),
    }
    return state.campaign.posts.find(post => post.id === postId)
  }),
}))

import { GET, POST } from '../app/api/portal/campaign-assistant/delivery/route'

function getRequest() {
  return new Request('https://openocti.local/api/portal/campaign-assistant/delivery')
}

function request(body) {
  return new Request('https://openocti.local/api/portal/campaign-assistant/delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function campaign() {
  return {
    id: 'camp_portal',
    tenantId: 'tenant_one',
    clientAccountId: 'acct_one',
    status: 'draft',
    portalAssistant: {
      source: 'client-portal',
      clientAccountId: 'acct_one',
      tenantId: 'tenant_one',
    },
    posts: Array.from({ length: 7 }, (_, index) => ({
      id: `post_${index + 1}`,
      sequence: index + 1,
      platform: 'Facebook',
      status: 'draft',
      scheduledFor: new Date(Date.now() + (index + 1) * 86_400_000).toISOString(),
      hook: `Hook ${index + 1}`,
      body: `Body ${index + 1}`,
      cta: 'Book a demo',
    })),
  }
}

describe('portal campaign delivery route', () => {
  beforeEach(() => {
    state.session = { accountId: 'acct_one', leaseId: 'lease_one', tenantId: 'tenant_one' }
    state.campaign = campaign()
    state.data = {
      'leases.json': {
        leases: [{ id: 'lease_one', clientAccountId: 'acct_one', tenantId: 'tenant_one', status: 'active' }],
      },
      'postiz-channel-tenants.json': {
        map: {
          facebook_one: 'tenant_one',
          instagram_one: 'tenant_one',
          tenant_only: 'tenant_one',
          other_tenant: 'tenant_other',
        },
        accountMap: {
          facebook_one: 'acct_one',
          instagram_one: 'acct_one',
          tenant_only: 'acct_other',
          other_tenant: 'acct_one',
        },
      },
    }
    process.env.POSTIZ_API_URL = 'https://postiz.example.test/api/public/v1'
    process.env.POSTIZ_API_KEY = 'postiz-test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.POSTIZ_API_URL
    delete process.env.POSTIZ_API_KEY
  })

  it('lists only channels mapped to both the signed-in account and tenant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'facebook_one', provider: 'facebook', name: 'Acme Facebook' },
      { id: 'instagram_one', provider: 'instagram', name: 'Acme Instagram' },
      { id: 'tenant_only', provider: 'linkedin', name: 'Wrong account' },
      { id: 'other_tenant', provider: 'youtube', name: 'Wrong tenant' },
      { id: 'unmapped', provider: 'threads', name: 'Unmapped' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const response = await GET(getRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.channels).toEqual([
      { id: 'facebook_one', provider: 'facebook', name: 'Acme Facebook' },
      { id: 'instagram_one', provider: 'instagram', name: 'Acme Instagram' },
    ])
    expect(JSON.stringify(body)).not.toContain('postiz-test-key')
  })

  it('approves all seven drafts without contacting a publishing provider', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({ action: 'approve_campaign', campaignId: 'camp_portal' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('approved')
    expect(body.campaign.posts).toHaveLength(7)
    expect(body.campaign.posts.every(post => post.status === 'approved')).toBe(true)
    expect(state.campaign.posts.every(post => post.portalApproval?.contentHash)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires approval before any external delivery', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({ action: 'publish_test', campaignId: 'camp_portal' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/Approve the campaign/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('schedules one approved post to the selected mapped channels only after verifiable receipts', async () => {
    await POST(request({ action: 'approve_campaign', campaignId: 'camp_portal' }))
    const fetchMock = vi.fn(async url => {
      if (String(url).endsWith('/integrations')) {
        return new Response(JSON.stringify([
          { id: 'facebook_one', provider: 'facebook', name: 'Acme Facebook' },
          { id: 'instagram_one', provider: 'instagram', name: 'Acme Instagram' },
          { id: 'unmapped', provider: 'linkedin', name: 'Unmapped' },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([
        { postId: 'postiz_receipt_1', integration: { id: 'facebook_one' } },
        { postId: 'postiz_receipt_2', integration: { id: 'instagram_one' } },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({
      action: 'publish_test',
      campaignId: 'camp_portal',
      channelIds: ['facebook_one', 'instagram_one'],
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('test_scheduled')
    expect(body.scheduledCount).toBe(1)
    expect(state.campaign.posts[0]).toMatchObject({
      status: 'scheduled',
      portalDelivery: {
        provider: 'postiz',
        postizPostId: 'postiz_receipt_1',
        integrationId: 'facebook_one',
        channelIds: ['facebook_one', 'instagram_one'],
      },
    })
    expect(state.campaign.posts[0].portalDelivery.receipts).toHaveLength(2)
    expect(state.campaign.posts.slice(1).every(post => post.status === 'approved')).toBe(true)
    const publishCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/posts'))
    expect(JSON.parse(publishCall[1].body).posts.map(post => post.integration.id)).toEqual([
      'facebook_one',
      'instagram_one',
    ])
    expect(JSON.stringify(body)).not.toContain('postiz-test-key')
  })

  it('rejects a selected channel that is not assigned to the portal account', async () => {
    await POST(request({ action: 'approve_campaign', campaignId: 'camp_portal' }))
    const fetchMock = vi.fn(async url => new Response(JSON.stringify(
      String(url).endsWith('/integrations')
        ? [{ id: 'facebook_one', provider: 'facebook' }, { id: 'tenant_only', provider: 'linkedin' }]
        : []
    ), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({
      action: 'publish_test',
      campaignId: 'camp_portal',
      channelIds: ['tenant_only'],
    }))

    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/not assigned/i)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/posts'))).toBe(false)
  })

  it('does not mark a post scheduled when the scheduler receipt cannot be verified', async () => {
    await POST(request({ action: 'approve_campaign', campaignId: 'camp_portal' }))
    vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(
      String(url).endsWith('/integrations')
        ? [{ id: 'facebook_one', provider: 'facebook' }]
        : [{ integration: { id: 'facebook_one' } }]
    ), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const response = await POST(request({ action: 'publish_test', campaignId: 'camp_portal', channelIds: ['facebook_one'] }))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.status).toBe('delivery_failed')
    expect(state.campaign.posts[0].status).toBe('approved')
    expect(state.campaign.posts[0].portalDelivery).toBeUndefined()
  })

  it('requires an explicit confirmation before scheduling the full campaign', async () => {
    await POST(request({ action: 'approve_campaign', campaignId: 'camp_portal' }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({ action: 'schedule_campaign', campaignId: 'camp_portal' }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/Confirm the seven-post/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cannot access another portal account campaign', async () => {
    state.session = { accountId: 'acct_other', leaseId: 'lease_other', tenantId: 'tenant_other' }
    state.data['leases.json'].leases = [{ id: 'lease_other', clientAccountId: 'acct_other', tenantId: 'tenant_other', status: 'active' }]

    const response = await POST(request({ action: 'approve_campaign', campaignId: 'camp_portal' }))
    expect(response.status).toBe(404)
  })
})
