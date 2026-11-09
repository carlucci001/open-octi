// lib/accountContext.js
// Single-call 360 view of a CRM account: the record itself plus every
// related entity a human (or agent) would otherwise have to gather with
// five or six separate list calls. Backs the `get_account_context` agent
// tool in app/api/agent/execute/route.js — keep that tool thin and put all
// the actual logic here so it's independently testable.
import { loadAll, findById } from './entityStore'
import { readData } from './dataStore'

const NOTE_ACTIVITY_TYPES = new Set(['note'])
const CALL_ACTIVITY_TYPES = new Set(['phone_call', 'call', 'meeting', 'transcript'])
const RECENT_ACTIVITY_LIMIT = 25
const ACTIVITY_BODY_TRUNCATE = 600

function truncate(value, max) {
  const s = String(value || '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function byAtDesc(a, b) {
  return String(b.at || b.createdAt || '').localeCompare(String(a.at || a.createdAt || ''))
}

/**
 * Case-insensitive name match against the accounts list.
 * Returns { account } on a single unambiguous match, or
 * { candidates } (never a guess) when more than one account matches.
 */
function resolveAccountByName(name) {
  const needle = String(name || '').trim().toLowerCase()
  if (!needle) return { candidates: [] }
  const accounts = loadAll('accounts')
  // Exact case-insensitive match first.
  const exact = accounts.filter(a => String(a.name || '').trim().toLowerCase() === needle)
  if (exact.length === 1) return { account: exact[0] }
  if (exact.length > 1) {
    return { candidates: exact.map(a => ({ id: a.id, name: a.name, type: a.type, stage: a.stage })) }
  }
  // Fall back to substring match.
  const partial = accounts.filter(a => String(a.name || '').toLowerCase().includes(needle))
  if (partial.length === 1) return { account: partial[0] }
  if (partial.length > 1) {
    return { candidates: partial.map(a => ({ id: a.id, name: a.name, type: a.type, stage: a.stage })) }
  }
  return { candidates: [] }
}

/**
 * Resolve an account from { id } or { name }. Returns one of:
 *   { account }              - unambiguous match
 *   { candidates: [...] }    - ambiguous name, never a guess
 *   { notFound: true }       - no match at all
 */
export function resolveAccount({ id, name } = {}) {
  if (id) {
    const account = findById('accounts', id)
    return account ? { account } : { notFound: true }
  }
  if (name) {
    const result = resolveAccountByName(name)
    if (result.account) return { account: result.account }
    if (result.candidates.length) return { candidates: result.candidates }
    return { notFound: true }
  }
  return { notFound: true }
}

function invoicesForAccount(account) {
  const all = readData('invoices.json')?.invoices || []
  const byId = all.filter(i => i.clientId === account.id)
  // Fallback: some legacy invoices only ever recorded clientName. Matching by
  // exact case-insensitive name is the same fallback app/api/invoices/route.js
  // uses when clientId isn't present.
  const name = String(account.name || '').trim().toLowerCase()
  if (!name) return byId
  return byId.concat(all.filter(i => !i.clientId && String(i.clientName || '').trim().toLowerCase() === name))
}

export function getAccountContext({ id, name } = {}) {
  const resolved = resolveAccount({ id, name })
  if (resolved.notFound) return { notFound: true, id: id || null, name: name || null }
  if (resolved.candidates) return { ambiguous: true, candidates: resolved.candidates }

  const account = resolved.account
  const accountId = account.id

  const contacts = loadAll('contacts').filter(c => c.accountId === accountId)
  const opportunities = loadAll('opportunities').filter(o => o.accountId === accountId)
  const projects = loadAll('projects').filter(p => p.accountId === accountId)
  const allTasks = loadAll('tasks').filter(t => t.linkedTo?.accountId === accountId || t.clientId === accountId)
  const openTasks = allTasks.filter(t => !['done', 'complete', 'completed', 'cancelled', 'canceled'].includes(String(t.status || '').toLowerCase()))
  const invoices = invoicesForAccount(account)

  const activities = loadAll('activities')
    .filter(a => a.linkedTo?.accountId === accountId)
    .sort(byAtDesc)

  const noteActivities = activities.filter(a => NOTE_ACTIVITY_TYPES.has(a.type))
  const notes = [
    ...(account.notes ? [{ source: 'account.notes', text: account.notes, at: account.updatedAt || account.createdAt || null }] : []),
    ...noteActivities.map(a => ({ source: 'activity', id: a.id, text: a.body || a.subject || '', at: a.at || a.createdAt || null })),
  ]

  const recentActivities = activities.slice(0, RECENT_ACTIVITY_LIMIT).map(a => ({
    id: a.id,
    type: a.type,
    subject: a.subject || '',
    body: truncate(a.body, ACTIVITY_BODY_TRUNCATE),
    at: a.at || a.createdAt || null,
    agentId: a.agentId || null,
  }))

  const counts = {
    contacts: contacts.length,
    opportunities: opportunities.length,
    projects: projects.length,
    openTasks: openTasks.length,
    totalTasks: allTasks.length,
    invoices: invoices.length,
    activities: activities.length,
    calls: activities.filter(a => CALL_ACTIVITY_TYPES.has(a.type)).length,
  }

  return {
    account,
    contacts,
    opportunities,
    projects,
    openTasks,
    invoices,
    notes,
    recentActivities,
    counts,
    generatedAt: new Date().toISOString(),
  }
}
