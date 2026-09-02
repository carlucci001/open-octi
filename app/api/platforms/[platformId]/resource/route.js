// GET /api/platforms/[platformId]/resource?resource=<info|customers|customer|subscriptions>&...
//
// Read-only proxy to a registered platform's live Platform Admin API
// (handoff doc §9 / §15, M1 read-only slice — GetRemedy3 is the first
// platform to light this up). Any CRM user with platform read access may
// call it, matching the existing `GET /api/platforms` convention. It:
//   - loads the registration (never trusts a client-supplied URL/base path);
//   - resolves credentialRef -> Command Vault credential -> API key
//     SERVER-SIDE ONLY (lib/platforms/adminClient, lib/agent-creds);
//   - builds the outbound URL from the registered platform URL + admin API
//     base path via the SSRF-guarded helpers in lib/platforms/ssrf;
//   - calls the platform with Authorization: Bearer <key>;
//   - relays the platform's JSON + status code.
//
// The resolved key is never sent to the client, logged, or echoed in an
// error. Resource ids and query params are allowlisted here (in addition to
// the allowlist inside adminClient) — no arbitrary path passthrough. GET
// only; this route never mutates the platform.
import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { callPlatformAdminResource, PLATFORM_ADMIN_RESOURCES } from '@/lib/platforms/adminClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200, headers = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export async function GET(request, { params }) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const { searchParams } = new URL(request.url)
  const resource = searchParams.get('resource') || ''
  const spec = PLATFORM_ADMIN_RESOURCES[resource]
  if (!spec) {
    return json({ ok: false, error: { code: 'UNKNOWN_RESOURCE', message: `Unknown resource. Allowed: ${Object.keys(PLATFORM_ADMIN_RESOURCES).join(', ')}.` } }, 400)
  }

  const allowedKeys = new Set(['resource', ...spec.params])
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      return json({ ok: false, error: { code: 'UNKNOWN_PARAM', message: `Unsupported query parameter "${key}" for resource "${resource}".` } }, 400)
    }
  }

  const result = await callPlatformAdminResource(params.platformId, resource, {
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
    id: searchParams.get('id'),
    since: searchParams.get('since'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  })

  const ok = result.status >= 200 && result.status < 300
  const body = result.body
  const payload = ok
    ? (body && !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, 'data')
        ? { ok: true, ...body }
        : { ok: true, data: body })
    : { ok: false, ...(body && !Array.isArray(body) ? body : {}) }
  return json(payload, result.status, { 'X-FCC-Platform-Cache': result.cached ? 'HIT' : 'MISS' })
}
