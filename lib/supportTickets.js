import { readData, writeData } from './dataStore'
import { genId } from './entityStore'

export const SUPPORT_STATUSES = [
  'new',
  'triage',
  'waiting_on_farrington',
  'waiting_on_client',
  'scheduled',
  'in_progress',
  'resolved',
  'closed',
  'reopened',
]

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent']

export const SUPPORT_CATEGORIES = [
  'access_login',
  'billing_invoice',
  'website_issue',
  'crm_issue',
  'automation_agent',
  'custom_work_order',
  'domain_email',
  'content_media',
  'feature_request',
  'training_how_to',
  'security_privacy',
  'other',
]

const FILE = 'support-tickets.json'
const PUBLIC_COMMENT_TYPES = new Set(['portal', 'public'])
const FIRST_RESPONSE_HOURS = { urgent: 2, high: 8, normal: 24, low: 48 }
const RESOLUTION_HOURS = { urgent: 24, high: 72, normal: 168, low: 240 }

function nowIso() {
  return new Date().toISOString()
}

function cleanString(value, fallback = '') {
  const v = String(value ?? '').trim()
  return v || fallback
}

function normalizeChoice(value, allowed, fallback) {
  const v = String(value || '').trim().toLowerCase()
  return allowed.includes(v) ? v : fallback
}

function dueAt(hours, from = new Date()) {
  return new Date(from.getTime() + hours * 3600000).toISOString()
}

function loadWrap() {
  const wrap = readData(FILE) || { supportTickets: [], lastUpdated: null, sequence: 0 }
  if (Array.isArray(wrap)) return { supportTickets: wrap, lastUpdated: null, sequence: wrap.length }
  return {
    supportTickets: Array.isArray(wrap.supportTickets) ? wrap.supportTickets : [],
    lastUpdated: wrap.lastUpdated || null,
    sequence: Number(wrap.sequence) || (wrap.supportTickets?.length || 0),
  }
}

function saveWrap(wrap) {
  writeData(FILE, { ...wrap, lastUpdated: nowIso() })
}

function nextTicketNumber(wrap, date = new Date()) {
  const year = date.getFullYear()
  const sequence = (Number(wrap.sequence) || 0) + 1
  wrap.sequence = sequence
  return `SUP-${year}-${String(sequence).padStart(4, '0')}`
}

function audit(event, actor = {}, details = {}) {
  return {
    id: genId('sa'),
    event,
    at: nowIso(),
    actorType: actor.type || actor.actorType || 'system',
    actorName: actor.name || actor.actorName || 'System',
    actorId: actor.id || actor.actorId || null,
    details,
  }
}

function publicComment(comment) {
  return PUBLIC_COMMENT_TYPES.has(comment.visibility || 'internal')
}

function portalComment(comment) {
  return {
    id: comment.id,
    body: comment.body || '',
    authorType: comment.authorType === 'portal' ? 'portal' : 'staff',
    createdAt: comment.createdAt,
  }
}

function portalAccountId(ticket) {
  return ticket.accountId || ticket.clientId || ticket.linkedTo?.accountId || null
}

export function sanitizeTicket(ticket, { portal = false } = {}) {
  const comments = Array.isArray(ticket.comments) ? ticket.comments : []
  const base = {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    tenantId: ticket.tenantId || null,
    accountId: ticket.accountId || null,
    accountName: ticket.accountName || '',
    clientId: ticket.clientId || ticket.accountId || null,
    portalUserId: ticket.portalUserId || null,
    subject: ticket.subject || '',
    description: ticket.description || '',
    category: ticket.category || 'other',
    status: ticket.status || 'new',
    priority: ticket.priority || 'normal',
    source: ticket.source || 'crm',
    assignedToUserId: ticket.assignedToUserId || '',
    team: ticket.team || 'support',
    watchers: Array.isArray(ticket.watchers) ? ticket.watchers : [],
    firstResponseDueAt: ticket.firstResponseDueAt || null,
    resolutionDueAt: ticket.resolutionDueAt || null,
    firstRespondedAt: ticket.firstRespondedAt || null,
    resolvedAt: ticket.resolvedAt || null,
    closedAt: ticket.closedAt || null,
    reopenedAt: ticket.reopenedAt || null,
    archivedAt: ticket.archivedAt || null,
    visibility: ticket.visibility || 'internal',
    portalVisible: ticket.portalVisible !== false,
    linkedTo: ticket.linkedTo || {},
    documentIds: Array.isArray(ticket.documentIds) ? ticket.documentIds : [],
    mediaIds: Array.isArray(ticket.mediaIds) ? ticket.mediaIds : [],
    productId: ticket.productId || '',
    serviceId: ticket.serviceId || '',
    estCostUsd: Number(ticket.estCostUsd || 0),
    usageUnknown: Boolean(ticket.usageUnknown),
    usageEventCount: Number(ticket.usageEventCount || 0),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }
  if (portal) {
    const portalTicket = {
      id: base.id,
      ticketNumber: base.ticketNumber,
      subject: base.subject,
      description: base.description,
      category: base.category,
      status: base.status,
      priority: base.priority,
      resolvedAt: base.resolvedAt,
      closedAt: base.closedAt,
      reopenedAt: base.reopenedAt,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      comments: comments.filter(publicComment).map(portalComment),
    }
    if (base.archivedAt) portalTicket.archivedAt = base.archivedAt
    return portalTicket
  }
  return {
    ...base,
    internalOnly: Boolean(ticket.internalOnly),
    sensitiveFlag: Boolean(ticket.sensitiveFlag),
    deletedAt: ticket.deletedAt || null,
    deletedBy: ticket.deletedBy || null,
    comments,
    audit: Array.isArray(ticket.audit) ? ticket.audit : [],
  }
}

export function listSupportTickets(filters = {}) {
  let tickets = loadWrap().supportTickets
  if (!filters.includeDeleted) tickets = tickets.filter(t => !t.deletedAt)
  if (filters.accountId) tickets = tickets.filter(t => t.accountId === filters.accountId || t.clientId === filters.accountId)
  if (filters.portalAccountId) tickets = tickets.filter(t => portalAccountId(t) === filters.portalAccountId && t.portalVisible !== false && !t.internalOnly)
  if (filters.portalTenantId) tickets = tickets.filter(t => (
    t.tenantId === filters.portalTenantId
    || (filters.allowLegacyAccountScope && !t.tenantId)
  ))
  if (filters.status) tickets = tickets.filter(t => t.status === filters.status)
  if (filters.priority) tickets = tickets.filter(t => t.priority === filters.priority)
  if (filters.category) tickets = tickets.filter(t => t.category === filters.category)
  if (filters.assignedToUserId) tickets = tickets.filter(t => t.assignedToUserId === filters.assignedToUserId)
  if (!filters.includeClosed) tickets = tickets.filter(t => !['resolved', 'closed'].includes(t.status))
  if (filters.q) {
    const q = String(filters.q).toLowerCase()
    tickets = tickets.filter(t => [
      t.ticketNumber,
      t.subject,
      t.description,
      t.accountName,
      t.category,
      t.priority,
      t.status,
    ].some(v => String(v || '').toLowerCase().includes(q)))
  }
  tickets.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
  const portal = Boolean(filters.portal)
  return tickets.map(t => sanitizeTicket(t, { portal }))
}

export function getSupportTicket(id, options = {}) {
  const ticket = loadWrap().supportTickets.find(t => t.id === id || t.ticketNumber === id)
  if (!ticket || (!options.includeDeleted && ticket.deletedAt)) return null
  if (options.portalAccountId && (
    ticket.portalVisible === false
    || ticket.internalOnly
    || portalAccountId(ticket) !== options.portalAccountId
  )) return null
  if (options.portalTenantId && ticket.tenantId !== options.portalTenantId && !(options.allowLegacyAccountScope && !ticket.tenantId)) return null
  return sanitizeTicket(ticket, { portal: Boolean(options.portal) })
}

export function createSupportTicket(input = {}, actor = {}) {
  const wrap = loadWrap()
  const createdAt = nowIso()
  const priority = normalizeChoice(input.priority, SUPPORT_PRIORITIES, 'normal')
  const status = normalizeChoice(input.status, SUPPORT_STATUSES, 'new')
  const ticket = {
    id: genId('st'),
    ticketNumber: input.ticketNumber || nextTicketNumber(wrap),
    tenantId: cleanString(input.tenantId) || null,
    accountId: input.accountId || input.clientId || null,
    accountName: cleanString(input.accountName),
    clientId: input.clientId || input.accountId || null,
    portalUserId: input.portalUserId || null,
    subject: cleanString(input.subject, 'Support request'),
    description: cleanString(input.description),
    category: normalizeChoice(input.category, SUPPORT_CATEGORIES, 'other'),
    status,
    priority,
    source: cleanString(input.source, actor.type === 'portal' ? 'portal' : 'crm'),
    assignedToUserId: cleanString(input.assignedToUserId),
    team: cleanString(input.team, 'support'),
    watchers: Array.isArray(input.watchers) ? input.watchers.filter(Boolean) : [],
    firstResponseDueAt: input.firstResponseDueAt || dueAt(FIRST_RESPONSE_HOURS[priority] || 24),
    resolutionDueAt: input.resolutionDueAt || dueAt(RESOLUTION_HOURS[priority] || 168),
    firstRespondedAt: input.firstRespondedAt || null,
    resolvedAt: input.resolvedAt || null,
    closedAt: input.closedAt || null,
    reopenedAt: null,
    archivedAt: null,
    visibility: input.visibility || 'internal',
    portalVisible: input.portalVisible !== false,
    internalOnly: Boolean(input.internalOnly),
    sensitiveFlag: Boolean(input.sensitiveFlag),
    linkedTo: input.linkedTo || {},
    documentIds: Array.isArray(input.documentIds) ? input.documentIds : [],
    mediaIds: Array.isArray(input.mediaIds) ? input.mediaIds : [],
    productId: cleanString(input.productId),
    serviceId: cleanString(input.serviceId),
    comments: [],
    audit: [audit('created', actor, { source: input.source || actor.type || 'crm' })],
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    deletedBy: null,
  }
  if (input.initialComment || input.description) {
    ticket.comments.push({
      id: genId('sc'),
      body: cleanString(input.initialComment || input.description),
      visibility: actor.type === 'portal' ? 'portal' : (input.commentVisibility || 'internal'),
      authorType: actor.type || 'staff',
      authorName: actor.name || 'Support',
      authorId: actor.id || null,
      createdAt,
    })
  }
  wrap.supportTickets.push(ticket)
  saveWrap(wrap)
  return sanitizeTicket(ticket)
}

export function updateSupportTicket(id, patch = {}, actor = {}) {
  const wrap = loadWrap()
  const idx = wrap.supportTickets.findIndex(t => t.id === id || t.ticketNumber === id)
  if (idx < 0 || wrap.supportTickets[idx].deletedAt) return null
  const prev = wrap.supportTickets[idx]
  const allowed = [
    'accountId', 'accountName', 'clientId', 'tenantId', 'portalUserId', 'subject', 'description',
    'category', 'status', 'priority', 'source', 'assignedToUserId', 'team', 'watchers',
    'firstResponseDueAt', 'resolutionDueAt', 'firstRespondedAt', 'resolvedAt',
    'closedAt', 'archivedAt', 'visibility', 'portalVisible', 'internalOnly', 'sensitiveFlag',
    'linkedTo', 'documentIds', 'mediaIds', 'productId', 'serviceId',
  ]
  const next = { ...prev }
  const changes = {}
  for (const key of allowed) {
    if (!(key in patch)) continue
    let value = patch[key]
    if (key === 'status') value = normalizeChoice(value, SUPPORT_STATUSES, prev.status || 'new')
    if (key === 'priority') value = normalizeChoice(value, SUPPORT_PRIORITIES, prev.priority || 'normal')
    if (key === 'category') value = normalizeChoice(value, SUPPORT_CATEGORIES, prev.category || 'other')
    if (key === 'archivedAt') {
      const timestamp = value ? Date.parse(value) : NaN
      value = value && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
    }
    next[key] = value
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(value ?? null)) changes[key] = { from: prev[key] ?? null, to: value ?? null }
  }
  if (changes.status) {
    const status = next.status
    if (status === 'resolved' && !next.resolvedAt) next.resolvedAt = nowIso()
    if (status === 'closed' && !next.closedAt) next.closedAt = nowIso()
    if (status === 'reopened') next.reopenedAt = nowIso()
  }
  if (changes.priority && !patch.resolutionDueAt) next.resolutionDueAt = dueAt(RESOLUTION_HOURS[next.priority] || 168)
  next.updatedAt = nowIso()
  next.audit = [...(Array.isArray(prev.audit) ? prev.audit : []), audit('updated', actor, { changes })]
  wrap.supportTickets[idx] = next
  saveWrap(wrap)
  return sanitizeTicket(next)
}

export function addSupportTicketComment(id, comment = {}, actor = {}) {
  const wrap = loadWrap()
  const idx = wrap.supportTickets.findIndex(t => t.id === id || t.ticketNumber === id)
  if (idx < 0 || wrap.supportTickets[idx].deletedAt) return null
  const ticket = wrap.supportTickets[idx]
  const visibility = actor.type === 'portal' ? 'portal' : (comment.visibility || 'internal')
  const entry = {
    id: genId('sc'),
    body: cleanString(comment.body || comment.message || comment.note),
    visibility,
    authorType: actor.type || 'staff',
    authorName: actor.name || 'Support',
    authorId: actor.id || null,
    createdAt: nowIso(),
  }
  if (!entry.body) throw new Error('comment body required')
  const next = {
    ...ticket,
    comments: [...(Array.isArray(ticket.comments) ? ticket.comments : []), entry],
    firstRespondedAt: ticket.firstRespondedAt || (actor.type === 'portal' ? null : entry.createdAt),
    updatedAt: entry.createdAt,
    audit: [...(Array.isArray(ticket.audit) ? ticket.audit : []), audit('commented', actor, { visibility })],
  }
  wrap.supportTickets[idx] = next
  saveWrap(wrap)
  return { ticket: sanitizeTicket(next), comment: entry }
}

export function deleteSupportTicket(id, actor = {}) {
  const wrap = loadWrap()
  const idx = wrap.supportTickets.findIndex(t => t.id === id || t.ticketNumber === id)
  if (idx < 0 || wrap.supportTickets[idx].deletedAt) return null
  const at = nowIso()
  const next = {
    ...wrap.supportTickets[idx],
    deletedAt: at,
    deletedBy: actor.name || actor.id || 'unknown',
    updatedAt: at,
    audit: [...(Array.isArray(wrap.supportTickets[idx].audit) ? wrap.supportTickets[idx].audit : []), audit('deleted', actor)],
  }
  wrap.supportTickets[idx] = next
  saveWrap(wrap)
  return sanitizeTicket(next, { portal: false })
}
