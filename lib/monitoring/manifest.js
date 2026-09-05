const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function validateCredentialRefs(value, label) {
  if (value == null) return {}
  const refs = requireObject(value, label)
  for (const [name, envName] of Object.entries(refs)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error(`${label} contains an invalid credential name: ${name}`)
    if (!/^[A-Z][A-Z0-9_]*$/.test(String(envName))) {
      throw new Error(`${label}.${name} must reference an environment variable name`)
    }
  }
  return { ...refs }
}

export function validateMonitoringManifest(input) {
  const manifest = requireObject(input, 'Monitoring manifest')
  const installation = requireObject(manifest.installation, 'installation')
  const id = String(installation.id || '').trim()
  const edition = String(installation.edition || '').trim()

  if (!ID_PATTERN.test(id)) throw new Error('installation.id must be a stable lowercase identifier')
  if (!ID_PATTERN.test(edition)) throw new Error('installation.edition must be a stable lowercase identifier')
  if (!Array.isArray(manifest.monitors)) throw new Error('monitors must be an array')
  if (manifest.monitors.length > 32) throw new Error('At most 32 monitors are supported per installation')

  const seen = new Set()
  const monitors = manifest.monitors.map((raw, index) => {
    const monitor = requireObject(raw, `monitors[${index}]`)
    const monitorId = String(monitor.id || '').trim()
    const adapter = String(monitor.adapter || '').trim()
    if (!ID_PATTERN.test(monitorId)) throw new Error(`monitors[${index}].id is invalid`)
    if (seen.has(monitorId)) throw new Error(`Duplicate monitor id: ${monitorId}`)
    if (!ID_PATTERN.test(adapter)) throw new Error(`monitors[${index}].adapter is invalid`)
    seen.add(monitorId)

    return {
      id: monitorId,
      name: String(monitor.name || monitorId),
      adapter,
      enabled: monitor.enabled !== false,
      required: monitor.required === true,
      config: monitor.config == null ? {} : requireObject(monitor.config, `monitors[${index}].config`),
      credentials: validateCredentialRefs(monitor.credentials, `monitors[${index}].credentials`),
      configEnv: validateCredentialRefs(monitor.configEnv, `monitors[${index}].configEnv`),
      tags: Array.isArray(monitor.tags) ? monitor.tags.map(String) : [],
    }
  })

  return {
    schemaVersion: Number(manifest.schemaVersion || 1),
    installation: {
      id,
      name: String(installation.name || id),
      edition,
      supportPlan: String(installation.supportPlan || 'community'),
    },
    monitors,
  }
}

export function resolveMonitorCredentials(monitor, env = process.env) {
  const credentials = {}
  const missing = []
  for (const [name, envName] of Object.entries(monitor.credentials || {})) {
    const value = env[envName]
    if (String(value || '').trim()) credentials[name] = String(value).trim()
    else missing.push(envName)
  }
  return { credentials, missing }
}
