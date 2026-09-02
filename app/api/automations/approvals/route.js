// The approval gate for client automations provisioned from a concierge
// order. Operator-only by construction: requireCrmWrite runs before anything
// else, so nothing reachable from a portal session can activate an automation
// or start recurring billing. Mirrors the admin-approval-only rule that
// already governs portal access.
import { NextResponse } from 'next/server'
import { requireCrmWrite, requireCrmRead } from '@/lib/permissions'
import {
  listPendingApprovals,
  approveClientAutomation,
  declineClientAutomation,
} from '@/lib/portal-automation-provisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const pending = listPendingApprovals().map(item => ({
    id: item.id,
    name: item.name,
    clientName: item.clientName,
    accountId: item.tenantId,
    cadence: item.cadence,
    requestedAt: item.provisionedFrom?.requestedAt || item.createdAt,
    requestedBy: item.provisionedFrom?.requestedBy || null,
    templateId: item.provisionedFrom?.templateId || item.templateId || null,
    monthlyFee: item.provisionedFrom?.monthlyFee ?? null,
    setupFee: item.provisionedFrom?.setupFee ?? 0,
    ticketNumber: item.provisionedFrom?.ticketNumber || null,
    notes: item.provisionedFrom?.notes || '',
  }))
  return NextResponse.json({ ok: true, pending, count: pending.length })
}

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  const action = String(body.action || '').trim().toLowerCase()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ ok: false, error: 'action must be "approve" or "decline"' }, { status: 400 })
  }

  const who = user?.email || user?.name || user?.id || 'operator'
  try {
    if (action === 'approve') {
      const automation = approveClientAutomation(id, { approvedBy: who })
      console.log('[automation-approval] approved', id, 'by', who)
      return NextResponse.json({
        ok: true,
        action: 'approve',
        automation: { id: automation.id, name: automation.name, status: automation.status, enabled: automation.enabled, trigger: automation.trigger },
      })
    }
    const automation = declineClientAutomation(id, { reason: body.reason, declinedBy: who })
    console.log('[automation-approval] declined', id, 'by', who)
    return NextResponse.json({
      ok: true,
      action: 'decline',
      automation: { id: automation.id, name: automation.name, status: automation.status, enabled: automation.enabled },
    })
  } catch (approvalError) {
    return NextResponse.json({ ok: false, error: approvalError?.message || 'Approval failed' }, { status: 409 })
  }
}
