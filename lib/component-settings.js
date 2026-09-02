// Per-component configuration layer.
// Every section of Command Center can carry its own settings surface ("full
// CRUD extended to settings"). Overrides are stored SPARSELY per scope and
// resolve through a layered chain:
//   registry default (code/env) -> global -> brand:<id> -> account:<id> -> campaign:<id>
// so changing a global default propagates everywhere it has not been
// explicitly overridden. Registry (this file) is the source of truth for
// valid components, keys, types, and which scopes may override each key.
// Origin: claude/command-center-session-handoff-2026-07-23.md (next initiative).
import { mutateData, readData } from './dataStore'

const FILE = 'component-settings.json'

export class ComponentSettingsError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ComponentSettingsError'
    this.status = status
  }
}

// Lazy require keeps this module import-cycle-safe (same pattern dataStore
// uses for its sqlite adapter).
function campaignStudioLib() {
  return require('./campaign-studio')
}

export const COMPONENT_SETTINGS_REGISTRY = {
  'campaign-studio.campaigns': {
    label: 'Campaigns list',
    group: 'Campaign Studio',
    settings: {
      view: { type: 'enum', label: 'Default view', options: ['list', 'card'], default: 'list', scopes: ['global'] },
      pageSize: { type: 'number', label: 'Campaigns per page', min: 5, max: 250, default: 25, scopes: ['global'] },
    },
  },
  'campaign-studio.post-queue': {
    label: 'Post Queue',
    group: 'Campaign Studio',
    settings: {
      view: { type: 'enum', label: 'Default view', options: ['list', 'card'], default: 'list', scopes: ['global'] },
      pageSize: { type: 'number', label: 'Posts per page', min: 5, max: 100, default: 10, scopes: ['global'] },
    },
  },
  'campaign-studio.brief': {
    label: 'Campaign brief defaults',
    group: 'Campaign Studio',
    settings: {
      defaultBrandId: {
        type: 'enum', label: 'Default brand', default: 'farrington-development', scopes: ['global'],
        options: () => campaignStudioLib().listCampaignBrands().brands.map(b => ({ value: b.id, label: b.label || b.id })),
      },
      defaultCadenceId: {
        type: 'enum', label: 'Default cadence', default: 'daily-7', scopes: ['global', 'brand'],
        options: () => campaignStudioLib().CADENCES.map(c => ({ value: c.id, label: c.label || c.id })),
      },
      defaultCustomDays: { type: 'number', label: 'Custom run length (days)', min: 1, max: 90, default: 30, scopes: ['global', 'brand'] },
      defaultCreationEndpoint: {
        type: 'enum', label: 'Default creation endpoint', default: 'openai', scopes: ['global', 'brand'],
        options: () => campaignStudioLib().CREATION_ENDPOINTS.map(e => ({ value: e.id, label: e.label || e.id })),
      },
    },
  },
  'campaign-studio.image-gen': {
    label: 'Image generation',
    group: 'Campaign Studio',
    settings: {
      quality: {
        type: 'enum', label: 'OpenAI image quality',
        options: [
          { value: 'high', label: 'High — ≈$0.17/image ($0.40 with brand logos)' },
          { value: 'medium', label: 'Medium — ≈$0.05/image, softer detail' },
          { value: 'low', label: 'Low — cheapest, draft quality' },
        ],
        default: () => process.env.OPENAI_IMAGE_QUALITY || 'high',
        scopes: ['global', 'brand', 'campaign'],
        help: 'Applies to OpenAI gpt-image-1. Resolved server-side at generation time.',
      },
      useBrandReferences: {
        type: 'boolean', label: 'Attach brand logo references', default: true,
        scopes: ['global', 'brand', 'campaign'],
        help: 'Off = clean generations that never pull a brand mark (and cost less on OpenAI).',
      },
    },
  },
  'leads.list': {
    label: 'Leads list',
    group: 'Sales',
    settings: {
      view: { type: 'enum', label: 'Default view', options: ['list', 'grid', 'kanban', 'lead-lists'], default: 'list', scopes: ['global'] },
      pageSize: { type: 'number', label: 'Leads per page', min: 10, max: 250, default: 50, scopes: ['global'] },
      defaultSort: {
        type: 'enum', label: 'Default sort',
        options: [
          { value: 'created', label: 'Received date' },
          { value: 'name', label: 'Name' },
          { value: 'status', label: 'Status' },
        ],
        default: 'created', scopes: ['global'],
      },
      defaultSortDir: {
        type: 'enum', label: 'Default sort direction',
        options: [{ value: 'desc', label: 'Newest / Z→A first' }, { value: 'asc', label: 'Oldest / A→Z first' }],
        default: 'desc', scopes: ['global'],
      },
      defaultStatusFilter: {
        type: 'enum', label: 'Default status filter',
        options: [
          { value: 'all', label: 'All statuses' },
          { value: 'new', label: 'New' },
          { value: 'contacted', label: 'Contacted' },
          { value: 'qualified', label: 'Qualified' },
          { value: 'converted', label: 'Converted' },
          { value: 'unqualified', label: 'Unqualified' },
        ],
        default: 'all', scopes: ['global'],
        help: 'Applied on first visit; a device\u2019s last-used filter still wins once saved.',
      },
    },
  },
  'contacts.list': {
    label: 'Contacts list',
    group: 'Sales',
    settings: {
      view: { type: 'enum', label: 'Default view', options: ['list', 'card'], default: 'list', scopes: ['global'] },
      pageSize: { type: 'number', label: 'Contacts per page', min: 10, max: 250, default: 25, scopes: ['global'] },
      defaultSort: {
        type: 'enum', label: 'Default sort',
        options: [
          { value: 'updated', label: 'Last updated' },
          { value: 'name', label: 'Name' },
          { value: 'account', label: 'Account' },
        ],
        default: 'updated', scopes: ['global'],
      },
      defaultSortDir: {
        type: 'enum', label: 'Default sort direction',
        options: [{ value: 'desc', label: 'Newest / Z→A first' }, { value: 'asc', label: 'Oldest / A→Z first' }],
        default: 'desc', scopes: ['global'],
      },
    },
  },
  'research.list': {
    label: 'Research dossiers',
    group: 'Sales',
    settings: {
      pageSize: { type: 'number', label: 'Dossiers per page', min: 5, max: 100, default: 25, scopes: ['global'] },
    },
  },
  'clients.list': {
    label: 'Clients list',
    group: 'Accounts & Clients',
    settings: {
      view: { type: 'enum', label: 'Default view', options: ['list', 'card'], default: 'list', scopes: ['global'] },
      pageSize: { type: 'number', label: 'Clients per page', min: 10, max: 250, default: 50, scopes: ['global'] },
    },
  },
  'documents.list': {
    label: 'Documents list',
    group: 'Workspace',
    settings: {
      view: { type: 'enum', label: 'Default view', options: ['list', 'card'], default: 'list', scopes: ['global'] },
      pageSize: { type: 'number', label: 'Documents per page', min: 10, max: 250, default: 25, scopes: ['global'] },
    },
  },
  'accounts.360': {
    label: 'Account 360 tiles',
    group: 'Accounts & Clients',
    settings: {
      visibleTiles: {
        type: 'multi-enum', label: 'Tiles shown',
        options: [
          { value: 'contacts', label: 'Contacts' },
          { value: 'pipeline', label: 'Open Pipeline' },
          { value: 'tickets', label: 'Open Tickets' },
          { value: 'activity', label: 'Last Activity' },
          { value: 'projects', label: 'Projects' },
          { value: 'tasks', label: 'Open Tasks' },
          { value: 'time', label: 'Tracked Time' },
        ],
        default: ['contacts', 'pipeline', 'tickets', 'activity', 'projects', 'tasks', 'time'],
        scopes: ['global'],
      },
    },
  },
  'support.queue': {
    label: 'Support queue',
    group: 'Support & Delivery',
    settings: {
      defaultPreset: {
        type: 'enum', label: 'Default preset view',
        options: [
          { value: 'all', label: 'All tickets' },
          { value: 'unassigned', label: 'Unassigned' },
          { value: 'breaching', label: 'SLA breaching' },
          { value: 'waiting', label: 'Waiting on client' },
          { value: 'urgent', label: 'Urgent' },
        ],
        default: 'all', scopes: ['global'],
      },
      defaultStatusFilter: {
        type: 'enum', label: 'Default status filter',
        options: [
          { value: 'open', label: 'Open tickets' },
          { value: 'all', label: 'All (incl. closed)' },
        ],
        default: 'open', scopes: ['global'],
      },
      breachFirstSort: {
        type: 'boolean', label: 'SLA breaches sort to top', default: true, scopes: ['global'],
        help: 'Off = plain most-recently-updated order.',
      },
    },
  },
  'pipelines.board': {
    label: 'Pipelines board',
    group: 'Support & Delivery',
    settings: {
      showIdleChips: {
        type: 'boolean', label: 'Show idle-deal chips', default: true, scopes: ['global'],
      },
      idleWarnDays: {
        type: 'number', label: 'Idle warning after (days)', min: 1, max: 60, default: 7, scopes: ['global'],
        help: 'Amber chip when a deal has not moved in this many days.',
      },
      idleHotDays: {
        type: 'number', label: 'Idle critical after (days)', min: 2, max: 120, default: 14, scopes: ['global'],
        help: 'Chip turns red at this age.',
      },
      showForecastStrip: {
        type: 'boolean', label: 'Show weighted forecast strip', default: true, scopes: ['global'],
      },
    },
  },
}

const SCOPE_RE = /^(global|brand:[\w.-]+|account:[\w.-]+|campaign:[\w.-]+)$/

function componentDef(componentId) {
  const def = COMPONENT_SETTINGS_REGISTRY[componentId]
  if (!def) throw new ComponentSettingsError(`unknown component: ${componentId}`, 404)
  return def
}

function scopeKind(scope) {
  return scope === 'global' ? 'global' : String(scope).split(':')[0]
}

export function normalizeScope(scope) {
  const value = String(scope || '').trim()
  if (!SCOPE_RE.test(value)) throw new ComponentSettingsError(`invalid scope: ${scope}`)
  return value
}

function settingDefault(def) {
  return typeof def.default === 'function' ? def.default() : def.default
}

function resolveOptions(def) {
  const raw = typeof def.options === 'function' ? def.options() : def.options
  if (!Array.isArray(raw)) return []
  return raw.map(option => (typeof option === 'object' && option !== null
    ? { value: String(option.value), label: String(option.label ?? option.value) }
    : { value: String(option), label: String(option) }))
}

export function validateSettingValue(def, value) {
  if (def.type === 'boolean') {
    if (typeof value !== 'boolean') throw new ComponentSettingsError('expected boolean')
    return value
  }
  if (def.type === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) throw new ComponentSettingsError('expected number')
    if (def.min !== undefined && n < def.min) throw new ComponentSettingsError(`minimum is ${def.min}`)
    if (def.max !== undefined && n > def.max) throw new ComponentSettingsError(`maximum is ${def.max}`)
    return Math.round(n)
  }
  if (def.type === 'enum') {
    const v = String(value)
    const allowed = resolveOptions(def).map(option => option.value)
    if (!allowed.includes(v)) throw new ComponentSettingsError(`must be one of: ${allowed.join(', ')}`)
    return v
  }
  if (def.type === 'multi-enum') {
    if (!Array.isArray(value)) throw new ComponentSettingsError('expected array')
    const allowed = new Set(resolveOptions(def).map(option => option.value))
    const list = value.map(String)
    for (const item of list) {
      if (!allowed.has(item)) throw new ComponentSettingsError(`invalid option: ${item}`)
    }
    return [...new Set(list)]
  }
  throw new ComponentSettingsError(`unsupported type: ${def.type}`)
}

function readStore() {
  const data = readData(FILE)
  return data && typeof data === 'object' ? data : { version: 1, settings: {} }
}

export function scopeChainFor(context = {}) {
  const chain = ['global']
  if (context.brandId) chain.push(`brand:${context.brandId}`)
  if (context.accountId) chain.push(`account:${context.accountId}`)
  if (context.campaignId) chain.push(`campaign:${context.campaignId}`)
  return chain
}

export function getScopeOverrides(componentId, scope) {
  componentDef(componentId)
  const normalized = normalizeScope(scope)
  const store = readStore()
  return { ...(store.settings?.[componentId]?.[normalized] || {}) }
}

// Stale keys and keys whose scope permission was later tightened are
// silently ignored — the registry always wins.
function isValidOverrideKey(def, kind, key) {
  const settingDef = def.settings[key]
  return !!settingDef && settingDef.scopes.includes(kind)
}

export function resolveComponentSettings(componentId, context = {}) {
  const def = componentDef(componentId)
  const store = readStore()
  const layers = store.settings?.[componentId] || {}
  const chain = scopeChainFor(context)
  const values = {}
  const sources = {}
  for (const [key, settingDef] of Object.entries(def.settings)) {
    values[key] = settingDefault(settingDef)
    sources[key] = 'default'
  }
  for (const scope of chain) {
    const overrides = layers[scope]
    if (!overrides) continue
    const kind = scopeKind(scope)
    for (const [key, value] of Object.entries(overrides)) {
      if (!isValidOverrideKey(def, kind, key)) continue
      values[key] = value
      sources[key] = scope
    }
  }
  return { componentId, values, sources }
}

export function setScopeOverrides(componentId, scope, { set = {}, unset = [] } = {}) {
  const def = componentDef(componentId)
  const normalized = normalizeScope(scope)
  const kind = scopeKind(normalized)
  const applied = {}
  for (const [key, raw] of Object.entries(set || {})) {
    const settingDef = def.settings[key]
    if (!settingDef) throw new ComponentSettingsError(`unknown setting: ${key}`)
    if (!settingDef.scopes.includes(kind)) {
      throw new ComponentSettingsError(`${key} cannot be set at ${kind} scope`)
    }
    applied[key] = validateSettingValue(settingDef, raw)
  }
  const removals = (Array.isArray(unset) ? unset : []).map(String).filter(key => def.settings[key])
  return mutateData(FILE, current => {
    const base = current && typeof current === 'object' ? current : { version: 1, settings: {} }
    const settings = { ...(base.settings || {}) }
    const component = { ...(settings[componentId] || {}) }
    const scoped = { ...(component[normalized] || {}) }
    for (const key of removals) delete scoped[key]
    Object.assign(scoped, applied)
    if (Object.keys(scoped).length) component[normalized] = scoped
    else delete component[normalized]
    if (Object.keys(component).length) settings[componentId] = component
    else delete settings[componentId]
    const data = { ...base, version: 1, settings, updatedAt: Date.now() }
    return { data, result: { ...scoped } }
  })
}

export function listComponentSchema(componentId) {
  const def = componentDef(componentId)
  return {
    componentId,
    label: def.label,
    settings: Object.entries(def.settings).map(([key, s]) => ({
      key,
      type: s.type,
      label: s.label || key,
      help: s.help || '',
      scopes: [...s.scopes],
      default: settingDefault(s),
      ...(s.type === 'enum' || s.type === 'multi-enum' ? { options: resolveOptions(s) } : {}),
      ...(s.min !== undefined ? { min: s.min } : {}),
      ...(s.max !== undefined ? { max: s.max } : {}),
    })),
  }
}

export function listRegisteredComponents() {
  const store = readStore()
  return Object.entries(COMPONENT_SETTINGS_REGISTRY).map(([id, def]) => {
    const layers = store.settings?.[id] || {}
    const overrideScopes = Object.keys(layers).filter(scope => {
      const kind = scopeKind(scope)
      return Object.keys(layers[scope] || {}).some(key => isValidOverrideKey(def, kind, key))
    })
    return {
      id,
      label: def.label,
      group: def.group || 'Other',
      settingsCount: Object.keys(def.settings).length,
      overrideScopes,
    }
  })
}
