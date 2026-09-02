export const DEFAULT_APOLLO_PAID_SEARCHES = 2
export const MAX_APOLLO_PAID_SEARCHES = 6

export function normalizeApolloPaidSearches(value, fallback = DEFAULT_APOLLO_PAID_SEARCHES) {
  const parsed = Number(value)
  const fallbackValue = Number(fallback)
  const normalizedFallback = Number.isFinite(fallbackValue)
    ? Math.min(MAX_APOLLO_PAID_SEARCHES, Math.max(1, Math.floor(fallbackValue)))
    : DEFAULT_APOLLO_PAID_SEARCHES
  if (!Number.isFinite(parsed)) return normalizedFallback
  return Math.min(MAX_APOLLO_PAID_SEARCHES, Math.max(1, Math.floor(parsed)))
}

export function buildLeadVendorRequest(provider, maxPaidBatches) {
  const normalizedProvider = String(provider || '').trim().toLowerCase() === 'apollo' ? 'apollo' : 'apify'
  return {
    provider: normalizedProvider,
    maxPaidBatches: normalizedProvider === 'apollo'
      ? normalizeApolloPaidSearches(maxPaidBatches)
      : 1,
  }
}

export function paidSearchLimitFromConfig(config) {
  return normalizeApolloPaidSearches(config?.maxPaidBatches)
}
