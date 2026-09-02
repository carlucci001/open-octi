import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ data: {} }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => store.data[filename]),
  writeData: vi.fn((filename, value) => {
    store.data[filename] = JSON.parse(JSON.stringify(value))
  }),
}))

import {
  approveSocialOperatorCampaign,
  clearCampaigns,
  createSocialOperatorCampaign,
  deleteCampaign,
  getCampaign,
  listSocialOperatorBudgets,
  prepareSocialOperatorHandoff,
  recordSocialOperatorDelivery,
  updateCampaignPost,
} from '../lib/campaign-studio'

const client = { id: 'cl_acme', name: 'Acme Outdoor', industry: 'Outdoor retail' }
const agent = { id: 'sasha', name: 'Sasha', title: 'Media operator' }

describe('Campaign Studio Social Operator persistence', () => {
  beforeEach(() => {
    store.data = {
      'campaign-studio.json': { campaigns: [], socialOperatorBudgets: {} },
    }
  })

  it('saves the job and client budget in the existing Campaign Studio store', () => {
    const campaign = createSocialOperatorCampaign({
      topic: 'Announce the Saturday trail clinic',
      platforms: ['Instagram', 'LinkedIn'],
      approvalRule: 'approval_required',
      budgetLimit: 7,
      tenantId: 'acme',
      channels: [{ id: 'postiz_instagram', name: 'Acme Instagram', identifier: 'instagram', tenantId: 'acme' }],
    }, { client, agent })

    expect(getCampaign(campaign.id)?.kind).toBe('social_operator')
    expect(store.data['campaign-studio.json'].campaigns).toHaveLength(1)
    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({
      limit: 7,
      used: 2,
      reserved: 0,
      remaining: 5,
    })
  })

  it('preserves incurred generation credits when an approval-required job is deleted', () => {
    const campaign = createSocialOperatorCampaign({
      topic: 'Announce the Saturday trail clinic',
      platforms: ['Instagram', 'LinkedIn'],
      approvalRule: 'approval_required',
      budgetLimit: 7,
    }, { client, agent })

    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({ used: 2, reserved: 0, remaining: 5 })

    expect(deleteCampaign(campaign.id)).toBe(true)
    expect(getCampaign(campaign.id)).toBeNull()
    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({ limit: 7, used: 2, reserved: 0, remaining: 5 })
  })

  it('blocks Postiz handoff until approval, then derives persisted copy and records delivery', () => {
    const campaign = createSocialOperatorCampaign({
      topic: 'Announce the Saturday trail clinic',
      sourceText: 'The clinic starts at 9 AM.',
      platforms: ['Instagram'],
      approvalRule: 'approval_required',
      budgetLimit: 4,
      tenantId: 'acme',
      channels: [{ id: 'postiz_instagram', name: 'Acme Instagram', identifier: 'instagram', tenantId: 'acme' }],
    }, { client, agent })
    const postId = campaign.posts[0].id

    expect(() => prepareSocialOperatorHandoff(campaign.id, postId, ['postiz_instagram']))
      .toThrowError(expect.objectContaining({ code: 'approval_required', status: 409 }))

    const approved = approveSocialOperatorCampaign(campaign.id)
    const handoff = prepareSocialOperatorHandoff(approved.id, postId, ['postiz_instagram'])

    expect(handoff).toMatchObject({ tenantId: 'acme', channels: ['postiz_instagram'] })
    expect(handoff.content).toContain('Acme Outdoor')
    expect(handoff.content).toContain('Saturday trail clinic')
    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({ used: 1, reserved: 0 })

    const delivered = recordSocialOperatorDelivery(approved.id, postId, {
      postId: 'postiz_post_1',
      group: 'group_1',
      integrationIds: ['postiz_instagram'],
      scheduleUrl: 'https://postiz.example/launches',
      scheduledFor: '2026-07-16T14:00:00.000Z',
    })
    expect(delivered.posts[0]).toMatchObject({
      status: 'scheduled',
      scheduledFor: '2026-07-16T14:00:00.000Z',
      postiz: { postId: 'postiz_post_1', integrationIds: ['postiz_instagram'] },
    })
  })

  it('rejects a channel that was not selected for the job', () => {
    const campaign = createSocialOperatorCampaign({
      topic: 'Share summer hours',
      platforms: ['BlueSky'],
      approvalRule: 'guarded_auto',
      budgetLimit: 4,
      channels: [{ id: 'postiz_bluesky', name: 'Acme BlueSky', tenantId: 'acme' }],
      tenantId: 'acme',
    }, { client, agent })

    expect(() => prepareSocialOperatorHandoff(campaign.id, campaign.posts[0].id, ['another_channel']))
      .toThrowError(expect.objectContaining({ code: 'channel_not_assigned', status: 403 }))
  })

  it('invalidates approval after copy or media changes and reapproves without double charging', () => {
    const campaign = createSocialOperatorCampaign({
      topic: 'Share summer hours',
      platforms: ['BlueSky'],
      approvalRule: 'approval_required',
      budgetLimit: 4,
      channels: [{ id: 'postiz_bluesky', name: 'Acme BlueSky', tenantId: 'acme' }],
      tenantId: 'acme',
    }, { client, agent })
    const approved = approveSocialOperatorCampaign(campaign.id)
    const postId = approved.posts[0].id

    const edited = updateCampaignPost(approved.id, postId, { body: 'Updated approved copy.' })
    expect(edited.socialOperator).toMatchObject({ jobStatus: 'awaiting_reapproval' })
    expect(edited.posts[0]).toMatchObject({ status: 'draft', approvedRevision: null })
    expect(() => prepareSocialOperatorHandoff(approved.id, postId, ['postiz_bluesky']))
      .toThrowError(expect.objectContaining({ code: 'approval_required', status: 409 }))

    const reapproved = approveSocialOperatorCampaign(approved.id)
    expect(reapproved.socialOperator.jobStatus).toBe('approved')
    expect(reapproved.posts[0].approvedRevision).toMatch(/^[a-f0-9]{64}$/)
    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({ used: 1, reserved: 0 })
    expect(prepareSocialOperatorHandoff(approved.id, postId, ['postiz_bluesky']).content)
      .toContain('Updated approved copy.')
  })

  it('rejects a persisted variant whose approved content was changed outside the mutation boundary', () => {
    const campaign = createSocialOperatorCampaign({
      topic: 'Share summer hours',
      platforms: ['BlueSky'],
      approvalRule: 'guarded_auto',
      budgetLimit: 4,
      channels: [{ id: 'postiz_bluesky', name: 'Acme BlueSky', tenantId: 'acme' }],
      tenantId: 'acme',
    }, { client, agent })

    store.data['campaign-studio.json'].campaigns[0].posts[0].body = 'Unapproved storage edit.'

    expect(() => prepareSocialOperatorHandoff(campaign.id, campaign.posts[0].id, ['postiz_bluesky']))
      .toThrowError(expect.objectContaining({ code: 'approval_stale', status: 409 }))
  })

  it('preserves incurred generation credits when campaigns are cleared', () => {
    createSocialOperatorCampaign({
      topic: 'Share summer hours',
      platforms: ['BlueSky'],
      approvalRule: 'guarded_auto',
      budgetLimit: 4,
    }, { client, agent })
    createSocialOperatorCampaign({
      topic: 'Announce the next trail clinic',
      platforms: ['Instagram', 'LinkedIn'],
      approvalRule: 'approval_required',
      budgetLimit: 4,
    }, { client, agent })

    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({ used: 3, reserved: 0, remaining: 1 })

    clearCampaigns()

    expect(store.data['campaign-studio.json'].campaigns).toEqual([])
    expect(listSocialOperatorBudgets().cl_acme).toMatchObject({ limit: 4, used: 3, reserved: 0, remaining: 1 })
  })
})
