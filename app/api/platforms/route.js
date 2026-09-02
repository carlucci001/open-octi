// GET  /api/platforms — list registered platforms (any CRM user; the Platforms
//                        page is visible to members, mutations are not)
// POST /api/platforms — register a platform (admin/owner only, audit-logged)
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { requireCrmRead } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/auditLog'
import { createPlatform, listPlatforms, platformRelationshipOptions, sanitizePlatform } from '@/lib/platforms/registry'
import { parsePlatformUrl } from '@/lib/platforms/ssrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return json({ ok: true, platforms: listPlatforms().map(sanitizePlatform), relationshipOptions: platformRelationshipOptions() })
}

export async function POST(request) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  try {
    parsePlatformUrl(body.url) // static SSRF screen at registration time
    const platform = createPlatform(body)
    logAuditEvent({
      request,
      user,
      action: 'platform_registered',
      area: 'platforms',
      targetId: platform.platformId,
      targetName: platform.name,
      meta: { url: platform.url, environment: platform.environment, supportsActions: platform.supportsActions },
    })
    return json({ ok: true, platform: sanitizePlatform(platform), platforms: listPlatforms().map(sanitizePlatform) })
  } catch (registerError) {
    return json({ ok: false, error: registerError.message || 'The platform could not be registered.' }, 400)
  }
}
