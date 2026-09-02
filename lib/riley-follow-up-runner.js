// Riley Follow-up Watchdog — finds pipeline leads stalled past a threshold
// and drafts (never sends) a personalized nudge via Nylas. Dry-runs cleanly
// with a 'skipped' reason when Nylas credentials aren't configured.
import { loadAll } from './entityStore'
import { getCred } from './agent-creds'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const IN_HOUSE_TENANT = 'farrington-development'
const NYLAS_BASE_URL = process.env.NYLAS_BASE_URL || 'https://api.us.nylas.com/v3'

function recordTenantId(record) {
  return String(record?.tenantId || IN_HOUSE_TENANT).trim()
}

function lastActivityAt(leadId, activities) {
  const stamps = activities
    .filter(a => a.linkedTo?.leadId === leadId)
    .map(a => a.at || a.createdAt)
    .filter(Boolean)
  return stamps.sort().pop() || null
}

function daysStalled(lead, activities, now) {
  const last = lastActivityAt(lead.id, activities) || lead.updatedAt || lead.createdAt
  if (!last) return Infinity
  return Math.floor((now - new Date(last).getTime()) / MS_PER_DAY)
}

function getNylasCred() {
  const apiKey = String(process.env.NYLAS_API_KEY || process.env.NYLAS_KEY || '').trim() || getCred('nylas')?.key || ''
  const grantId = String(process.env.NYLAS_GRANT_ID || '').trim()
  return { apiKey, grantId }
}

function followUpCopy(lead) {
  const name = lead.name || lead.contactName || lead.businessName || 'there'
  const subject = `Checking in${lead.businessName ? ` — ${lead.businessName}` : ''}`
  const body = `Hi ${name},\n\nWanted to follow up on where things stand — happy to pick the conversation back up whenever works for you.\n\nBest,\nFarrington Development`
  return { subject, body }
}

async function draftFollowUp({ apiKey, grantId, lead }) {
  const { subject, body } = followUpCopy(lead)
  const response = await fetch(`${NYLAS_BASE_URL}/grants/${encodeURIComponent(grantId)}/drafts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject,
      body,
      to: lead.email ? [{ email: lead.email }] : [],
    }),
  })
  if (!response.ok) throw new Error(`Nylas draft request failed (${response.status})`)
  const data = await response.json().catch(() => ({}))
  return data?.data?.id || data?.id || null
}

export async function runRileyFollowUpWatchdog(automation = {}, options = {}) {
  const tenantId = String(automation?.tenantId || IN_HOUSE_TENANT).trim()
  const stalledDays = Number(automation?.config?.stalledDays ?? 5)
  const limit = Math.max(1, Number(automation?.config?.limit ?? 10))
  const now = Date.now()

  const leads = loadAll('leads')
  const activities = loadAll('activities')
  const scoped = leads.filter(lead => recordTenantId(lead) === tenantId)

  const stalled = scoped
    .map(lead => ({ lead, days: daysStalled(lead, activities, now) }))
    .filter(({ days }) => days >= stalledDays)
    .sort((a, b) => b.days - a.days)
    .slice(0, limit)

  const { apiKey, grantId } = getNylasCred()
  const configured = Boolean(apiKey && grantId)

  const records = []
  for (const { lead, days } of stalled) {
    const name = lead.businessName || lead.name || lead.id
    if (!configured) {
      records.push({ id: lead.id, name, daysStalled: days, draft: 'skipped', reason: 'nylas_not_configured' })
      continue
    }
    try {
      const draftId = await draftFollowUp({ apiKey, grantId, lead })
      records.push({ id: lead.id, name, daysStalled: days, draft: 'drafted', draftId })
    } catch (err) {
      records.push({ id: lead.id, name, daysStalled: days, draft: 'skipped', reason: err.message })
    }
  }

  return {
    scanned: scoped.length,
    stalled: stalled.length,
    drafted: records.filter(r => r.draft === 'drafted').length,
    records,
  }
}
