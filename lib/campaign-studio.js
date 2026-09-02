import { createHash } from 'crypto'
import { readData, writeData } from './dataStore'
import { tenantIdForAccount } from './entityStore'
import {
  SOCIAL_OPERATOR_APPROVAL_RULES,
  SOCIAL_OPERATOR_PLATFORMS,
  SocialOperatorError,
  approveSocialOperatorJob,
  buildSocialOperatorJob,
} from './social-operator'

export { SOCIAL_OPERATOR_APPROVAL_RULES, SOCIAL_OPERATOR_PLATFORMS, SocialOperatorError }

const FILE = 'campaign-studio.json'

export const CAMPAIGN_OFFERS = [
  {
    id: 'command-center',
    label: 'Command Centers',
    promise: 'Private AI command center for leads, follow-up, content, and operations.',
    cta: 'Book a command center demo',
    angles: ['replace scattered tools', 'respond faster', 'turn operations into a control room', 'make AI useful inside the business'],
  },
  {
    id: 'newspaper-growth',
    label: 'Newspaper Growth',
    promise: 'Local newspaper system for publishing, sponsors, ad sales, and community reach.',
    cta: 'Request the newspaper growth plan',
    angles: ['sell sponsor inventory', 'publish faster', 'serve local businesses', 'make the newsroom measurable'],
  },
  {
    id: 'ad-sales',
    label: 'Newspaper Ads',
    promise: 'Local ad campaigns with creative, placement, follow-up, and performance tracking.',
    cta: 'Ask about local ad packages',
    angles: ['be seen locally', 'sponsor trusted coverage', 'reach buyers nearby', 'turn attention into calls'],
  },
  {
    id: 'web-ai-services',
    label: 'Web + AI Services',
    promise: 'Website, automation, AI consulting, and practical systems for small businesses.',
    cta: 'Request a website or AI audit',
    angles: ['fix the website', 'automate follow-up', 'modernize sales', 'make the business easier to run'],
  },
]

export const CREATION_ENDPOINTS = [
  { id: 'openai', label: 'OpenAI Images', media: ['image'], bestFor: 'current preferred route for clean branded stills and campaign graphics' },
  { id: 'imagen', label: 'Google Imagen', media: ['image'], bestFor: 'selectable alternate for Google Imagen stills' },
  { id: 'nano-banana', label: 'Nano Banana (Gemini)', media: ['image'], bestFor: 'photographic stills with legible text' },
  { id: 'fal', label: 'Fal.ai', media: ['image', 'video'], bestFor: 'polished image sets and fast model routing' },
  { id: 'nvidia-local', label: 'Local NVIDIA', media: ['image', 'analysis', 'encode'], bestFor: 'local drafts, analysis, and hardware encoding' },
  { id: 'manual', label: 'Manual / Existing Media', media: ['image', 'video', 'audio'], bestFor: 'approved assets already in the media library' },
]

export const CADENCES = [
  { id: 'daily-7', label: '7 days / daily', count: 7, spacingDays: 1 },
  { id: 'weekday-10', label: '10 weekdays', count: 10, spacingDays: 1 },
  { id: 'month-12', label: '12 posts / month', count: 12, spacingDays: 2 },
  { id: 'push-21', label: '21 post push', count: 21, spacingDays: 1 },
]

const DEFAULT_PLATFORM_ROTATION = ['BlueSky', 'LinkedIn', 'Facebook', 'Instagram', 'X', 'Email']

// Brand streams: which social identity a campaign publishes as. Sourced from the
// same store the Postiz channel guard reads, so the picker and the enforcement
// can never disagree.
export function listCampaignBrands() {
  const raw = readData('postiz-channel-tenants.json') || {}
  const brands = Array.isArray(raw.brands) && raw.brands.length
    ? raw.brands
    : [{ id: 'farrington-development', label: 'Farrington Development', tenantId: 'farrington-development' }]
  return {
    brands,
    brandMap: raw.brandMap && typeof raw.brandMap === 'object' ? raw.brandMap : {},
    defaultBrandId: raw.defaultBrandId || 'farrington-development',
  }
}
const FORMAT_ROTATION = ['meme', 'image post', 'short video', 'quote graphic', 'sales note']
const STATUS_ORDER = ['draft', 'asset_needed', 'asset_ready', 'approved', 'scheduled']

function load() {
  const data = readData(FILE)
  return data && Array.isArray(data.campaigns) ? data : { campaigns: [] }
}

function save(data) {
  writeData(FILE, { ...data, updatedAt: new Date().toISOString() })
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function normalizeText(value, fallback = '') {
  return String(value || fallback).trim()
}

function findOffer(offerId) {
  return CAMPAIGN_OFFERS.find(offer => offer.id === offerId) || CAMPAIGN_OFFERS[0]
}

function findCadence(cadenceId) {
  return CADENCES.find(cadence => cadence.id === cadenceId) || CADENCES[0]
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  next.setHours(9 + (days % 8), days % 2 ? 30 : 0, 0, 0)
  return next
}

function normalizePlatforms(value, destination = '') {
  const allowed = new Set(DEFAULT_PLATFORM_ROTATION)
  const selected = Array.isArray(value) ? value.filter(platform => allowed.has(platform)) : []
  if (selected.length) return selected
  const target = String(destination || '').toLowerCase()
  const first = target.includes('linkedin') ? 'LinkedIn'
    : target.includes('facebook') ? 'Facebook'
      : target.includes('instagram') ? 'Instagram'
        : target.includes('blue') ? 'BlueSky'
          : ''
  return first ? [first] : ['BlueSky']
}

function platformFor(index, platforms = ['BlueSky']) {
  const rotation = platforms.length ? platforms : ['BlueSky']
  return rotation[index % rotation.length]
}

function formatFor(index) {
  return FORMAT_ROTATION[index % FORMAT_ROTATION.length]
}

const SHARED_AI_COPY = {
  hooks: [
    ({ audience }) => `${audience} do not need another dashboard to babysit.`,
    () => `The useful AI work usually starts before the tool gets installed.`,
    () => `Local attention is still valuable when the follow-up is clear.`,
    () => `A cleaner handoff can change the whole month.`,
    () => `The best offer is the one a busy owner can understand quickly.`,
  ],
  bodies: [
    ({ market }) => `A pattern keeps showing up in ${market}: leads, messages, content, and follow-up live in too many places. The practical fix is a simple workflow that shows what needs attention today and what can wait.`,
    () => `Before adding automation, map the handoff. Who captures the lead? Who replies? What gets scheduled? Once that is visible, AI can take the repeat work without making the business feel robotic.`,
    ({ audience }) => `For ${audience}, the win is not a bigger tech stack. It is fewer missed replies, cleaner records, and a follow-up rhythm the team can actually keep.`,
    () => `Most operations problems are not dramatic. They are small delays repeated every week. A useful system catches those delays early enough that the owner does not have to remember everything manually.`,
    ({ angle }) => `If ${angle} is the goal, start with the part of the day that already creates friction. Fix that path first, then add automation only where it removes real work.`,
  ],
}

const OFFER_COPY_POOLS = {
  'command-center': SHARED_AI_COPY,
  'web-ai-services': SHARED_AI_COPY,
  'newspaper-growth': {
    hooks: [
      ({ audience }) => `${audience} do not need another tool that slows the newsroom down.`,
      () => `Publishing speed is a revenue problem, not just an editorial one.`,
      () => `Sponsor inventory only sells when someone can actually see it.`,
      () => `Local coverage earns trust. The system behind it should earn revenue.`,
      ({ market }) => `Readers in ${market} show up every day. The operation behind the paper should too.`,
    ],
    bodies: [
      ({ market }) => `Local papers in ${market} keep hitting the same wall: stories, sponsors, ad slots, and reader outreach live in separate places. A newsroom system puts publishing, sponsor inventory, and follow-up on one rail so the day runs on schedule.`,
      () => `Before chasing new revenue, make the current inventory visible. List every sponsorship slot, every ad position, every recurring feature. Once it is on one page, selling it stops depending on memory.`,
      ({ audience }) => `For ${audience}, the win is a paper that publishes on time, bills on time, and knows which sponsors are up for renewal — without the publisher carrying all of it in their head.`,
      () => `Most newsroom stress is not the news. It is the routine around it: scheduling, sponsor follow-up, ad proofs, renewals. Put the routine on a system and the reporting gets the attention.`,
      ({ angle }) => `If the goal is to ${angle}, start with one measurable piece — publishing cadence or sponsor renewals — and put a system under it before touching anything else.`,
    ],
  },
  'ad-sales': {
    hooks: [
      ({ market }) => `Buyers in ${market} are paying attention to someone. It should be you.`,
      () => `A local ad works when the follow-up is ready before the phone rings.`,
      () => `Sponsoring trusted local coverage beats shouting into a national feed.`,
      ({ audience }) => `${audience} do not need more impressions. They need calls.`,
      () => `The best local campaign is the one a reader can act on in ten seconds.`,
    ],
    bodies: [
      ({ market }) => `Local advertising in ${market} still works when three things line up: a clear offer, placement next to coverage people trust, and a follow-up path that answers fast. Miss one and the budget leaks.`,
      () => `Before buying placement, decide what a response looks like — a call, a visit, a form. Then build the ad backward from that action. Creative follows the response, not the other way around.`,
      ({ audience }) => `For ${audience}, the practical measure is simple: did the campaign create conversations with nearby buyers? Track the calls and the visits, not just the views.`,
      () => `Trusted local coverage gives an ad borrowed credibility. Placement next to news people actually read is worth more than a bigger banner somewhere anonymous.`,
      ({ angle }) => `If the goal is to ${angle}, run a small placement with clear tracking first. Prove the response, then scale the spend.`,
    ],
  },
}

function copyFor({ offer, audience, market, index }) {
  const angle = offer.angles[index % offer.angles.length]
  const ctx = { audience, market, angle }
  const pool = OFFER_COPY_POOLS[offer.id] || SHARED_AI_COPY
  return {
    hook: pool.hooks[index % pool.hooks.length](ctx),
    body: pool.bodies[index % pool.bodies.length](ctx),
    cta: offer.cta,
  }
}

function isLegacyGeneratedPost(post = {}) {
  const body = String(post.body || '')
  return /This post leans on\s+"/i.test(body) || /Built for .+ teams that need to .+ without adding another disconnected tool\./i.test(body)
}

export function upgradeCampaignCopy(campaign) {
  if (!campaign || !Array.isArray(campaign.posts)) return campaign
  const offer = findOffer(campaign.offerId)
  const audience = normalizeText(campaign.audience, 'local business owners')
  const market = normalizeText(campaign.market, 'the local market')
  return {
    ...campaign,
    posts: campaign.posts.map((post, index) => {
      if (!isLegacyGeneratedPost(post)) return post
      const copy = copyFor({ offer, audience, market, index })
      return { ...post, hook: copy.hook, body: copy.body, cta: copy.cta }
    }),
  }
}

export function generateCampaign(input = {}) {
  const now = new Date()
  const offer = findOffer(input.offerId)
  const customDays = Math.min(90, Math.max(1, Math.round(Number(input.customDays)) || 7))
  const cadence = input.cadenceId === 'custom'
    ? { id: 'custom', label: `${customDays} days / daily`, count: customDays, spacingDays: 1 }
    : findCadence(input.cadenceId)
  const audience = normalizeText(input.audience, 'local business owners')
  const market = normalizeText(input.market, 'the local market')
  const endpoint = CREATION_ENDPOINTS.find(item => item.id === input.creationEndpoint) || CREATION_ENDPOINTS[0]
  const name = normalizeText(input.name, `${offer.label} campaign`)
  const destination = normalizeText(input.destination, 'Postiz scheduler - BlueSky first')
  const platforms = normalizePlatforms(input.platforms, destination)

  const posts = Array.from({ length: cadence.count }, (_, index) => {
    const platform = platformFor(index, platforms)
    const format = formatFor(index)
    const copy = copyFor({ offer, audience, market, index })
    return {
      id: id('cpost'),
      sequence: index + 1,
      platform,
      format,
      status: 'draft',
      scheduledFor: addDays(now, index * cadence.spacingDays).toISOString(),
      creationEndpoint: endpoint.id,
      hook: copy.hook,
      body: copy.body,
      cta: copy.cta,
      assetBrief: `Photographic ${format} concept for ${platform} targeting ${audience} in ${market}. Credible, sharp, modern, local, sales-ready. Image only — no text, words, letters, captions, logos, or watermarks.`,
      assetStatus: format === 'sales note' ? 'not_required' : 'needed',
      mediaId: '',
      notes: '',
    }
  })

  const accountId = normalizeText(input.accountId, '')
  let accountName = normalizeText(input.accountName, '')
  let accountOwnership = ''
  if (accountId) {
    const store = readData('accounts.json')
    const list = Array.isArray(store) ? store : (store?.accounts || [])
    const account = list.find(item => item?.id === accountId)
    if (account) {
      accountName = accountName || account.name || ''
      accountOwnership = account.type === 'in-house' ? 'in-house' : 'client'
    }
  }

  return {
    id: id('camp'),
    name,
    // Ownership: explicit tenant wins, then the account's active lease, then Carl's own.
    tenantId: normalizeText(input.tenantId, '') || (accountId ? tenantIdForAccount(accountId) : '') || 'farrington-development',
    // Brand stream: which social identity this campaign is allowed to publish as.
    brandId: normalizeText(input.brandId, '') || 'farrington-development',
    accountId,
    accountName,
    accountOwnership,
    offerId: offer.id,
    offerLabel: offer.label,
    objective: normalizeText(input.objective, 'create sales conversations'),
    audience,
    market,
    platforms,
    cadenceId: cadence.id,
    creationEndpoint: endpoint.id,
    status: 'draft',
    autopilot: {
      mode: 'manual',
      enabled: false,
      guardrail: 'approval_required',
      destination,
    },
    posts,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function listCampaigns() {
  return load().campaigns.map(upgradeCampaignCopy).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

export function createCampaign(input) {
  const data = load()
  const campaign = generateCampaign(input)
  data.campaigns = [campaign, ...(data.campaigns || [])]
  save(data)
  return campaign
}

export function deleteCampaigns(ids = []) {
  const data = load()
  const set = new Set((ids || []).map(String).filter(Boolean))
  if (!set.size) return { deleted: 0 }
  const before = (data.campaigns || []).length
  data.campaigns = (data.campaigns || []).filter(campaign => !set.has(campaign.id))
  save(data)
  return { deleted: before - data.campaigns.length }
}

export function deleteCampaignPosts(campaignId, postIds = []) {
  const data = load()
  const index = (data.campaigns || []).findIndex(campaign => campaign.id === campaignId)
  if (index < 0) return null
  const set = new Set((postIds || []).map(String).filter(Boolean))
  const campaign = data.campaigns[index]
  const before = (campaign.posts || []).length
  const posts = (campaign.posts || []).filter(post => !set.has(post.id))
  data.campaigns[index] = { ...campaign, posts, updatedAt: new Date().toISOString() }
  save(data)
  return { campaign: data.campaigns[index], deleted: before - posts.length }
}

function storedSocialOperatorBudget(data, clientId) {
  const stored = data.socialOperatorBudgets?.[clientId] || {}
  return {
    unit: 'credits',
    limit: Number(stored.limit) || 0,
    used: Number(stored.used) || 0,
    reserved: Number(stored.reserved) || 0,
  }
}

function saveSocialOperatorBudget(data, client, budget) {
  data.socialOperatorBudgets = { ...(data.socialOperatorBudgets || {}) }
  data.socialOperatorBudgets[client.id] = {
    clientId: client.id,
    clientName: client.name,
    unit: 'credits',
    limit: budget.limit,
    used: budget.used,
    reserved: budget.reserved,
    remaining: Math.max(0, budget.limit - budget.used - budget.reserved),
    updatedAt: new Date().toISOString(),
  }
}

function socialPostApprovalRevision(post = {}) {
  const approvedContent = {
    platform: normalizeText(post.platform),
    hook: normalizeText(post.hook),
    body: normalizeText(post.body),
    cta: normalizeText(post.cta),
    assetMediaId: normalizeText(post.assetMediaId),
    assetUrl: normalizeText(post.assetUrl),
  }
  return createHash('sha256').update(JSON.stringify(approvedContent)).digest('hex')
}

function stampSocialOperatorApproval(campaign, now = new Date().toISOString()) {
  return {
    ...campaign,
    socialOperator: {
      ...campaign.socialOperator,
      jobStatus: 'approved',
      approvedAt: campaign.socialOperator?.approvedAt || now,
      approvalInvalidatedAt: null,
    },
    posts: (campaign.posts || []).map(post => ({
      ...post,
      approvedRevision: socialPostApprovalRevision(post),
    })),
    updatedAt: now,
  }
}

export function listSocialOperatorBudgets() {
  return load().socialOperatorBudgets || {}
}

export function getCampaign(idValue) {
  return listCampaigns().find(campaign => campaign.id === idValue) || null
}

export function preflightSocialOperatorCampaign(input, { client, agent } = {}) {
  const data = load()
  const currentBudget = client?.id ? storedSocialOperatorBudget(data, client.id) : {}
  const { campaign, budget } = buildSocialOperatorJob({ client, agent, input, currentBudget })
  return { campaign, budget }
}

export function createSocialOperatorCampaign(input, { client, agent } = {}) {
  const data = load()
  const currentBudget = client?.id ? storedSocialOperatorBudget(data, client.id) : {}
  const result = buildSocialOperatorJob({ client, agent, input, currentBudget })
  const campaign = result.campaign.socialOperator?.jobStatus === 'approved'
    ? stampSocialOperatorApproval(result.campaign)
    : result.campaign
  data.campaigns = [campaign, ...(data.campaigns || [])]
  saveSocialOperatorBudget(data, client, result.budget)
  save(data)
  return campaign
}

export function approveSocialOperatorCampaign(idValue) {
  const data = load()
  const index = (data.campaigns || []).findIndex(campaign => campaign.id === idValue)
  if (index < 0 || data.campaigns[index]?.kind !== 'social_operator') {
    throw new SocialOperatorError('Social Operator job not found.', { code: 'job_not_found', status: 404 })
  }
  const current = data.campaigns[index]
  const client = current.socialOperator?.client
  const currentBudget = storedSocialOperatorBudget(data, client?.id)
  const estimated = Math.max(0, Number(current.socialOperator?.budget?.estimated) || 0)
  const actual = Math.max(0, Number(current.socialOperator?.budget?.actual) || 0)
  const result = current.socialOperator?.jobStatus === 'awaiting_reapproval' && actual >= estimated
    ? {
        campaign: {
          ...current,
          status: 'armed',
          autopilot: { ...(current.autopilot || {}), enabled: true, mode: 'manual_approved' },
          socialOperator: { ...current.socialOperator, jobStatus: 'approved', approvedAt: new Date().toISOString() },
          posts: (current.posts || []).map(post => post.status === 'scheduled' ? post : { ...post, status: 'approved' }),
        },
        budget: currentBudget,
      }
    : approveSocialOperatorJob({ campaign: current, currentBudget })
  const campaign = stampSocialOperatorApproval(result.campaign)
  data.campaigns[index] = campaign
  saveSocialOperatorBudget(data, client, result.budget)
  save(data)
  return campaign
}

export function prepareSocialOperatorHandoff(campaignId, postId, channelIds = []) {
  const campaign = getCampaign(campaignId)
  if (!campaign || campaign.kind !== 'social_operator') {
    throw new SocialOperatorError('Social Operator job not found.', { code: 'job_not_found', status: 404 })
  }
  if (campaign.socialOperator?.jobStatus !== 'approved') {
    throw new SocialOperatorError('Approve this Social Operator job before sending it to Postiz.', {
      code: 'approval_required',
      status: 409,
    })
  }
  const estimated = Number(campaign.socialOperator?.budget?.estimated) || 0
  const actual = Number(campaign.socialOperator?.budget?.actual) || 0
  if (actual < estimated) {
    throw new SocialOperatorError('The client credit guard has not cleared this job.', {
      code: 'budget_not_cleared',
      status: 409,
    })
  }
  const post = (campaign.posts || []).find(item => item.id === postId)
  if (!post) throw new SocialOperatorError('Social variant not found.', { code: 'variant_not_found', status: 404 })
  if (!post.approvedRevision || post.approvedRevision !== socialPostApprovalRevision(post)) {
    throw new SocialOperatorError('This social variant changed after approval. Approve the latest copy and media before scheduling.', {
      code: 'approval_stale',
      status: 409,
    })
  }
  if (!['approved', 'scheduled'].includes(post.status)) {
    throw new SocialOperatorError('Approve this social variant before scheduling it.', {
      code: 'variant_approval_required',
      status: 409,
    })
  }
  const channels = Array.isArray(channelIds) ? [...new Set(channelIds.filter(Boolean))] : []
  if (!channels.length) {
    throw new SocialOperatorError('Select one connected Postiz account for this variant.', {
      code: 'channel_required',
    })
  }
  const allowed = new Set((campaign.socialOperator?.channels || []).map(channel => channel.id))
  const blocked = channels.filter(channelId => !allowed.has(channelId))
  if (blocked.length) {
    throw new SocialOperatorError('The selected Postiz account is not assigned to this Social Operator job.', {
      code: 'channel_not_assigned',
      status: 403,
      details: { blocked },
    })
  }
  return {
    campaign,
    post,
    channels,
    tenantId: campaign.tenantId,
    content: [post.hook, post.body, post.cta].filter(Boolean).join('\n\n'),
    mediaUrl: post.assetUrl || '',
  }
}

export function recordSocialOperatorDelivery(campaignId, postId, result = {}) {
  const data = load()
  const now = new Date().toISOString()
  let updated = null
  data.campaigns = (data.campaigns || []).map(campaign => {
    if (campaign.id !== campaignId || campaign.kind !== 'social_operator') return campaign
    const posts = (campaign.posts || []).map(post => post.id === postId ? {
      ...post,
      status: 'scheduled',
      scheduledFor: result.scheduledFor || post.scheduledFor,
      postiz: {
        postId: result.postId || '',
        group: result.group || '',
        integrationIds: result.integrationIds || [],
        scheduleUrl: result.scheduleUrl || '',
        recordedAt: now,
      },
    } : post)
    updated = { ...campaign, posts, updatedAt: now }
    return updated
  })
  if (!updated) throw new SocialOperatorError('Social Operator job or variant not found.', { code: 'variant_not_found', status: 404 })
  save(data)
  return updated
}

export function recordSocialOperatorUsage(campaignId, usage = {}) {
  const data = load()
  const now = new Date().toISOString()
  let updated = null
  data.campaigns = (data.campaigns || []).map(campaign => {
    if (campaign.id !== campaignId || campaign.kind !== 'social_operator') return campaign
    updated = {
      ...campaign,
      socialOperator: {
        ...campaign.socialOperator,
        usage: {
          ...(campaign.socialOperator?.usage || {}),
          ...usage,
          recordedAt: now,
        },
      },
      updatedAt: now,
    }
    return updated
  })
  if (!updated) throw new SocialOperatorError('Social Operator job not found.', { code: 'job_not_found', status: 404 })
  save(data)
  return updated
}

export function updateCampaign(idValue, patch = {}) {
  const data = load()
  const now = new Date().toISOString()
  let updated = null
  data.campaigns = (data.campaigns || []).map(campaign => {
    if (campaign.id !== idValue) return campaign
    updated = {
      ...campaign,
      ...patch,
      autopilot: { ...(campaign.autopilot || {}), ...(patch.autopilot || {}) },
      updatedAt: now,
    }
    return updated
  })
  save(data)
  return updated
}

export function updateCampaignPost(campaignId, postId, patch = {}) {
  const data = load()
  const now = new Date().toISOString()
  let updated = null
  data.campaigns = (data.campaigns || []).map(campaign => {
    if (campaign.id !== campaignId) return campaign
    let approvalInvalidated = false
    const posts = (campaign.posts || []).map(post => {
      if (post.id !== postId) return post
      const next = { ...post, ...patch }
      if (
        campaign.kind === 'social_operator'
        && campaign.socialOperator?.jobStatus === 'approved'
        && socialPostApprovalRevision(post) !== socialPostApprovalRevision(next)
      ) {
        approvalInvalidated = true
        return {
          ...next,
          status: post.status === 'scheduled' ? 'scheduled' : 'draft',
          approvedRevision: null,
        }
      }
      return next
    })
    updated = {
      ...campaign,
      posts,
      socialOperator: approvalInvalidated ? {
        ...campaign.socialOperator,
        jobStatus: 'awaiting_reapproval',
        approvalInvalidatedAt: now,
      } : campaign.socialOperator,
      updatedAt: now,
    }
    return updated
  })
  save(data)
  return updated
}

function releaseSocialOperatorReservation(data, campaign) {
  const socialOperator = campaign?.socialOperator
  if (campaign?.kind !== 'social_operator' || socialOperator?.jobStatus !== 'awaiting_approval') return false

  const client = socialOperator.client
  const estimated = Math.max(0, Number(socialOperator.budget?.estimated) || 0)
  if (!client?.id || estimated <= 0) return false

  const budget = storedSocialOperatorBudget(data, client.id)
  const reserved = Math.max(0, budget.reserved - estimated)
  if (reserved === budget.reserved) return false

  saveSocialOperatorBudget(data, client, { ...budget, reserved })
  return true
}

export function deleteCampaign(idValue) {
  const data = load()
  const campaign = (data.campaigns || []).find(item => item.id === idValue)
  if (!campaign) return false

  releaseSocialOperatorReservation(data, campaign)
  data.campaigns = (data.campaigns || []).filter(campaign => campaign.id !== idValue)
  save(data)
  return true
}

export function clearCampaigns() {
  const data = load()
  for (const campaign of data.campaigns || []) releaseSocialOperatorReservation(data, campaign)
  data.campaigns = []
  save(data)
  return true
}

export function campaignSummary(campaign) {
  const posts = campaign?.posts || []
  const counts = Object.fromEntries(STATUS_ORDER.map(status => [status, 0]))
  for (const post of posts) counts[post.status] = (counts[post.status] || 0) + 1
  const approved = posts.filter(post => ['approved', 'scheduled'].includes(post.status)).length
  const assetsReady = posts.filter(post => ['not_required', 'ready', 'attached'].includes(post.assetStatus)).length
  const assetSpend = posts.reduce((total, post) => total + (Number(post.assetCost) || 0), 0)
  return {
    total: posts.length,
    counts,
    approved,
    assetsReady,
    assetSpend,
    operatorUsage: campaign?.socialOperator?.budget || null,
    readyForAutopilot: posts.length > 0 && approved === posts.length,
  }
}
