import { describe, expect, it, vi } from 'vitest'

import { getAutomationRunner } from '../lib/automation-runners'
import { runCampaignPublishAutomation } from '../lib/campaign-publish-runner'
import { runCampaignPublishTick } from '../lib/campaign-publish-scheduler'
import { getPostizPublishReadiness } from '../lib/postiz-publish'

const NOW = '2026-07-17T16:00:00.000Z'

function campaignWith(post = {}) {
  return {
    id: 'campaign_1',
    tenantId: 'acme',
    posts: [{
      id: 'post_1',
      status: 'approved',
      autoPublish: true,
      publishAt: '2026-07-17T15:55:00.000Z',
      channels: ['postiz_instagram'],
      hook: 'A useful opening',
      body: 'The campaign message.',
      cta: 'Book today.',
      assetUrl: 'https://cdn.example/campaign.jpg',
      ...post,
    }],
  }
}

describe('campaign-publish-v1 runner', () => {
  it('publishes an explicitly opted-in due post and persists the receipt', async () => {
    const publishPost = vi.fn(async () => ({
      ok: true,
      postId: 'postiz_123',
      group: 'group_1',
      scheduleUrl: 'https://postiz.example/launches',
      scheduledFor: '2026-07-17T16:01:00.000Z',
      count: 1,
      integrationIds: ['postiz_instagram'],
    }))
    const updatePost = vi.fn((_campaignId, _postId, patch) => patch)

    const result = await runCampaignPublishAutomation(
      { runnerId: 'campaign-publish-v1' },
      { campaigns: [campaignWith()], publishPost, updatePost, now: NOW }
    )

    expect(publishPost).toHaveBeenCalledWith(expect.objectContaining({
      content: 'A useful opening\n\nThe campaign message.\n\nBook today.',
      mediaUrl: 'https://cdn.example/campaign.jpg',
      channels: ['postiz_instagram'],
      publishAt: '2026-07-17T15:55:00.000Z',
      tenantId: 'acme',
    }))
    expect(updatePost).toHaveBeenCalledWith('campaign_1', 'post_1', expect.objectContaining({
      status: 'scheduled',
      autoPublish: true,
      postiz_postId: 'postiz_123',
      scheduledFor: '2026-07-17T16:01:00.000Z',
      publishResult: expect.objectContaining({ ok: true, runnerId: 'campaign-publish-v1' }),
    }))
    expect(result.metrics).toMatchObject({ due: 1, published: 1, failed: 0 })
  })

  it('does not publish a future post', async () => {
    const publishPost = vi.fn()
    const updatePost = vi.fn()

    const result = await runCampaignPublishAutomation(
      { runnerId: 'campaign-publish-v1' },
      {
        campaigns: [campaignWith({ publishAt: '2026-07-17T17:00:00.000Z' })],
        publishPost,
        updatePost,
        now: NOW,
      }
    )

    expect(publishPost).not.toHaveBeenCalled()
    expect(updatePost).not.toHaveBeenCalled()
    expect(result.metrics).toMatchObject({ due: 0, published: 0, failed: 0 })
  })

  it('skips an already receipted post idempotently', async () => {
    const publishPost = vi.fn()
    const updatePost = vi.fn()

    const result = await runCampaignPublishAutomation(
      { runnerId: 'campaign-publish-v1' },
      {
        campaigns: [campaignWith({ postiz_postId: 'postiz_existing' })],
        publishPost,
        updatePost,
        now: NOW,
      }
    )

    expect(publishPost).not.toHaveBeenCalled()
    expect(updatePost).not.toHaveBeenCalled()
    expect(result.metrics.skippedReceipted).toBe(1)
  })

  it('skips legacy due posts that do not explicitly opt in', async () => {
    const publishPost = vi.fn()
    const updatePost = vi.fn()

    const result = await runCampaignPublishAutomation(
      { runnerId: 'campaign-publish-v1' },
      {
        campaigns: [campaignWith({ autoPublish: undefined })],
        publishPost,
        updatePost,
        now: NOW,
      }
    )

    expect(publishPost).not.toHaveBeenCalled()
    expect(updatePost).not.toHaveBeenCalled()
    expect(result.metrics.skippedNotOptedIn).toBe(1)
  })

  it('records a safe failure result without writing a receipt', async () => {
    const error = Object.assign(new Error('Postiz unavailable'), {
      stage: 'create-post',
      status: 502,
    })
    const publishPost = vi.fn(async () => { throw error })
    const updatePost = vi.fn((_campaignId, _postId, patch) => patch)

    const result = await runCampaignPublishAutomation(
      { runnerId: 'campaign-publish-v1' },
      { campaigns: [campaignWith()], publishPost, updatePost, now: NOW }
    )

    expect(updatePost).toHaveBeenCalledWith('campaign_1', 'post_1', expect.not.objectContaining({
      postiz_postId: expect.anything(),
    }))
    expect(updatePost).toHaveBeenCalledWith('campaign_1', 'post_1', expect.objectContaining({
      publishResult: expect.objectContaining({
        ok: false,
        runnerId: 'campaign-publish-v1',
        stage: 'create-post',
        error: 'Postiz unavailable',
      }),
    }))
    expect(result.metrics).toMatchObject({ due: 1, published: 0, failed: 1 })
  })

  it('reports the real configured-state contract without making a network request', () => {
    expect(getPostizPublishReadiness({})).toMatchObject({ connected: false, configured: false })
    expect(getPostizPublishReadiness({
      POSTIZ_API_URL: 'https://postiz.example/api/public/v1',
      POSTIZ_API_KEY: 'secret',
    })).toMatchObject({ connected: true, configured: true })
    expect(getAutomationRunner({ runnerId: 'campaign-publish-v1' })).toMatchObject({
      id: 'campaign-publish-v1',
      label: 'Campaign Publish Automation v1',
    })
  })

  it('prevents overlapping scheduler ticks', async () => {
    let releasePublish
    const pendingPublish = new Promise(resolve => { releasePublish = resolve })
    const publishPost = vi.fn(() => pendingPublish)
    const updatePost = vi.fn()
    const options = {
      campaigns: [campaignWith()],
      publishPost,
      updatePost,
      readiness: { configured: true, connected: true },
      now: NOW,
    }

    const firstTick = runCampaignPublishTick(options)
    await vi.waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1))
    await expect(runCampaignPublishTick(options)).resolves.toEqual({
      skipped: true,
      reason: 'run_in_progress',
    })

    releasePublish({
      ok: true,
      postId: 'postiz_queued',
      group: 'group_queued',
      scheduleUrl: 'https://postiz.example/launches',
      scheduledFor: '2026-07-17T16:01:00.000Z',
      count: 1,
      integrationIds: ['postiz_instagram'],
    })
    await firstTick
  })
})
