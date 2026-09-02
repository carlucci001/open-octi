// PATCH  /api/platforms/[platformId] — edit a registration (admin/owner, audited)
// DELETE /api/platforms/[platformId] — remove a registration (admin/owner, audited;
//                                      built-in platforms cannot be removed)
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { deletePlatform, getPlatform, listPlatforms, sanitizePlatform, updatePlatform } from '@/lib/platforms/registry'
import { parsePlatformUrl } from '@/lib/platforms/ssrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  const existing = getPlatform(params.platformId)
  if (!existing) return json({ ok: false, error: 'Platform not found.' }, 404)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  try {
    if (body.url) parsePlatformUrl(body.url)
    const platform = updatePlatform(existing.id, body)
    logAuditEvent({
      request,
      user,
      action: 'platform_updated',
      area: 'platforms',
      targetId: platform.platformId,
      targetName: platform.name,
      meta: { url: platform.url, environment: platform.environment, supportsActions: platform.supportsActions },
    })
    return json({ ok: true, platform: sanitizePlatform(platform), platforms: listPlatforms().map(sanitizePlatform) })
  } catch (updateError) {
    return json({ ok: false, error: updateError.message || 'The platform could not be updated.' }, 400)
  }
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  const existing = getPlatform(params.platformId)
  if (!existing) return json({ ok: false, error: 'Platform not found.' }, 404)

  try {
    deletePlatform(existing.id)
    logAuditEvent({
      request,
      user,
      action: 'platform_removed',
      area: 'platforms',
      severity: 'warn',
      targetId: existing.platformId,
      targetName: existing.name,
    })
    return json({ ok: true, platforms: listPlatforms().map(sanitizePlatform) })
  } catch (deleteError) {
    return json({ ok: false, error: deleteError.message || 'The platform could not be removed.' }, 400)
  }
}
