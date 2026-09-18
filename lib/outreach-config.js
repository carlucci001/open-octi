// Browser-safe campaign policy; keep all excluded service domains here.
export const OUTREACH_CAMPAIGN = 'fd-new-business-outreach'
export const OUTREACH_LIST = 'new_business_owners'
// Invalid/unset configuration keeps follow-ups off; zero disables all steps.
export function outreachMaxStep(value) {
  if (value === undefined || String(value).trim() === '') return 1
  const step = Number(value)
  return Number.isSafeInteger(step) && step >= 0 ? step : 1
}
export const OUTREACH_BLOCKED_DOMAINS = [
  'incfile.com', 'legalzoom.com', 'northwestregisteredagent.com',
  'zenbusiness.com', 'bizee.com', 'registeredagentsinc.com',
  'cscglobal.com', 'ctcorporation.com', 'corpnet.com', 'incorporate.com',
]
export const OUTREACH_AUTOMATION = {
  id: 'auto_fd_new_business_outreach', name: 'New business owners — outreach',
  scope: 'in-house', templateId: 'outreach-sequence-v1', enabled: true, status: 'active',
  trigger: { type: 'schedule', config: { cadence: 'daily', hour: 9, minute: 30, timeZone: 'America/New_York' } },
}

export function normalizeOutreachEmail(email) { return String(email || '').trim().toLowerCase() }
export function blockedOutreachEmail(email) {
  const domain = normalizeOutreachEmail(email).split('@')[1] || ''
  return /\.(gov|edu)$/.test(domain) || OUTREACH_BLOCKED_DOMAINS.some(item => domain === item || domain.endsWith(`.${item}`))
}
export function outreachLabel(lead) {
  const value = lead?.outreach
  if (!value) return '—'
  if (value.status === 'sent') return `sent ${value.step}`
  if (value.status === 'suppressed') return value.reason === 'unsubscribe' ? 'unsubscribed' : "don't email"
  return value.status
}
