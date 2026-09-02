// lib/platforms/registry.js
// Platform registry — kv_store JSON via entityStore ('platforms' entity), per the
// Platforms area ruling spec (2026-08-01). A platform is the admin interface for an
// external product Farrington runs (GetFound3 first).
//
// SECURITY: a platform record NEVER stores secret values. Credentials live in the
// Command Vault and are referenced here by name only (credentialRef) — same care
// as Stripe keys.

import { create, findById, loadAll, remove as removeEntity, update as updateEntity } from '../entityStore'

const ENVIRONMENTS = new Set(['production', 'staging'])
const SURFACES = new Set(['generic', 'getfound3'])
const OWNERSHIP_TYPES = new Set(['in-house', 'client'])
const LEGACY_READ_CAPABILITIES = ['customers', 'subscriptions']

const OPERATING_PLATFORM_PROJECTS = {
  'farrington-command-center': { id: 'pr_local_farrington_command_center', name: 'Farrington Command Center' },
  getremedy3: { id: 'pr_local_getremedy3', name: 'GetRemedy3' },
  getfound3: { id: 'pr_local_getfound3', name: 'GetFound3' },
  myvtc: { id: 'pr_local_myvtc', name: 'MyVTC' },
  'newsroom-aios': { id: 'pr_local_newsroomaios', name: 'NewsroomAIOS' },
  vibnflow: { id: 'pr_local_vibnflow', name: 'VibNFlow' },
  vibnflip: { id: 'pr_local_vibnflip', name: 'VibNFlip' },
}

// Registered by code, cannot be deleted from the UI. GetFound3's management
// surface is the existing GetFound3 admin workspace, reused inside Platforms.
const BUILT_IN_PLATFORMS = [
  {
    platformId: 'farrington-command-center',
    name: 'Command Center',
    url: 'https://openocti.local',
    adminApiBasePath: '/api/platform-admin/v1',
    environment: 'production',
    credentialRef: 'Command Center Platform Admin',
    surface: 'generic',
    builtIn: true,
    capabilities: ['health', 'releases', 'errors', 'usage', 'revenue'],
    supportsActions: false,
    notes: 'Command Center reference implementation of the Platform Admin v2 contract.',
  },
  {
    platformId: 'getfound3',
    name: 'GetFound3',
    url: 'https://getfound3.com',
    adminApiBasePath: '/api/platform-admin/v1',
    environment: 'production',
    surface: 'getfound3',
    builtIn: true,
    notes: 'Visibility reports platform. Managed through the embedded GetFound3 workspace. Platform Admin API pending (see getfound3 launch-hardening §9).',
  },
  {
    platformId: 'myvtc',
    name: 'MyVTC',
    url: 'https://myvtc.com',
    adminApiBasePath: '/api/platform-admin/v1',
    environment: 'production',
    credentialRef: 'MyVTC Platform Admin',
    surface: 'generic',
    builtIn: true,
    capabilities: ['customers', 'subscriptions', 'health', 'releases', 'errors', 'usage', 'revenue'],
    supportsActions: false,
    notes: 'MyVTC (myvtc.com). Read-only Platform Admin resources include customers, subscriptions, health, releases, errors, usage, and revenue; actions remain disabled.',
  },
]

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max)
}

function findInHouseOwnerAccount(accounts = loadAll('accounts')) {
  return accounts.find(account => /^carl farrington(?:\s|$)/i.test(String(account.name || '').trim()))
    || accounts.find(account => account.type === 'in-house')
    || accounts.find(account => String(account.name || '').trim().toLowerCase() === 'farrington development')
    || null
}

export function slugifyPlatformId(value = '') {
  return text(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// A credentialRef must be a vault reference name, never a pasted secret.
export function assertCredentialRef(value) {
  const ref = text(value, 160)
  if (!ref) return ''
  if (ref.length > 80 || /^(sk|pk|rk|whsec|shpat|ghp|gho|xox[baprs])[-_]/i.test(ref) || /^ey[A-Za-z0-9_-]{20,}/.test(ref)) {
    throw new Error('credentialRef looks like a raw secret. Store the secret in the Command Vault and reference it here by its credential name.')
  }
  return ref
}

export function sanitizePlatform(record) {
  if (!record) return null
  const account = record.accountId ? findById('accounts', record.accountId) : null
  const project = record.projectId ? findById('projects', record.projectId) : null
  return {
    id: record.id,
    platformId: record.platformId,
    name: record.name,
    url: record.url,
    adminApiBasePath: record.adminApiBasePath || '',
    environment: ENVIRONMENTS.has(record.environment) ? record.environment : 'production',
    ownershipType: OWNERSHIP_TYPES.has(record.ownershipType) ? record.ownershipType : '',
    accountId: record.accountId || '',
    accountName: account?.name || '',
    projectId: record.projectId || '',
    projectName: project?.name || '',
    credentialRef: record.credentialRef || '',
    surface: SURFACES.has(record.surface) ? record.surface : 'generic',
    capabilities: normalizedPlatformCapabilities(record),
    supportsActions: platformSupportsCapability(record, 'actions'),
    builtIn: Boolean(record.builtIn),
    status: record.status || 'unknown',
    lastCheckAt: record.lastCheckAt || null,
    lastCheckNote: record.lastCheckNote || '',
    manifestVersion: record.manifestVersion || '',
    notes: record.notes || '',
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
  }
}

export function platformRelationshipOptions() {
  const accounts = loadAll('accounts')
  const inHouseOwner = findInHouseOwnerAccount(accounts)
  return {
    accounts: accounts
      .filter(account => account.type === 'client' || account.type === 'in-house')
      .map(account => ({ id: account.id, name: account.name, type: account.type, isDefaultInHouseOwner: account.id === inHouseOwner?.id }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    projects: loadAll('projects')
      .map(project => ({ id: project.id, name: project.name, accountId: project.accountId || '' }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  }
}

export function normalizedPlatformCapabilities(record = {}) {
  if (Array.isArray(record.capabilities)) {
    return [...new Set(record.capabilities.map(value => text(value, 80)).filter(Boolean))]
  }
  const legacy = [...LEGACY_READ_CAPABILITIES]
  if (record.supportsActions) legacy.push('actions')
  return legacy
}

export function platformSupportsCapability(record, capability) {
  return normalizedPlatformCapabilities(record).includes(String(capability || '').trim())
}

function seedBuiltIns() {
  const existing = loadAll('platforms')
  const present = new Map(existing.map(p => [p.platformId, p]))
  for (const seed of BUILT_IN_PLATFORMS) {
    const current = present.get(seed.platformId)
    if (!current) {
      create('platforms', { ...seed, status: 'unknown' })
      continue
    }
    // Built-in contract declarations are code-owned. Reconcile older persisted
    // rows so a previous manifest cannot keep lighting up routes FCC does not
    // implement (the customers/subscriptions 404 regression).
    const capabilitiesChanged = JSON.stringify(current.capabilities || []) !== JSON.stringify(seed.capabilities || [])
    if (capabilitiesChanged || Boolean(current.supportsActions) !== Boolean(seed.supportsActions)) {
      updateEntity('platforms', current.id, {
        capabilities: seed.capabilities,
        supportsActions: seed.supportsActions,
      })
    }
  }
  seedOperatingPlatformRelationships()
}

function seedOperatingPlatformRelationships() {
  const accounts = loadAll('accounts')
  const inHouseAccount = findInHouseOwnerAccount(accounts)
  const projects = loadAll('projects')
  const platforms = loadAll('platforms')

  for (const [platformId, expectedProject] of Object.entries(OPERATING_PLATFORM_PROJECTS)) {
    let project = projects.find(item => item.id === expectedProject.id)
      || projects.find(item => String(item.name || '').trim().toLowerCase() === expectedProject.name.toLowerCase())
    if (!project) {
      project = create('projects', {
        ...expectedProject,
        accountId: inHouseAccount?.id || null,
        status: 'active',
        description: `${expectedProject.name} in-house platform project.`,
      })
      projects.unshift(project)
    } else if (inHouseAccount && project.accountId !== inHouseAccount.id) {
      project = updateEntity('projects', project.id, { accountId: inHouseAccount.id }) || project
    }

    const platform = platforms.find(item => item.platformId === platformId)
    if (!platform) continue
    const relationship = {
      ownershipType: 'in-house',
      accountId: inHouseAccount?.id || '',
      projectId: project.id,
    }
    if (platform.ownershipType !== relationship.ownershipType
      || platform.accountId !== relationship.accountId
      || platform.projectId !== relationship.projectId) {
      updateEntity('platforms', platform.id, relationship)
    }
  }
}

export function listPlatforms() {
  seedBuiltIns()
  return [...loadAll('platforms')].sort((a, b) => {
    if (Boolean(a.builtIn) !== Boolean(b.builtIn)) return a.builtIn ? -1 : 1
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function getPlatform(idOrPlatformId) {
  seedBuiltIns()
  const key = String(idOrPlatformId || '').trim()
  if (!key) return null
  return findById('platforms', key) || loadAll('platforms').find(p => p.platformId === key) || null
}

export function normalizePlatformInput(input = {}, existing = null) {
  const name = text(input.name, 160) || existing?.name || ''
  if (!name) throw new Error('Platform name is required.')

  const platformId = existing ? existing.platformId : slugifyPlatformId(input.platformId || name)
  if (!platformId) throw new Error('A platform id could not be derived from the name.')

  const url = text(input.url, 400) || existing?.url || ''
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Platform URL must be a valid HTTPS URL.')

  const adminApiBasePath = text(input.adminApiBasePath ?? existing?.adminApiBasePath, 200)
  if (adminApiBasePath && !adminApiBasePath.startsWith('/')) {
    throw new Error('Admin API base path must be a relative path starting with "/".')
  }

  const environmentInput = text(input.environment ?? existing?.environment, 20).toLowerCase() || 'production'
  if (!ENVIRONMENTS.has(environmentInput)) throw new Error('Environment must be "production" or "staging".')

  const ownershipType = text(input.ownershipType ?? existing?.ownershipType, 20).toLowerCase()
  if (!OWNERSHIP_TYPES.has(ownershipType)) throw new Error('Ownership must be "in-house" or "client".')
  const projectId = text(input.projectId ?? existing?.projectId, 120)
  if (!projectId) throw new Error('Related project is required.')
  if (!findById('projects', projectId)) throw new Error('The related project could not be found.')
  const inHouseAccount = findInHouseOwnerAccount()
  const accountId = text(input.accountId ?? existing?.accountId, 120) || (ownershipType === 'in-house' ? inHouseAccount?.id : '') || ''
  if (ownershipType === 'client' && !accountId) throw new Error('Client account is required for a client-owned platform.')
  if (accountId && !findById('accounts', accountId)) throw new Error('The selected account could not be found.')

  return {
    platformId,
    name,
    url,
    adminApiBasePath,
    environment: environmentInput,
    ownershipType,
    accountId,
    projectId,
    credentialRef: assertCredentialRef(input.credentialRef ?? existing?.credentialRef),
    surface: existing ? existing.surface : (SURFACES.has(input.surface) ? input.surface : 'generic'),
    // Truthful-interface capability flag (work order 2026-08-02): action UI
    // and the action proxy only light up when an admin has set this to true.
    // Defaults false; absent on a PATCH keeps the existing value.
    supportsActions: Boolean(input.supportsActions ?? existing?.supportsActions),
    capabilities: Array.isArray(input.capabilities)
      ? [...new Set(input.capabilities.map(value => text(value, 80)).filter(Boolean))]
      : existing?.capabilities,
    builtIn: existing ? Boolean(existing.builtIn) : false,
    notes: text(input.notes ?? existing?.notes, 1000),
  }
}

export function createPlatform(input = {}) {
  seedBuiltIns()
  const normalized = normalizePlatformInput(input)
  if (loadAll('platforms').some(p => p.platformId === normalized.platformId)) {
    throw new Error(`A platform with id "${normalized.platformId}" is already registered.`)
  }
  return create('platforms', { ...normalized, status: 'unknown', lastCheckAt: null, lastCheckNote: '', manifestVersion: '' })
}

export function updatePlatform(id, patch = {}) {
  const existing = getPlatform(id)
  if (!existing) return null
  const normalized = normalizePlatformInput(patch, existing)
  return updateEntity('platforms', existing.id, normalized)
}

export function deletePlatform(id) {
  const existing = getPlatform(id)
  if (!existing) return false
  if (existing.builtIn) throw new Error(`${existing.name} is a built-in platform and cannot be removed.`)
  return removeEntity('platforms', existing.id)
}

export function recordPlatformCheck(id, { status, note, manifestVersion, capabilities } = {}) {
  const existing = getPlatform(id)
  if (!existing) return null
  const patch = {
    status: status === 'ok' ? 'ok' : 'error',
    lastCheckAt: new Date().toISOString(),
    lastCheckNote: text(note, 500),
    manifestVersion: text(manifestVersion, 40) || existing.manifestVersion || '',
  }
  if (Array.isArray(capabilities)) patch.capabilities = [...new Set(capabilities.map(value => text(value, 80)).filter(Boolean))]
  return updateEntity('platforms', existing.id, patch)
}
