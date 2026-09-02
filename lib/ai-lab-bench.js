const MAX_NAME = 120
const MAX_NOTES = 2000

export function normalizeBenchState(value) {
  return {
    entries: Array.isArray(value?.entries) ? value.entries.filter(entry => entry?.id && entry?.modelId) : [],
    hiddenModelIds: Array.isArray(value?.hiddenModelIds)
      ? [...new Set(value.hiddenModelIds.map(String).filter(Boolean))]
      : [],
  }
}

export function listBenchEntries(catalogModels = [], value = {}) {
  const state = normalizeBenchState(value)
  const catalogById = new Map(catalogModels.map(model => [model.id, model]))
  const overrides = new Map(state.entries.filter(entry => !entry.custom).map(entry => [entry.modelId, entry]))
  const hidden = new Set(state.hiddenModelIds)

  const defaults = catalogModels
    .filter(model => !hidden.has(model.id))
    .map(model => mergeBenchEntry(model, overrides.get(model.id), false))

  const custom = state.entries
    .filter(entry => entry.custom && catalogById.has(entry.modelId))
    .map(entry => mergeBenchEntry(catalogById.get(entry.modelId), entry, true))

  return [...defaults, ...custom]
}

export function mutateBenchState(value, catalogModels, action, payload = {}, options = {}) {
  const state = normalizeBenchState(value)
  const catalogById = new Map(catalogModels.map(model => [model.id, model]))
  const now = options.now || new Date().toISOString()

  if (action === 'create') {
    const modelId = String(payload.modelId || '').trim()
    if (!catalogById.has(modelId)) throw new Error('Choose a runnable catalog model')
    const id = String(options.id || `bench_${Date.now().toString(36)}`).trim()
    if (!id || state.entries.some(entry => entry.id === id)) throw new Error('Bench entry id already exists')
    state.entries.push(cleanEntry({
      id,
      modelId,
      displayName: payload.displayName || catalogById.get(modelId).name,
      notes: payload.notes,
      enabled: payload.enabled !== false,
      custom: true,
      createdAt: now,
      updatedAt: now,
    }))
    return state
  }

  const id = String(payload.id || '').trim()
  if (!id) throw new Error('Bench entry id is required')
  const customIndex = state.entries.findIndex(entry => entry.id === id && entry.custom)
  const defaultModel = catalogById.get(id)

  if (action === 'update') {
    if (customIndex >= 0) {
      state.entries[customIndex] = cleanEntry({
        ...state.entries[customIndex],
        displayName: payload.displayName,
        notes: payload.notes,
        enabled: payload.enabled !== false,
        updatedAt: now,
      })
      return state
    }
    if (!defaultModel) throw new Error('Bench entry was not found')
    const existingIndex = state.entries.findIndex(entry => !entry.custom && entry.modelId === id)
    const next = cleanEntry({
      id,
      modelId: id,
      displayName: payload.displayName || defaultModel.name,
      notes: payload.notes,
      enabled: payload.enabled !== false,
      custom: false,
      createdAt: existingIndex >= 0 ? state.entries[existingIndex].createdAt : now,
      updatedAt: now,
    })
    if (existingIndex >= 0) state.entries[existingIndex] = next
    else state.entries.push(next)
    state.hiddenModelIds = state.hiddenModelIds.filter(modelId => modelId !== id)
    return state
  }

  if (action === 'delete') {
    if (customIndex >= 0) {
      state.entries.splice(customIndex, 1)
      return state
    }
    if (!defaultModel) throw new Error('Bench entry was not found')
    state.entries = state.entries.filter(entry => entry.custom || entry.modelId !== id)
    if (!state.hiddenModelIds.includes(id)) state.hiddenModelIds.push(id)
    return state
  }

  throw new Error('Unsupported Bench action')
}

function mergeBenchEntry(model, stored, custom) {
  return {
    ...model,
    id: custom ? stored.id : model.id,
    modelId: model.id,
    displayName: stored?.displayName || model.name,
    benchNotes: stored?.notes ?? model.notes ?? '',
    enabled: stored?.enabled !== false,
    custom,
    createdAt: stored?.createdAt || null,
    updatedAt: stored?.updatedAt || null,
  }
}

function cleanEntry(entry) {
  return {
    id: String(entry.id),
    modelId: String(entry.modelId),
    displayName: String(entry.displayName || '').trim().slice(0, MAX_NAME),
    notes: String(entry.notes || '').trim().slice(0, MAX_NOTES),
    enabled: entry.enabled !== false,
    custom: Boolean(entry.custom),
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
  }
}
