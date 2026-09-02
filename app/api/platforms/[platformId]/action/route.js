// POST /api/platforms/[platformId]/action
// Body: { resource: 'customer_action', id, action, reason, idempotencyKey? }
//
// Authenticated, audited mutation proxy to a registered platform's live
// Platform Admin API (Phase 1 actions work order, 2026-08-02). Mirrors the
// GET resource proxy's double-allowlist style, but:
//   - gated by `requireCrmWrite` — read access is NOT enough to mutate;
//   - the action spec AND the action string are allowlisted here (in
//     addition to the allowlist inside adminClient) — no passthrough;
//   - a typed reason (min 3 chars) is required for every action;
//   - EVERY attempted action writes an audit row via logAuditEvent — on
//     success and on failure — with actor, platform, action, target,
//     reason, outcome, and the upstream status;
//   - the upstream call carries an `Idempotency-Key` (client-supplied UUID,
//     one per user-confirmed action; generated here if absent/invalid).
//
// The resolved platform key is never sent to the client, logged, or echoed
// in an error (same guarantee as the GET proxy).
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCrmWrite } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/auditLog'
import { callPlatformAdminAction, PLATFORM_ADMIN_ACTIONS } from '@/lib/platforms/adminClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_BODY_KEYS = new Set(['resource', 'id', 'action', 'reason', 'idempotencyKey'])
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request, { params }) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' } }, 400)
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ ok: false, error: { code: 'INVALID_JSON', message: 'The request body must be a JSON object.' } }, 400)
  }

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return json({ ok: false, error: { code: 'UNKNOWN_PARAM', message: `Unsupported body field "${key}".` } }, 400)
    }
  }

  const resource = String(payload.resource ?? '')
  const spec = PLATFORM_ADMIN_ACTIONS[resource]
  if (!spec) {
    return json({ ok: false, error: { code: 'UNKNOWN_RESOURCE', message: `Unknown action resource. Allowed: ${Object.keys(PLATFORM_ADMIN_ACTIONS).join(', ')}.` } }, 400)
  }

  const action = String(payload.action ?? '').trim()
  if (!spec.allowedActions.includes(action)) {
    return json({ ok: false, error: { code: 'UNKNOWN_ACTION', message: `Unknown action. Allowed: ${spec.allowedActions.join(', ')}.` } }, 400)
  }

  const reason = String(payload.reason ?? '').trim()
  if (reason.length < 3) {
    return json({ ok: false, error: { code: 'MISSING_REASON', message: 'A reason of at least 3 characters is required.' } }, 400)
  }

  const id = String(payload.id ?? '').trim()
  if (!id) {
    return json({ ok: false, error: { code: 'MISSING_PARAM', message: 'Missing required parameter "id".' } }, 400)
  }

  const clientKey = String(payload.idempotencyKey ?? '').trim()
  const idempotencyKey = IDEMPOTENCY_KEY_RE.test(clientKey) ? clientKey : randomUUID()

  const result = await callPlatformAdminAction(params.platformId, resource, { id, action, reason, idempotencyKey })
  const ok = result.status >= 200 && result.status < 300

  // Audit on success AND failure — a refused or failed mutation attempt is
  // just as much part of the record as a completed one.
  logAuditEvent({
    request,
    user,
    action: 'platform_action',
    area: 'platforms',
    severity: 'warn',
    targetId: id,
    targetName: `${params.platformId}: ${action}`,
    meta: {
      platformId: params.platformId,
      resource,
      action,
      reason,
      outcome: ok ? 'success' : 'failure',
      upstreamStatus: result.status,
      errorCode: ok ? '' : (result.body?.error?.code || ''),
    },
  })

  return json({ ok, ...result.body }, result.status)
}
