// Server-side Kie unified media jobs. No model defaults and no billable retries.
import { isIP } from 'node:net'

const API_ORIGIN = 'https://api.kie.ai'
const CREATE_PATH = '/api/v1/jobs/createTask'
const STATES = new Set(['waiting', 'queuing', 'generating', 'success', 'fail'])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const sharedDiscoveryGate = { tail: Promise.resolve(), nextAt: 0 }
const MAX_RETRY_DELAY_MS = 10000

export class KieError extends Error {
  constructor(code, message, status = 502, mayHaveCreatedTask = false) {
    super(message)
    this.name = 'KieError'
    this.code = code
    this.status = status
    this.mayHaveCreatedTask = mayHaveCreatedTask
  }
}

function invalidResponse() { return new KieError('INVALID_RESPONSE', 'Kie returned an invalid response.') }
function invalidInput() { return new KieError('INVALID_INPUT', 'Input does not match the selected Kie model schema.', 400) }
function unsupportedSchema() { return new KieError('UNSUPPORTED_SCHEMA', 'This Kie model schema is not supported by the media job tool.', 422) }

function modelId(value) {
  if (typeof value !== 'string' || value.length > 200 || !value.split('/').every(part => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) && part !== '..')) {
    throw new KieError('INVALID_MODEL', 'A valid Kie catalog model ID is required.', 400)
  }
  return value
}

function taskId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value)) throw new KieError('INVALID_TASK', 'A valid Kie task ID is required.', 400)
  return value
}

function outputMediaType(taskType) {
  const normalized = taskType.toLowerCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
  const output = normalized.match(/\bto (image|video|audio|speech|music|sound)$/)?.[1]
    || normalized.match(/^(image|video|audio|speech|music|sound)(?: generation| synthesis)?$/)?.[1]
  return ['speech', 'music', 'sound'].includes(output) ? 'audio' : output
}

async function vaultApiKey() {
  const { readData } = await import('./dataStore')
  const stored = readData('credentials.json')
  for (const credential of stored?.credentials || []) {
    if (!/^kie(?:[.\s_-]?ai)?$/i.test(String(credential.name || '').trim())) continue
    const field = (credential.fields || []).find(item => /^(?:api[\s_-]*)?key$|^token$/i.test(String(item.label || '').trim()))
    if (typeof field?.value === 'string' && field.value.trim()) return field.value.trim()
  }
  return ''
}

function apiError(status, billable, response) {
  const known = {
    401: ['AUTH_ERROR', 'Kie rejected the API key. Check the Kie.AI vault credential.', 401],
    403: ['AUTH_ERROR', 'The Kie API key does not have access to this operation.', 403],
    402: ['INSUFFICIENT_CREDITS', 'Kie has insufficient credits for this request.', 402],
    404: ['NOT_FOUND', 'The requested Kie model or task was not found.', 404],
    422: ['INVALID_INPUT', 'Kie rejected the request. Check the current model schema.', 422],
    429: ['RATE_LIMITED', 'Kie rate limited this request. Wait before trying again.', 429],
    433: ['KEY_LIMIT', 'The Kie API key has reached its usage limit.', 429],
    455: ['UNAVAILABLE', 'This Kie service is currently unavailable.', 503],
  }
  const fields = known[status] || ['UPSTREAM_ERROR', 'The Kie request failed.', 502]
  const error = new KieError(...fields, billable && status >= 500)
  if (status === 429) {
    const header = response?.headers?.get?.('retry-after')
    if (typeof header === 'string' && header.trim()) {
      const delay = /^\d+(?:\.\d+)?$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - Date.now()
      if (Number.isFinite(delay)) error.retryAfterMs = Math.min(MAX_RETRY_DELAY_MS, Math.max(0, delay))
    }
  }
  return error
}

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    const cancelled = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancelled)
      reject(new KieError('ABORTED', 'The Kie request was cancelled.', 499))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancelled)
      resolve()
    }, delay)
    signal?.addEventListener('abort', cancelled, { once: true })
    if (signal?.aborted) cancelled()
  })
}

// Resolve local OpenAPI references only. Never fetch schema-controlled URLs.
function resolveSchema(value, document, ancestors = [], depth = 0) {
  if (depth > 32) throw unsupportedSchema()
  if (Array.isArray(value)) return value.map(item => resolveSchema(item, document, ancestors, depth + 1))
  if (!object(value)) return value
  if (value.$ref) {
    if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/') || ancestors.includes(value.$ref)) throw unsupportedSchema()
    let target = document
    try {
      for (const segment of value.$ref.slice(2).split('/')) {
        const key = decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~')
        if (!object(target) || !Object.hasOwn(target, key)) throw unsupportedSchema()
        target = target[key]
      }
    } catch { throw unsupportedSchema() }
    const { $ref, ...siblings } = value
    return resolveSchema({ ...target, ...siblings }, document, [...ancestors, $ref], depth + 1)
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSchema(item, document, ancestors, depth + 1)]))
}

// Validate the schema's common JSON Schema constraints before spending credits.
// Unsupported conditional constructs fail closed rather than guessing a payload.
function matchesSchema(value, schema, depth = 0) {
  if (depth > 32 || schema === false) return false
  if (schema === true) return true
  if (!object(schema)) throw unsupportedSchema()
  if (['not', 'if', 'then', 'else', 'dependencies', 'dependentRequired', 'dependentSchemas', 'patternProperties', 'propertyNames', 'unevaluatedProperties', 'unevaluatedItems', 'contains', 'prefixItems'].some(key => key in schema)) throw unsupportedSchema()
  for (const key of ['required', 'enum', 'allOf', 'anyOf', 'oneOf']) if (key in schema && !Array.isArray(schema[key])) throw unsupportedSchema()
  if ('properties' in schema && !object(schema.properties)) throw unsupportedSchema()
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  if (schema.const !== undefined && !equal(value, schema.const)) return false
  if (schema.enum && (!Array.isArray(schema.enum) || !schema.enum.some(item => equal(value, item)))) return false
  if (schema.allOf && !schema.allOf.every(branch => matchesSchema(value, branch, depth + 1))) return false
  if (schema.anyOf && !schema.anyOf.some(branch => matchesSchema(value, branch, depth + 1))) return false
  if (schema.oneOf && schema.oneOf.filter(branch => matchesSchema(value, branch, depth + 1)).length !== 1) return false
  const typeMatches = type => ({ object: object(value), array: Array.isArray(value), string: typeof value === 'string', number: typeof value === 'number' && Number.isFinite(value), integer: Number.isInteger(value), boolean: typeof value === 'boolean', null: value === null })[type] === true
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(typeMatches)) return false
  if (typeof value === 'string') {
    const length = [...value].length
    if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) return false
    if (schema.pattern) {
      // Arbitrary upstream regular expressions are not executed in the server.
      throw unsupportedSchema()
    }
    if (['uri', 'url'].includes(schema.format)) {
      try { if (!['https:', 'http:'].includes(new URL(value).protocol)) return false } catch { return false }
    }
  }
  if (typeof value === 'number') {
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) return false
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) return false
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) return false
    if (schema.multipleOf && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-8) return false
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return false
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return false
    if (schema.items && !value.every(item => matchesSchema(item, schema.items, depth + 1))) return false
  }
  if (object(value)) {
    if (Object.keys(value).length < (schema.minProperties ?? 0) || Object.keys(value).length > (schema.maxProperties ?? Infinity)) return false
    if ((schema.required || []).some(key => !Object.hasOwn(value, key))) return false
    const properties = schema.properties || {}
    for (const [key, item] of Object.entries(value)) {
      if (/callback/i.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) return false
      if (Object.hasOwn(properties, key)) {
        if (!matchesSchema(item, properties[key], depth + 1)) return false
      } else if (schema.additionalProperties === false) return false
      else if (object(schema.additionalProperties) && !matchesSchema(item, schema.additionalProperties, depth + 1)) return false
    }
  }
  return true
}

function jobSchema(data, model) {
  if (!object(data) || data.model !== model) throw invalidResponse()
  if (data.openapi == null) throw new KieError('SCHEMA_UNAVAILABLE', 'Kie has not published this model schema yet.', 422)
  const doc = data.openapi
  const operation = doc.paths?.[CREATE_PATH]?.post
  if (!operation) throw new KieError('UNSUPPORTED_ENDPOINT', 'This model does not use the supported Kie media job endpoint.', 422)
  const servers = operation.servers || doc.paths[CREATE_PATH].servers || doc.servers
  if (servers?.some(server => server.url?.replace(/\/$/, '') !== API_ORIGIN)) throw unsupportedSchema()
  const body = resolveSchema(operation.requestBody, doc)?.content?.['application/json']?.schema
  if (!object(body) || !object(body.properties?.input)) throw unsupportedSchema()
  if ((body.required || []).some(key => !['model', 'input'].includes(key))) throw unsupportedSchema()
  return { body, input: body.properties.input }
}

function resultUrls(data) {
  let response = data.response
  if (!object(response)) {
    try { response = JSON.parse(data.resultJson) } catch { throw invalidResponse() }
  }
  if (!object(response)) throw invalidResponse()
  const urls = response.resultUrls ?? (Array.isArray(response.data) ? response.data.map(track => track?.audio_url) : null)
  if (!Array.isArray(urls) || !urls.length || urls.length > 32) throw invalidResponse()
  for (const value of urls) {
    if (typeof value !== 'string' || value.length > 8192) throw invalidResponse()
    let url
    try { url = new URL(value) } catch { throw invalidResponse() }
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/g, '')) || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)) throw invalidResponse()
  }
  // The media downloader must separately validate DNS and redirect targets.
  return [...new Set(urls)]
}

export function createKieClient({ fetchImpl = (...args) => fetch(...args), resolveApiKey = vaultApiKey, timeoutMs = 20000, discoveryIntervalMs = 1100 } = {}) {
  // All normal client instances in this process share Kie's account discovery budget.
  // A zero interval is only intended for deterministic mocked tests.
  const discoveryGate = discoveryIntervalMs > 0 ? sharedDiscoveryGate : { tail: Promise.resolve(), nextAt: 0 }

  async function requestOnce(path, { method = 'GET', body, discovery = false, signal } = {}) {
    const billable = method === 'POST'
    let key
    try { key = await resolveApiKey() } catch { throw new KieError('CREDENTIAL_UNAVAILABLE', 'Unable to read the Kie.AI vault credential.', 503) }
    if (typeof key !== 'string' || !key.trim()) throw new KieError('MISSING_KEY', 'Add the Kie.AI API Key to the Credentials vault first.', 503)
    if (signal?.aborted) throw new KieError('ABORTED', 'The Kie request was cancelled.', 499)
    if (discovery) {
      const previous = discoveryGate.tail
      let release
      discoveryGate.tail = new Promise(resolve => { release = resolve })
      await previous
      try {
        const delay = Math.max(0, discoveryGate.nextAt - Date.now())
        if (delay) await waitForRetry(delay, signal)
        discoveryGate.nextAt = Date.now() + discoveryIntervalMs
      } finally { release() }
    }
    const controller = new AbortController()
    let timedOut = false
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      const response = await fetchImpl(`${API_ORIGIN}${path}`, {
        method, headers: { Authorization: `Bearer ${key.trim()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, redirect: 'error', cache: 'no-store',
      })
      if (!response.ok) throw apiError(response.status, billable, response)
      let payload
      try { payload = await response.json() } catch { throw invalidResponse() }
      if (!object(payload) || !Number.isInteger(payload.code)) throw invalidResponse()
      if (payload.code !== 200) throw apiError(payload.code, billable, response)
      if (!Object.hasOwn(payload, 'data')) throw invalidResponse()
      return payload.data
    } catch (error) {
      if (timedOut || controller.signal.aborted) throw new KieError(timedOut ? 'TIMEOUT' : 'ABORTED', billable ? 'The Kie submission result is unknown. Check Kie task history before retrying to avoid a duplicate charge.' : timedOut ? 'The Kie request timed out.' : 'The Kie request was cancelled.', timedOut ? 504 : 499, billable)
      if (error instanceof KieError) {
        if (billable && error.code === 'INVALID_RESPONSE') error.mayHaveCreatedTask = true
        throw error
      }
      throw new KieError('NETWORK_ERROR', billable ? 'The Kie submission result is unknown. Check Kie task history before retrying to avoid a duplicate charge.' : 'Unable to reach Kie.', 502, billable)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
  }

  async function request(path, options = {}) {
    // Only explicit rate limits on safe GETs are retried. A billable POST is
    // always single-attempt, even when Kie responds with HTTP/application 429.
    for (let attempt = 0; ; attempt += 1) {
      try { return await requestOnce(path, options) }
      catch (error) {
        if ((options.method || 'GET') !== 'GET' || error.code !== 'RATE_LIMITED' || attempt >= 2) throw error
        const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(1100 * (2 ** attempt), error.retryAfterMs || 0))
        await waitForRetry(delay, options.signal)
      }
    }
  }

  async function listModels({ query, taskType, provider, signal } = {}) {
    const params = new URLSearchParams()
    for (const [name, value] of Object.entries({ q: query, taskType, provider })) {
      if (value !== undefined && value !== '') {
        if (typeof value !== 'string' || value.length > 200) throw invalidInput()
        params.set(name, value)
      }
    }
    const data = await request(`/api/v1/models${params.size ? `?${params}` : ''}`, { discovery: true, signal })
    if (!object(data) || !Array.isArray(data.models) || !Number.isInteger(data.total) || data.total < 0) throw invalidResponse()
    return { total: data.total, models: data.models.map(item => {
      if (!object(item) || typeof item.model !== 'string' || !Array.isArray(item.taskType) || !item.taskType.every(type => typeof type === 'string')) throw invalidResponse()
      try { modelId(item.model) } catch { throw invalidResponse() }
      return { model: item.model, title: String(item.title || item.model), provider: String(item.provider || ''), taskTypes: item.taskType, description: String(item.description || ''), pricingDescription: String(item.pricingDesc || '') }
    }) }
  }

  async function getModelSchema(model, { signal } = {}) {
    modelId(model)
    const data = await request(`/api/v1/models/${model}/schema`, { discovery: true, signal })
    const schema = jobSchema(data, model)
    return { model, endpoint: CREATE_PATH, inputSchema: schema.input, requiredInputFields: schema.input.required || [], requestSchema: schema.body }
  }

  async function getModelPrice(model, { signal } = {}) {
    modelId(model)
    const data = await request(`/api/v1/models/${model}/price`, { discovery: true, signal })
    if (!object(data) || data.model !== model || typeof data.pricingDesc !== 'string') throw invalidResponse()
    return { model, pricingDescription: data.pricingDesc }
  }

  async function getCreditBalance({ signal } = {}) {
    const data = await request('/api/v1/chat/credit', { signal })
    if (typeof data !== 'number' || !Number.isFinite(data) || data < 0) throw invalidResponse()
    return data
  }

  async function prepareTask({ model, input, mediaType, signal } = {}) {
    modelId(model)
    if (mediaType !== undefined && !['image', 'video', 'audio'].includes(mediaType)) throw invalidInput()
    const catalog = await listModels({ query: model, signal })
    const selected = catalog.models.find(item => item.model === model)
    if (!selected) throw new KieError('MODEL_NOT_FOUND', 'The model is not in the current Kie catalog.', 404)
    if (mediaType && !selected.taskTypes.some(type => outputMediaType(type) === mediaType)) {
      throw new KieError('MEDIA_TYPE_MISMATCH', 'The selected Kie model does not declare the requested media output type.', 400)
    }
    const schema = await getModelSchema(model, { signal })
    if (input !== undefined && (!object(input) || !matchesSchema({ model, input }, schema.requestSchema))) throw invalidInput()
    const creditBalance = await getCreditBalance({ signal })
    return { ...selected, inputSchema: schema.inputSchema, requiredInputFields: schema.requiredInputFields, creditBalance }
  }

  async function createTask({ model, input, mediaType, signal } = {}) {
    if (!object(input)) throw invalidInput()
    let frozenInput
    try {
      const encoded = JSON.stringify(input)
      if (encoded.length > 200000) throw invalidInput()
      frozenInput = JSON.parse(encoded)
    } catch { throw invalidInput() }
    const prepared = await prepareTask({ model, input: frozenInput, mediaType, signal })
    if (prepared.creditBalance <= 0) throw apiError(402, false)
    const data = await request(CREATE_PATH, { method: 'POST', body: { model, input: frozenInput }, signal })
    try { if (!object(data)) throw invalidResponse(); taskId(data.taskId) } catch { const error = invalidResponse(); error.mayHaveCreatedTask = true; throw error }
    return { taskId: data.taskId, model, taskTypes: prepared.taskTypes, state: 'waiting', pricingDescription: prepared.pricingDescription, creditBalance: prepared.creditBalance }
  }

  async function getTask(id, { signal } = {}) {
    taskId(id)
    const data = await request(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(id)}`, { signal })
    if (!object(data) || data.taskId !== id || !STATES.has(data.state) || typeof data.model !== 'string') throw invalidResponse()
    try { modelId(data.model) } catch { throw invalidResponse() }
    const output = { taskId: id, model: data.model, state: data.state, terminal: ['success', 'fail'].includes(data.state), resultUrls: data.state === 'success' ? resultUrls(data) : [] }
    for (const key of ['creditsConsumed', 'costTime', 'createTime', 'completeTime']) if (typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= 0) output[key] = data[key]
    if (data.state === 'fail') {
      output.error = 'Kie could not complete this generation. Check the task in Kie for details.'
      output.errorCode = typeof data.failCode === 'number' ? data.failCode : 'GENERATION_FAILED'
    }
    return output
  }

  return { listModels, getModelSchema, getModelPrice, getCreditBalance, prepareTask, createTask, getTask }
}

const client = createKieClient()
export const listKieModels = client.listModels
export const getKieModelSchema = client.getModelSchema
export const getKieModelPrice = client.getModelPrice
export const getKieCreditBalance = client.getCreditBalance
export const prepareKieTask = client.prepareTask
export const createKieTask = client.createTask
export const getKieTask = client.getTask
