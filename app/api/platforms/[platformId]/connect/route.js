// POST /api/platforms/[platformId]/connect — test the platform connection
// (admin/owner). Fetches and validates the platform manifest behind the SSRF
// guards, records an honest health state on the registration, and audits the
// check. A failed check is a successful request with check.ok=false — the
// operator always sees what happened, nothing hangs.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { getPlatform, recordPlatformCheck, sanitizePlatform } from '@/lib/platforms/registry'
import { fetchPlatformManifest } from '@/lib/platforms/manifest'
import { extractManifestCapabilities } from '@/lib/platforms/manifest'
import { callPlatformAdminResource, PLATFORM_ADMIN_RESOURCES } from '@/lib/platforms/adminClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request, { params }) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  const platform = getPlatform(params.platformId)
  if (!platform) return json({ ok: false, error: 'Platform not found.' }, 404)

  let check
  try {
    check = await fetchPlatformManifest(platform.url)
  } catch (guardError) {
    // SSRF/URL violation — a registration problem, surfaced loudly.
    check = { ok: false, status: 0, note: guardError.message || 'The platform URL failed connection safety checks.' }
  }

  const declaredCapabilities = check.ok ? extractManifestCapabilities(check.manifest) : []
  let updated = recordPlatformCheck(platform.id, {
    status: check.ok ? 'ok' : 'error',
    note: check.note,
    manifestVersion: check.manifest?.platform?.version || check.manifest?.schemaVersion || '',
    capabilities: check.ok && check.manifest?.capabilities !== undefined ? declaredCapabilities : undefined,
  })

  const capabilityResults = []
  if (check.ok) {
    for (const name of declaredCapabilities) {
      if (name === 'actions' || !PLATFORM_ADMIN_RESOURCES[name]) {
        capabilityResults.push({ name, declared: true, responded: null, status: null })
        continue
      }
      const result = await callPlatformAdminResource(platform.platformId, name, {})
      const responded = result.status >= 200 && result.status < 300
      capabilityResults.push({ name, declared: true, responded, status: result.status })
    }
  }
  const respondedCapabilities = capabilityResults.filter(result => result.responded === true).map(result => result.name)

  logAuditEvent({
    request,
    user,
    action: check.ok ? 'platform_check_passed' : 'platform_check_failed',
    area: 'platforms',
    severity: check.ok ? 'info' : 'warn',
    targetId: platform.platformId,
    targetName: platform.name,
    meta: { status: check.status, note: check.note, declaredCapabilities, respondedCapabilities },
  })

  return json({
    ok: true,
    platform: sanitizePlatform(updated),
    check: {
      ok: check.ok,
      status: check.status,
      note: check.note,
      manifest: check.ok ? {
        schemaVersion: check.manifest?.schemaVersion || '',
        id: check.manifest?.platform?.id || '',
        name: check.manifest?.platform?.name || '',
        version: check.manifest?.platform?.version || '',
        adminApiBasePath: check.manifest?.platform?.adminApiBasePath || '',
        capabilities: declaredCapabilities,
      } : null,
      declaredCapabilities,
      respondedCapabilities,
      capabilities: capabilityResults,
    },
  })
}
