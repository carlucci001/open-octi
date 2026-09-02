import { describe, expect, it } from 'vitest'
import {
  buildPortalCampaignInput,
  inferCampaignAudience,
  inferCampaignMarket,
  inferCampaignOffer,
  isPortalCampaignForSession,
  normalizeCampaignRequest,
  toPortalCampaign,
} from '../lib/portal-campaign-assistant'

describe('portal campaign assistant', () => {
  const session = { accountId: 'acct_hvac', tenantId: 'tenant_hvac' }

  it('turns one client message into a seven-day social campaign input', () => {
    const input = buildPortalCampaignInput({
      message: 'Promote our spring HVAC tune-up to homeowners around Asheville and get more estimate requests.',
      companyName: 'Blue Ridge Heating',
      session,
    })

    expect(input).toMatchObject({
      name: 'Blue Ridge Heating — seven-day social campaign',
      tenantId: 'tenant_hvac',
      cadenceId: 'daily-7',
      creationEndpoint: 'manual',
      destination: 'Postiz scheduler',
      platforms: ['Facebook'],
      audience: 'homeowners',
      market: 'Asheville',
    })
  })

  it('normalizes requests and infers the existing campaign offer family', () => {
    expect(normalizeCampaignRequest('  Build\n a website campaign  ')).toBe('Build a website campaign')
    expect(inferCampaignOffer('Promote our web design service')).toBe('web-ai-services')
    expect(inferCampaignOffer('Sell newspaper sponsorship packages')).toBe('newspaper-growth')
    expect(inferCampaignOffer('Automate lead follow-up')).toBe('command-center')
    expect(inferCampaignAudience('Reach restaurant owners in Hendersonville')).toBe('restaurant owners')
    expect(inferCampaignAudience('Create a campaign to promote our service to restaurant owners in Hendersonville')).toBe('restaurant owners')
    expect(inferCampaignMarket('Reach restaurant owners in Hendersonville.')).toBe('Hendersonville')
    expect(inferCampaignAudience("Promote our AI Command Center to small business owners in Western North Carolina and remote U.S. markets. Invite owners to book a demo.")).toBe('small business owners')
    expect(inferCampaignMarket("Promote our AI Command Center to small business owners in Western North Carolina and remote U.S. markets. Invite owners to book a demo.")).toBe('Western North Carolina and remote US markets')
  })

  it('only exposes campaigns created for the signed-in portal account and tenant', () => {
    const campaign = {
      tenantId: 'tenant_hvac',
      portalAssistant: { source: 'client-portal', clientAccountId: 'acct_hvac' },
    }

    expect(isPortalCampaignForSession(campaign, session)).toBe(true)
    expect(isPortalCampaignForSession(campaign, { ...session, accountId: 'acct_other' })).toBe(false)
    expect(isPortalCampaignForSession({ ...campaign, tenantId: 'tenant_other' }, session)).toBe(false)
  })

  it('returns a portal-safe campaign preview without internal handoff metadata', () => {
    const preview = toPortalCampaign({
      id: 'camp_1',
      name: 'Test campaign',
      status: 'draft',
      objective: 'Get more calls',
      posts: [{
        id: 'post_1',
        sequence: 1,
        platform: 'Facebook',
        hook: 'A stronger first step',
        body: 'Useful copy',
        cta: 'Call today',
        assetStatus: 'needed',
        mediaId: 'internal-media-id',
      }],
      portalAssistant: { createdByEmail: 'private@example.com' },
    })

    expect(preview).toMatchObject({ platforms: [] })
    expect(preview.posts[0]).toMatchObject({ platform: 'Social', hook: 'A stronger first step' })
    expect(preview.posts[0]).not.toHaveProperty('mediaId')
    expect(preview).not.toHaveProperty('portalAssistant')
  })

  it('exposes the live post URL only when Postiz recorded a delivery', () => {
    const scheduled = toPortalCampaign({
      id: 'camp_2',
      posts: [{ id: 'post_1', sequence: 1, status: 'scheduled', postiz: { postId: 'pz_1', scheduleUrl: 'https://postiz.example/p/pz_1' } }],
    })
    expect(scheduled.posts[0].liveUrl).toBe('https://postiz.example/p/pz_1')

    const draft = toPortalCampaign({
      id: 'camp_3',
      posts: [{ id: 'post_1', sequence: 1, status: 'draft' }],
    })
    expect(draft.posts[0].liveUrl).toBeNull()
  })
})
