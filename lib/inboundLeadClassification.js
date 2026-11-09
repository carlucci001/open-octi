// Classification every OpenOcti-owned inbound prospect receives so the Lead is
// visible under the CRM's tenant / brand / lead-list conventions.
//
// Why this exists (incident 2026-09-28): the public Command Center consult form
// created a Lead with no tenantId, brandContext or leadListId, and the Doreen
// post-call webhook created no Lead at all. Both paths now classify through here
// so a new inbound prospect lands in the same bucket the Leads UI defaults to.
//
// Conventions this mirrors (do not invent new ones here):
// - tenantId 'farrington-development' — Carl's own tenant (crm-execute create_lead,
//   entityStore.logActivity default). WNC/leased tenants (e.g. 'lease-cl_001')
//   are never used for OpenOcti inquiries.
// - brandContext 'farrington_dev' — DEFAULT_BRAND_ID in app/leads/LeadsManager.js
//   and the brand website/intake already stamps.
// - leadListId 'farrington_dev' — the legacy pipeline-backed lead list that
//   LeadsManager picks as the default list for a new lead. Only assigned when the
//   list actually exists; otherwise the lead stays unlisted ('unassigned' bucket),
//   which every authorized CRM user can see. No owner/assignee is set: an
//   unassigned inbound lead is visible to all authorized users (lib/leadLists
//   userCanAccessLead), and ownership is Carl's call inside the CRM.
import { findLeadListById } from './leadLists'

export const FARRINGTON_TENANT_ID = 'farrington-development'
export const FARRINGTON_BRAND_CONTEXT = 'farrington_dev'
export const FARRINGTON_INBOUND_LIST_ID = 'farrington_dev'

function unique(values) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

// Digits only; drop a US country code so 'PHONE_REDACTED' and '8285550100' match.
export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

// A lead with no tenantId is legacy OpenOcti data (leads predate tenant stamping).
export function isFarringtonTenantLead(lead = {}) {
  const tenantId = String(lead?.tenantId || '').trim()
  return !tenantId || tenantId === FARRINGTON_TENANT_ID
}

export function resolveFarringtonInboundListId() {
  try {
    return findLeadListById(FARRINGTON_INBOUND_LIST_ID)?.id || null
  } catch {
    return null
  }
}

// Returns the fields to spread onto a new OpenOcti Lead record.
// `tags` are merged with the standard inbound tags (order preserved, deduped).
// Pass `inbound: false` for leads an operator/agent adds by hand (cold calls,
// prospecting): they still get tenant/brand/list, but not the 'inbound' tag.
export function farringtonInboundClassification({ source = '', tags = [], inbound = true } = {}) {
  const leadListId = resolveFarringtonInboundListId()
  const baseTags = inbound ? ['inbound', 'farrington-development', source] : []
  return {
    tenantId: FARRINGTON_TENANT_ID,
    brandContext: FARRINGTON_BRAND_CONTEXT,
    leadListId,
    tags: unique([...baseTags, ...(Array.isArray(tags) ? tags : [])]),
  }
}

// Find an existing OpenOcti-tenant lead for a contact. Never matches another
// tenant's lead just because the email or phone is the same.
export function findFarringtonLeadByContact(leads = [], { email, phone } = {}) {
  const normEmail = normalizeEmail(email)
  const normPhone = normalizePhone(phone)
  const scoped = (leads || []).filter(isFarringtonTenantLead)
  if (normEmail) {
    const byEmail = scoped.find(lead => normalizeEmail(lead.email) === normEmail)
    if (byEmail) return byEmail
  }
  if (normPhone) {
    const byPhone = scoped.find(lead => normalizePhone(lead.phone) === normPhone)
    if (byPhone) return byPhone
  }
  return null
}
