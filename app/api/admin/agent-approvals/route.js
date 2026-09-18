// Admin console surface for the agent tool-call approval gate. This route
// lives under /api/admin/ so the middleware session gate applies on top of
// requireAdmin() below — every handler starts by checking a real logged-in
// admin session. It must never accept x-agent-key or any other machine
// credential: an agent must not be able to approve its own tool call.
import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth'
import {
  listRequests,
  listWindows,
  approveRequest,
  denyRequest,
  openWindow,
  closeWindow,
  logGuardrailAuditEvent,
} from '@/lib/agent-approvals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function decidedByFor(user) {
  return user?.name || user?.email || user?.id || 'Command Center admin'
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  const pending = listRequests({ status: 'pending' })
  const decided = listRequests({})
    .filter(r => r.decidedAt)
    .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime())
    .slice(0, 20)
  const openWindows = listWindows().filter(w => !w.closedAt)

  return json({ ok: true, pending, recent: decided, windows: openWindows })
}

export async function POST(request) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const action = String(body?.action || '').trim()
  const decidedBy = decidedByFor(user)

  if (action === 'approve' || action === 'deny') {
    const id = String(body?.id || '').trim()
    if (!id) return json({ ok: false, error: 'id is required' }, 400)
    const record = action === 'approve' ? approveRequest(id, decidedBy) : denyRequest(id, decidedBy)
    if (!record) return json({ ok: false, error: 'approval request not found' }, 404)
    logGuardrailAuditEvent({
      tool: record.tool,
      risk: record.risk,
      approved: action === 'approve',
      via: 'admin_console',
      approvalId: record.id,
      approvalPrincipal: 'admin',
      blocked: false,
      reason: `admin ${action === 'approve' ? 'approved' : 'denied'} via console`,
      tenantId: record.tenantId,
      decidedBy,
    })
    return json({ ok: true, request: record })
  }

  if (action === 'open_window') {
    let window
    try {
      window = openWindow({
        minutes: body?.minutes,
        risks: body?.risks,
        openedBy: decidedBy,
        note: body?.note,
      })
    } catch (validationError) {
      return json({ ok: false, error: validationError.message }, 400)
    }
    logGuardrailAuditEvent({
      tool: null,
      risk: Array.isArray(window.risks) ? window.risks.join(',') : window.risks,
      approved: true,
      via: 'admin_console',
      windowId: window.id,
      approvalPrincipal: 'admin',
      blocked: false,
      reason: 'admin opened an approval window',
      tenantId: null,
      decidedBy,
      note: window.note || undefined,
    })
    return json({ ok: true, window })
  }

  if (action === 'close_window') {
    const id = String(body?.id || '').trim()
    if (!id) return json({ ok: false, error: 'id is required' }, 400)
    const window = closeWindow(id, decidedBy)
    if (!window) return json({ ok: false, error: 'approval window not found' }, 404)
    logGuardrailAuditEvent({
      tool: null,
      risk: Array.isArray(window.risks) ? window.risks.join(',') : window.risks,
      approved: false,
      via: 'admin_console',
      windowId: window.id,
      approvalPrincipal: 'admin',
      blocked: false,
      reason: 'admin closed an approval window',
      tenantId: null,
      decidedBy,
    })
    return json({ ok: true, window })
  }

  return json({ ok: false, error: `unknown action: ${action || '(none)'}` }, 400)
}
