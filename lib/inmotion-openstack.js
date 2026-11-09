import { createHash } from 'node:crypto'
import { findCredential } from './vault.js'

export const INMOTION_CREDENTIAL_NAME = 'InMotion Explorer VPC'
const PROJECT_ID = 'be56a2b160fc429bac6ef9c7ce46f2ea'
const REGION = 'iad4'
const AUTH_URL = 'https://iad4.inmotioncloud.net:5000'
const CACHE_MS = 60000
const TIMEOUT_MS = 12000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const ENDPOINTS = {
  compute: 'https://iad4.inmotioncloud.net:8774/v2.1',
  network: 'https://iad4.inmotioncloud.net:9696',
  volumev3: `https://iad4.inmotioncloud.net:8776/v3/${PROJECT_ID}`,
}

let cached
let pending

class CloudReadError extends Error {
  constructor(status, message, httpStatus) {
    super(message)
    this.status = status
    this.httpStatus = httpStatus
  }
}

function field(credential, label) {
  const matches = Array.isArray(credential?.fields) ? credential.fields.filter(item => item?.label === label) : []
  if (matches.length !== 1 || typeof matches[0].value !== 'string') return ''
  return matches[0].value.trim()
}

function initialStatus(credential) {
  return {
    provider: 'InMotion Cloud',
    configured: false,
    status: 'not_configured',
    readOnly: true,
    cached: false,
    lastCheckedAt: null,
    connection: {
      name: INMOTION_CREDENTIAL_NAME,
      projectId: PROJECT_ID,
      region: REGION,
      authUrl: AUTH_URL,
      credentialExpiresAt: field(credential, 'Credential Expires At') || null,
      roles: [],
      dashboardUrl: 'https://central.inmotionhosting.com/projects/rgwvDGgyOk/cloud/overview',
      apiAccessUrl: 'https://iad4.inmotioncloud.net/project/api_access/',
      vaultUrl: '/?tab=credentials',
    },
    checks: {},
    quotas: { compute: {}, network: {}, volume: {} },
    instances: [],
    volumes: [],
    flavors: [],
    services: [],
    truncated: { instances: false, volumes: false, flavors: false },
  }
}

function safeFailure(error) {
  if (error instanceof CloudReadError) {
    return { status: error.status, message: error.message, ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}) }
  }
  return { status: 'error', message: 'The cloud request could not be completed.' }
}

async function requestJson(url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: controller.signal, cache: 'no-store' })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new CloudReadError(response.status === 401 || response.status === 403 ? 'denied' : 'error',
        response.status === 401 || response.status === 403 ? 'The cloud denied this read operation.' : 'The cloud returned an unsuccessful response.', response.status)
    }
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => {})
      throw new CloudReadError('error', 'The cloud response exceeded the safe size limit.')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new CloudReadError('error', 'The cloud returned an empty response.')
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new CloudReadError('error', 'The cloud response exceeded the safe size limit.')
      }
      chunks.push(Buffer.from(value))
    }
    let data
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new CloudReadError('error', 'The cloud returned an invalid response.') }
    return { data, headers: response.headers }
  } catch (error) {
    if (controller.signal.aborted) throw new CloudReadError('timeout', 'The cloud read timed out.')
    if (error instanceof CloudReadError) throw error
    throw new CloudReadError('error', 'The cloud request could not be completed.')
  } finally {
    clearTimeout(timer)
  }
}

function endpoint(catalog, type) {
  const matches = catalog.filter(service => service?.type === type)
    .flatMap(service => Array.isArray(service.endpoints) ? service.endpoints : [])
    .filter(item => item?.interface === 'public' && (item.region_id || item.region) === REGION)
  if (!matches.length) throw new CloudReadError('unavailable', 'This service has no public endpoint in the selected region.')
  // Catalog URLs are untrusted input. Only the already verified IAD4 endpoints are permitted.
  if (matches.some(item => typeof item.url !== 'string' || item.url.replace(/\/$/, '') !== ENDPOINTS[type])) {
    throw new CloudReadError('error', 'The service endpoint does not match the verified InMotion endpoint.')
  }
  return ENDPOINTS[type]
}

function quotaValues(value, names = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CloudReadError('error', 'The cloud returned invalid quota data.')
  const number = item => typeof item === 'number' && Number.isFinite(item) ? item : null
  const entries = Object.entries(value).filter(([key, item]) => key !== 'id' && /^[a-zA-Z0-9_:-]{1,100}$/.test(key) && (typeof item === 'number' || (item && typeof item === 'object' && 'limit' in item)))
  if (!entries.length) throw new CloudReadError('error', 'The cloud returned invalid quota data.')
  return Object.fromEntries(entries.map(([key, item]) => [names[key] || key, {
    limit: number(typeof item === 'number' ? item : item.limit),
    inUse: number(item?.in_use ?? item?.used),
    reserved: number(item?.reserved),
  }]))
}

function list(value) {
  if (!Array.isArray(value)) throw new CloudReadError('error', 'The cloud returned invalid inventory data.')
  return value.slice(0, 500)
}

async function readSnapshot(base, credentialId, secret) {
  const snapshot = { ...base, lastCheckedAt: new Date().toISOString() }
  let session
  try {
    const { data, headers } = await requestJson(`${AUTH_URL}/v3/auth/tokens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ auth: { identity: { methods: ['application_credential'], application_credential: { id: credentialId, secret } } } }),
    })
    const token = headers.get('x-subject-token')
    const roles = data.token?.roles
    if (!token || data.token?.project?.id !== PROJECT_ID || !Array.isArray(roles) || roles.length !== 1 || roles[0]?.name !== 'reader') {
      throw new CloudReadError('denied', 'The credential must authenticate to this project with only the reader role.')
    }
    if (!Array.isArray(data.token.catalog)) throw new CloudReadError('error', 'The cloud returned an invalid service catalog.')
    session = { token, catalog: data.token.catalog }
    snapshot.connection = { ...base.connection, roles: ['reader'] }
    snapshot.checks.identity = { status: 'ok' }
  } catch (error) {
    snapshot.checks.identity = safeFailure(error)
    snapshot.status = 'error'
    snapshot.error = snapshot.checks.identity.message
    return snapshot
  }

  const text = value => {
    if (typeof value !== 'string') return ''
    if ([credentialId, secret, session.token].some(sensitive => value.includes(sensitive))) return '[redacted]'
    return value.slice(0, 250)
  }
  const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null
  snapshot.services = session.catalog.slice(0, 100).map(item => ({ name: text(item?.name), type: text(item?.type) }))
  const operations = [
    ['instances', 'compute', '/servers/detail?limit=500', data => {
      snapshot.instances = list(data.servers).map(item => ({ id: text(item.id), name: text(item.name), status: text(item.status), flavor: text(item.flavor?.original_name || item.flavor?.id) }))
      snapshot.truncated.instances = data.servers.length > 500 || !!data.servers_links?.some(item => item.rel === 'next')
    }],
    ['computeQuotas', 'compute', `/os-quota-sets/${PROJECT_ID}/detail`, data => { snapshot.quotas.compute = quotaValues(data.quota_set) }],
    ['flavors', 'compute', '/flavors/detail?limit=500', data => {
      snapshot.flavors = list(data.flavors).map(item => ({ id: text(item.id), name: text(item.name), vcpus: numeric(item.vcpus), ramMiB: numeric(item.ram), diskGiB: numeric(item.disk) }))
      snapshot.truncated.flavors = data.flavors.length > 500 || !!data.flavors_links?.some(item => item.rel === 'next')
    }],
    ['networkQuotas', 'network', `/v2.0/quotas/${PROJECT_ID}/details`, data => {
      snapshot.quotas.network = quotaValues(data.quota, {
        floatingip: 'floating_ips', network: 'networks', port: 'ports', router: 'routers',
        subnet: 'subnets', security_group: 'security_groups', security_group_rule: 'security_group_rules',
      })
    }],
    ['volumeQuotas', 'volumev3', `/os-quota-sets/${PROJECT_ID}?usage=True`, data => { snapshot.quotas.volume = quotaValues(data.quota_set) }],
    ['volumes', 'volumev3', '/volumes/detail?limit=500', data => {
      snapshot.volumes = list(data.volumes).map(item => ({ id: text(item.id), name: text(item.name), status: text(item.status), size: numeric(item.size) }))
      snapshot.truncated.volumes = data.volumes.length > 500 || !!data.volumes_links?.some(item => item.rel === 'next')
    }],
  ]
  await Promise.all(operations.map(async ([name, type, path, consume]) => {
    try {
      const baseUrl = endpoint(session.catalog, type)
      const { data } = await requestJson(`${baseUrl}${path}`, { method: 'GET', headers: { 'X-Auth-Token': session.token, Accept: 'application/json' } })
      consume(data)
      snapshot.checks[name] = { status: 'ok' }
    } catch (error) { snapshot.checks[name] = safeFailure(error) }
  }))
  snapshot.status = Object.values(snapshot.checks).every(check => check.status === 'ok') ? 'connected' : 'partial'
  return snapshot
}

/** Returns only sanitized metadata. Live requests are fixed, project-scoped reads. */
export async function getInMotionStatus({ refresh = false } = {}) {
  let credential
  try { credential = findCredential(INMOTION_CREDENTIAL_NAME) }
  catch { return { ...initialStatus(), status: 'error', error: 'The encrypted credential vault is unavailable.' } }
  const base = initialStatus(credential)
  const credentialId = field(credential, 'Application Credential ID')
  const secret = field(credential, 'Application Credential Secret')
  if (!credentialId || !secret) return base
  base.configured = true
  if (field(credential, 'Project ID') !== PROJECT_ID || field(credential, 'Region') !== REGION || ![AUTH_URL, `${AUTH_URL}/v3`].includes(field(credential, 'Auth URL').replace(/\/$/, ''))) {
    return { ...base, status: 'error', error: 'The saved connection does not match the verified InMotion project, region and authentication endpoint.' }
  }
  const key = createHash('sha256').update(JSON.stringify([credentialId, secret, base.connection.credentialExpiresAt])).digest('hex')
  if (!refresh) {
    if (cached?.key === key && Date.now() - cached.at < CACHE_MS) return structuredClone({ ...cached.snapshot, cached: true })
    return { ...base, status: 'unchecked' }
  }
  if (pending?.key === key) return structuredClone(await pending.promise)
  const promise = readSnapshot(base, credentialId, secret)
  pending = { key, promise }
  try {
    const snapshot = await promise
    cached = { key, snapshot, at: Date.now() }
    return structuredClone(snapshot)
  } finally {
    if (pending?.promise === promise) pending = undefined
  }
}
