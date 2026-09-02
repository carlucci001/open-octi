export function selectedModelEntries(selectedModelIds = [], models = []) {
  return selectedModelIds
    .map(id => models.find(model => model.id === id))
    .filter(Boolean)
}

export function countSelectedProviders(selectedEntries = []) {
  return new Set(selectedEntries.map(model => model.provider).filter(Boolean)).size
}

export function canRunModelComparison(selectedModelIds = [], prompt = '') {
  return selectedModelIds.length >= 2 && Boolean(String(prompt || '').trim())
}

export function selectReadyModelSlate(models = [], maxCount = 2) {
  const readyModels = models.filter(model => model?.configured)
  const byProvider = []

  for (const model of readyModels) {
    if (!byProvider.some(item => item.provider === model.provider)) byProvider.push(model)
    if (byProvider.length >= maxCount) break
  }

  const picked = byProvider.length >= Math.min(maxCount, 2)
    ? byProvider
    : readyModels.slice(0, maxCount)

  return picked.map(model => model.id)
}
