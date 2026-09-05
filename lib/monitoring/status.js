export const MONITOR_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  FAILED: 'failed',
  NOT_CONFIGURED: 'not_configured',
  NOT_APPLICABLE: 'not_applicable',
})

export const FAILURE_STATUSES = new Set([
  MONITOR_STATUS.FAILED,
  MONITOR_STATUS.NOT_CONFIGURED,
])
