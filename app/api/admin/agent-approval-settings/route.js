// Admin console surface for Agent Approvals *configuration* — timing and
// notification channels — kept as a sibling route rather than folded into
// app/api/admin/agent-approvals/route.js so that route's action dispatch
// (approve/deny/open_window/close_window, all decision-making on live
// requests) doesn't grow a second, unrelated "settings" action string.
// Matches the existing pattern under app/api/admin/ (credit-grants,
// portal-login-as, subscription-plans, stripe-catalog-sync each get their
// own route directory).
//
// requireAdmin() gates every handler here, same as the neighboring route.
// This must never accept a machine key (x-agent-key/x-api-key) — an agent
// must not be able to change its own approval timing or turn off the
// notifications that tell Carl it's waiting.
import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/auth'
import {
  getApprovalSettings,
  saveApprovalSettings,
  sendApprovalNotificationEmail,
} from '@/lib/agent-approvals'
import { pushNtfy } from '@/lib/ntfy'
import { getAgentToolRiskCatalog } from '@/lib/agent-tool-risk-catalog'
import { readData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AGENT_GUARDRAIL_LOG_FILE = 'agent-tool-guardrails.json'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function decidedByFor(user) {
  return user?.name || user?.email || user?.id || 'Command Center admin'
}

function recentGuardrailActivity(limit = 20) {
  const current = readData(AGENT_GUARDRAIL_LOG_FILE) || { events: [] }
  const events = Array.isArray(current.events) ? current.events : []
  return events.slice(-limit).reverse()
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  const settings = getApprovalSettings()
  const riskCatalog = getAgentToolRiskCatalog()
  const activity = recentGuardrailActivity(20)

  return json({ ok: true, settings, riskCatalog, activity })
}

export async function POST(request) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const action = String(body?.action || 'save').trim()
  const decidedBy = decidedByFor(user)

  if (action === 'save') {
    // saveApprovalSettings() clamps every field server-side (ttl 1–120,
    // window 1–240) — the posted values here are never trusted as-is.
    const settings = saveApprovalSettings({
      notifyPush: body?.notifyPush,
      notifyEmail: body?.notifyEmail,
      notifyEmailTo: body?.notifyEmailTo,
      ttlMinutes: body?.ttlMinutes,
      maxWindowMinutes: body?.maxWindowMinutes,
      updatedBy: decidedBy,
    })
    return json({ ok: true, settings })
  }

  if (action === 'test') {
    // Tests whatever is toggled on in the (possibly unsaved) form the admin
    // is looking at right now, not necessarily the last-saved settings — so
    // Carl can verify a channel before committing it. Both legs are awaited
    // and reported individually; neither is fire-and-forget here, unlike
    // the real notifyApprovalPending() path used when an approval is
    // actually created.
    const wantPush = body?.notifyPush !== false
    const wantEmail = body?.notifyEmail === true
    const emailTo = typeof body?.notifyEmailTo === 'string' ? body.notifyEmailTo.trim() : ''

    const result = { ok: true, push: null, email: null }

    if (wantPush) {
      try {
        const r = await pushNtfy({
          title: 'Command Center: test notification',
          body: `Sent by ${decidedBy} from Agent Approvals settings. If you see this, push notifications are working.`,
          priority: 'default',
          tags: ['test_tube'],
        })
        result.push = r?.ok ? { ok: true } : { ok: false, error: r?.error || `ntfy responded ${r?.status ?? 'unknown'}` }
      } catch (e) {
        result.push = { ok: false, error: String(e?.message || e) }
      }
    }

    if (wantEmail) {
      try {
        await sendApprovalNotificationEmail({
          to: emailTo,
          subject: 'Command Center: test notification',
          lines: [
            `This is a test notification from Agent Approvals settings, sent by ${decidedBy}.`,
            'If you received this, email notifications for pending agent approvals are working.',
          ],
        })
        result.email = { ok: true }
      } catch (e) {
        result.email = { ok: false, error: String(e?.message || e) }
      }
    }

    if ((wantPush && !result.push?.ok) || (wantEmail && !result.email?.ok)) result.ok = false
    if (!wantPush && !wantEmail) return json({ ok: false, error: 'no channel enabled to test' }, 400)

    return json(result)
  }

  return json({ ok: false, error: `unknown action: ${action || '(none)'}` }, 400)
}
