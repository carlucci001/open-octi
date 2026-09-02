// Push a Campaign Studio asset into Postiz to be scheduled/published.
//
// POST body: { content, mediaUrl?, channels: [integrationId], publishAt }
//   - publishAt: ISO string. If omitted or in the past, defaults to "now + 60s"
//     so Postiz can still accept it as a schedule rather than rejecting on
//     a past instant.
//   - channels: one or more Postiz integration ids (from /api/postiz/channels)
//   - mediaUrl: optional public image URL. Posted to Postiz upload-from-url
//     first so the uploaded media record can be referenced in the post.
//
// Returns: { ok, postId, group, scheduleUrl, scheduledFor }

import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import {
  SocialOperatorError,
  prepareSocialOperatorHandoff,
  recordSocialOperatorDelivery,
} from '@/lib/campaign-studio'
import {
  getPostizPublishConfig,
  normalizePostizMediaUrl,
  PostizPublishError,
  publishPostizPost,
} from '@/lib/postiz-publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const activeOperatorHandoffs = globalThis.__fccActiveSocialOperatorHandoffs || new Set()
globalThis.__fccActiveSocialOperatorHandoffs = activeOperatorHandoffs

const PLATFORM_ALIASES = {
  bluesky: ['bluesky', 'bsky'],
  linkedin: ['linkedin'],
  facebook: ['facebook'],
  instagram: ['instagram'],
  x: ['x', 'twitter'],
  tiktok: ['tiktok'],
}

function platformKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function recognizedPlatform(value) {
  const key = platformKey(value)
  if (!key) return ''
  for (const [platform, aliases] of Object.entries(PLATFORM_ALIASES)) {
    if (aliases.some(alias => key === alias || (alias.length > 2 && key.includes(alias)))) return platform
  }
  return ''
}

function channelPlatform(channel) {
  const explicit = [
    channel?.identifier,
    channel?.platform,
    channel?.provider,
    channel?.type,
    channel?.integration?.identifier,
    channel?.integration?.platform,
  ]
  for (const value of explicit) {
    const platform = recognizedPlatform(value)
    if (platform) return platform
  }
  return recognizedPlatform(`${channel?.name || ''} ${channel?.profile || ''}`)
}

function operatorError(message, code, status, details) {
  return NextResponse.json({ ok: false, error: message, code, ...(details ? { details } : {}) }, { status })
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  const cfg = getPostizPublishConfig()
  if (cfg?.error) {
    return NextResponse.json({ ok: false, error: cfg.error }, { status: 503 })
  }
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'Postiz env not configured (POSTIZ_API_URL / POSTIZ_API_KEY)' },
      { status: 503 }
    )
  }

  let payload = null
  try { payload = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  let operatorHandoffKey = ''
  try {
  let content = String(payload?.content || '').trim()
  let mediaUrl = normalizePostizMediaUrl(payload?.mediaUrl, request.url)
  const channels = Array.isArray(payload?.channels) ? payload.channels.filter(Boolean) : []
  const publishAtRaw = payload?.publishAt ? String(payload.publishAt) : ''
  let tenantId = String(payload?.tenantId || 'farrington-development').trim()
  let brandId = String(payload?.brandId || '').trim()
  const campaignId = String(payload?.campaignId || '').trim()
  const postId = String(payload?.postId || '').trim()
  const operatorReference = !!(campaignId || postId)
  let operatorHandoff = null

  if (operatorReference) {
    if (!campaignId || !postId) {
      return NextResponse.json({ ok: false, error: 'campaignId and postId are both required for a Social Operator handoff' }, { status: 400 })
    }
    if (channels.length !== 1) {
      return NextResponse.json({ ok: false, error: 'Schedule each platform variant to one selected Postiz account at a time.' }, { status: 400 })
    }
    try {
      operatorHandoff = prepareSocialOperatorHandoff(campaignId, postId, channels)
      content = operatorHandoff.content
      mediaUrl = normalizePostizMediaUrl(operatorHandoff.mediaUrl, request.url)
      tenantId = operatorHandoff.tenantId
      // Operator campaigns predate brands: enforce only when the campaign carries one.
      brandId = String(operatorHandoff.campaign?.brandId || '').trim()
    } catch (error) {
      if (error instanceof SocialOperatorError) {
        return NextResponse.json({
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details,
        }, { status: error.status })
      }
      throw error
    }

    const priorDelivery = operatorHandoff.post?.postiz
    if (operatorHandoff.post?.status === 'scheduled' || priorDelivery?.postId || priorDelivery?.recordedAt) {
      return operatorError(
        'This social variant has already been handed to Postiz. Duplicate scheduling was blocked.',
        'variant_already_handed_off',
        409,
        { scheduledFor: operatorHandoff.post?.scheduledFor || null, postizPostId: priorDelivery?.postId || null }
      )
    }

    const assignedChannel = (operatorHandoff.campaign?.socialOperator?.channels || []).find(channel => channel.id === channels[0])
    const detectedPlatform = channelPlatform(assignedChannel)
    const variantPlatform = recognizedPlatform(operatorHandoff.post?.platform)
    if (detectedPlatform && variantPlatform && detectedPlatform !== variantPlatform) {
      return operatorError(
        `The selected Postiz account is for ${detectedPlatform}, not ${operatorHandoff.post.platform}.`,
        'channel_platform_mismatch',
        409,
        { channelId: channels[0], channelPlatform: detectedPlatform, variantPlatform }
      )
    }

    const channelTenantId = String(assignedChannel?.tenantId || '').trim()
    if (channelTenantId && tenantId && channelTenantId !== tenantId) {
      return operatorError(
        'The selected Postiz account is assigned to another tenant.',
        'channel_tenant_mismatch',
        403,
        { channelId: channels[0], channelTenantId, campaignTenantId: tenantId }
      )
    }

    const campaignClientId = String(operatorHandoff.campaign?.socialOperator?.client?.id || '').trim()
    const channelClientId = String(assignedChannel?.clientId || assignedChannel?.client?.id || '').trim()
    if (channelClientId && campaignClientId && channelClientId !== campaignClientId) {
      return operatorError(
        'The selected Postiz account is assigned to another client.',
        'channel_client_mismatch',
        403,
        { channelId: channels[0], channelClientId, campaignClientId }
      )
    }
  }
  console.log('[postiz-publish] request', {
    hasContent: !!content,
    hasMedia: !!mediaUrl,
    channelCount: channels.length,
    tenantId,
  })

  if (!content) return NextResponse.json({ ok: false, error: 'content is required' }, { status: 400 })
  if (channels.length === 0) return NextResponse.json({ ok: false, error: 'At least one channel is required' }, { status: 400 })

  if (operatorReference) {
    operatorHandoffKey = `${campaignId}:${postId}`
    if (activeOperatorHandoffs.has(operatorHandoffKey)) {
      return operatorError('This social variant is already being handed to Postiz.', 'variant_handoff_in_progress', 409)
    }
    activeOperatorHandoffs.add(operatorHandoffKey)
  }

  let receipt
  try {
    receipt = await publishPostizPost({
      content,
      mediaUrl,
      channels,
      publishAt: publishAtRaw,
      tenantId,
      // Plain Campaign Studio handoffs default to the house brand so they can
      // never fan out to another brand's channels; operator handoffs enforce
      // only when the campaign carries a brand.
      brandId: operatorReference ? brandId : (brandId || 'farrington-development'),
      requestUrl: request.url,
      config: cfg,
    })
  } catch (error) {
    if (operatorHandoffKey) activeOperatorHandoffs.delete(operatorHandoffKey)
    if (error instanceof PostizPublishError) {
      return NextResponse.json({
        ok: false,
        stage: error.stage,
        error: error.message,
        detail: error.detail,
        contentType: error.contentType,
        ...(operatorReference && error.code ? { code: error.code } : {}),
      }, { status: error.status })
    }
    throw error
  }

  const {
    postId: postizPostId,
    group,
    scheduleUrl,
    scheduledFor,
    integrationIds,
  } = receipt

  let operatorDeliveryRecorded = false
  let recordWarning = null
  if (operatorReference) {
    try {
      recordSocialOperatorDelivery(campaignId, postId, { postId: postizPostId, group, scheduleUrl, scheduledFor, integrationIds })
      operatorDeliveryRecorded = true
      activeOperatorHandoffs.delete(operatorHandoffKey)
    } catch (error) {
      recordWarning = `Postiz accepted the schedule, but Command Center could not record it: ${String(error?.message || error)}`
      console.error('[postiz-publish] operator delivery record failed', error)
    }
  }

  return NextResponse.json({
    ok: true,
    postId: postizPostId,
    group,
    scheduleUrl,
    scheduledFor,
    count: receipt.count,
    integrationIds,
    operatorDeliveryRecorded,
    recordWarning,
  })
  } catch (e) {
    if (operatorHandoffKey) activeOperatorHandoffs.delete(operatorHandoffKey)
    console.error('[postiz-publish] unhandled error', e)
    return NextResponse.json(
      { ok: false, stage: 'postiz-publish-route', error: 'Postiz publish route failed before it could return a normal API response', detail: String(e?.message || e) },
      { status: 502 }
    )
  }
}
