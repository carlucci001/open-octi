import { describe, expect, it } from 'vitest'
import {
  SocialOperatorError,
  approveSocialOperatorJob,
  buildSocialOperatorJob,
} from '../lib/social-operator'

const client = {
  id: 'cl_acme',
  name: 'Acme Outdoor',
  industry: 'Outdoor retail',
  website: 'https://acme.example',
  notes: 'Known for practical local trail advice and weekend workshops.',
}

const agent = {
  id: 'sasha',
  name: 'Sasha',
  title: 'Media operator',
}

const idSequence = () => {
  let value = 0
  return prefix => `${prefix}_test_${++value}`
}

describe('Social Operator campaign jobs', () => {
  it('creates one client-aware draft variant per platform and settles generation credits before approval', () => {
    const result = buildSocialOperatorJob({
      client,
      agent,
      input: {
        topic: 'Launch the Saturday trail clinic',
        sourceText: 'The clinic starts at 9 AM and includes a free boot-fit check.',
        platforms: ['LinkedIn', 'Instagram', 'X'],
        approvalRule: 'approval_required',
        budgetLimit: 10,
        channels: [{ id: 'postiz_1', name: 'Acme Social', identifier: 'instagram', tenantId: 'acme' }],
        tenantId: 'acme',
      },
      currentBudget: { limit: 10, used: 2, reserved: 0 },
      now: new Date('2026-07-15T16:00:00.000Z'),
      makeId: idSequence(),
    })

    expect(result.campaign).toMatchObject({
      kind: 'social_operator',
      tenantId: 'acme',
      platforms: ['LinkedIn', 'Instagram', 'X'],
      socialOperator: {
        client: { id: 'cl_acme', name: 'Acme Outdoor' },
        agent: { id: 'sasha', name: 'Sasha' },
        approvalRule: 'approval_required',
        jobStatus: 'awaiting_approval',
        budget: { limit: 10, estimated: 3, actual: 3 },
      },
    })
    expect(result.campaign.posts).toHaveLength(3)
    expect(result.campaign.posts.map(post => post.platform)).toEqual(['LinkedIn', 'Instagram', 'X'])
    expect(new Set(result.campaign.posts.map(post => post.body)).size).toBe(3)
    expect(result.campaign.posts.every(post => post.status === 'draft')).toBe(true)
    expect(result.campaign.posts[1].body).toContain('Acme Outdoor')
    expect(result.campaign.posts[1].body).toContain('#AcmeOutdoor')
    expect(result.budget).toMatchObject({ limit: 10, used: 5, reserved: 0 })
  })

  it('auto-approves guarded work inside the client credit limit and records actual usage', () => {
    const result = buildSocialOperatorJob({
      client,
      agent,
      input: {
        topic: 'Share the new summer hours',
        platforms: ['BlueSky', 'Facebook'],
        approvalRule: 'guarded_auto',
        budgetLimit: 8,
      },
      currentBudget: { limit: 8, used: 1, reserved: 0 },
      now: new Date('2026-07-15T16:00:00.000Z'),
      makeId: idSequence(),
    })

    expect(result.campaign.socialOperator.jobStatus).toBe('approved')
    expect(result.campaign.socialOperator.budget).toMatchObject({ estimated: 2, actual: 2, remaining: 5 })
    expect(result.campaign.posts.every(post => post.status === 'approved')).toBe(true)
    expect(result.campaign.autopilot).toMatchObject({ enabled: true, mode: 'guarded_auto' })
    expect(result.budget).toMatchObject({ limit: 8, used: 3, reserved: 0 })
  })

  it('stops before saving when the selected variants exceed the available client credits', () => {
    expect(() => buildSocialOperatorJob({
      client,
      agent,
      input: {
        topic: 'Promote the fall schedule',
        platforms: ['BlueSky', 'Facebook', 'Instagram'],
        approvalRule: 'guarded_auto',
        budgetLimit: 5,
      },
      currentBudget: { limit: 5, used: 3, reserved: 0 },
    })).toThrowError(expect.objectContaining({
      name: 'SocialOperatorError',
      code: 'budget_limit_exceeded',
      status: 409,
    }))
  })

  it('records editorial approval without charging already-generated work twice', () => {
    const created = buildSocialOperatorJob({
      client,
      agent,
      input: {
        topic: 'Invite customers to the repair workshop',
        platforms: ['LinkedIn', 'Facebook'],
        approvalRule: 'approval_required',
        budgetLimit: 6,
      },
      currentBudget: { limit: 6, used: 1, reserved: 0 },
      now: new Date('2026-07-15T16:00:00.000Z'),
      makeId: idSequence(),
    })

    const approved = approveSocialOperatorJob({
      campaign: created.campaign,
      currentBudget: created.budget,
      now: new Date('2026-07-15T17:00:00.000Z'),
    })

    expect(approved.campaign.socialOperator.jobStatus).toBe('approved')
    expect(approved.campaign.socialOperator.approvedAt).toBe('2026-07-15T17:00:00.000Z')
    expect(approved.campaign.socialOperator.budget).toMatchObject({ estimated: 2, actual: 2, remaining: 3 })
    expect(approved.campaign.posts.every(post => post.status === 'approved')).toBe(true)
    expect(approved.budget).toMatchObject({ limit: 6, used: 3, reserved: 0 })
  })

  it('uses structured validation errors for missing assignments and source input', () => {
    for (const args of [
      { client: null, agent, input: { topic: 'A topic', platforms: ['BlueSky'], budgetLimit: 4 } },
      { client, agent: null, input: { topic: 'A topic', platforms: ['BlueSky'], budgetLimit: 4 } },
      { client, agent, input: { topic: '', platforms: ['BlueSky'], budgetLimit: 4 } },
    ]) {
      try {
        buildSocialOperatorJob(args)
        throw new Error('expected validation to fail')
      } catch (error) {
        expect(error).toBeInstanceOf(SocialOperatorError)
        expect(error.status).toBe(400)
      }
    }
  })
})
