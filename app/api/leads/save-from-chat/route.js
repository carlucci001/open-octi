// Deterministic lead-save endpoint. Called by the ChatPanel "Save lead" button
// when an assistant message contains a {"draftLead": {...}} JSON block.
// No agent / LLM in the loop — the button hands the already-extracted fields
// straight to this endpoint, which writes the lead atomically.
import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { getCurrentUser } from '@/lib/auth'
import { findExistingLeadMatch, duplicateLeadResponse } from '@/lib/leadDedupe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function genLeadId() {
  return 'ld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export async function POST(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }

  const draft = (body && body.draftLead) || body || {}
  const name = (draft.name || '').toString().trim()
  const businessName = (draft.businessName || '').toString().trim()
  if (!name && !businessName) {
    return NextResponse.json({ ok: false, error: 'name or businessName required' }, { status: 400 })
  }

  const blob = readData('leads.json') || { leads: [] }
  const leads = Array.isArray(blob) ? blob : (blob.leads || [])
  const existingMatch = findExistingLeadMatch(draft, leads)
  if (existingMatch) {
    return NextResponse.json(duplicateLeadResponse(existingMatch), { status: 409 })
  }

  const now = new Date().toISOString()
  const lead = {
    id: genLeadId(),
    createdAt: now,
    updatedAt: now,
    name,
    email: (draft.email || '').toString().trim(),
    phone: (draft.phone || '').toString().trim(),
    businessName,
    website: (draft.website || draft.url || '').toString().trim(),
    title: (draft.title || '').toString().trim(),
    source: (draft.source || 'inbound').toString().trim(),
    status: (draft.status || 'new').toString().trim(),
    suggestedPipelineId: (draft.suggestedPipelineId || '').toString().trim(),
    notes: (draft.notes || '').toString(),
    sourceUrl: (draft.sourceUrl || '').toString().trim(),
    capturedBy: me.id,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
  }

  leads.push(lead)
  const out = Array.isArray(blob) ? leads : { ...blob, leads, lastUpdated: now }
  writeData('leads.json', out)

  return NextResponse.json({ ok: true, lead })
}
