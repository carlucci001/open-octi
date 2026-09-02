import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@/lib/dataStore', () => ({
  readData: file => (store.has(file) ? JSON.parse(JSON.stringify(store.get(file))) : null),
  writeData: (file, data) => store.set(file, data),
  mutateData: (file, mutator) => {
    const current = store.has(file) ? JSON.parse(JSON.stringify(store.get(file))) : null
    const outcome = mutator(current)
    store.set(file, outcome.data)
    return outcome.result
  },
}))

describe('component settings layer', () => {
  beforeEach(() => {
    store.clear()
    vi.unstubAllEnvs()
  })

  it('resolves registry defaults with default provenance when nothing is stored', async () => {
    const { resolveComponentSettings } = await import('@/lib/component-settings')
    const { values, sources } = resolveComponentSettings('campaign-studio.post-queue', {})
    expect(values).toMatchObject({ view: 'list', pageSize: 10 })
    expect(sources).toMatchObject({ view: 'default', pageSize: 'default' })
  })

  it('layers global under brand under campaign with provenance', async () => {
    const { resolveComponentSettings, setScopeOverrides } = await import('@/lib/component-settings')
    setScopeOverrides('campaign-studio.image-gen', 'global', { set: { quality: 'medium' } })
    setScopeOverrides('campaign-studio.image-gen', 'brand:newsroom-aios', { set: { useBrandReferences: false } })
    setScopeOverrides('campaign-studio.image-gen', 'campaign:camp_1', { set: { quality: 'high' } })

    const global = resolveComponentSettings('campaign-studio.image-gen', {})
    expect(global.values.quality).toBe('medium')
    expect(global.values.useBrandReferences).toBe(true)

    const brand = resolveComponentSettings('campaign-studio.image-gen', { brandId: 'newsroom-aios' })
    expect(brand.values).toMatchObject({ quality: 'medium', useBrandReferences: false })
    expect(brand.sources).toMatchObject({ quality: 'global', useBrandReferences: 'brand:newsroom-aios' })

    const campaign = resolveComponentSettings('campaign-studio.image-gen', { brandId: 'newsroom-aios', campaignId: 'camp_1' })
    expect(campaign.values).toMatchObject({ quality: 'high', useBrandReferences: false })
    expect(campaign.sources.quality).toBe('campaign:camp_1')
  })

  it('stores sparse overrides and unset falls back through the chain', async () => {
    const { getScopeOverrides, resolveComponentSettings, setScopeOverrides } = await import('@/lib/component-settings')
    setScopeOverrides('campaign-studio.post-queue', 'global', { set: { pageSize: 50 } })
    expect(getScopeOverrides('campaign-studio.post-queue', 'global')).toEqual({ pageSize: 50 })
    const overrides = setScopeOverrides('campaign-studio.post-queue', 'global', { unset: ['pageSize'] })
    expect(overrides).toEqual({})
    const { values, sources } = resolveComponentSettings('campaign-studio.post-queue', {})
    expect(values.pageSize).toBe(10)
    expect(sources.pageSize).toBe('default')
  })

  it('rejects unknown components, unknown keys, bad values, and disallowed scopes', async () => {
    const { setScopeOverrides } = await import('@/lib/component-settings')
    expect(() => setScopeOverrides('nope.nothing', 'global', { set: {} })).toThrow(/unknown component/)
    expect(() => setScopeOverrides('campaign-studio.post-queue', 'global', { set: { bogus: 1 } })).toThrow(/unknown setting/)
    expect(() => setScopeOverrides('campaign-studio.post-queue', 'global', { set: { view: 'kanban' } })).toThrow(/must be one of/)
    expect(() => setScopeOverrides('campaign-studio.post-queue', 'global', { set: { pageSize: 2 } })).toThrow(/minimum/)
    expect(() => setScopeOverrides('campaign-studio.post-queue', 'brand:x', { set: { pageSize: 20 } })).toThrow(/cannot be set at brand scope/)
    expect(() => setScopeOverrides('campaign-studio.post-queue', 'garbage scope', { set: {} })).toThrow(/invalid scope/)
  })

  it('feeds the OpenAI quality default from env at resolve time', async () => {
    const { resolveComponentSettings } = await import('@/lib/component-settings')
    vi.stubEnv('OPENAI_IMAGE_QUALITY', 'medium')
    expect(resolveComponentSettings('campaign-studio.image-gen', {}).values.quality).toBe('medium')
    vi.unstubAllEnvs()
    expect(resolveComponentSettings('campaign-studio.image-gen', {}).values.quality).toBe('high')
  })

  it('ignores stored keys whose scope kind is not allowed by the registry', async () => {
    const { resolveComponentSettings } = await import('@/lib/component-settings')
    store.set('component-settings.json', {
      version: 1,
      settings: { 'campaign-studio.post-queue': { 'brand:newsroom-aios': { pageSize: 99 } } },
    })
    const { values } = resolveComponentSettings('campaign-studio.post-queue', { brandId: 'newsroom-aios' })
    expect(values.pageSize).toBe(10)
  })

  it('schema serializes labels, options, bounds, and scopes for the drawer', async () => {
    const { listComponentSchema } = await import('@/lib/component-settings')
    const schema = listComponentSchema('campaign-studio.image-gen')
    const quality = schema.settings.find(s => s.key === 'quality')
    expect(quality.options.map(o => o.value)).toEqual(['high', 'medium', 'low'])
    expect(quality.scopes).toEqual(['global', 'brand', 'campaign'])
    const pageSize = listComponentSchema('leads.list').settings.find(s => s.key === 'pageSize')
    expect(pageSize).toMatchObject({ min: 10, max: 250, default: 50 })
  })

  it('registers the support queue and pipelines board components with usable defaults', async () => {
    const { resolveComponentSettings } = await import('@/lib/component-settings')
    const support = resolveComponentSettings('support.queue', {})
    expect(support.values).toMatchObject({ defaultPreset: 'all', defaultStatusFilter: 'open', breachFirstSort: true })
    const board = resolveComponentSettings('pipelines.board', {})
    expect(board.values).toMatchObject({ showIdleChips: true, idleWarnDays: 7, idleHotDays: 14, showForecastStrip: true })
  })

  it('lists components with group, settings count, and override scopes for the hub', async () => {
    const { listRegisteredComponents, setScopeOverrides } = await import('@/lib/component-settings')
    setScopeOverrides('pipelines.board', 'global', { set: { idleWarnDays: 10 } })
    const components = listRegisteredComponents()
    const board = components.find(c => c.id === 'pipelines.board')
    expect(board).toMatchObject({ group: 'Support & Delivery', settingsCount: 4 })
    expect(board.overrideScopes).toEqual(['global'])
    const leads = components.find(c => c.id === 'leads.list')
    expect(leads).toMatchObject({ group: 'Sales', settingsCount: 5 })
    expect(leads.overrideScopes).toEqual([])
    expect(components.every(c => typeof c.group === 'string' && c.group.length > 0)).toBe(true)
  })

  it('does not flag a component as customized when its only stored override key is stale', async () => {
    const { listRegisteredComponents } = await import('@/lib/component-settings')
    store.set('component-settings.json', {
      version: 1,
      settings: { 'pipelines.board': { global: { retiredSetting: true } } },
    })
    const components = listRegisteredComponents()
    const board = components.find(c => c.id === 'pipelines.board')
    expect(board.overrideScopes).toEqual([])
  })

  it('still flags a component as customized when a scope mixes a stale key with a valid one', async () => {
    const { listRegisteredComponents } = await import('@/lib/component-settings')
    store.set('component-settings.json', {
      version: 1,
      settings: { 'pipelines.board': { global: { retiredSetting: true, idleWarnDays: 10 } } },
    })
    const components = listRegisteredComponents()
    const board = components.find(c => c.id === 'pipelines.board')
    expect(board.overrideScopes).toEqual(['global'])
  })

  it('leads sort and status defaults validate against their enums', async () => {
    const { setScopeOverrides } = await import('@/lib/component-settings')
    expect(() => setScopeOverrides('leads.list', 'global', { set: { defaultSort: 'value' } })).toThrow(/must be one of/)
    expect(setScopeOverrides('leads.list', 'global', { set: { defaultSort: 'name', defaultSortDir: 'asc', defaultStatusFilter: 'new' } }))
      .toEqual({ defaultSort: 'name', defaultSortDir: 'asc', defaultStatusFilter: 'new' })
  })
})
