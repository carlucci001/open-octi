// Generic CRUD + relationship helpers layered over dataStore.js.
// Each entity has a file (e.g., 'accounts.json') and a collection key (e.g., 'accounts').
// Records must have an `id` field.
import { readData, writeData } from './dataStore'

export function genId(prefix = '') {
  return (prefix ? prefix + '_' : '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const FILES = {
  accounts:       { file: 'accounts.json',       key: 'accounts',       prefix: 'ac' },
  contacts:       { file: 'contacts.json',       key: 'contacts',       prefix: 'ct' },
  leads:          { file: 'leads.json',          key: 'leads',          prefix: 'ld' },
  leadLists:      { file: 'lead-lists.json',     key: 'leadLists',      prefix: 'll' },
  leadCategories: { file: 'lead-categories.json', key: 'leadCategories', prefix: 'lc' },
  leadRunPresets: { file: 'lead-run-presets.json', key: 'leadRunPresets', prefix: 'lrp' },
  opportunities:  { file: 'opportunities.json',  key: 'opportunities',  prefix: 'op' },
  projects:       { file: 'projects.json',       key: 'projects',       prefix: 'pr' },
  activities:     { file: 'activities.json',     key: 'activities',     prefix: 'av' },
  tasks:          { file: 'tasks.json',          key: 'tasks',          prefix: 'tk' },
  pipelines:      { file: 'pipelines.json',      key: 'pipelines',      prefix: 'pl' },
  supportTickets: { file: 'support-tickets.json', key: 'supportTickets', prefix: 'st' },
  platforms:      { file: 'platforms.json',      key: 'platforms',      prefix: 'pf' },
  usageEvents:    { file: 'usage-events.json',   key: 'usageEvents',    prefix: 'ue' },
  usageRollups:   { file: 'usage-rollups.json',  key: 'usageRollups',   prefix: 'ur' },
  releases:       { file: 'releases.json',       key: 'releases',       prefix: 'rel' },
  releaseSummaries: { file: 'release-summaries.json', key: 'releaseSummaries', prefix: 'rs' },
  incidents:      { file: 'incidents.json',      key: 'incidents',      prefix: 'inc' },
  revenueSnapshots: { file: 'revenue-snapshots.json', key: 'revenueSnapshots', prefix: 'rev' },
}

function meta(type) {
  const m = FILES[type]
  if (!m) throw new Error(`Unknown entity type: ${type}`)
  return m
}

export function loadAll(type) {
  const { file, key } = meta(type)
  const data = readData(file) || { [key]: [] }
  return data[key] || []
}

export function saveAll(type, list) {
  const { file, key, readonly } = meta(type)
  if (readonly) throw new Error(`${type} is read-only`)
  writeData(file, { lastUpdated: new Date().toISOString(), [key]: list })
}

export function findById(type, id) {
  return loadAll(type).find(r => r.id === id) || null
}

export function create(type, record) {
  const { prefix } = meta(type)
  const now = new Date().toISOString()
  const rec = { id: genId(prefix), createdAt: now, updatedAt: now, ...record }
  const list = loadAll(type)
  list.unshift(rec)
  saveAll(type, list)
  return rec
}

export function update(type, id, patch) {
  const list = loadAll(type)
  const i = list.findIndex(r => r.id === id)
  if (i === -1) return null
  list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() }
  saveAll(type, list)
  return list[i]
}

export function remove(type, id) {
  const list = loadAll(type)
  const next = list.filter(r => r.id !== id)
  if (next.length === list.length) return false
  saveAll(type, next)
  return true
}

export function removeMany(type, ids) {
  const set = new Set(ids)
  const list = loadAll(type)
  saveAll(type, list.filter(r => !set.has(r.id)))
  return true
}

// Relationship resolvers for convenience. Read-only.

export function accountWithRelations(accountId) {
  const account = findById('accounts', accountId)
  if (!account) return null
  return {
    ...account,
    contacts: loadAll('contacts').filter(c => c.accountId === accountId),
    opportunities: loadAll('opportunities').filter(o => o.accountId === accountId),
    projects: loadAll('projects').filter(p => p.accountId === accountId),
    tasks: loadAll('tasks').filter(t => t.linkedTo?.accountId === accountId || t.clientId === accountId),
    activities: loadAll('activities').filter(a => a.linkedTo?.accountId === accountId).sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    supportTickets: loadAll('supportTickets').filter(t => t.accountId === accountId && t.deletedAt == null).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')),
  }
}

export function contactWithRelations(contactId) {
  const contact = findById('contacts', contactId)
  if (!contact) return null
  return {
    ...contact,
    account: contact.accountId ? findById('accounts', contact.accountId) : null,
    activities: loadAll('activities').filter(a => a.linkedTo?.contactId === contactId).sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    tasks: loadAll('tasks').filter(t => t.linkedTo?.contactId === contactId),
  }
}

// Dedupe: find accounts matching a business name OR a contact email.
// Used by the Qualify flow to prevent duplicate accounts.
export function findAccountMatches({ name, email }) {
  const matches = []
  const accounts = loadAll('accounts')
  const contacts = loadAll('contacts')

  if (name) {
    const normalized = name.trim().toLowerCase()
    for (const a of accounts) {
      if ((a.name || '').trim().toLowerCase() === normalized) {
        matches.push({ account: a, reason: 'exact name match' })
      } else if ((a.name || '').toLowerCase().includes(normalized) || normalized.includes((a.name || '').toLowerCase())) {
        matches.push({ account: a, reason: 'partial name match' })
      }
    }
  }

  if (email) {
    const normalized = email.trim().toLowerCase()
    const matchingContact = contacts.find(c => (c.email || '').toLowerCase() === normalized)
    if (matchingContact?.accountId) {
      const acct = accounts.find(a => a.id === matchingContact.accountId)
      if (acct && !matches.some(m => m.account.id === acct.id)) {
        matches.push({ account: acct, reason: 'email match via contact', contact: matchingContact })
      }
    }
  }

  return matches
}

export function findContactByEmail(email) {
  if (!email) return null
  const norm = email.trim().toLowerCase()
  return loadAll('contacts').find(c => (c.email || '').toLowerCase() === norm) || null
}

// Module-level "current request" tenant context. Single-threaded JS per request makes this
// safe so long as we set/clear it around the agent execute dispatch. Tools call logActivity
// without needing to thread tenantId through every callsite.
let _currentTenantContext = null
export function setRequestTenantContext(ctx) { _currentTenantContext = ctx }
export function clearRequestTenantContext() { _currentTenantContext = null }
export function getRequestTenantContext() { return _currentTenantContext }

// Resolve tenantId for a CRM account: if the account belongs to a client with an
// ACTIVE lease, activities linked to it attribute to that client's tenant so their
// portal usage/feed reflects real work. Returns null when no active lease matches.
export function tenantIdForAccount(accountId) {
  if (!accountId) return null
  try {
    const lf = readData('leases.json') || { leases: [] }
    const lease = (lf.leases || []).find(l => l.status === 'active' && (l.clientAccountId === accountId || l.accountId === accountId))
    return lease?.tenantId || null
  } catch {
    return null
  }
}

// Activity logger — used anywhere we want a timeline entry.
// tenantId carries lease attribution (if the activity was performed by a leased agent
// for a specific customer). When omitted, falls back to module-level context, then to
// the active lease of the linked account, then to 'farrington-development' (Carl's own).
export function logActivity({ type, subject, body, linkedTo, meta: activityMeta, tenantId, agentId }) {
  const ctx = _currentTenantContext || {}
  return create('activities', {
    type: type || 'note',
    subject: subject || '',
    body: body || '',
    linkedTo: linkedTo || {},
    meta: activityMeta || {},
    tenantId: tenantId || ctx.tenantId || tenantIdForAccount(linkedTo?.accountId) || 'farrington-development',
    agentId: agentId || ctx.agentId || null,
    leaseId: ctx.leaseId || null,
    at: new Date().toISOString(),
  })
}

// Resolve tenantId given an agent slug — looks up data/agents.json
export function tenantIdForAgent(agentSlug) {
  if (!agentSlug) return 'farrington-development'
  try {
    const af = readData('agents.json') || { agents: {} }
    return af.agents?.[agentSlug]?.tenantId || 'farrington-development'
  } catch {
    return 'farrington-development'
  }
}
