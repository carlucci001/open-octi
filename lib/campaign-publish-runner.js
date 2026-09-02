import { listCampaigns, updateCampaignPost } from './campaign-studio'
import { getPostizPublishReadiness, publishPostizPost } from './postiz-publish'

export const CAMPAIGN_PUBLISH_RUNNER_ID = 'campaign-publish-v1'

function asTime(value) {
  const time = new Date(value || '').getTime()
  return Number.isFinite(time) ? time : null
}

function hasReceipt(post) {
  return Boolean(post?.postiz_postId || post?.postiz?.postId)
}

function campaignTenantId(campaign) {
  return String(
    campaign?.tenantId
    || campaign?.socialOperator?.tenantId
    || campaign?.clientId
    || 'farrington-development'
  ).trim()
}

function campaignBrandId(campaign) {
  const explicit = String(campaign?.brandId || '').trim()
  if (explicit) return explicit
  // Social Operator (client) campaigns predate brands; tenant + client guards isolate them.
  if (campaign?.kind === 'social_operator') return ''
  // Studio campaigns without a brand are treated as the house brand and can only
  // reach house-brand channels.
  return 'farrington-development'
}

function failureDetails(error, attemptedAt) {
  return {
    ok: false,
    runnerId: CAMPAIGN_PUBLISH_RUNNER_ID,
    attemptedAt,
    stage: error?.stage || 'campaign-publish',
    status: error?.status || null,
    code: error?.code || null,
    error: String(error?.message || error || 'Postiz publish failed'),
  }
}

export async function runCampaignPublishAutomation(_automation = {}, options = {}) {
  const now = new Date(options.now || Date.now())
  const nowMs = now.getTime()
  const attemptedAt = now.toISOString()
  const campaigns = options.campaigns || listCampaigns()
  const publishPost = options.publishPost || publishPostizPost
  const updatePost = options.updatePost || updateCampaignPost
  const readiness = options.readiness || getPostizPublishReadiness()
  const metrics = {
    campaigns: campaigns.length,
    scanned: 0,
    due: 0,
    published: 0,
    failed: 0,
    skippedNotOptedIn: 0,
    skippedNotDue: 0,
    skippedReceipted: 0,
    runnerId: CAMPAIGN_PUBLISH_RUNNER_ID,
  }
  const results = []

  if (!options.publishPost && !readiness.connected) {
    return {
      ok: false,
      connected: false,
      readiness,
      summary: `Campaign publishing is paused: ${readiness.reason || 'Postiz is not configured.'}`,
      metrics,
      results,
    }
  }

  for (const campaign of campaigns) {
    for (const post of campaign?.posts || []) {
      metrics.scanned += 1
      if (!['approved', 'scheduled'].includes(post?.status)) continue
      if (post.autoPublish !== true) {
        metrics.skippedNotOptedIn += 1
        continue
      }
      if (hasReceipt(post)) {
        metrics.skippedReceipted += 1
        continue
      }
      const publishTime = asTime(post.publishAt)
      if (publishTime === null || publishTime > nowMs || !Array.isArray(post.channels) || !post.channels.length) {
        metrics.skippedNotDue += 1
        continue
      }

      metrics.due += 1
      try {
        const receipt = await publishPost({
          content: [post.hook, post.body, post.cta].filter(Boolean).join('\n\n'),
          mediaUrl: post.assetUrl || '',
          channels: post.channels,
          publishAt: post.publishAt,
          tenantId: campaignTenantId(campaign),
          brandId: campaignBrandId(campaign),
        })
        const publishResult = {
          ok: true,
          runnerId: CAMPAIGN_PUBLISH_RUNNER_ID,
          attemptedAt,
          receipt,
        }
        updatePost(campaign.id, post.id, {
          status: 'scheduled',
          autoPublish: true,
          publishAt: post.publishAt,
          scheduledFor: receipt.scheduledFor,
          channels: post.channels,
          postiz_postId: receipt.postId,
          postiz_group: receipt.group,
          postiz_scheduleUrl: receipt.scheduleUrl,
          postiz_integrationIds: receipt.integrationIds,
          postiz: {
            postId: receipt.postId,
            group: receipt.group,
            scheduleUrl: receipt.scheduleUrl,
            scheduledFor: receipt.scheduledFor,
            integrationIds: receipt.integrationIds,
            recordedAt: attemptedAt,
          },
          publishResult,
        })
        metrics.published += 1
        results.push({ campaignId: campaign.id, postId: post.id, ok: true, receipt })
      } catch (error) {
        const publishResult = failureDetails(error, attemptedAt)
        updatePost(campaign.id, post.id, { publishResult })
        metrics.failed += 1
        results.push({ campaignId: campaign.id, postId: post.id, ...publishResult })
      }
    }
  }

  const summary = `Campaign Publish checked ${metrics.scanned} posts, published ${metrics.published}, and recorded ${metrics.failed} failures.`
  return {
    ok: metrics.failed === 0,
    connected: readiness.connected,
    readiness,
    summary,
    metrics,
    results,
  }
}
