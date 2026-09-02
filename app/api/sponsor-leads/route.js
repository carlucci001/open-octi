// Compatibility bridge: SponsorCRM.js expects the old sponsor-leads schema (bn, cn, ph, em, st, etc).
// Data now lives in the unified leads.json. This route translates both directions so SponsorCRM
// keeps working identically while sharing storage with the new Leads tab.
import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, findById } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Map new canonical status → old granular status (fallback when legacy.originalStatus missing)
function canonicalToLegacy(status) {
  switch (status) {
    case 'new':         return 'prospect'
    case 'contacted':   return 'called'
    case 'qualified':   return 'interested'
    case 'unqualified': return 'declined'
    case 'converted':   return 'closed'
    default:            return 'prospect'
  }
}

// Map old granular status → new canonical
function legacyToCanonical(st) {
  switch (st) {
    case 'prospect':    return 'new'
    case 'called':
    case 'voicemail':
    case 'email_sent':
    case 'follow_up':   return 'contacted'
    case 'interested':  return 'qualified'
    case 'closed':      return 'qualified' // formal conversion happens via Qualify wizard
    case 'declined':    return 'unqualified'
    default:            return 'new'
  }
}

// Translate a new-shape lead into old sponsor-lead shape
function toOldShape(lead) {
  const legacy = lead.legacy || {}
  // Parse notes: stored as string in new schema, legacy.originalNotes preserves the original array
  let notes = legacy.originalNotes
  if (!Array.isArray(notes)) {
    if (typeof lead.notes === 'string' && lead.notes.trim()) {
      notes = [{ text: lead.notes, at: lead.createdAt }]
    } else {
      notes = []
    }
  }
  return {
    id: lead.id,
    bn: lead.businessName || '',
    cn: lead.name || '',
    ph: lead.phone || '',
    em: lead.email || '',
    web: lead.website || lead.web || '',
    address: lead.address || '',
    researchSummary: lead.researchSummary || legacy.researchSummary || '',
    st: legacy.originalStatus || canonicalToLegacy(lead.status),
    campaign: legacy.campaign || lead.suggestedPipelineId || 'sponsors',
    lt: legacy.lt || '',
    mk: legacy.mk || '',
    cat: legacy.cat || '',
    bt: legacy.bt || '',
    notes,
    ts: legacy.ts || lead.createdAt,
    lc: legacy.lc || '',
    source: lead.source || '',
    leadListId: lead.leadListId || lead.suggestedPipelineId || '',
    suggestedPipelineId: lead.suggestedPipelineId || '',
    opportunityId: lead.opportunityId || lead.convertedToOpportunityId || '',
    serviceLine: lead.serviceLine || '',
    productOpportunity: lead.productOpportunity || '',
    searchAliases: Array.isArray(lead.searchAliases) ? lead.searchAliases : [],
    tags: Array.isArray(lead.tags) ? lead.tags : [],
    // Preserve the new id under the same field name used by old code
  }
}

// Translate old-shape input into a patch to apply to a lead
function oldUpdateToPatch(patch, existing) {
  const nextLegacy = { ...(existing?.legacy || {}) }
  const out = {}
  if (patch.bn !== undefined) out.businessName = patch.bn
  if (patch.cn !== undefined) out.name = patch.cn
  if (patch.ph !== undefined) out.phone = patch.ph
  if (patch.em !== undefined) out.email = patch.em
  if (patch.web !== undefined) out.website = patch.web
  if (patch.website !== undefined) out.website = patch.website
  if (patch.address !== undefined) out.address = patch.address
  if (patch.researchSummary !== undefined) {
    out.researchSummary = patch.researchSummary
    nextLegacy.researchSummary = patch.researchSummary
  }
  if (patch.st !== undefined) {
    nextLegacy.originalStatus = patch.st
    out.status = legacyToCanonical(patch.st)
  }
  if (patch.campaign !== undefined) nextLegacy.campaign = patch.campaign
  if (patch.lt !== undefined) nextLegacy.lt = patch.lt
  if (patch.mk !== undefined) nextLegacy.mk = patch.mk
  if (patch.cat !== undefined) nextLegacy.cat = patch.cat
  if (patch.bt !== undefined) nextLegacy.bt = patch.bt
  if (patch.lc !== undefined) nextLegacy.lc = patch.lc
  if (patch.notes !== undefined) {
    nextLegacy.originalNotes = patch.notes
    // Also flatten to new schema's string notes
    out.notes = Array.isArray(patch.notes)
      ? patch.notes.map(n => typeof n === 'string' ? n : (n.text || '')).filter(Boolean).join('\n\n')
      : String(patch.notes || '')
  }
  out.legacy = nextLegacy
  return out
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const leads = loadAll('leads').map(toOldShape)
  // SponsorCRM historically accepts either an array OR { leads: [] }. Return the array shape.
  return NextResponse.json(leads)
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add' || body.lead && !body.action) {
    const src = body.lead || body
    const canonical = legacyToCanonical(src.st)
    const rec = create('leads', {
      name: src.cn || '',
      email: src.em || '',
      phone: src.ph || '',
      businessName: src.bn || '',
      title: '',
      source: src.lt === 'newspaper' || src.lt === 'tda' ? 'cold_list' : 'cold_call',
      status: canonical,
      suggestedPipelineId: src.campaign || 'sponsors',
      notes: Array.isArray(src.notes) ? src.notes.map(n => typeof n === 'string' ? n : (n.text || '')).filter(Boolean).join('\n\n') : (src.notes || ''),
      tags: [],
      legacy: {
        source: 'sponsor-crm',
        originalStatus: src.st,
        campaign: src.campaign,
        lt: src.lt, mk: src.mk, cat: src.cat, bt: src.bt,
        ts: src.ts, lc: src.lc,
        originalNotes: Array.isArray(src.notes) ? src.notes : (src.notes ? [{ text: src.notes, at: new Date().toISOString() }] : []),
      },
    })
    return NextResponse.json({ ok: true, lead: toOldShape(rec) })
  }

  if (body.action === 'update') {
    const id = body.id || body.lead?.id
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const existing = findById('leads', id)
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const patch = oldUpdateToPatch(body.patch || body.lead || body, existing)
    const rec = update('leads', id, patch)
    return NextResponse.json({ ok: true, lead: toOldShape(rec) })
  }

  if (body.action === 'add_note') {
    const id = body.id
    const existing = findById('leads', id)
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const legacy = { ...(existing.legacy || {}) }
    const notes = Array.isArray(legacy.originalNotes) ? [...legacy.originalNotes] : []
    notes.push({ text: body.text || body.note || '', at: new Date().toISOString() })
    legacy.originalNotes = notes
    const rec = update('leads', id, {
      legacy,
      notes: notes.map(n => typeof n === 'string' ? n : (n.text || '')).filter(Boolean).join('\n\n'),
    })
    return NextResponse.json({ ok: true, lead: toOldShape(rec) })
  }

  if (body.action === 'delete') {
    remove('leads', body.id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_update_status') {
    const ids = new Set(body.ids || [])
    const newSt = body.status
    for (const id of ids) {
      const existing = findById('leads', id)
      if (!existing) continue
      const legacy = { ...(existing.legacy || {}), originalStatus: newSt }
      update('leads', id, { status: legacyToCanonical(newSt), legacy })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    const ids = body.ids || []
    for (const id of ids) remove('leads', id)
    return NextResponse.json({ ok: true })
  }

  // Catch-all: if nothing matched but there's a patch with id, treat as update
  if (body.id && (body.patch || body.lead)) {
    const existing = findById('leads', body.id)
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const patch = oldUpdateToPatch(body.patch || body.lead, existing)
    const rec = update('leads', body.id, patch)
    return NextResponse.json({ ok: true, lead: toOldShape(rec) })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

export async function DELETE(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const id = body.id
  if (id) remove('leads', id)
  return NextResponse.json({ ok: true })
}
