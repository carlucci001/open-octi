import crypto from 'node:crypto'

export class LeadSourceNeedsKeyError extends Error {
  constructor(manifest) {
    super(`${manifest.name} needs a free API key before it can be proven`)
    this.name = 'LeadSourceNeedsKeyError'
    this.code = 'needs-key'
    this.settingsLink = manifest.auth?.settingsLink || '/openocti?tab=models-keys'
  }
}

export function getPath(value, pathSpec) {
  if (Array.isArray(pathSpec)) {
    for (const candidate of pathSpec) {
      const found = getPath(value, candidate)
      if (found !== undefined && found !== null && String(found).trim() !== '') return found
    }
    return null
  }
  if (pathSpec === null || pathSpec === undefined) return null
  if (typeof pathSpec !== 'string') return pathSpec
  return pathSpec.split('.').reduce((cursor, part) => cursor?.[part], value)
}

export function renderTemplate(value, context) {
  if (Array.isArray(value)) return value.map(item => renderTemplate(item, context))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, context)]))
  if (typeof value !== 'string') return value
  const exact = value.match(/^\{([^}]+)\}$/)
  if (exact && context[exact[1]] !== undefined) return context[exact[1]]
  return value.replace(/\{([^}]+)\}/g, (_, key) => context[key] ?? '')
}

export function requestContext({ jurisdiction = {}, since, limit = 50, offset = 0, query = '' } = {}, apiKey = '') {
  const today = new Date().toISOString().slice(0, 10)
  const sinceDate = (since ? new Date(since) : new Date(Date.now() - 30 * 86400000)).toISOString().slice(0, 10)
  return {
    zip: jurisdiction.zip || '',
    county: jurisdiction.county || '',
    countyFips: jurisdiction.countyFips || '',
    state: jurisdiction.state || '',
    since: sinceDate,
    sinceDate,
    today,
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
    offset,
    query,
    serialNumber: jurisdiction.serialNumber || '97123420',
    apiKey,
  }
}

export function apiKeyFor(manifest) {
  if (manifest.auth?.type !== 'key') return ''
  const key = manifest.auth.env ? process.env[manifest.auth.env] : ''
  if (!key) throw new LeadSourceNeedsKeyError(manifest)
  return key
}

function dateValue(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  const date = compact
    ? new Date(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00.000Z`)
    : (typeof value === 'number' ? new Date(value) : new Date(text))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function clean(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text || null
}

export function normalizeSignal(raw, manifest) {
  const fields = manifest.fields || {}
  const external = clean(getPath(raw, fields.externalId))
  const organizationName = clean(getPath(raw, fields.organizationName))
  const firstName = clean(getPath(raw, fields.firstName))
  const lastName = clean(getPath(raw, fields.lastName))
  const credential = clean(getPath(raw, fields.credential))
  const personName = [firstName, lastName].filter(Boolean).join(' ')
  const providerName = personName ? `${personName}${credential ? `, ${credential}` : ''}` : null
  const name = organizationName || clean(getPath(raw, fields.name)) || providerName || 'Unknown public-record entity'
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 24)
  const zip = clean(getPath(raw, fields.zip))?.slice(0, 5) || null
  return {
    sourceId: manifest.id,
    externalId: external || fingerprint,
    triggeredAt: dateValue(getPath(raw, fields.triggeredAt)),
    trigger: manifest.triggers?.[0] || 'new-business',
    entity: {
      name,
      dba: clean(getPath(raw, fields.dba)),
      address: {
        line1: clean(getPath(raw, fields.line1)),
        city: clean(getPath(raw, fields.city)),
        state: clean(getPath(raw, fields.state)),
        zip,
        county: clean(getPath(raw, fields.county)),
      },
      phone: clean(getPath(raw, fields.phone)),
      email: clean(getPath(raw, fields.email)),
      website: clean(getPath(raw, fields.website)),
    },
    people: personName ? [{ name: personName, title: credential || 'Provider' }] : [],
    attrs: Object.fromEntries(Object.entries(fields).map(([key, spec]) => [key, getPath(raw, spec)])),
    provenance: { source: 'government', field: fields },
  }
}

export async function fetchJson(url, init = {}, timeoutMs = 15000) {
  let response
  try {
    response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const code = error.cause?.code || error.name || 'network-error'
    const wrapped = new Error(`Network request failed for ${new URL(url).hostname} (${code})`)
    wrapped.code = code
    throw wrapped
  }
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} from ${new URL(url).hostname}`)
    error.status = response.status
    error.retryAfter = response.headers.get('retry-after')
    throw error
  }
  if (!contentType.includes('json')) throw new Error(`Expected JSON from ${new URL(url).hostname}`)
  return response.json()
}

export function rowsAt(payload, rowsPath) {
  const rows = getPath(payload, rowsPath || 'results')
  if (Array.isArray(rows)) return rows
  if (rows && typeof rows === 'object') return [rows]
  if (Array.isArray(payload)) return payload
  return []
}

export function buildResult(manifest, rawRows, startedAt, extraStats = {}) {
  const rows = rawRows.map(row => normalizeSignal(row, manifest))
  return {
    rows,
    cursor: null,
    stats: {
      reachability: true,
      schemaMatched: true,
      fetched: rows.length,
      elapsedMs: Date.now() - startedAt,
      ...extraStats,
    },
  }
}
