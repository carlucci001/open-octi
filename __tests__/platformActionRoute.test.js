// Platforms Phase 1 mutations (work order 2026-08-02) —
// POST /api/platforms/[platformId]/action route tests. Covers: the
// resource/action/reason/id allowlist (mirrors the GET route's
// double-allowlist style), requireCrmWrite gating (NOT requireCrmRead —
// a read-only caller must be refused), an audit row on both success and
// upstream failure, and Idempotency-Key passthrough to the admin client.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'u1', role: 'member' },
  denyWrite: false,
  actionResult: null,
}))

vi.mock('../lib/permissions', () => ({
  requireCrmWrite: vi.fn(async () => (
    state.denyWrite
      ? { user: null, error: Response.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
      : { user: state.user, error: null }
  )),
}))

vi.mock('../lib/auditLog', () => ({
  logAuditEvent: vi.fn(),
}))

vi.mock('../lib/platforms/adminClient', () => ({
  callPlatformAdminAction: vi.fn(async () => state.actionResult),
  PLATFORM_ADMIN_ACTIONS: {
    customer_action: {
      method: 'POST',
      pathTemplate: ({ id }) => `/customers/${encodeURIComponent(id)}/actions`,
      bodyFields: ['action', 'reason'],
      requiredParams: ['id'],
      allowedActions: ['suspend', 'reactivate', 'cancel_subscription', 'pause_subscription', 'resume_subscription'],
    },
  },
}))

import { logAuditEvent } from '../lib/auditLog'
import { callPlatformAdminAction } from '../lib/platforms/adminClient'
import { POST } from '../app/api/platforms/[platformId]/action/route'

function request(body) {
  return new Request('https://crm.example.com/api/platforms/getremedy3/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(platformId = 'getremedy3') {
  return { params: { platformId } }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = { id: 'u1', role: 'member' }
  state.denyWrite = false
  state.actionResult = { status: 200, body: { data: { id: 'cust_1', suspended: true } } }
})

describe('POST /api/platforms/[platformId]/action — resource/action/reason/id allowlist', () => {
  it('rejects an unknown resource with 400 and never calls upstream', async () => {
    const response = await POST(request({ resource: 'delete_everything', id: 'cust_1', action: 'suspend', reason: 'valid reason' }), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNKNOWN_RESOURCE')
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })

  it('rejects an unknown action with 400 and never calls upstream', async () => {
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'delete_everything', reason: 'valid reason' }), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNKNOWN_ACTION')
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })

  it('rejects a missing reason with 400 and never calls upstream', async () => {
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend' }), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('MISSING_REASON')
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })

  it('rejects a too-short reason with 400 and never calls upstream', async () => {
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'ok' }), ctx())
    expect(response.status).toBe(400)
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })

  it('rejects an unsupported body field instead of passing it through', async () => {
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'valid reason', extra: 'x' }), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNKNOWN_PARAM')
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })

  it('rejects a missing id with 400', async () => {
    const response = await POST(request({ resource: 'customer_action', action: 'suspend', reason: 'valid reason' }), ctx())
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('MISSING_PARAM')
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON with 400', async () => {
    const badRequest = new Request('https://crm.example.com/api/platforms/getremedy3/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    const response = await POST(badRequest, ctx())
    expect(response.status).toBe(400)
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
  })
})

describe('POST .../action — requireCrmWrite gating (read-only caller must be refused)', () => {
  it('denies a read-only caller with 403 before calling upstream or writing an audit row', async () => {
    state.denyWrite = true
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'valid reason' }), ctx())
    expect(response.status).toBe(403)
    expect(callPlatformAdminAction).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe('POST .../action — audit logging on success AND failure', () => {
  it('writes an audit row on success with actor, platform, action, target, reason, outcome', async () => {
    state.actionResult = { status: 200, body: { data: { id: 'cust_1', suspended: true } } }
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'fraud review' }), ctx())
    expect(response.status).toBe(200)
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    const [call] = logAuditEvent.mock.calls[0]
    expect(call.action).toBe('platform_action')
    expect(call.user).toBe(state.user)
    expect(call.targetId).toBe('cust_1')
    expect(call.meta.platformId).toBe('getremedy3')
    expect(call.meta.action).toBe('suspend')
    expect(call.meta.reason).toBe('fraud review')
    expect(call.meta.outcome).toBe('success')
    expect(call.meta.upstreamStatus).toBe(200)
  })

  it('writes an audit row on upstream failure too, with the failure outcome and error code', async () => {
    state.actionResult = { status: 502, body: { error: { code: 'UPSTREAM_UNREACHABLE', message: 'The platform could not be reached.' } } }
    const response = await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'fraud review' }), ctx())
    expect(response.status).toBe(502)
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    const [call] = logAuditEvent.mock.calls[0]
    expect(call.meta.outcome).toBe('failure')
    expect(call.meta.errorCode).toBe('UPSTREAM_UNREACHABLE')
    expect(call.meta.upstreamStatus).toBe(502)
  })
})

describe('POST .../action — Idempotency-Key passthrough', () => {
  it('forwards a valid client-supplied idempotency key to the admin client', async () => {
    await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'fraud review', idempotencyKey: 'client-generated-key-1' }), ctx())
    const [, , options] = callPlatformAdminAction.mock.calls[0]
    expect(options.idempotencyKey).toBe('client-generated-key-1')
  })

  it('generates an idempotency key when the client does not supply one', async () => {
    await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'fraud review' }), ctx())
    const [, , options] = callPlatformAdminAction.mock.calls[0]
    expect(options.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('ignores a malformed client idempotency key and generates one instead', async () => {
    await POST(request({ resource: 'customer_action', id: 'cust_1', action: 'suspend', reason: 'fraud review', idempotencyKey: '!! not valid !!' }), ctx())
    const [, , options] = callPlatformAdminAction.mock.calls[0]
    expect(options.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
