const PLATFORM_PROFILES = {
  BlueSky: { format: 'conversation post', characterLimit: 300, style: 'concise and conversational' },
  LinkedIn: { format: 'professional update', characterLimit: 3000, style: 'credible and business-focused' },
  Facebook: { format: 'community post', characterLimit: 5000, style: 'helpful and community-focused' },
  Instagram: { format: 'image post', characterLimit: 2200, style: 'visual and energetic' },
  X: { format: 'short update', characterLimit: 280, style: 'direct and compact' },
  TikTok: { format: 'short video', characterLimit: 2200, style: 'spoken and action-oriented' },
}

export const SOCIAL_OPERATOR_PLATFORMS = Object.entries(PLATFORM_PROFILES).map(([id, profile]) => ({
  id,
  label: id,
  ...profile,
}))

export const SOCIAL_OPERATOR_APPROVAL_RULES = [
  { id: 'approval_required', label: 'Approval required' },
  { id: 'guarded_auto', label: 'Guarded automatic' },
]

export const SOCIAL_OPERATOR_CREDIT_PER_VARIANT = 1

export class SocialOperatorError extends Error {
  constructor(message, { code = 'invalid_social_operator_job', status = 400, details = null } = {}) {
    super(message)
    this.name = 'SocialOperatorError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function text(value, max = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max)
}

function contentText(value, max = 5000) {
  return String(value || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, max)
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function makeHashtag(value) {
  const compact = text(value, 80).replace(/[^a-z0-9]+/gi, '')
  return compact ? `#${compact}` : '#LocalBusiness'
}

function truncate(value, max) {
  const clean = text(value, Math.max(max, 1))
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

function sourceLead(sourceText, topic) {
  const source = text(sourceText, 1200)
  if (!source) return `This update focuses on ${topic.toLowerCase()}.`
  const firstSentence = source.match(/^.*?[.!?](?:\s|$)/)?.[0] || source
  return truncate(firstSentence, 180)
}

function clientContext(client) {
  return [
    text(client.industry, 100),
    text(client.notes, 220),
    Array.isArray(client.tags) ? client.tags.map(tag => text(tag, 40)).filter(Boolean).join(', ') : '',
  ].filter(Boolean).join(' · ')
}

function platformCopy({ platform, client, topic, sourceText }) {
  const profile = PLATFORM_PROFILES[platform]
  const name = text(client.name, 120)
  const detail = sourceLead(sourceText, topic)
  const website = text(client.website, 200)
  const cta = website ? `Learn more: ${website}` : `Ask ${name} for details.`
  const hashtag = makeHashtag(name)

  if (platform === 'LinkedIn') return {
    hook: `${name}: ${topic}`,
    body: `${detail} ${name} is sharing the practical details so customers can decide what fits and take the next step with confidence.`,
    cta,
  }
  if (platform === 'Facebook') return {
    hook: `A local update from ${name}`,
    body: `${topic}. ${detail} Share this with someone in the community who would find it useful.`,
    cta,
  }
  if (platform === 'Instagram') return {
    hook: topic,
    body: `${name} has something worth saving: ${detail}\n\n${hashtag} #LocalBusiness`,
    cta: website ? `Details at ${website}` : `Message ${name} for details.`,
  }
  if (platform === 'TikTok') return {
    hook: `Quick update from ${name}`,
    body: `On camera: lead with “${topic}.” Then show the most useful detail: ${detail}`,
    cta: website ? `Full details: ${website}` : `Follow ${name} for the next update.`,
  }
  if (platform === 'X') {
    const combined = `${name}: ${topic}. ${detail} ${website || hashtag}`
    return { hook: '', body: truncate(combined, profile.characterLimit), cta: '' }
  }
  const combined = `${name}: ${topic}. ${detail} ${website || hashtag}`
  return { hook: '', body: truncate(combined, profile.characterLimit), cta: '' }
}

function normalizePlatforms(value) {
  const selected = Array.isArray(value) ? value : []
  const platforms = [...new Set(selected.map(item => text(item, 40)).filter(item => PLATFORM_PROFILES[item]))]
  if (!platforms.length) {
    throw new SocialOperatorError('Select at least one supported social platform.', { code: 'platform_required' })
  }
  return platforms
}

function normalizeBudget(currentBudget, requestedLimit) {
  const used = positiveNumber(currentBudget?.used)
  const reserved = positiveNumber(currentBudget?.reserved)
  const priorLimit = positiveNumber(currentBudget?.limit)
  const limit = requestedLimit === undefined || requestedLimit === null || requestedLimit === ''
    ? (priorLimit || 10)
    : Number(requestedLimit)
  if (!Number.isFinite(limit) || limit < 1) {
    throw new SocialOperatorError('Client credit limit must be at least 1.', { code: 'invalid_budget_limit' })
  }
  if (limit < used + reserved) {
    throw new SocialOperatorError('Client credit limit cannot be lower than credits already used or reserved.', {
      code: 'budget_below_committed',
      status: 409,
      details: { limit, used, reserved },
    })
  }
  return { unit: 'credits', limit, used, reserved }
}

function budgetSnapshot(budget, estimated, actual) {
  return {
    unit: 'credits',
    limit: budget.limit,
    estimated,
    actual,
    clientUsed: budget.used,
    clientReserved: budget.reserved,
    remaining: Math.max(0, budget.limit - budget.used - budget.reserved),
  }
}

export function buildSocialOperatorJob({
  client,
  agent,
  input = {},
  currentBudget = {},
  now = new Date(),
  makeId = prefix => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
} = {}) {
  if (!client?.id || !text(client.name)) {
    throw new SocialOperatorError('Select a valid Command Center client.', { code: 'client_required' })
  }
  if (!agent?.id || !text(agent.name)) {
    throw new SocialOperatorError('Assign a valid Command Center agent.', { code: 'agent_required' })
  }
  const topic = text(input.topic, 500)
  if (!topic) throw new SocialOperatorError('Add a source topic or brief.', { code: 'topic_required' })

  const platforms = normalizePlatforms(input.platforms)
  const approvalRule = input.approvalRule === 'guarded_auto' ? 'guarded_auto' : 'approval_required'
  const textVariantCredits = platforms.length * SOCIAL_OPERATOR_CREDIT_PER_VARIANT
  const researchCredits = input.researchMode === 'trend_research' ? 10 : 0
  const mediaCredits = input.mediaMode === 'generate_one'
    ? 25
    : input.mediaMode === 'generate_per_platform' ? platforms.length * 25 : 0
  const estimated = textVariantCredits + researchCredits + mediaCredits
  const budget = normalizeBudget(currentBudget, input.budgetLimit)
  const available = Math.max(0, budget.limit - budget.used - budget.reserved)
  if (estimated > available) {
    throw new SocialOperatorError(`This job needs ${estimated} credits, but only ${available} are available.`, {
      code: 'budget_limit_exceeded',
      status: 409,
      details: { estimated, available, limit: budget.limit, used: budget.used, reserved: budget.reserved },
    })
  }

  const autoApproved = approvalRule === 'guarded_auto'
  // Variant generation has already incurred provider work. Settle usage now;
  // editorial approval controls publishing, not billing.
  const nextBudget = { ...budget, used: budget.used + estimated }
  const sourceText = text(input.sourceText, 2000)
  const media = input.media?.url ? {
    id: text(input.media.id, 120),
    name: text(input.media.name || input.media.title, 160),
    url: text(input.media.url, 1000),
    type: text(input.media.type, 60),
  } : null
  const channels = Array.isArray(input.channels) ? input.channels.slice(0, 20).map(channel => ({
    id: text(channel?.id, 160),
    name: text(channel?.name, 160),
    identifier: text(channel?.identifier, 80),
    platform: text(channel?.platform, 80),
    provider: text(channel?.provider, 80),
    type: text(channel?.type, 80),
    profile: text(channel?.profile, 160),
    tenantId: text(channel?.tenantId, 160),
    clientId: text(channel?.clientId || channel?.client?.id, 160),
  })).filter(channel => channel.id) : []
  const createdAt = new Date(now).toISOString()
  const context = clientContext(client)
  const generatedVariants = Array.isArray(input.generatedVariants) ? input.generatedVariants : null
  const generatedByPlatform = new Map((generatedVariants || []).map(variant => [text(variant?.platform, 40), variant]))
  if (generatedVariants) {
    const missing = platforms.filter(platform => !generatedByPlatform.has(platform))
    if (missing.length || generatedByPlatform.size !== platforms.length) {
      throw new SocialOperatorError('Generated variants must match the selected platform set.', {
        code: 'generated_variant_mismatch',
        status: 502,
        details: { missing, expected: platforms },
      })
    }
  }
  const posts = platforms.map((platform, index) => {
    const generated = generatedByPlatform.get(platform)
    const copy = generated ? {
      hook: contentText(generated.hook, 1200),
      body: contentText(generated.body, PLATFORM_PROFILES[platform].characterLimit),
      cta: contentText(generated.cta, 800),
    } : platformCopy({ platform, client, topic, sourceText })
    const profile = PLATFORM_PROFILES[platform]
    return {
      id: makeId('cpost'),
      sequence: index + 1,
      platform,
      format: profile.format,
      status: autoApproved ? 'approved' : 'draft',
      scheduledFor: new Date(new Date(now).getTime() + (index + 1) * 30 * 60 * 1000).toISOString(),
      creationEndpoint: text(input.creationEndpoint, 60) || 'openai',
      hook: copy.hook,
      body: copy.body,
      cta: copy.cta,
      assetBrief: generated?.assetBrief
        ? contentText(generated.assetBrief, 1000)
        : `Create a ${profile.style} ${profile.format} visual for ${client.name} about ${topic}. ${context || 'Use the client brand context.'} Image only — no text, words, letters, captions, logos, or watermarks.`,
      assetAltText: generated?.altText ? contentText(generated.altText, 500) : '',
      assetStatus: media ? 'attached' : 'needed',
      assetUrl: media?.url || '',
      assetMediaId: media?.id || '',
      assetProvider: text(input.media?.provider, 80),
      assetModel: text(input.media?.model, 160),
      assetVendor: text(input.media?.vendor, 120),
      assetCost: positiveNumber(input.media?.costUsd),
      mediaId: media?.id || '',
      notes: `Assigned to ${agent.name}.`,
      operatorVariant: {
        characterLimit: profile.characterLimit,
        style: profile.style,
        source: generated ? 'model' : 'legacy_template',
      },
    }
  })

  const campaign = {
    id: makeId('camp'),
    kind: 'social_operator',
    name: text(input.name, 180) || `${client.name} — ${topic}`,
    tenantId: text(input.tenantId, 160) || channels[0]?.tenantId || 'farrington-development',
    offerId: 'social-operator',
    offerLabel: 'Social Operator',
    objective: text(input.objective, 300) || `Publish a platform-specific client update about ${topic}`,
    audience: text(input.audience, 180) || (client.industry ? `${client.industry} customers` : 'the selected client audience'),
    market: text(input.market || client.address, 180) || 'the client market',
    platforms,
    cadenceId: 'operator-one-off',
    creationEndpoint: text(input.creationEndpoint, 60) || 'openai',
    status: autoApproved ? 'armed' : 'draft',
    autopilot: {
      mode: approvalRule,
      enabled: autoApproved,
      guardrail: approvalRule,
      destination: 'Postiz delivery rail',
    },
    socialOperator: {
      client: { id: client.id, name: text(client.name, 160), industry: text(client.industry, 120) },
      agent: { id: agent.id, name: text(agent.name, 160), title: text(agent.title || agent.role, 160) },
      source: { type: text(input.sourceType, 40) || (media ? 'media' : 'topic'), topic, content: sourceText },
      researchMode: input.researchMode === 'trend_research' ? 'trend_research' : 'client_context',
      research: input.research && typeof input.research === 'object' ? input.research : null,
      mediaMode: ['generate_one', 'generate_per_platform'].includes(input.mediaMode) ? input.mediaMode : (media ? 'existing' : 'text_only'),
      approvalRule,
      jobStatus: autoApproved ? 'approved' : 'awaiting_approval',
      channels,
      budget: budgetSnapshot(nextBudget, estimated, estimated),
      creditBreakdown: { textVariants: textVariantCredits, research: researchCredits, media: mediaCredits },
      generation: input.generation && typeof input.generation === 'object'
        ? input.generation
        : { mode: 'legacy_template', provider: '', model: '', usage: null, cost: null },
      usageReservationId: text(input.usageReservationId, 200),
      usage: input.usage && typeof input.usage === 'object' ? input.usage : null,
      approvedAt: autoApproved ? createdAt : null,
    },
    posts,
    createdAt,
    updatedAt: createdAt,
  }

  return { campaign, budget: nextBudget }
}

export function approveSocialOperatorJob({ campaign, currentBudget = {}, now = new Date() } = {}) {
  if (campaign?.kind !== 'social_operator') {
    throw new SocialOperatorError('Social Operator job not found.', { code: 'job_not_found', status: 404 })
  }
  if (campaign.socialOperator?.jobStatus === 'approved') return { campaign, budget: currentBudget }
  const estimated = positiveNumber(campaign.socialOperator?.budget?.estimated)
  const actual = positiveNumber(campaign.socialOperator?.budget?.actual)
  const budget = normalizeBudget(currentBudget, currentBudget?.limit || campaign.socialOperator?.budget?.limit)
  let nextBudget = budget
  if (actual < estimated) {
    // Compatibility for awaiting jobs created before generation-time settlement.
    const reservedWithoutJob = Math.max(0, budget.reserved - estimated)
    const available = Math.max(0, budget.limit - budget.used - reservedWithoutJob)
    if (estimated > available) {
      throw new SocialOperatorError('Approval would exceed the client credit limit.', {
        code: 'budget_limit_exceeded',
        status: 409,
        details: { estimated, available, limit: budget.limit },
      })
    }
    nextBudget = { ...budget, used: budget.used + estimated, reserved: reservedWithoutJob }
  }
  const approvedAt = new Date(now).toISOString()
  return {
    budget: nextBudget,
    campaign: {
      ...campaign,
      status: 'armed',
      autopilot: { ...(campaign.autopilot || {}), enabled: true, mode: 'manual_approved' },
      socialOperator: {
        ...campaign.socialOperator,
        jobStatus: 'approved',
        approvedAt,
        budget: budgetSnapshot(nextBudget, estimated, estimated),
      },
      posts: (campaign.posts || []).map(post => post.status === 'scheduled' ? post : { ...post, status: 'approved' }),
      updatedAt: approvedAt,
    },
  }
}
