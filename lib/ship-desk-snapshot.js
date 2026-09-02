import { readCicdItems } from './cicd-registry'
import { getReleaseSummary } from './release-summaries'
import { resolveRepositoryLinks } from './repository-links'
import { buildRollbackCommand, collectCommitMessages, matchCicdItem, parseReleaseList, selectReleaseState } from './ship-desk'
import { processShipDeskAlerts } from './ship-desk-alerts'
import { callPlatformAdminResource } from './platforms/adminClient'
import { listPlatforms, normalizedPlatformCapabilities } from './platforms/registry'
import { getReleaseAnnotation } from './release-annotations'

function upstreamData(result) {
  return result?.body?.data ?? result?.body ?? null
}

function failedHealth(result) {
  return {
    status: 'down',
    version: '',
    checks: [],
    ts: new Date().toISOString(),
    detail: result?.body?.error?.message || 'Platform health could not be read.',
  }
}

export async function buildShipDeskSnapshot({
  platforms = listPlatforms(),
  cicdItems = readCicdItems(),
  fetchResource = callPlatformAdminResource,
  processAlerts = processShipDeskAlerts,
  collectMessages = collectCommitMessages,
  getSummary = getReleaseSummary,
  getAnnotation = getReleaseAnnotation,
} = {}) {
  const rows = await Promise.all(platforms.map(async platform => {
    const capabilities = normalizedPlatformCapabilities(platform)
    const hasHealth = capabilities.includes('health')
    const hasReleases = capabilities.includes('releases')
    const [healthResult, releaseResult] = await Promise.all([
      hasHealth ? fetchResource(platform.platformId, 'health', {}) : null,
      hasReleases ? fetchResource(platform.platformId, 'releases', { limit: 20 }, { bypassCache: true }) : null,
    ])
    const health = hasHealth && healthResult?.status >= 200 && healthResult.status < 300
      ? upstreamData(healthResult)
      : hasHealth ? failedHealth(healthResult) : { status: 'unknown', version: '', checks: [], ts: null }
    const releases = hasReleases && releaseResult?.status >= 200 && releaseResult.status < 300
      ? parseReleaseList(upstreamData(releaseResult))
        .map(release => ({ ...release, annotation: getAnnotation(platform.platformId, release.id) }))
      : []
    const { live, previous } = selectReleaseState(releases)
    const cicd = matchCicdItem(platform, cicdItems)
    const commitMessages = live && previous && cicd?.localPath
      ? collectMessages({ repoPath: cicd.localPath, fromCommit: previous.commit, toCommit: live.commit })
      : []
    return {
      platformId: platform.platformId,
      name: platform.name,
      url: platform.url,
      capabilities,
      monitorHealth: hasHealth,
      health,
      releases,
      liveRelease: live,
      previousRelease: previous,
      commitMessages,
      summary: live ? getSummary(platform.platformId, live.id) : null,
      links: resolveRepositoryLinks(cicd || {}),
      rollback: {
        command: buildRollbackCommand({ previousRelease: previous, cicd }),
        releasePolicy: String(cicd?.releasePolicy || '').trim(),
      },
    }
  }))

  await processAlerts(rows)
  return { generatedAt: new Date().toISOString(), pollIntervalMs: 60_000, platforms: rows }
}
