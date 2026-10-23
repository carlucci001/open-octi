import { NextResponse } from 'next/server'
import { requireAdmin, requireOwner } from '@/lib/auth'
import {
  compareVersions,
  fetchLatestRelease,
  getUpdaterStatus,
  readInstalledVersion,
  requestUpdaterInstall,
  updateConfiguration,
} from '@/lib/openocti-updates.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function noStore(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

function sameOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try { return new URL(origin).host === new URL(request.url).host } catch { return false }
}

export async function GET(request) {
  const { user, error } = await requireAdmin(request)
  if (error) return error
  const config = updateConfiguration()
  const currentVersion = readInstalledVersion()
  try {
    const latest = await fetchLatestRelease({ repository: config.repository })
    const updater = await getUpdaterStatus()
    return noStore({
      ok: true,
      product: config.product,
      currentVersion,
      latestVersion: latest.version,
      updateAvailable: compareVersions(latest.version, currentVersion) > 0,
      release: latest,
      installReady: updater.ready === true,
      installState: updater.state || (updater.ready ? 'idle' : 'not_configured'),
      installMessage: updater.message || updater.error || '',
      canInstall: user.role === 'owner' && updater.ready === true,
    })
  } catch (checkError) {
    return noStore({ ok: false, currentVersion, error: checkError.message }, 503)
  }
}

export async function POST(request) {
  const { error } = await requireOwner(request)
  if (error) return error
  if (!sameOrigin(request)) return noStore({ ok: false, error: 'same-origin confirmation required' }, 403)

  let body
  try { body = await request.json() } catch { return noStore({ ok: false, error: 'invalid JSON' }, 400) }
  if (body?.confirm !== true) return noStore({ ok: false, error: 'explicit confirmation required' }, 400)

  const config = updateConfiguration()
  try {
    const latest = await fetchLatestRelease({ repository: config.repository, force: true })
    if (String(body.version || '') !== latest.version) return noStore({ ok: false, error: 'The requested version is no longer the latest official release. Refresh and review again.' }, 409)
    const result = await requestUpdaterInstall(latest.version)
    return noStore({ ok: true, accepted: true, version: latest.version, ...result }, 202)
  } catch (installError) {
    return noStore({ ok: false, error: installError.message }, 503)
  }
}
