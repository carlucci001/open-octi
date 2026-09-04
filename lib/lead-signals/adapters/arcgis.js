import { buildResult, fetchJson, getPath, renderTemplate, requestContext } from './common'

function firstField(spec, available) {
  const candidates = Array.isArray(spec) ? spec : [spec]
  return candidates.find(field => typeof field === 'string' && available.has(field)) || null
}

function addCondition(baseWhere, condition) {
  const base = String(baseWhere || '1=1').trim()
  return !base || base === '1=1' ? condition : `(${base}) AND (${condition})`
}

function dateWhereCandidates({ manifest, request, context, field, fieldType }) {
  const template = String(manifest.request?.where || '')
  const configured = String(request.where || '1=1')
  const shouldFilter = Boolean(field && (manifest.discovered || request.dateFilter === true || /\{since(?:Date)?\}/.test(template)))
  if (!shouldFilter) return [{ mode: 'configured', where: configured, filtersDate: false }]

  const baseWhere = /\{since(?:Date)?\}/.test(template) ? '1=1' : configured
  const iso = context.sinceDate
  const compact = iso.replace(/-/g, '')
  const epoch = Date.parse(`${iso}T00:00:00.000Z`)
  const filters = fieldType === 'esriFieldTypeString'
    ? [
        ['string-compact', `${field} >= '${compact}'`],
        ['string-iso', `${field} >= '${iso}'`],
      ]
    : [
        ['timestamp', `${field} >= TIMESTAMP '${iso} 00:00:00'`],
        ['date-literal', `${field} >= DATE '${iso}'`],
        ['epoch-ms', `${field} >= ${epoch}`],
      ]
  return [
    ...filters.map(([mode, condition]) => ({ mode, where: addCondition(baseWhere, condition), filtersDate: true })),
    { mode: 'client-fallback', where: baseWhere, filtersDate: false },
  ]
}

function parsedDate(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  const date = compact ? new Date(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00.000Z`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function queryUrl(base, request, context, where) {
  const query = new URL(`${base}/query`)
  query.searchParams.set('f', 'json')
  query.searchParams.set('where', where)
  query.searchParams.set('outFields', request.outFields || '*')
  query.searchParams.set('returnGeometry', 'false')
  query.searchParams.set('resultOffset', '0')
  query.searchParams.set('resultRecordCount', String(Math.min(context.limit, request.pageSize || 200)))
  if (request.orderByFields) query.searchParams.set('orderByFields', request.orderByFields)
  return query
}

export async function pullArcgis({ manifest, jurisdiction, since, limit = 50 }) {
  const startedAt = Date.now()
  const context = requestContext({ jurisdiction, since, limit })
  const request = renderTemplate(manifest.request || {}, context)
  const base = manifest.endpoint.replace(/\/$/, '')
  const metadata = await fetchJson(`${base}?f=json`)
  if (metadata.error) throw new Error(`ArcGIS schema error: ${metadata.error.message || 'unknown error'}`)
  const available = new Set((metadata.fields || []).map(field => field.name))
  const fieldTypes = new Map((metadata.fields || []).map(field => [field.name, field.type]))
  const required = Object.values(manifest.fields || {}).flat().filter(value => typeof value === 'string' && value !== manifest.fields?.county)
  const configured = required.filter(field => available.has(field)).length
  if (available.size && required.length && configured === 0) throw new Error(`ArcGIS schema does not match ${manifest.id}`)
  const dateField = firstField(manifest.fields?.triggeredAt, available)
  const candidates = dateWhereCandidates({ manifest, request, context, field: dateField, fieldType: fieldTypes.get(dateField) })
  const retryLadder = []
  let selected = null
  let rawRows = []
  let lastError = null
  for (const candidate of candidates) {
    const payload = await fetchJson(queryUrl(base, request, context, candidate.where).toString())
    if (payload.error) {
      lastError = payload.error.message || 'unknown error'
      retryLadder.push({ mode: candidate.mode, outcome: 'error', message: lastError })
    } else {
      const fetched = (payload.features || []).map(feature => feature.attributes || feature)
      retryLadder.push({ mode: candidate.mode, outcome: fetched.length ? 'ok' : 'empty', rows: fetched.length })
      if (fetched.length || candidate === candidates.at(-1)) {
        selected = candidate
        rawRows = fetched
        break
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!selected) throw new Error(`ArcGIS query error: ${lastError || 'all date-filter attempts failed'}`)

  let clientFiltered = false
  if (selected.mode === 'client-fallback' && since && dateField) {
    const cutoff = new Date(context.sinceDate)
    rawRows = rawRows.filter(row => {
      const date = parsedDate(getPath(row, manifest.fields.triggeredAt))
      return date && date >= cutoff
    })
    clientFiltered = true
  }
  rawRows = rawRows.slice(0, context.limit)
  return buildResult(manifest, rawRows, startedAt, {
    endpoint: new URL(base).origin,
    pages: 1,
    schemaFields: available.size,
    dateField,
    dateFieldType: dateField ? fieldTypes.get(dateField) : null,
    dateFilterMode: selected.mode,
    clientFiltered,
    retryLadder,
  })
}
