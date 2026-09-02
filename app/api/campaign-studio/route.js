import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  CADENCES,
  CAMPAIGN_OFFERS,
  CREATION_ENDPOINTS,
  listCampaignBrands,
  SOCIAL_OPERATOR_APPROVAL_RULES,
  SOCIAL_OPERATOR_PLATFORMS,
  SocialOperatorError,
  approveSocialOperatorCampaign,
  campaignSummary,
  clearCampaigns,
  createCampaign,
  createSocialOperatorCampaign,
  deleteCampaign,
  deleteCampaignPosts,
  deleteCampaigns,
  getCampaign,
  listCampaigns,
  listSocialOperatorBudgets,
  preflightSocialOperatorCampaign,
  updateCampaign,
  updateCampaignPost,
  upgradeCampaignCopy,
} from '@/lib/campaign-studio'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { getPostizPublishReadiness } from '@/lib/postiz-publish'
import { addFolder, generateMedia, describeImageGen, getMedia } from '@/lib/media-gen'
import { resolveComponentSettings } from '@/lib/component-settings'
import { findClient } from '@/lib/clients'
import { listAgents } from '@/lib/agents-store'
import { runAiModel } from '@/lib/ai-lab'
import { generateSocialContent, SocialContentGenerationError } from '@/lib/social-content-generation'
import { researchSocialTrends, SocialTrendResearchError } from '@/lib/social-trend-research'
import { commitUsage, configureUsageAccount, getUsageBalance, releaseUsage, reserveUsage } from '@/lib/usage-ledger'
import { CREDIT_TOP_UP, MANAGED_SOCIAL_PLANS } from '@/lib/usage-pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Heal legacy asset URLs: anything stored as the static /media/<file> path is
// rewritten to the API file route, which serves runtime-written files in prod.
function servedMediaUrl(url) {
  if (!url) return url
  const m = String(url).match(/^\/media\/(.+)$/)
  return m ? `/api/media/file/${encodeURIComponent(m[1])}` : url
}

function hydrate(campaign) {
  const upgraded = upgradeCampaignCopy(campaign)
  const posts = (upgraded.posts || []).map(p => p.assetUrl ? { ...p, assetUrl: servedMediaUrl(p.assetUrl) } : p)
  let socialOperator = upgraded.socialOperator
  if (upgraded.kind === 'social_operator' && socialOperator?.client?.id) {
    try {
      const balance = getUsageBalance({
        tenantId: upgraded.tenantId || 'farrington-development',
        clientId: socialOperator.client.id,
        poolKey: 'operating-credits',
      })
      socialOperator = {
        ...socialOperator,
        usage: { ...(socialOperator.usage || {}), balance },
      }
    } catch {}
  }
  const hydrated = { ...upgraded, socialOperator, posts }
  return { ...hydrated, summary: campaignSummary(hydrated) }
}

// The synchronous Create Asset button uses the still-image chain. Paid routes are
// honored only when explicitly selected.
function assetProviderForEndpoint(endpoint) {
  if (endpoint === 'imagen' || endpoint === 'google-imagen') return 'imagen'
  if (endpoint === 'fal') return 'fal'
  if (endpoint === 'openai') return 'openai'
  if (endpoint === 'nano-banana' || endpoint === 'gemini') return 'gemini'
  return 'auto' // auto currently resolves to OpenAI/ChatGPT image generation
}

function endpointCost(endpoint) {
  const d = describeImageGen(assetProviderForEndpoint(endpoint))
  return { modelLabel: d.label, vendor: d.vendor, costPerImage: d.costPerImage }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const postiz = getPostizPublishReadiness()
  const schedulerEnabled = String(process.env.CAMPAIGN_PUBLISH_SCHEDULER_ENABLED || '').toLowerCase() !== 'false'
  return NextResponse.json({
    ok: true,
    campaignPublisher: {
      connected: postiz.connected && schedulerEnabled,
      postizConfigured: postiz.configured,
      schedulerEnabled,
      reason: !schedulerEnabled ? 'Automatic campaign publishing is disabled' : (postiz.reason || ''),
    },
    offers: CAMPAIGN_OFFERS,
    endpoints: CREATION_ENDPOINTS.map(e => ({ ...e, ...endpointCost(e.id) })),
    cadences: CADENCES,
    brands: listCampaignBrands(),
    campaigns: listCampaigns().map(hydrate),
    socialOperator: {
      platforms: SOCIAL_OPERATOR_PLATFORMS,
      approvalRules: SOCIAL_OPERATOR_APPROVAL_RULES,
      budgets: listSocialOperatorBudgets(),
      pricing: {
        status: 'internal_proposal',
        plans: MANAGED_SOCIAL_PLANS,
        topUp: CREDIT_TOP_UP,
      },
    },
  })
}

function socialOperatorError(error) {
  if (!(error instanceof SocialOperatorError)) return null
  return NextResponse.json({
    ok: false,
    error: error.message,
    code: error.code,
    details: error.details,
  }, { status: error.status })
}

function socialGenerationError(error) {
  if (!(error instanceof SocialContentGenerationError)) return null
  return NextResponse.json({
    ok: false,
    error: error.message,
    code: error.code,
    details: error.details,
  }, { status: error.status })
}

function socialTrendError(error) {
  if (!(error instanceof SocialTrendResearchError)) return null
  return NextResponse.json({
    ok: false,
    error: error.message,
    code: error.code,
    details: error.details,
  }, { status: error.status })
}

function microdollars(usd) {
  const amount = Number(usd)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1_000_000) : 0
}

function socialCampaignPatch(patch = {}) {
  const allowed = ['name', 'objective', 'audience', 'market']
  return Object.fromEntries(allowed.filter(key => patch[key] !== undefined).map(key => [key, patch[key]]))
}

function socialPostPatch(patch = {}) {
  const allowed = ['hook', 'body', 'cta', 'assetBrief', 'scheduledFor', 'notes']
  return Object.fromEntries(allowed.filter(key => patch[key] !== undefined).map(key => [key, patch[key]]))
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))

  if (body.action === 'create_campaign') {
    return NextResponse.json({ ok: true, campaign: hydrate(createCampaign(body.campaign || {})) })
  }

  if (body.action === 'delete_campaigns') {
    const result = deleteCampaigns(Array.isArray(body.campaignIds) ? body.campaignIds : [])
    return NextResponse.json({ ok: true, ...result })
  }

  if (body.action === 'delete_posts') {
    const result = deleteCampaignPosts(String(body.campaignId || ''), Array.isArray(body.postIds) ? body.postIds : [])
    if (!result) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 })
    return NextResponse.json({ ok: true, campaign: hydrate(result.campaign), deleted: result.deleted })
  }

  if (body.action === 'create_social_operator_job') {
    const job = body.job || {}
    const client = findClient(job.clientId)
    if (!client) return NextResponse.json({ ok: false, error: 'Select a valid Command Center client.', code: 'client_not_found' }, { status: 404 })
    try {
      const roster = await listAgents()
      const agent = (roster.agents || []).find(item => item.id === job.agentId && item.enabled !== false && item.draft !== true)
      if (!agent) return NextResponse.json({ ok: false, error: 'Select an enabled Command Center agent.', code: 'agent_not_found' }, { status: 404 })
      if (job.approvalRule === 'guarded_auto' && (agent.degraded || agent.offlineRuntime)) {
        return NextResponse.json({
          ok: false,
          error: 'Guarded automatic operation requires an online, non-degraded agent. Use approval required or select another agent.',
          code: 'agent_not_ready',
        }, { status: 409 })
      }
      const preflight = preflightSocialOperatorCampaign(job, { client, agent })
      const tenantId = String(job.tenantId || job.channels?.[0]?.tenantId || 'farrington-development')
      const operationId = String(job.operationId || job.requestId || randomUUID())
      const limitBehavior = job.limitBehavior === 'request_approval' ? 'request_approval' : 'block'
      const limitMilliCredits = Math.round(Number(preflight.budget.limit) * 1000)
      const reservedMilliCredits = Math.round(Number(preflight.campaign.socialOperator?.budget?.estimated || 0) * 1000)
      const identity = { tenantId, clientId: client.id, poolKey: 'operating-credits' }
      configureUsageAccount({
        ...identity,
        idempotencyKey: `social-config:${tenantId}:${client.id}:${limitMilliCredits}:${limitBehavior}`,
        limitMilliCredits,
        costLimitMicrodollars: null,
        limitBehavior,
        metadata: { clientName: client.name, source: 'social_operator' },
      })
      const reservation = reserveUsage({
        ...identity,
        idempotencyKey: `social-generate:${operationId}:reserve`,
        milliCredits: reservedMilliCredits,
        estimatedCostMicrodollars: Math.max(
          1,
          (job.platforms || []).length * 50_000
            + (job.researchMode === 'trend_research' ? 50_000 : 0)
            + (job.mediaMode === 'generate_one' ? 60_000 : 0),
        ),
        service: 'social_operator',
        sku: 'platform_text_variant',
        referenceType: 'social_operation',
        referenceId: operationId,
        rateVersion: 'legacy-variant-guard-v1',
        metadata: { platforms: job.platforms || [], approvalRule: job.approvalRule || 'approval_required' },
      })
      if (!reservation.ok) {
        return NextResponse.json({
          ok: false,
          error: reservation.decision === 'approval_required'
            ? 'This job exceeds the configured client limit and requires approval or more credits.'
            : 'This job exceeds the configured client credit limit.',
          code: reservation.code,
          details: reservation.balance,
        }, { status: 409 })
      }

      let generated
      let generatedMedia = job.media || null
      let research = null
      try {
        if (job.researchMode === 'trend_research') {
          research = await researchSocialTrends({
            client,
            topic: job.topic,
            source: {
              type: job.sourceType || 'topic',
              title: job.topic,
              content: job.sourceText,
            },
          })
        }
        const researchedSource = [
          job.sourceText,
          research?.content ? `CURRENT PUBLIC-SOURCE RESEARCH:\n${research.content}` : '',
          research?.citations?.length ? `RESEARCH CITATIONS:\n${research.citations.join('\n')}` : '',
        ].filter(Boolean).join('\n\n')
        generated = await generateSocialContent({
          client,
          agent,
          topic: job.topic,
          source: {
            type: job.sourceType || (job.media ? 'media' : 'topic'),
            title: job.topic,
            content: researchedSource,
          },
          sourceText: researchedSource,
          platforms: job.platforms,
          runModel: runAiModel,
        })
        if (job.mediaMode === 'generate_one') {
          try {
            const provider = agent.imageGeneration?.provider || 'openai'
            const item = await generateMedia({
              prompt: `${generated.variants[0]?.assetBrief || `Create a branded social visual for ${client.name}.`} Professional commercial composition. Image only — no text, words, letters, captions, logos, or watermarks.`.slice(0, 1000),
              title: `${client.name} — ${job.topic}`,
              tags: ['social-operator', client.id, operationId],
              folder: `client-${client.id}`,
              size: '1024x1024',
              provider,
            })
            const rate = describeImageGen(item.provider || provider)
            generatedMedia = {
              id: item.id,
              name: item.title || `${client.name} social visual`,
              url: item.url,
              type: item.mediaType || item.mimeType || 'image',
              provider: item.provider || provider,
              model: rate.label,
              vendor: rate.vendor,
              costUsd: rate.costPerImage,
            }
          } catch (mediaError) {
            throw new SocialContentGenerationError('The post copy was generated, but the requested campaign image failed.', {
              code: 'media_generation_failed',
              status: 502,
              details: {
                totalEstimatedUsd: generated.generation.totalEstimatedUsd,
                cause: String(mediaError?.message || mediaError).slice(0, 300),
              },
            })
          }
        }
      } catch (generationError) {
        releaseUsage({
          ...identity,
          reservationId: reservation.reservationId,
          idempotencyKey: `social-generate:${operationId}:release`,
          actualCostMicrodollars: microdollars(generationError?.details?.totalEstimatedUsd),
          reason: 'generation_failed',
          metadata: { code: generationError?.code || 'generation_failed' },
        })
        const response = socialGenerationError(generationError)
        if (response) return response
        const trendResponse = socialTrendError(generationError)
        if (trendResponse) return trendResponse
        throw generationError
      }

      const actualCostMicrodollars = microdollars(
        Number(generated.generation.totalEstimatedUsd || 0) + Number(generatedMedia?.costUsd || 0),
      )
      const settlement = commitUsage({
        ...identity,
        reservationId: reservation.reservationId,
        idempotencyKey: `social-generate:${operationId}:commit`,
        actualMilliCredits: reservedMilliCredits,
        actualCostMicrodollars,
        billableCents: Math.round(reservedMilliCredits / 1000),
        provider: generated.generation.provider,
        model: generated.generation.model,
        rateVersion: 'legacy-variant-guard-v1',
        metadata: { requestedModel: generated.generation.requestedModel, attempts: generated.generation.attempts.length },
      })
      const campaign = createSocialOperatorCampaign({
        ...job,
        tenantId,
        generatedVariants: generated.variants,
        generation: generated.generation,
        research: research ? {
          content: research.content,
          citations: research.citations,
          usage: research.usage,
          provenance: research.provenance,
          costStatus: 'unpriced_provider_usage',
        } : null,
        media: generatedMedia,
        usageReservationId: reservation.reservationId,
        usage: {
          operationId,
          eventId: settlement.event.id,
          decision: settlement.decision,
          chargedMilliCredits: reservedMilliCredits,
          actualCostMicrodollars,
          balance: settlement.balance,
        },
      }, { client, agent })
      return NextResponse.json({
        ok: true,
        campaign: hydrate(campaign),
        budget: listSocialOperatorBudgets()[client.id] || null,
      })
    } catch (error) {
      const response = socialOperatorError(error)
      if (response) return response
      throw error
    }
  }

  if (body.action === 'approve_social_operator_job') {
    try {
      const campaign = approveSocialOperatorCampaign(body.id)
      return NextResponse.json({
        ok: true,
        campaign: hydrate(campaign),
        budget: listSocialOperatorBudgets()[campaign.socialOperator?.client?.id] || null,
      })
    } catch (error) {
      const response = socialOperatorError(error)
      if (response) return response
      throw error
    }
  }

  if (body.action === 'update_campaign') {
    const existing = getCampaign(body.id)
    const patch = existing?.kind === 'social_operator' ? socialCampaignPatch(body.patch || {}) : (body.patch || {})
    const campaign = updateCampaign(body.id, patch)
    if (!campaign) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, campaign: hydrate(campaign) })
  }

  if (body.action === 'update_post') {
    const existing = getCampaign(body.campaignId)
    const patch = existing?.kind === 'social_operator' ? socialPostPatch(body.patch || {}) : (body.patch || {})
    const campaign = updateCampaignPost(body.campaignId, body.postId, patch)
    if (!campaign) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, campaign: hydrate(campaign) })
  }

  // Attach an existing Media-library file to a post instead of generating one.
  if (body.action === 'attach_asset') {
    const campaign = getCampaign(body.campaignId)
    if (!campaign) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    const item = body.mediaId ? getMedia(body.mediaId) : null
    if (!item || !item.url) return NextResponse.json({ ok: false, error: 'media item not found' }, { status: 404 })
    const updated = updateCampaignPost(body.campaignId, body.postId, {
      assetUrl: item.url,
      assetMediaId: item.id,
      assetProvider: 'library',
      assetModel: 'Media library',
      assetVendor: 'own media',
      assetCost: 0,
      assetStatus: 'ready',
      assetUpdatedAt: new Date().toISOString(),
      assetError: '',
    })
    if (!updated) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, campaign: hydrate(updated), asset: { url: item.url, id: item.id, provider: 'library' } })
  }

  if (body.action === 'generate_asset') {
    const campaign = listCampaigns().find(c => c.id === body.campaignId)
    if (!campaign) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    const post = (campaign.posts || []).find(p => p.id === body.postId)
    if (!post) return NextResponse.json({ ok: false, error: 'post not found' }, { status: 404 })
    // Visual-only prompt. We deliberately do NOT feed the headline/body copy
    // into the image (models can't spell) — the real copy is shown as live text
    // on the post. Hard "no text" instruction keeps the image clean.
    const visual = (post.assetBrief && post.assetBrief.trim())
      ? post.assetBrief.trim()
      : `Photographic ${post.format} concept for ${post.platform} targeting ${campaign.audience || 'local business owners'} in ${campaign.market || 'the local market'}`
    // Imagen/Nano Banana can render text, so we let the brief decide on words.
    // The default brief is visual-only; add wording there if you want it baked in.
    const prompt = `${visual}. Professional commercial photography, sharp focus, natural lighting, high detail, clean modern composition.`.slice(0, 700)
    // Layered image-gen settings (global -> brand -> campaign), resolved
    // server-side so the client can never drift from the configured truth.
    const { values: imageGenPrefs } = resolveComponentSettings('campaign-studio.image-gen', { brandId: campaign.brandId || '', campaignId: campaign.id })
    const provider = assetProviderForEndpoint(campaign.creationEndpoint)
    const vertical = /instagram|tiktok|story|reel|short/i.test(`${post.platform} ${post.format}`)
    const size = vertical ? '1024x1536' : '1024x1024'
    // File the asset under the owning client (reusable across that client's
    // campaigns); house/brand campaigns get a brand folder instead.
    let folder = 'campaigns'
    if (campaign.accountId) {
      folder = `client:${campaign.accountId}`
    } else if (campaign.brandId) {
      folder = `brand:${campaign.brandId}`
      try { addFolder({ id: folder, name: `Brand — ${campaign.brandId}`, parent: null }) } catch {}
    }
    // Reference logos are locked to this campaign's own brand/client. Legacy
    // marketing folders count as part of the same brand's scope.
    const legacyBrandFolders = {
      'farrington-development': ['farrington-development-marketing'],
      'newsroom-aios': ['newsroomaios-marketing'],
      'wnc-times': ['wnctimes-marketing'],
    }
    const referenceScope = {
      folders: [folder, ...(legacyBrandFolders[campaign.brandId] || [])],
      tags: [campaign.brandId, campaign.accountId].filter(Boolean),
    }
    try {
      const item = await generateMedia({
        prompt,
        title: `${campaign.name} – #${post.sequence} ${post.platform}`,
        tags: ['campaign', campaign.id, String(post.platform || '').toLowerCase(), campaign.brandId, campaign.accountId].filter(Boolean),
        folder,
        size,
        provider,
        referenceScope,
        quality: imageGenPrefs.quality,
        useBrandReferences: imageGenPrefs.useBrandReferences,
      })
      const cost = describeImageGen(item.provider)
      const usedReferences = Array.isArray(item.brandReferences) && item.brandReferences.length > 0
      const perImage = usedReferences && cost.costPerImageWithReference ? cost.costPerImageWithReference : cost.costPerImage
      const updated = updateCampaignPost(body.campaignId, body.postId, {
        assetUrl: item.url,
        assetMediaId: item.id,
        assetProvider: item.provider || provider,
        assetModel: cost.label,
        assetVendor: cost.vendor,
        assetCost: perImage,
        assetStatus: 'ready',
        status: post.status === 'draft' || post.status === 'asset_needed' ? 'asset_ready' : post.status,
      })
      return NextResponse.json({ ok: true, campaign: hydrate(updated), asset: { url: item.url, id: item.id, provider: item.provider, model: cost.label, vendor: cost.vendor, costPerImage: perImage } })
    } catch (e) {
      console.error('[campaign-asset] generation failed', { campaignId: body.campaignId, postId: body.postId, provider, error: e?.message || String(e) })
      return NextResponse.json({ ok: false, error: e.message || 'asset generation failed' }, { status: 502 })
    }
  }

  if (body.action === 'delete_campaign') {
    return NextResponse.json({ ok: deleteCampaign(body.id) })
  }

  if (body.action === 'clear_campaigns') {
    return NextResponse.json({ ok: clearCampaigns(), campaigns: [] })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
