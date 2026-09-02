import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { create, loadAll, logActivity, update } from '@/lib/entityStore'
import { findExistingLeadMatch } from '@/lib/leadDedupe'
import { findLeadListById, leadListIdForLead } from '@/lib/leadLists'
import { requireCrmWrite } from '@/lib/permissions'
import { createSweepRunOnce, finishSweepRun, getSweepRun, reportSweepProgress } from '@/lib/lead-sweep-runs'
import { normalizeLeadClientRequestId } from '@/lib/lead-run-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/
const URL_RE = /https?:\/\/[^\s,)"']+|www\.[^\s,)"']+/i

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseProviderJson(text = '') {
  const trimmed = String(text || '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    if (fenced) return JSON.parse(fenced)
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
    throw new Error('Lead provider returned invalid JSON')
  }
}

async function askPerplexity(key, prompt) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: 'Return only valid JSON. Do not include markdown, commentary, examples, or headings.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2800,
    }),
    signal: AbortSignal.timeout(45000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Lead provider returned HTTP ${response.status}: ${text.slice(0, 180)}`)
  const data = JSON.parse(text)
  return data.choices?.[0]?.message?.content || ''
}

function normalizeCandidate(candidate = {}) {
  const organization = String(candidate.organization || candidate.businessName || candidate.name || '').trim()
  const website = String(candidate.website || candidate.url || candidate.sourceUrl || '').match(URL_RE)?.[0] || ''
  const email = String(candidate.email || '').match(EMAIL_RE)?.[0] || ''
  const phone = String(candidate.phone || '').match(PHONE_RE)?.[0] || ''
  const sourceUrl = String(candidate.sourceUrl || candidate.source || website || '').match(URL_RE)?.[0] || website
  return {
    organization,
    website,
    email,
    phone,
    sourceUrl,
    area: String(candidate.area || candidate.location || '').trim(),
    contact: String(candidate.contact || candidate.contactName || '').trim(),
    notes: String(candidate.notes || candidate.summary || '').trim(),
  }
}

function candidateRejectReason(candidate = {}) {
  const name = candidate.organization || ''
  if (name.length < 3) return 'missing organization name'
  if (/organization\s+website\s+email\s+phone/i.test(name)) return 'header row'
  if (/example|sample|placeholder/i.test(name)) return 'placeholder'
  if (!(candidate.website || candidate.email || candidate.phone || candidate.sourceUrl)) return 'missing website/email/phone/sourceUrl'
  return ''
}

function isUsableCandidate(candidate = {}) {
  return !candidateRejectReason(candidate)
}

function uniqueList(values = []) {
  return Array.from(new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean)))
}

function resultLead(lead = {}, action = 'created') {
  return {
    id: lead.id,
    action,
    businessName: lead.businessName,
    website: lead.website,
    email: lead.email,
    phone: lead.phone,
    leadListId: leadListIdForLead(lead),
    pipelineId: lead.suggestedPipelineId || '',
  }
}

function countBy(items = [], key = 'reason') {
  return items.reduce((acc, item) => {
    const value = item?.[key] || 'unknown'
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function leadCreatePayload(incoming = {}) {
  const receivedAt = incoming.receivedAt || incoming.createdAt || new Date().toISOString()
  return {
    name: '',
    email: '',
    phone: '',
    businessName: '',
    title: '',
    source: 'organization_research',
    status: 'new',
    opportunityId: null,
    notes: '',
    tags: [],
    ...incoming,
    receivedAt,
    createdAt: incoming.createdAt || receivedAt,
  }
}

function leadFromCandidate(candidate, config) {
  const area = candidate.area || config.area || 'United States'
  const campaignSlug = `${config.campaignId || 'organization-campaign'}-${slugify(config.scope === 'national' ? 'national' : area)}`
  const tags = [
    'organization-campaign',
    config.brandContext,
    config.destination,
    config.campaignTag,
    config.scope,
    slugify(area),
  ].filter(Boolean)
  return {
    name: candidate.contact || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    businessName: candidate.organization,
    website: candidate.website || '',
    sourceUrl: candidate.sourceUrl || candidate.website || '',
    source: 'organization_research',
    status: 'new',
    brandContext: config.brandContext,
    serviceLine: config.serviceLine,
    productOpportunity: config.offer,
    leadListId: config.leadListId,
    leadListName: config.leadListName,
    suggestedPipelineId: null,
    campaign: campaignSlug,
    campaignType: config.campaignType,
    leadDestination: config.destination,
    leadDestinationLabel: config.destinationLabel,
    leadSourceProvider: 'perplexity',
    leadSourceCategory: config.campaignId,
    leadSourceLocation: area,
    leadSourceQuery: config.query,
    organizationType: config.organizationType,
    organizationScope: config.scope,
    organizationRegion: config.scope === 'national' ? '' : area,
    leadQualitySpec: {
      mode: 'organization-campaign',
      generated: true,
      campaignPreset: config.campaignId,
      organizationType: config.organizationType,
      destination: config.destination,
      destinationLabel: config.destinationLabel,
      leadListId: config.leadListId,
      leadListName: config.leadListName,
      scope: config.scope,
      area,
      notes: config.notes,
    },
    tags,
    notes: [
      candidate.notes,
      `Campaign: ${config.campaignLabel}`,
      `Lead List: ${config.leadListName}`,
      `Organization type: ${config.organizationType}`,
      `Scope: ${config.scope}${area ? ` / ${area}` : ''}`,
      candidate.sourceUrl ? `Source: ${candidate.sourceUrl}` : '',
    ].filter(Boolean).join('\n'),
  }
}

function attachExistingLeadToLeadList(match, draft, config) {
  const lead = match?.lead
  if (!lead?.id) return null
  if (leadListIdForLead(lead) === config.leadListId) {
    return { action: 'already_in_lead_list', lead }
  }
  if (lead.opportunityId) return null

  const patch = {
    leadListId: config.leadListId,
    leadListName: config.leadListName,
    suggestedPipelineId: null,
    campaign: draft.campaign,
    campaignType: draft.campaignType,
    leadDestination: draft.leadDestination,
    leadDestinationLabel: draft.leadDestinationLabel,
    leadSourceProvider: draft.leadSourceProvider,
    leadSourceCategory: draft.leadSourceCategory,
    leadSourceLocation: draft.leadSourceLocation,
    leadSourceQuery: draft.leadSourceQuery,
    organizationType: draft.organizationType,
    organizationScope: draft.organizationScope,
    organizationRegion: draft.organizationRegion,
    productOpportunity: draft.productOpportunity,
    tags: uniqueList([...(lead.tags || []), ...(draft.tags || [])]),
    leadQualitySpec: {
      ...(lead.leadQualitySpec || {}),
      ...(draft.leadQualitySpec || {}),
      assignedExistingLead: true,
      matchedReason: match.reason,
    },
    updatedAt: new Date().toISOString(),
  }

  if (!lead.website && draft.website) patch.website = draft.website
  if (!lead.sourceUrl && draft.sourceUrl) patch.sourceUrl = draft.sourceUrl
  if (!lead.email && draft.email) patch.email = draft.email
  if (!lead.phone && draft.phone) patch.phone = draft.phone
  if (!lead.brandContext && draft.brandContext) patch.brandContext = draft.brandContext
  if (!lead.serviceLine && draft.serviceLine) patch.serviceLine = draft.serviceLine

  const rec = update('leads', lead.id, patch)
  return { action: 'assigned_existing', lead: rec }
}

function buildPrompt(config, searchLimit, attempt = 0, excludeNames = []) {
  const focusPrompts = [
    'Return a mix of national, state, metro, county, and regional organizations from different parts of the United States.',
    'Prioritize organizations outside the obvious national headquarters result. Include state and regional groups with public member news, events, sponsors, newsletters, or directories.',
    'Broaden to chambers, regional business councils, economic development partnerships, visitor/business alliances, and downtown/business associations that fit the campaign.',
    'Use different states and metro areas than earlier results. Favor organizations with official websites and public contact pages.',
  ]
  const exclusions = excludeNames.length
    ? `Do not include these organizations already handled: ${excludeNames.slice(-25).join('; ')}.`
    : ''
  return [
    `Find exactly ${searchLimit} distinct real organizations for a CRM lead campaign.`,
    `Organization type: ${config.organizationType}.`,
    `Campaign: ${config.campaignLabel}.`,
    `Area/scope: ${config.scope} ${config.area || 'United States'}.`,
    `Search query theme: ${config.query}.`,
    `Quality notes: ${config.notes || 'Prefer official organization websites and direct contact pages.'}`,
    focusPrompts[attempt % focusPrompts.length],
    exclusions,
    'Return a JSON array only. Each object must have: organization, website, email, phone, area, contact, sourceUrl, notes.',
    `Return at least ${Math.min(searchLimit, 12)} objects when organizations exist. Do not stop after one result.`,
    'Use official organization websites or contact pages for sourceUrl. Leave email, phone, or contact blank if not found.',
    'Do not include headers, placeholders, examples, associations without a public website, or businesses that are not organizations.',
  ].filter(Boolean).join('\n')
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const clientRequestId = normalizeLeadClientRequestId(body.clientRequestId)
  const limit = Math.min(Math.max(Number(body.limit || 5), 1), 25)
  const leadListId = String(body.leadListId || body.pipelineId || '').trim()
  const leadList = leadListId ? findLeadListById(leadListId) : null
  if (!leadList) return NextResponse.json({ ok: false, error: 'Lead list is required' }, { status: 400 })

  const cred = getCred('perplexity')
  if (!cred?.key) return NextResponse.json({ ok: false, error: 'Perplexity credential is missing from Command Center vault' }, { status: 400 })

  const config = {
    campaignId: String(body.campaignId || 'organization-campaign'),
    campaignLabel: String(body.campaignLabel || 'Organization campaign'),
    campaignTag: String(body.campaignTag || 'organization'),
    organizationType: String(body.organizationType || 'Organization'),
    query: String(body.query || ''),
    scope: String(body.scope || 'national'),
    area: String(body.area || 'United States'),
    notes: String(body.notes || ''),
    offer: String(body.offer || ''),
    destination: String(body.destination || body.brandContext || 'farrington_dev'),
    destinationLabel: String(body.destinationLabel || body.destination || 'CRM'),
    brandContext: String(body.brandContext || body.destination || 'farrington_dev'),
    serviceLine: String(body.serviceLine || 'crm-command-center'),
    campaignType: String(body.campaignType || body.brandContext || 'farrington_dev'),
    leadListId: leadList.id,
    leadListName: leadList.name || leadList.id,
  }

  // Up to four sequential Perplexity passes at a 45s timeout each puts the
  // worst case near 180s — past Cloudflare's 100s origin limit, which surfaced
  // in the browser as a red gateway 5xx while the server kept creating leads.
  // Start the work, return a run record, let the client poll.
  const startedBy = user?.email || user?.name || 'operator'
  const { run, created } = createSweepRunOnce({
    kind: 'organization',
    stepsTotal: 4,
    startedBy,
    params: {
      limit,
      leadListId: leadList.id,
      leadListName: config.leadListName,
      campaign: config.campaignLabel,
      scope: config.scope,
      area: config.area,
      clientRequestId: clientRequestId || null,
      // Replay metadata: the exact Leads Lab form state behind this run, so
      // "Run again" can restore it. Never read by the pipeline.
      form: body.form && typeof body.form === 'object' && !Array.isArray(body.form) ? body.form : null,
    },
  })

  if (!created) {
    console.log(`[leads-lab] replay request=${clientRequestId} run=${run.id} kind=organization status=${run.status}`)
    return NextResponse.json({ ok: true, run, replayed: true })
  }

  console.log(`[leads-lab] accepted request=${clientRequestId || 'none'} run=${run.id} kind=organization`)

  executeOrganizationCampaign({
    config,
    cred,
    limit,
    leadList,
    onProgress: update => reportSweepProgress(run.id, update),
  })
    .then(result => {
      const finished = finishSweepRun(run.id, { status: 'completed', result })
      console.log(`[leads-lab] completed request=${clientRequestId || 'none'} run=${run.id} kind=organization created=${Number(result?.created || 0)} persisted=${Boolean(finished)}`)
      return finished
    })
    .catch(err => {
      const message = err?.message || 'Organization lead generation failed'
      const finished = finishSweepRun(run.id, { status: 'failed', error: message })
      console.error(`[leads-lab] failed request=${clientRequestId || 'none'} run=${run.id} kind=organization persisted=${Boolean(finished)} error=${message}`)
      return finished
    })
    // Terminal guard: nothing beyond this point may reject unhandled.
    .catch(() => {})

  await new Promise(resolve => setTimeout(resolve, 250))

  return NextResponse.json({ ok: true, run: getSweepRun(run.id) || run }, { status: 202 })
}

async function executeOrganizationCampaign({ config, cred, limit, leadList, onProgress = () => {} }) {
  const existingLeads = loadAll('leads')
  const created = []
  const assigned = []
  const alreadyInPipeline = []
  const skipped = []
  const rejected = []
  const providerStats = []
  const seen = new Set()
  const handledNames = []
  const replaceExistingLead = lead => {
    const idx = existingLeads.findIndex(item => item.id === lead.id)
    if (idx >= 0) existingLeads[idx] = lead
    else existingLeads.push(lead)
  }

  for (let attempt = 0; created.length + assigned.length + alreadyInPipeline.length < limit && attempt < 4; attempt += 1) {
    const remaining = limit - created.length - assigned.length - alreadyInPipeline.length
    const searchLimit = Math.min(Math.max(remaining * 4, limit + 8), 45)
    onProgress({
      step: attempt + 1,
      stepsTotal: 4,
      phase: 'sourcing',
      phaseLabel: `Researching organizations — pass ${attempt + 1}, ${limit - remaining} of ${limit} filled`,
    })
    let rawList = []
    let candidates = []
    try {
      const prompt = buildPrompt(config, searchLimit, attempt, handledNames)
      const content = await askPerplexity(cred.key, prompt)
      const rawCandidates = parseProviderJson(content)
      rawList = Array.isArray(rawCandidates) ? rawCandidates : rawCandidates?.leads || []
      const normalized = rawList.map(normalizeCandidate)
      const rejectedThisAttempt = normalized
        .map(candidate => ({ businessName: candidate.organization, reason: candidateRejectReason(candidate) }))
        .filter(item => item.reason)
      rejected.push(...rejectedThisAttempt)
      candidates = normalized.filter(isUsableCandidate)
      providerStats.push({
        attempt: attempt + 1,
        requested: searchLimit,
        raw: rawList.length,
        usable: candidates.length,
        rejected: rejectedThisAttempt.length,
      })
    } catch (error) {
      providerStats.push({ attempt: attempt + 1, error: error.message || 'Provider failed' })
      if (created.length + assigned.length + alreadyInPipeline.length === 0) throw error
      break
    }

    for (const candidate of candidates) {
      if (created.length + assigned.length + alreadyInPipeline.length >= limit) break
      const identity = [candidate.organization, candidate.website, candidate.email, candidate.phone].join('|').toLowerCase()
      if (seen.has(identity)) continue
      seen.add(identity)
      handledNames.push(candidate.organization)

      const draft = leadFromCandidate(candidate, config)
      const existingMatch = findExistingLeadMatch(draft, existingLeads)
      if (existingMatch) {
        const attached = attachExistingLeadToLeadList(existingMatch, draft, config)
        if (attached?.action === 'assigned_existing') {
          replaceExistingLead(attached.lead)
          assigned.push(resultLead(attached.lead, attached.action))
          logActivity({ type: 'note', subject: 'Organization lead assigned to lead list', linkedTo: { leadId: attached.lead.id } })
          continue
        }
        if (attached?.action === 'already_in_lead_list') {
          alreadyInPipeline.push(resultLead(attached.lead, attached.action))
          continue
        }
        skipped.push({
          businessName: draft.businessName,
          reason: existingMatch.reason,
          matchedLeadId: existingMatch.lead?.id || '',
          matchedLeadListId: leadListIdForLead(existingMatch.lead),
        })
        continue
      }
      const rec = create('leads', leadCreatePayload(draft))
      existingLeads.push(rec)
      created.push(resultLead(rec, 'created'))
      logActivity({ type: 'note', subject: 'Organization lead generated', linkedTo: { leadId: rec.id } })
    }
  }

  const fulfilled = created.length + assigned.length + alreadyInPipeline.length
  console.info('[organization-campaign]', JSON.stringify({
    requested: limit,
    fulfilled,
    created: created.length,
    assigned: assigned.length,
    alreadyInPipeline: alreadyInPipeline.length,
    skipped: skipped.length,
    rejected: rejected.length,
    leadListId: leadList.id,
    campaignId: config.campaignId,
    providerStats,
  }))

  onProgress({ step: 4, stepsTotal: 4, phase: 'done', phaseLabel: 'Wrapping up' })

  return {
    requested: limit,
    fulfilled,
    found: seen.size,
    created: created.length,
    assigned: assigned.length,
    alreadyInPipeline: alreadyInPipeline.length,
    skipped: skipped.length,
    rejected: rejected.length,
    leadList: { id: leadList.id, name: leadList.name || leadList.id },
    pipeline: { id: leadList.id, name: leadList.name || leadList.id },
    leads: [...created, ...assigned, ...alreadyInPipeline],
    skippedLeads: skipped,
    rejectedLeads: rejected.slice(0, 20),
    skipReasons: countBy(skipped),
    rejectionReasons: countBy(rejected),
    providerStats,
  }
}
