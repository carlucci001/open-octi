import { buildResult, fetchJson, renderTemplate, requestContext } from './common'

function metadataUrl(endpoint) {
  const url = new URL(endpoint)
  const match = url.pathname.match(/\/resource\/([a-z0-9-]+)\.json/i)
  return match ? `${url.origin}/api/views/${match[1]}` : null
}

export async function pullSocrata({ manifest, jurisdiction, since, limit = 50 }) {
  const startedAt = Date.now()
  const context = requestContext({ jurisdiction, since, limit })
  const request = renderTemplate(manifest.request || {}, context)
  const metaEndpoint = metadataUrl(manifest.endpoint)
  let schemaFields = 0
  if (metaEndpoint) {
    const metadata = await fetchJson(metaEndpoint)
    schemaFields = metadata.columns?.length || 0
  }
  const url = new URL(manifest.endpoint)
  url.searchParams.set('$limit', String(context.limit))
  url.searchParams.set('$offset', '0')
  if (request.where) url.searchParams.set('$where', request.where)
  if (request.order) url.searchParams.set('$order', request.order)
  const payload = await fetchJson(url.toString())
  const rawRows = Array.isArray(payload) ? payload : (payload.results || [])
  return buildResult(manifest, rawRows.slice(0, context.limit), startedAt, { endpoint: url.origin, pages: 1, schemaFields })
}
