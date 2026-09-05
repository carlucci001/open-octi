import { loadAll, update, remove } from '@/lib/entityStore'

// ── Tool definitions (shared schema) ──
export const TOOLS = [
  {
    name: 'find_lead',
    description: 'Search sponsor/CRM leads by business name. Returns matching leads with id, name, phone, status, campaign.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Business name substring to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'update_lead',
    description: 'Update fields on a sponsor/CRM lead by id. Fields: status (prospect, called, voicemail, interested, follow_up, closed, declined), phone, email, website, address, contact_name, notes (appends a dated note).',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        status: { type: 'string', enum: ['prospect', 'called', 'voicemail', 'interested', 'email_sent', 'follow_up', 'closed', 'declined'] },
        phone: { type: 'string' },
        email: { type: 'string' },
        website: { type: 'string' },
        address: { type: 'string' },
        contact_name: { type: 'string' },
        note: { type: 'string', description: 'Add a timestamped note to this lead' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'log_call',
    description: 'Log a call attempt for a sponsor/CRM lead.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        outcome: { type: 'string', enum: ['no_answer', 'voicemail', 'pitched', 'interested', 'declined', 'closed'] },
        note: { type: 'string' },
      },
      required: ['lead_id', 'outcome'],
    },
  },
  {
    name: 'delete_lead',
    description: 'Delete a sponsor/CRM lead by id. Confirm with user before calling.',
    input_schema: {
      type: 'object',
      properties: { lead_id: { type: 'string' } },
      required: ['lead_id'],
    },
  },
  {
    name: 'draft_email',
    description: 'Generate email body text tailored to a specific lead. Returns the draft text. User can review & send manually. Does NOT send.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        purpose: { type: 'string', description: 'e.g. "follow-up", "proposal", "reactivation"' },
      },
      required: ['lead_id', 'purpose'],
    },
  },
  {
    name: 'list_top_priority_leads',
    description: 'Return the top leads Carl should focus on today. Prioritizes interested/follow_up that haven\'t been touched recently.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 5 } },
    },
  },
]

// ── Lead helpers ──
function sponsorShape(lead) {
  return {
    id: lead.id,
    bn: lead.businessName || lead.bn || '',
    cn: lead.name || lead.cn || '',
    ph: lead.phone || lead.ph || '',
    em: lead.email || lead.em || '',
    web: lead.website || lead.web || '',
    address: lead.address || '',
    st: lead.status || lead.st || 'prospect',
    campaign: lead.source || lead.campaign || 'leads',
    lc: lead.updatedAt || lead.lastContactAt || '',
    notes: Array.isArray(lead.notes) ? lead.notes : [],
    calls: Array.isArray(lead.calls) ? lead.calls : [],
  }
}

function loadSponsors() {
  return loadAll('leads').map(sponsorShape)
}

function patchLeadFromSponsorInput(input, existing = {}) {
  const patch = {}
  if (input.status) patch.status = input.status
  if (input.phone) patch.phone = input.phone
  if (input.email) patch.email = input.email
  if (input.website) patch.website = input.website
  if (input.address) patch.address = input.address
  if (input.contact_name) patch.name = input.contact_name
  if (input.note) {
    const current = Array.isArray(existing.notes) ? existing.notes : []
    patch.notes = [...current, { t: input.note, d: new Date().toISOString() }]
  }
  return patch
}

// ── Tool executor ──
export async function executeTool(name, input) {
  try {
    if (name === 'find_lead') {
      const arr = loadSponsors()
      const q = (input.query || '').toLowerCase()
      const matches = arr.filter(l => (l.bn || '').toLowerCase().includes(q)).slice(0, 10)
      return { results: matches.map(l => ({ id: l.id, name: l.bn, phone: l.ph, email: l.em, status: l.st, campaign: l.campaign || 'sponsors' })) }
    }
    if (name === 'update_lead') {
      const lead = loadAll('leads').find(l => l.id === input.lead_id)
      if (!lead) return { error: 'Lead not found' }
      const patch = patchLeadFromSponsorInput(input, lead)
      if (!Object.keys(patch).length) return { ok: true, updated: [] }
      const saved = update('leads', input.lead_id, patch)
      return { ok: Boolean(saved), updated: Object.keys(patch) }
    }
    if (name === 'log_call') {
      const lead = loadAll('leads').find(l => l.id === input.lead_id)
      if (!lead) return { error: 'Lead not found' }
      const entry = { d: new Date().toISOString(), outcome: input.outcome, note: input.note || '', scriptTag: 'A' }
      const saved = update('leads', input.lead_id, { calls: [...(lead.calls || []), entry], lastContactAt: new Date().toISOString() })
      return { ok: Boolean(saved), outcome: input.outcome }
    }
    if (name === 'delete_lead') {
      const ok = remove('leads', input.lead_id)
      if (!ok) return { error: 'Lead not found' }
      return { ok: true }
    }
    if (name === 'draft_email') {
      const arr = loadSponsors()
      const lead = arr.find(l => l.id === input.lead_id)
      if (!lead) return { error: 'Lead not found' }
      return { draft: `Generated offline — chat will produce the actual email copy based on lead context for ${lead.bn} with purpose: ${input.purpose}. Lead data: name=${lead.bn}, contact=${lead.cn || 'unknown'}, campaign=${lead.campaign || 'sponsors'}, status=${lead.st}.`, lead_name: lead.bn }
    }
    if (name === 'list_top_priority_leads') {
      const arr = loadSponsors()
      const priority = arr.filter(l => ['interested', 'follow_up', 'called', 'voicemail'].includes(l.st))
      priority.sort((a, b) => (a.lc || '').localeCompare(b.lc || ''))
      const limit = input.limit || 5
      return { results: priority.slice(0, limit).map(l => ({ id: l.id, name: l.bn, phone: l.ph, status: l.st, last_contact: l.lc || 'never', notes_count: (l.notes || []).length })) }
    }
    return { error: `Unknown tool: ${name}` }
  } catch (e) {
    return { error: e.message }
  }
}

// ── Convert to provider-specific tool formats ──
export function toAnthropicTools(tools = TOOLS) {
  return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
}

export function toGeminiTools(tools = TOOLS) {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }]
}
