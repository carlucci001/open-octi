// Unified Leads API. Replaces the prior dev-leads schema.
// Leads are raw inquiries. On "qualify" a lead spawns/merges an Account + Contact + Opportunity
// in a chosen pipeline, with a dedupe check against existing accounts.
import { NextResponse } from 'next/server'
import {
  loadAll, create, update, remove, removeMany, findById,
  findAccountMatches, findContactByEmail, logActivity,
} from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { findExistingLeadMatch, duplicateLeadResponse } from '@/lib/leadDedupe'
import { loadLeadLists, userCanAccessLead } from '@/lib/leadLists'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeLeadTimestamps(lead = {}) {
  const receivedAt =
    lead.receivedAt ||
    lead.createdAt ||
    lead.inboundReceivedAt ||
    lead.submittedAt ||
    lead.importedAt ||
    lead.created_at ||
    lead.legacy?.receivedAt ||
    lead.legacy?.ts ||
    lead.legacy?.createdAt ||
    lead.legacy?.created_at ||
    lead.updatedAt ||
    null

  return {
    ...lead,
    receivedAt,
    createdAt: lead.createdAt || receivedAt,
    updatedAt: lead.updatedAt || receivedAt,
  }
}

// `legacy` is raw import residue kept for provenance. Across ~6.5k leads it was
// 40% of the /api/leads payload (1.3MB), but the list UI does read three scalars
// out of it — LeadsManager brand/campaign classification, Dashboard
// classifyCampaign/isDevLead. So slim it to those rather than dropping it.
// Legacy timestamps are already collapsed into receivedAt/createdAt/updatedAt by
// normalizeLeadTimestamps upstream, and the client checks those first.
// The single-lead GET (?id=) still returns `legacy` in full.
const LEGACY_LIST_KEYS = ['campaign', 'source', 'lt']

function stripListOnlyFields(lead = {}) {
  const legacy = lead.legacy
  if (!legacy || typeof legacy !== 'object') return lead
  const slim = {}
  for (const key of LEGACY_LIST_KEYS) {
    const value = legacy[key]
    if (value !== undefined && value !== null && value !== '') slim[key] = value
  }
  if (Object.keys(slim).length === 0) {
    const { legacy: _drop, ...rest } = lead
    return rest
  }
  return { ...lead, legacy: slim }
}

function leadStatusPatch(existing = {}, incoming = {}) {
  const now = new Date().toISOString()
  const patch = { ...incoming }
  if (incoming.status && incoming.status !== existing.status) {
    patch.statusChangedAt = now
    if (incoming.status === 'contacted') {
      patch.contactedAt = now
      patch.lastContactedAt = now
      patch.lastEngagedAt = now
    }
    if (incoming.status === 'qualified') {
      patch.qualifiedAt = now
      patch.lastEngagedAt = now
    }
    if (incoming.status === 'converted') {
      patch.convertedAt = patch.convertedAt || now
      patch.lastEngagedAt = now
    }
  }
  return patch
}

function leadCreatePayload(incoming = {}) {
  const receivedAt = incoming.receivedAt || incoming.createdAt || incoming.inboundReceivedAt || incoming.submittedAt || incoming.importedAt || incoming.legacy?.ts || new Date().toISOString()
  return {
    name: '',
    email: '',
    phone: '',
    businessName: '',
    website: '',
    title: '',
    source: 'cold_call',
    status: 'new',
    leadListId: incoming.leadListId || incoming.suggestedPipelineId || null,
    suggestedPipelineId: null,
    opportunityId: null,
    notes: '',
    tags: [],
    ...incoming,
    receivedAt,
    createdAt: incoming.createdAt || receivedAt,
  }
}

function leadSummary(lead = {}) {
  return {
    id: lead.id,
    name: lead.name || '',
    businessName: lead.businessName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    website: lead.website || '',
    source: lead.source || '',
    status: lead.status || '',
  }
}

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const leadLists = loadLeadLists()
  const id = searchParams.get('id')
  if (id) {
    const rec = findById('leads', id)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!userCanAccessLead(user, rec, leadLists)) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ lead: normalizeLeadTimestamps(rec) })
  }
  const status = searchParams.get('status')
  const source = searchParams.get('source')
  let list = loadAll('leads')
  list = list.filter(lead => userCanAccessLead(user, lead, leadLists))
  if (status) list = list.filter(l => l.status === status)
  if (source) list = list.filter(l => l.source === source)
  return NextResponse.json({ leads: list.map(lead => stripListOnlyFields(normalizeLeadTimestamps(lead))) })
}

// A lead captured from a website arrives with a URL as its business name, which
// then becomes the account name verbatim - Carl had to rename
// 'https://sagepath-reply.com/' to 'Sage Path' by hand. Strip a bare URL down to
// a readable company name; leave anything that is already a name alone.
function accountNameFromLead(raw) {
  const value = String(raw || '').trim()
  if (!value) return 'New Account'
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(value)
  if (!looksLikeUrl) return value
  let host = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
  host = host.replace(/\.(com|net|org|io|co|us|biz|info|dev|app|ai)$/i, '')
  const words = host.split(/[.\-_]+/).filter(Boolean)
  if (!words.length) return value
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const incoming = body.lead || {}
    const existingMatch = findExistingLeadMatch(incoming, loadAll('leads'))
    if (existingMatch) {
      return NextResponse.json(duplicateLeadResponse(existingMatch), { status: 409 })
    }
    const rec = create('leads', leadCreatePayload(incoming))
    logActivity({ type: 'note', subject: 'Lead created', linkedTo: { leadId: rec.id } })
    return NextResponse.json({ ok: true, lead: normalizeLeadTimestamps(rec) })
  }

  if (body.action === 'bulk_add') {
    const incomingLeads = Array.isArray(body.leads) ? body.leads : []
    if (!incomingLeads.length) {
      return NextResponse.json({ ok: false, error: 'leads array required' }, { status: 400 })
    }

    const existingLeads = loadAll('leads')
    const created = []
    const skipped = []

    for (const incoming of incomingLeads) {
      if (!incoming || typeof incoming !== 'object') continue
      const existingMatch = findExistingLeadMatch(incoming, existingLeads)
      if (existingMatch) {
        skipped.push({
          lead: leadSummary(incoming),
          reason: existingMatch.reason,
          existingLead: leadSummary(existingMatch.lead),
        })
        continue
      }

      const rec = create('leads', leadCreatePayload(incoming))
      existingLeads.push(rec)
      created.push(normalizeLeadTimestamps(rec))
      logActivity({ type: 'note', subject: 'Lead created', linkedTo: { leadId: rec.id } })
    }

    return NextResponse.json({ ok: true, created: created.length, skipped: skipped.length, leads: created, skippedLeads: skipped })
  }

  if (body.action === 'update') {
    const existing = findById('leads', body.lead.id)
    if (existing && !userCanAccessLead(user, existing, loadLeadLists())) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const rec = existing ? update('leads', body.lead.id, leadStatusPatch(existing, body.lead)) : null
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, lead: normalizeLeadTimestamps(rec) })
  }

  if (body.action === 'delete') {
    const lead = findById('leads', body.id)
    if (lead && !userCanAccessLead(user, lead, loadLeadLists())) return NextResponse.json({ error: 'not found' }, { status: 404 })
    remove('leads', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    const leadLists = loadLeadLists()
    const ids = (body.ids || []).filter(id => {
      const lead = findById('leads', id)
      return lead && userCanAccessLead(user, lead, leadLists)
    })
    const removed = removeMany('leads', ids)
    return NextResponse.json({ ok: true, removed })
  }

  if (body.action === 'dedupe_check') {
    const matches = findAccountMatches({ name: body.businessName, email: body.email })
    const existingContact = findContactByEmail(body.email)
    return NextResponse.json({ matches, existingContact })
  }

  if (body.action === 'qualify') {
    const lead = findById('leads', body.leadId)
    if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    if (!userCanAccessLead(user, lead, loadLeadLists())) return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    if (!body.pipelineId || !body.stageId) {
      return NextResponse.json({ error: 'pipelineId and stageId required' }, { status: 400 })
    }

    let account
    if (body.accountId) {
      account = findById('accounts', body.accountId)
      if (!account) return NextResponse.json({ error: 'accountId not found' }, { status: 404 })
    } else {
      account = create('accounts', {
        name: accountNameFromLead(lead.businessName || lead.name),
        type: 'prospect',
        stage: 'active',
        priority: 'medium',
        // Carry the prospect's website onto the account — Accounts has had a
        // website field all along; leads finally do too.
        website: lead.website || lead.web || lead.url || lead.domain || '',
        notes: lead.notes || '',
        tags: lead.tags || [],
      })
    }

    let contact = null
    if (lead.email) contact = findContactByEmail(lead.email)
    if (!contact) {
      contact = create('contacts', {
        name: lead.name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        title: lead.title || '',
        accountId: account.id,
        primary: true,
        tags: lead.tags || [],
      })
    } else if (!contact.accountId) {
      contact = update('contacts', contact.id, { accountId: account.id })
    }

    const opportunity = create('opportunities', {
      name: body.opportunityName || `${account.name} — ${body.pipelineId}`,
      accountId: account.id,
      contactId: contact.id,
      pipelineId: body.pipelineId,
      stageId: body.stageId,
      value: Number(body.value) || 0,
      probability: Number(body.probability) || 0,
      expectedClose: body.expectedClose || null,
      notes: lead.notes || '',
      tags: lead.tags || [],
      fromLeadId: lead.id,
      leadRequirementsPrompt: body.leadRequirementsPrompt || '',
      leadGeneration: body.leadGeneration || null,
    })

    update('leads', lead.id, {
      status: 'converted',
      convertedAt: new Date().toISOString(),
      statusChangedAt: new Date().toISOString(),
      qualifiedAt: new Date().toISOString(),
      lastEngagedAt: new Date().toISOString(),
      convertedToAccountId: account.id,
      convertedToAccountName: account.name,
      convertedToContactId: contact.id,
      convertedToOpportunityId: opportunity.id,
    })

    logActivity({
      type: 'lead_qualified',
      subject: `Lead qualified → ${account.name}`,
      body: `Added to pipeline "${body.pipelineId}" at stage "${body.stageId}"`,
      linkedTo: { accountId: account.id, contactId: contact.id, opportunityId: opportunity.id, leadId: lead.id },
    })

    return NextResponse.json({ ok: true, account, contact, opportunity, leadId: lead.id })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
