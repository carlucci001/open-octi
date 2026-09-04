import { apiKeyFor, buildResult, fetchJson, renderTemplate, requestContext, rowsAt } from './common'

export async function pullRestGeneric({ manifest, jurisdiction, since, limit = 50, query = '' }) {
  const startedAt = Date.now()
  const apiKey = apiKeyFor(manifest)
  const context = requestContext({ jurisdiction, since, limit, query }, apiKey)
  const request = renderTemplate(manifest.request || {}, context)
  const method = String(request.method || 'GET').toUpperCase()
  const endpoint = new URL(manifest.endpoint)
  for (const [key, value] of Object.entries(request.query || {})) {
    if (value !== '' && value !== null && value !== undefined) endpoint.searchParams.set(key, String(value))
  }
  const headers = { Accept: 'application/json', ...(request.headers || {}) }
  const init = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(request.body || {})
  }
  const payload = await fetchJson(endpoint.toString(), init)
  const rawRows = rowsAt(payload, request.rowsPath).slice(0, context.limit)
  return buildResult(manifest, rawRows, startedAt, { endpoint: endpoint.origin, pages: 1 })
}
