import { loadAll } from './entityStore'
import { isAdminLike } from './roles'

export function slugifyLeadList(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export function normalizeLeadList(list = {}) {
  const id = String(list.id || slugifyLeadList(list.name) || '').trim()
  return {
    id,
    name: String(list.name || id || 'Lead List').trim(),
    description: String(list.description || '').trim(),
    brandContext: String(list.brandContext || '').trim(),
    campaignId: String(list.campaignId || '').trim(),
    color: list.color || '#89b4fa',
    ownerUserId: String(list.ownerUserId || '').trim(),
    assignedUserIds: Array.isArray(list.assignedUserIds)
      ? list.assignedUserIds.map(id => String(id || '').trim()).filter(Boolean)
      : [],
    visibleToAll: Boolean(list.visibleToAll),
    source: list.source || 'lead_list',
    legacyPipelineId: String(list.legacyPipelineId || '').trim(),
    system: Boolean(list.system),
    createdAt: list.createdAt || new Date().toISOString(),
    updatedAt: list.updatedAt || list.createdAt || new Date().toISOString(),
  }
}

export function leadListIdForLead(lead = {}) {
  return String(lead.leadListId || lead.leadList?.id || lead.suggestedPipelineId || '').trim()
}

function legacyLeadListFromPipeline(pipeline = {}) {
  return normalizeLeadList({
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description || 'Legacy lead bucket from the old pipeline selector.',
    color: pipeline.color,
    visibleToAll: true,
    source: 'legacy_pipeline',
    legacyPipelineId: pipeline.id,
    system: true,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
  })
}

export function loadLeadLists({ includeLegacy = true } = {}) {
  const explicit = loadAll('leadLists').map(normalizeLeadList).filter(list => list.id)
  const byId = new Map(explicit.map(list => [list.id, list]))

  if (includeLegacy) {
    const explicitLegacyIds = new Set(explicit.map(list => list.legacyPipelineId).filter(Boolean))
    for (const pipeline of loadAll('pipelines')) {
      if (!pipeline?.id || byId.has(pipeline.id) || explicitLegacyIds.has(pipeline.id)) continue
      byId.set(pipeline.id, legacyLeadListFromPipeline(pipeline))
    }
  }

  return Array.from(byId.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export function findLeadListById(id, options) {
  const target = String(id || '').trim()
  if (!target) return null
  return loadLeadLists(options).find(list => list.id === target || list.legacyPipelineId === target) || null
}

export function userCanAccessLeadList(user, list = {}) {
  if (!user) return false
  if (isAdminLike(user)) return true
  const normalized = normalizeLeadList(list)
  const userKeys = [user.id, user.username, user.email].map(value => String(value || '').trim()).filter(Boolean)
  if (!normalized.ownerUserId && normalized.assignedUserIds.length === 0) return true
  if (normalized.visibleToAll) return true
  if (userKeys.includes(normalized.ownerUserId)) return true
  return normalized.assignedUserIds.some(id => userKeys.includes(id))
}

export function accessibleLeadListsForUser(user, options) {
  return loadLeadLists(options).filter(list => userCanAccessLeadList(user, list))
}

export function userCanAccessLead(user, lead = {}, lists = loadLeadLists()) {
  if (!user) return false
  if (isAdminLike(user)) return true
  const assignedLeadUser = String(lead.assignedUserId || lead.ownerUserId || '').trim()
  const userKeys = [user.id, user.username, user.email].map(value => String(value || '').trim()).filter(Boolean)
  if (assignedLeadUser && userKeys.includes(assignedLeadUser)) return true
  const listId = leadListIdForLead(lead)
  if (!listId) return true
  const list = lists.find(item => item.id === listId || item.legacyPipelineId === listId)
  return list ? userCanAccessLeadList(user, list) : false
}
