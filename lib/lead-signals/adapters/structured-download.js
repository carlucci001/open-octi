import crypto from 'node:crypto'
import readXlsxFile from 'read-excel-file/node'
import { buildResult, renderTemplate, requestContext } from './common'

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some(value => value.trim())) rows.push(row)
      row = []
    } else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const headers = (rows.shift() || []).map(value => value.replace(/^\uFEFF/, '').trim())
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])))
}

export function spreadsheetRowsToObjects(workbookRows, headerRow = 0) {
  const matrix = Array.isArray(workbookRows?.[0]?.data) ? workbookRows[0].data : workbookRows
  if (!Array.isArray(matrix) || matrix.length === 0) return []
  const headers = matrix[headerRow].map(value => String(value ?? '').trim())
  return matrix.slice(headerRow + 1).filter(row => row.some(value => value !== null && value !== '')).map(values => Object.fromEntries(
    headers.map((header, index) => [header, values[index] instanceof Date ? values[index].toISOString() : (values[index] ?? '')]),
  ))
}

export async function pullStructuredDownload({ manifest, jurisdiction, since, limit = 50, query = '' }) {
  const startedAt = Date.now()
  const context = requestContext({ jurisdiction, since, limit, query })
  const endpoint = new URL(renderTemplate(manifest.endpoint, context))
  if (/\.pdf(?:$|\?)/i.test(endpoint.href)) throw new Error('PDF campaign sources are forbidden')
  const response = await fetch(endpoint, { headers: { Accept: 'text/csv, application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${endpoint.hostname}`)
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('pdf') || contentType.includes('html')) throw new Error(`Structured campaign source returned forbidden ${contentType || 'content'}`)
  const format = String(manifest.request?.format || '').toLowerCase()
  const isXlsx = format === 'xlsx' || contentType.includes('spreadsheetml') || endpoint.pathname.endsWith('.xlsx')
  const bytes = isXlsx ? Buffer.from(await response.arrayBuffer()) : Buffer.from(await response.text())
  const text = isXlsx ? null : bytes.toString('utf8')
  let rawRows
  if (format === 'json' || contentType.includes('json')) {
    const payload = JSON.parse(text)
    rawRows = Array.isArray(payload) ? payload : payload.results || payload.data || []
  } else if (format === 'csv' || contentType.includes('csv') || endpoint.pathname.endsWith('.csv')) rawRows = parseCsv(text)
  else if (isXlsx) rawRows = spreadsheetRowsToObjects(await readXlsxFile(bytes), Number(manifest.request?.headerRow || 0))
  else throw new Error(`Unsupported structured campaign format: ${format || contentType || 'unknown'}`)
  const state = String(jurisdiction?.state || '').toUpperCase()
  if (state && manifest.fields?.state) rawRows = rawRows.filter(row => String(row[manifest.fields.state] || '').toUpperCase() === state)
  const result = buildResult(manifest, rawRows.slice(0, context.limit), startedAt, { endpoint: endpoint.origin, pages: 1, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  result.rows = result.rows.map(row => ({
    ...row,
    trigger: 'candidate-filed',
    entity: { ...row.entity, address: { ...row.entity.address, state: row.entity.address?.state || state || null } },
    people: row.people.map(person => ({ ...person, title: person.title === 'Provider' ? 'Candidate' : person.title })),
    attrs: { ...row.attrs, sourceHash: result.stats.sha256 },
  }))
  return result
}
