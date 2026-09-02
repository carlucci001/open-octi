const RELEASE_STATUSES = new Set(['live', 'previous', 'failed'])
const HEALTH_STATUSES = new Set(['ok', 'degraded', 'down'])

const finiteNumber = value => typeof value === 'number' && Number.isFinite(value)
const nonNegativeNumber = value => finiteNumber(value) && value >= 0
const string = value => typeof value === 'string'
const isoLike = value => string(value) && value.length > 0 && !Number.isNaN(Date.parse(value))

export function validateHealth(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value)
    && HEALTH_STATUSES.has(value.status)
    && string(value.version)
    && Array.isArray(value.checks)
    && value.checks.every(check => check && string(check.name) && typeof check.ok === 'boolean' && string(check.detail))
    && isoLike(value.ts)
  )
}

export function validateReleases(value) {
  return Array.isArray(value) && value.every(release => Boolean(
    release && string(release.id) && string(release.version) && string(release.commit)
    && isoLike(release.deployedAt) && string(release.deployer)
    && RELEASE_STATUSES.has(release.status)
    && (release.notes === undefined || string(release.notes))
  ))
}

export function validateErrors(value) {
  return Array.isArray(value) && value.every(error => Boolean(
    error && string(error.fingerprint) && string(error.message)
    && nonNegativeNumber(error.count) && isoLike(error.firstSeen) && isoLike(error.lastSeen)
    && string(error.level) && error.sample && string(error.sample.route)
    && (error.sample.stack === undefined || string(error.sample.stack))
  ))
}

export function validateUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.keys(value).length === 0) return true
  return nonNegativeNumber(value.activeUsers)
    && nonNegativeNumber(value.newUsers)
    && Array.isArray(value.events)
    && value.events.every(event => event && string(event.name) && nonNegativeNumber(event.count))
}

export function validateRevenue(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value)
    && string(value.currency)
    && finiteNumber(value.mrr)
    && finiteNumber(value.newMrr)
    && finiteNumber(value.churnedMrr)
    && nonNegativeNumber(value.failedPayments)
    && value.trials && nonNegativeNumber(value.trials.started) && nonNegativeNumber(value.trials.converted)
  )
}

export const PLATFORM_ADMIN_VALIDATORS = {
  health: validateHealth,
  releases: validateReleases,
  errors: validateErrors,
  usage: validateUsage,
  revenue: validateRevenue,
}
