import { avatarRef } from './avatars'
import { isOpenOcti } from './edition'

export const ROLES = ['owner', 'admin', 'member']

export const ROLE_DETAILS = {
  owner: {
    label: 'Owner',
    summary: 'Full control. Cannot be deleted, suspended, booted, or demoted.',
  },
  admin: {
    label: 'Admin',
    summary: 'Can manage users, settings, agents, and CRM records.',
  },
  member: {
    label: 'Member',
    summary: 'Can work CRM records, pipelines, feed, documents, and tasks.',
  },
}

export const ROLE_CAPABILITIES = {
  owner: ['*'],
  admin: ['crm:*', 'settings:*', 'users:manage', 'agents:manage', 'agents:use', 'voice:use', 'timer:use', 'system:manage'],
  member: [
    'crm:read',
    'crm:write',
    'pipeline:use',
    'feed:write',
    'agents:use',
    'voice:use',
    'timer:use',
    'profile:self',
  ],
}

export const ROLE_TOOLS = {
  owner: ['*'],
  admin: ['*'],
  member: [
    'ai_assistant',
    'agent_voice',
    'timer',
    'phone',
    'conference',
    'calendar',
    'notes',
    'documents',
    'crm_records',
    'pipelines',
    'feed',
  ],
}

export const ROLE_TABS = {
  owner: ['*'],
  admin: ['*'],
  member: [
    'dashboard',
    'feed',
    'leads',
    'press-desk',
    'lead-intake',
    'pipelines',
    'accounts',
    'SearchTools3',
    'platforms',
    'contacts',
    'projects',
    'tasks',
    'documents',
    'campaign-studio',
    'outreach-campaigns',
    'phone',
    'conference',
    'calendar',
    'notes',
    'agents',
    'agent-labs',
    'voice-guide',
  ],
}

const OPENOCTI_CLOSED_TABS = new Set(['platforms', 'SearchTools3'])

export function normalizeRoleValue(role) {
  return ROLES.includes(role) ? role : 'member'
}

export function roleForUser(user) {
  if (!user) return null
  if ((user.username || '').toLowerCase() === 'carl') return 'owner'
  return normalizeRoleValue(user.role)
}

export function isOwner(user) {
  return roleForUser(user) === 'owner'
}

export function isAdminLike(user) {
  const role = roleForUser(user)
  return role === 'owner' || role === 'admin'
}

export function hasCapability(user, capability) {
  const role = roleForUser(user)
  if (!role || !capability) return false
  const caps = ROLE_CAPABILITIES[role] || []
  if (caps.includes('*') || caps.includes(capability)) return true
  const [area] = capability.split(':')
  return caps.includes(`${area}:*`)
}

export function canUseTool(user, toolId) {
  const role = roleForUser(user) || 'member'
  const tools = ROLE_TOOLS[role] || ROLE_TOOLS.member
  return tools.includes('*') || tools.includes(toolId)
}

export function canUseTab(user, tabId, env = process.env) {
  if (tabId === 'my-account') return !!user
  if (isOpenOcti(env) && OPENOCTI_CLOSED_TABS.has(tabId)) return false
  const role = roleForUser(user) || 'member'
  if (tabId === 'credentials') return role === 'owner'
  if (tabId === 'builder') return role === 'owner'
  const tabs = ROLE_TABS[role] || ROLE_TABS.member
  return tabs.includes('*') || tabs.includes(tabId)
}

export function publicUser(user) {
  if (!user) return null
  const { passwordHash, ...safe } = user
  // Never ship the inline avatar data URL — send a /api/users/avatar reference.
  return { ...safe, avatarUrl: avatarRef(user), role: roleForUser(user) }
}
