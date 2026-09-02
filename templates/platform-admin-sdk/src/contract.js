export const PLATFORM_ADMIN_CAPABILITIES = ['customers', 'subscriptions', 'actions', 'health', 'releases', 'errors', 'usage', 'revenue']

const text = value => typeof value === 'string'
const number = value => typeof value === 'number' && Number.isFinite(value)
const count = value => number(value) && value >= 0
const date = value => text(value) && !Number.isNaN(Date.parse(value))

export function validateHealth(value) {
  return Boolean(value && ['ok', 'degraded', 'down'].includes(value.status) && text(value.version) && date(value.ts)
    && Array.isArray(value.checks) && value.checks.every(item => item && text(item.name) && typeof item.ok === 'boolean' && text(item.detail)))
}

export function validateReleases(value) {
  return Array.isArray(value) && value.every(item => item && text(item.id) && text(item.version) && text(item.commit)
    && date(item.deployedAt) && text(item.deployer) && ['live', 'previous', 'failed'].includes(item.status)
    && (item.notes === undefined || text(item.notes)))
}

export function validateErrors(value) {
  return Array.isArray(value) && value.every(item => item && text(item.fingerprint) && text(item.message) && count(item.count)
    && date(item.firstSeen) && date(item.lastSeen) && text(item.level) && item.sample && text(item.sample.route)
    && (item.sample.stack === undefined || text(item.sample.stack)))
}

export function validateUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.keys(value).length === 0) return true
  return count(value.activeUsers) && count(value.newUsers) && Array.isArray(value.events)
    && value.events.every(item => item && text(item.name) && count(item.count))
}

export function validateRevenue(value) {
  return Boolean(value && text(value.currency) && number(value.mrr) && number(value.newMrr) && number(value.churnedMrr)
    && count(value.failedPayments) && value.trials && count(value.trials.started) && count(value.trials.converted))
}
