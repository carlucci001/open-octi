export const ZERO_COST = Object.freeze({ usd: 0, label: 'No external provider cost' })

export function objectSchema(properties, required = []) {
  return { type: 'object', additionalProperties: false, properties, required }
}

export function noCost() {
  return ZERO_COST
}

function forwardedHeaders(sourceRequest, extra = {}) {
  const headers = new Headers(extra)
  const cookie = sourceRequest?.headers?.get?.('cookie')
  if (cookie) headers.set('cookie', cookie)
  return headers
}

export async function callRoute(handler, sourceRequest, { pathname, method = 'GET', query = {}, body } = {}) {
  const url = new URL(pathname || '/', 'http://operator-agent.local')
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const request = new Request(url, {
    method,
    headers: forwardedHeaders(sourceRequest, body === undefined ? {} : { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await handler(request)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `${pathname} returned HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return payload
}

export function tool(definition) {
  if (!definition?.name || !definition?.description || !definition?.input_schema) throw new Error('Operator tool metadata is incomplete')
  if (!['none', 'writes', 'costs', 'sends'].includes(definition.sideEffects)) throw new Error(`Invalid sideEffects for ${definition.name}`)
  if (typeof definition.costEstimate !== 'function' || typeof definition.execute !== 'function') throw new Error(`Operator tool ${definition.name} is not executable`)
  return Object.freeze(definition)
}
