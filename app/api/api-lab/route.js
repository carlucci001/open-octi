import dns from 'dns/promises'
import net from 'net'
import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_REQUEST_BODY_BYTES = 256 * 1024
const MAX_RESPONSE_BYTES = 640 * 1024
const DEFAULT_TIMEOUT_MS = 20000

const PRESETS = [
  {
    id: 'ContentStudio',
    label: 'ContentStudio',
    baseUrl: 'https://www.content.example.com',
    auth: { type: 'header', prefix: '', headerName: 'X-API-Key' },
    docsUrl: 'https://www.content.example.com',
    discoveryPaths: ['/openapi.json', '/api/openapi.json', '/swagger.json'],
    defaultHeaders: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'wnct-times' },
    samples: [
      { name: 'Search news', method: 'POST', path: '/api/ai/search-news', body: { query: 'City, ST local news', limit: 5 } },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    auth: { type: 'bearer', prefix: 'Bearer', headerName: 'Authorization' },
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    discoveryPaths: ['/openapi.json'],
    samples: [
      { name: 'List models', method: 'GET', path: '/models' },
      { name: 'Responses smoke test', method: 'POST', path: '/responses', body: { model: 'gpt-4.1-mini', input: 'Return the word ready.' } },
    ],
  },
  {
    id: 'stripe',
    label: 'Stripe',
    baseUrl: 'https://api.stripe.com/v1',
    auth: { type: 'bearer', prefix: 'Bearer', headerName: 'Authorization' },
    docsUrl: 'https://docs.stripe.com/api',
    discoveryPaths: ['/openapi/spec3.json'],
    samples: [
      { name: 'Balance', method: 'GET', path: '/balance' },
      { name: 'List customers', method: 'GET', path: '/customers?limit=3' },
    ],
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    baseUrl: 'https://api.elevenlabs.io/v1',
    auth: { type: 'header', headerName: 'xi-api-key', prefix: '' },
    docsUrl: 'https://elevenlabs.io/docs/api-reference',
    discoveryPaths: ['/openapi.json'],
    samples: [
      { name: 'User subscription', method: 'GET', path: '/user/subscription' },
      { name: 'Voices', method: 'GET', path: '/voices' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    auth: { type: 'header', headerName: 'x-api-key', prefix: '' },
    docsUrl: 'https://docs.anthropic.com/en/api',
    discoveryPaths: ['/openapi.json'],
    defaultHeaders: { 'anthropic-version': '2023-06-01' },
    samples: [
      { name: 'List models', method: 'GET', path: '/models' },
      { name: 'Messages smoke test', method: 'POST', path: '/messages', body: { model: 'claude-sonnet-4-5-20250929', max_tokens: 32, messages: [{ role: 'user', content: 'Return ready.' }] } },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    auth: { type: 'query', queryName: 'key' },
    docsUrl: 'https://ai.google.dev/api',
    discoveryPaths: ['/openapi.json'],
    samples: [
      { name: 'List models', method: 'GET', path: '/models' },
    ],
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    baseUrl: 'https://api-inference.huggingface.co',
    auth: { type: 'bearer', prefix: 'Bearer', headerName: 'Authorization' },
    docsUrl: 'https://huggingface.co/docs/api-inference/index',
    discoveryPaths: ['/openapi.json'],
    samples: [
      { name: 'Model info', method: 'GET', path: '/models/openai-community/gpt2' },
    ],
  },
]

function json(data, init) {
  return NextResponse.json(data, init)
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('Base URL is required.')
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS APIs are supported.')
  if (url.protocol !== 'https:') throw new Error('API Lab requires HTTPS when testing API keys.')
  url.hash = ''
  return url
}

function privateIp(ip) {
  const version = net.isIP(ip)
  if (!version) return true
  if (version === 4) {
    const parts = ip.split('.').map(Number)
    return (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      parts[0] >= 224
    )
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower === '::'
}

async function assertPublicTarget(url) {
  const host = url.hostname.toLowerCase()
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) throw new Error('Private or local targets are blocked.')
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) throw new Error('Private or local targets are blocked.')
  if (net.isIP(host)) {
    if (privateIp(host)) throw new Error('Private or local targets are blocked.')
    return
  }
  const records = await dns.lookup(host, { all: true, verbatim: true })
  if (!records.length || records.some(record => privateIp(record.address))) throw new Error('Private or local targets are blocked.')
}

function combineUrl(baseUrl, pathValue = '') {
  const raw = String(pathValue || '').trim()
  let url
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    url = new URL(raw)
  } else if (!raw) {
    url = new URL(baseUrl)
  } else if (raw.startsWith('?')) {
    url = new URL(baseUrl)
    url.search = raw
  } else {
    const basePath = baseUrl.pathname.replace(/\/$/, '')
    const nextPath = raw.startsWith('/') ? raw : `/${raw}`
    url = new URL(`${basePath}${nextPath}`, baseUrl.origin)
  }
  if (url.protocol !== baseUrl.protocol || url.hostname !== baseUrl.hostname) {
    throw new Error('Endpoint path must stay on the selected API host.')
  }
  url.hash = ''
  return url
}

function cleanHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [key, val] of Object.entries(value)) {
    const name = String(key || '').trim()
    if (!name || /^(host|connection|content-length|cookie|set-cookie)$/i.test(name)) continue
    out[name] = String(val ?? '')
  }
  return out
}

function applyAuth(url, headers, auth = {}) {
  const key = String(auth.key || '').trim()
  if (!key || auth.type === 'none') return
  if (/(^|\.)ContentStudio\.com$/i.test(url.hostname)) {
    for (const name of Object.keys(headers)) {
      if (/^authorization$/i.test(name)) delete headers[name]
    }
    const hasTenantId = Object.keys(headers).some(name => /^x-tenant-id$/i.test(name))
    if (!hasTenantId) {
      const parts = key.split('-').filter(Boolean)
      const inferredTenantId = parts.length > 2 ? parts.slice(0, -2).join('-') : ''
      if (inferredTenantId) headers['X-Tenant-ID'] = inferredTenantId
    }
    headers['X-API-Key'] = key
    return
  }
  if (auth.type === 'query') {
    url.searchParams.set(String(auth.queryName || 'key'), key)
    return
  }
  const headerName = String(auth.headerName || (auth.type === 'bearer' ? 'Authorization' : 'x-api-key')).trim()
  const prefix = auth.type === 'bearer' ? String(auth.prefix || 'Bearer').trim() : String(auth.prefix || '').trim()
  headers[headerName] = prefix ? `${prefix} ${key}` : key
}

function redact(value, secrets = []) {
  let out = String(value || '')
  for (const secret of secrets.map(s => String(s || '').trim()).filter(Boolean)) {
    if (secret.length >= 6) out = out.split(secret).join('[redacted]')
  }
  return out
}

async function readCappedResponse(response, secrets) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (size - MAX_RESPONSE_BYTES))))
      break
    }
    chunks.push(value)
  }
  const text = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
  return redact(text, secrets)
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function schemaName(schema) {
  if (!schema || typeof schema !== 'object') return ''
  if (schema.$ref) return schema.$ref.split('/').pop()
  if (schema.type) return schema.type
  if (schema.anyOf) return 'anyOf'
  if (schema.oneOf) return 'oneOf'
  if (schema.allOf) return 'allOf'
  return 'object'
}

function summarizeOpenApi(doc) {
  const paths = doc?.paths && typeof doc.paths === 'object' ? doc.paths : {}
  const operations = []
  for (const [pathName, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue
    for (const [method, operation] of Object.entries(methods)) {
      const upper = method.toUpperCase()
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(upper)) continue
      const requestBody = operation?.requestBody?.content || {}
      operations.push({
        id: operation.operationId || `${upper} ${pathName}`,
        method: upper,
        path: pathName,
        summary: operation.summary || operation.description || '',
        tags: Array.isArray(operation.tags) ? operation.tags.slice(0, 4) : [],
        parameters: Array.isArray(operation.parameters) ? operation.parameters.map(param => ({
          name: param.name,
          in: param.in,
          required: Boolean(param.required),
          type: schemaName(param.schema),
        })).slice(0, 12) : [],
        requestBody: Object.entries(requestBody).map(([contentType, meta]) => ({
          contentType,
          schema: schemaName(meta?.schema),
          rawSchema: meta?.schema || null,
        })).slice(0, 6),
        responses: Object.keys(operation?.responses || {}).slice(0, 8),
      })
    }
  }
  return {
    title: doc?.info?.title || 'OpenAPI document',
    version: doc?.info?.version || '',
    operationCount: operations.length,
    operations: operations.slice(0, 500),
  }
}

function discoveryCandidates(baseUrl, customPaths = []) {
  const common = [
    '',
    '/openapi.json',
    '/swagger.json',
    '/api/openapi.json',
    '/api/swagger.json',
    '/docs/openapi.json',
    '/docs/swagger.json',
    '/.well-known/openapi.json',
  ]
  return [...new Set([...customPaths, ...common].map(v => String(v || '').trim()))].slice(0, 16)
    .map(pathValue => combineUrl(baseUrl, pathValue))
}

async function performFetch(url, { method = 'GET', headers = {}, body, auth = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  await assertPublicTarget(url)
  const requestHeaders = { Accept: 'application/json, text/plain;q=0.9, */*;q=0.5', ...cleanHeaders(headers) }
  applyAuth(url, requestHeaders, auth)
  const secret = String(auth.key || '').trim()
  const init = {
    method,
    headers: requestHeaders,
    redirect: 'manual',
    signal: AbortSignal.timeout(Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 3000), 60000)),
  }
  if (!['GET', 'HEAD'].includes(method) && body !== undefined && body !== null && body !== '') {
    const raw = typeof body === 'string' ? body : JSON.stringify(body)
    if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BODY_BYTES) throw new Error('Request body is too large for the lab.')
    init.body = raw
    if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) requestHeaders['Content-Type'] = 'application/json'
  }
  const startedAt = Date.now()
  const response = await fetch(url, init)
  const text = await readCappedResponse(response, [secret])
  const parsed = safeJsonParse(text)
  const responseHeaders = {}
  for (const [key, value] of response.headers.entries()) {
    if (!/set-cookie/i.test(key)) responseHeaders[key] = redact(value, [secret])
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    latencyMs: Date.now() - startedAt,
    redirected: response.status >= 300 && response.status < 400,
    headers: responseHeaders,
    json: parsed,
    text: parsed ? null : text,
    truncated: Buffer.byteLength(text || '', 'utf8') >= MAX_RESPONSE_BYTES,
  }
}

async function discover(body) {
  const baseUrl = normalizeBaseUrl(body.baseUrl)
  const customPaths = Array.isArray(body.discoveryPaths) ? body.discoveryPaths : String(body.discoveryPaths || '').split('\n')
  const attempts = []
  for (const url of discoveryCandidates(baseUrl, customPaths)) {
    try {
      const result = await performFetch(url, {
        method: 'GET',
        headers: body.headers,
        auth: body.auth,
        timeoutMs: body.timeoutMs,
      })
      const doc = result.json
      const isOpenApi = doc && (doc.openapi || doc.swagger || doc.paths)
      attempts.push({ url: url.toString(), status: result.status, ok: result.ok, openapi: Boolean(isOpenApi) })
      if (isOpenApi) {
        return { ok: true, sourceUrl: url.toString(), attempts, catalog: summarizeOpenApi(doc) }
      }
    } catch (error) {
      attempts.push({ url: url.toString(), ok: false, error: error.message })
    }
  }
  return { ok: false, attempts, error: 'No JSON OpenAPI or Swagger document was found at the tested locations.' }
}

async function requestEndpoint(body) {
  const baseUrl = normalizeBaseUrl(body.baseUrl)
  const url = combineUrl(baseUrl, body.path)
  const method = String(body.method || 'GET').toUpperCase()
  const result = await performFetch(url, {
    method,
    headers: body.headers,
    body: body.body,
    auth: body.auth,
    timeoutMs: body.timeoutMs,
  })
  return { ok: true, url: url.toString().replace(String(body.auth?.key || ''), '[redacted]'), result }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return json({ ok: true, presets: PRESETS })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    if (body.action === 'discover') return json(await discover(body))
    if (body.action === 'request') return json(await requestEndpoint(body))
    return json({ ok: false, error: 'unknown action' }, { status: 400 })
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: 400 })
  }
}
