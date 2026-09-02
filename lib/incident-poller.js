import { callPlatformAdminResource } from './platforms/adminClient'
import { listPlatforms, normalizedPlatformCapabilities } from './platforms/registry'
import {
  listIncidents,
  processIncidentAlerts,
  reconcileIncidentEvents,
  resolveHealthyPlatformIncidents,
  saveIncidents,
  writeIncidentStatusState,
} from './incidents'

function upstreamData(result) {
  return result?.body?.data ?? result?.body ?? null
}

function successful(result) {
  return result?.status >= 200 && result.status < 300
}

async function safeFetch(fetchResource, platformId, resource, params) {
  try {
    return await fetchResource(platformId, resource, params, { bypassCache: true })
  } catch {
    return { status: 502, body: null }
  }
}

export async function pollIncidentSources({
  platforms = listPlatforms(),
  existingIncidents = listIncidents(),
  fetchResource = callPlatformAdminResource,
  saveIncidents: persistIncidents = saveIncidents,
  saveStatus = writeIncidentStatusState,
  processAlerts = processIncidentAlerts,
  now = () => new Date(),
  idFactory,
} = {}) {
  const polledAt = now().toISOString()
  const since = new Date(Date.parse(polledAt) - 24 * 60 * 60_000).toISOString()
  const capable = platforms.filter(platform => {
    const capabilities = normalizedPlatformCapabilities(platform)
    return capabilities.includes('errors') || capabilities.includes('health')
  })

  const rows = await Promise.all(capable.map(async platform => {
    const capabilities = normalizedPlatformCapabilities(platform)
    const hasErrors = capabilities.includes('errors')
    const hasHealth = capabilities.includes('health')
    const [errorsResult, healthResult] = await Promise.all([
      hasErrors ? safeFetch(fetchResource, platform.platformId, 'errors', { since, limit: 100 }) : null,
      hasHealth ? safeFetch(fetchResource, platform.platformId, 'health', {}) : null,
    ])
    const events = []
    if (hasErrors && successful(errorsResult)) {
      const errors = upstreamData(errorsResult)
      for (const error of Array.isArray(errors) ? errors : []) {
        events.push({
          platformId: platform.platformId,
          platformName: platform.name,
          fingerprint: String(error.fingerprint || ''),
          title: String(error.message || 'Platform error'),
          level: error.level,
          count: error.count,
          firstSeen: error.firstSeen,
          lastSeen: error.lastSeen,
          source: 'errors',
        })
      }
    }

    let health = null
    if (hasHealth && successful(healthResult)) {
      const value = upstreamData(healthResult)
      health = {
        platformId: platform.platformId,
        name: platform.name,
        status: ['ok', 'degraded', 'down'].includes(value?.status) ? value.status : 'down',
        version: String(value?.version || ''),
        checkedAt: polledAt,
      }
    } else if (hasHealth) {
      health = { platformId: platform.platformId, name: platform.name, status: 'down', version: '', checkedAt: polledAt }
    }
    if (health && health.status !== 'ok') {
      events.push({
        platformId: platform.platformId,
        platformName: platform.name,
        fingerprint: 'platform-health',
        title: health.status === 'degraded' ? `${platform.name} health is degraded` : `${platform.name} health check failed`,
        level: health.status === 'degraded' ? 'warning' : 'error',
        count: 1,
        firstSeen: polledAt,
        lastSeen: polledAt,
        source: 'health',
        increment: true,
      })
    }
    return { events, health }
  }))

  const events = rows.flatMap(row => row.events)
  const reconciled = reconcileIncidentEvents(existingIncidents, events, { now: polledAt, ...(idFactory ? { idFactory } : {}) })
  const healthyPlatformIds = rows.filter(row => row.health?.status === 'ok').map(row => row.health.platformId)
  const incidents = resolveHealthyPlatformIncidents(reconciled.incidents, healthyPlatformIds, { now: polledAt })
  const statusState = {
    generatedAt: polledAt,
    platforms: rows.map(row => row.health).filter(Boolean),
  }
  persistIncidents(incidents)
  saveStatus(statusState)
  await processAlerts(reconciled.alertCandidates)
  return { generatedAt: polledAt, pollIntervalMs: 60_000, incidents, platforms: statusState.platforms }
}
