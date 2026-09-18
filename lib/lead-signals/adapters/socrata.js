import { buildResult, fetchJson, renderTemplate, requestContext, signalSinceDate } from './common'

function metadataUrl(endpoint) {
  const url = new URL(endpoint)
  const match = url.pathname.match(/\/resource\/([a-z0-9-]+)\.json/i)
  return match ? `${url.origin}/api/views/${match[1]}` : null
}

export function collapseOfficerRows(rows) {
  const entities = new Map()
  for (const row of rows) {
    const existing = entities.get(row.externalId)
    if (!existing) entities.set(row.externalId, { ...row, people: [...row.people] })
    else for (const person of row.people) {
      if (!existing.people.some(item => item.name === person.name && item.title === person.title)) existing.people.push(person)
    }
  }
  return [...entities.values()]
}

export async function pullSocrata({ manifest, jurisdiction, since, signalSince, firstRun, backfill, limit = 50 }) {
  const startedAt = Date.now()
  const context = requestContext({ jurisdiction, since: signalSinceDate(since || signalSince, { firstRun, backfill }), limit })
  context.until = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const request = renderTemplate(manifest.request || {}, context)
  const headers = process.env.SOCRATA_APP_TOKEN ? { 'X-App-Token': process.env.SOCRATA_APP_TOKEN } : {}
  const metaEndpoint = metadataUrl(manifest.endpoint)
  let schemaFields = 0
  if (metaEndpoint) {
    const metadata = await fetchJson(metaEndpoint, { headers })
    schemaFields = metadata.columns?.length || 0
  }
  const url = new URL(manifest.endpoint)
  url.searchParams.set('$limit', String(context.limit))
  url.searchParams.set('$offset', '0')
  if (request.where) url.searchParams.set('$where', request.where)
  if (request.order) url.searchParams.set('$order', request.order)
  if (request.select) url.searchParams.set('$select', request.select)
  const payload = await fetchJson(url.toString(), { headers })
  const rawRows = Array.isArray(payload) ? payload : (payload.results || [])
  const result = buildResult(manifest, rawRows.slice(0, context.limit), startedAt, { endpoint: url.origin, pages: 1, schemaFields, rawRows: rawRows.length })
  if (request.collapseOfficers) result.rows = collapseOfficerRows(result.rows)
  return result
}
