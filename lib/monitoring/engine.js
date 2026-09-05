import { FAILURE_STATUSES, MONITOR_STATUS } from './status.js'
import { resolveMonitorCredentials, validateMonitoringManifest } from './manifest.js'

export class MonitorRegistry {
  constructor() {
    this.adapters = new Map()
  }

  register(id, runner) {
    if (this.adapters.has(id)) throw new Error(`Monitor adapter already registered: ${id}`)
    if (typeof runner !== 'function') throw new Error(`Monitor adapter ${id} must be a function`)
    this.adapters.set(id, runner)
    return this
  }

  get(id) {
    return this.adapters.get(id)
  }
}

function resultFor(monitor, status, summary, extra = {}) {
  return {
    id: monitor.id,
    name: monitor.name,
    adapter: monitor.adapter,
    required: monitor.required,
    status,
    summary,
    checkedAt: new Date().toISOString(),
    ...extra,
  }
}

async function runOne(monitor, registry, context) {
  if (!monitor.enabled) {
    return resultFor(monitor, MONITOR_STATUS.NOT_APPLICABLE, 'Disabled for this installation')
  }

  const runner = registry.get(monitor.adapter)
  if (!runner) {
    const status = monitor.required ? MONITOR_STATUS.FAILED : MONITOR_STATUS.NOT_CONFIGURED
    return resultFor(monitor, status, `Adapter is not installed: ${monitor.adapter}`)
  }

  const { credentials, missing } = resolveMonitorCredentials(monitor, context.env)
  const configuration = resolveMonitorCredentials({ credentials: monitor.configEnv }, context.env)
  missing.push(...configuration.missing)
  if (missing.length) {
    return resultFor(
      monitor,
      MONITOR_STATUS.NOT_CONFIGURED,
      `Missing configuration: ${missing.join(', ')}`,
    )
  }

  const startedAt = Date.now()
  try {
    const outcome = await runner({
      config: { ...monitor.config, ...configuration.credentials },
      credentials,
      fetch: context.fetch,
      now: context.now,
    })
    const status = Object.values(MONITOR_STATUS).includes(outcome?.status) ? outcome.status : MONITOR_STATUS.FAILED
    return resultFor(monitor, status, outcome?.summary || 'Check completed', {
      latencyMs: Date.now() - startedAt,
      details: outcome?.details,
    })
  } catch (error) {
    return resultFor(monitor, MONITOR_STATUS.FAILED, error?.message || 'Check failed', {
      latencyMs: Date.now() - startedAt,
    })
  }
}

export async function runMonitoringManifest(input, options = {}) {
  const manifest = validateMonitoringManifest(input)
  const registry = options.registry || new MonitorRegistry()
  const context = {
    env: options.env || process.env,
    fetch: options.fetch || globalThis.fetch,
    now: options.now || (() => new Date()),
  }
  const results = []
  for (const monitor of manifest.monitors) results.push(await runOne(monitor, registry, context))

  const blocking = results.filter(result => result.required && FAILURE_STATUSES.has(result.status))
  const degraded = results.filter(result => result.status === MONITOR_STATUS.DEGRADED || (!result.required && result.status === MONITOR_STATUS.FAILED))
  const report = {
    schemaVersion: 1,
    installation: manifest.installation,
    checkedAt: new Date().toISOString(),
    status: blocking.length ? MONITOR_STATUS.FAILED : degraded.length ? MONITOR_STATUS.DEGRADED
      : results.some(result => result.status === MONITOR_STATUS.HEALTHY) ? MONITOR_STATUS.HEALTHY : MONITOR_STATUS.NOT_APPLICABLE,
    summary: {
      total: results.length,
      healthy: results.filter(result => result.status === MONITOR_STATUS.HEALTHY).length,
      degraded: degraded.length,
      failed: results.filter(result => result.status === MONITOR_STATUS.FAILED).length,
      notConfigured: results.filter(result => result.status === MONITOR_STATUS.NOT_CONFIGURED).length,
      notApplicable: results.filter(result => result.status === MONITOR_STATUS.NOT_APPLICABLE).length,
    },
    results,
  }
  // Adapters never persist credential values, including error messages from a provider.
  const references = manifest.monitors.flatMap(monitor => Object.values(monitor.credentials))
  const secrets = [...new Set(references.map(reference => String(context.env[reference] || '')).filter(Boolean))]
  function sanitize(value) {
    if (typeof value === 'string') {
      for (const secret of secrets) value = value.split(secret).join('[redacted]')
      return value.slice(0,2000)
    }
    if (Array.isArray(value)) return value.map(sanitize)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]))
    return value
  }
  return sanitize(report)
}
