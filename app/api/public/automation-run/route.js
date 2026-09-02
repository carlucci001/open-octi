import { NextResponse } from 'next/server'
import { createAutomation, getAutomation, runAutomation } from '@/lib/automations-store'
import { authorized, configuredSecret } from '@/lib/automation-bridge-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROOF_AUTOMATION_ID = 'auto_marge_wnc_plumber_lead_sweep'
const DEFAULT_RECIPIENT = 'redacted@example.invalid'

function recipientFrom(body = {}, automation = {}) {
  const requested = String(body.recipientEmail || '').trim()
  if (requested && requested.includes('@') && !/example\.com$/i.test(requested)) return requested
  const configured = configuredSecret(process.env.AUTOMATION_DEMO_RECIPIENT_EMAIL)
    || configuredSecret(process.env.DEFAULT_OPERATOR_EMAIL)
  if (configured && configured.includes('@')) return configured
  const saved = String(automation.delivery?.recipients?.[0] || '').trim()
  if (saved && saved.includes('@') && !/example\.com$/i.test(saved)) return saved
  return DEFAULT_RECIPIENT
}

function ensureProofAutomation() {
  const existing = getAutomation(PROOF_AUTOMATION_ID)
  if (existing) return existing

  return createAutomation({
    id: PROOF_AUTOMATION_ID,
    templateId: 'lead-sweep-v1',
    runnerId: 'lead-sweep-v1',
    name: 'Marge WNC plumber lead sweep',
    description: 'Public beta proof run for a Western North Carolina plumbing lead sweep.',
    scope: 'client',
    tenantId: 'tenant-demo-blue-ridge-plumbing',
    clientName: 'Blue Ridge Plumbing',
    serviceType: 'lead-sweep',
    cadence: 'manual proof run',
    dataSource: {
      provider: 'apify',
      query: 'Western North Carolina property manager HOA commercial building emergency plumbing maintenance',
      limit: 10,
    },
    output: { format: 'crm-leads', destination: 'crm-and-email' },
    approval: { required: true, approver: 'Carl' },
    delivery: { method: 'email', channels: ['email', 'crm'], recipients: [DEFAULT_RECIPIENT] },
    campaign: { subject: 'Western NC plumber lead sweep', senderProfile: 'Farrington Development', cadence: 'manual' },
    trigger: { type: 'manual', config: { publicProof: true } },
    steps: [
      { id: 'search', label: 'Search buying signals with Apify' },
      { id: 'import', label: 'Import unique source records into CRM leads' },
      { id: 'email', label: 'Email proof summary through Resend' },
    ],
    enabled: true,
    status: 'active',
  })
}

function publicRunFromAutomation(automation) {
  const latest = Array.isArray(automation?.runHistory) ? automation.runHistory[0] : null
  const metrics = latest?.metrics || {}
  return {
    id: latest?.id || `run-${Date.now().toString(36)}`,
    workspaceId: 'demo-blue-ridge-plumbing-mpu75b8v',
    automationId: automation?.id || PROOF_AUTOMATION_ID,
    automationName: automation?.name || 'Marge WNC plumber lead sweep',
    requestedAt: latest?.startedAt || automation?.lastRunAt || new Date().toISOString(),
    finishedAt: latest?.finishedAt || null,
    status: latest?.status || 'queued',
    note: latest?.note || 'Automation run was requested.',
    returned: metrics.returned ?? null,
    created: metrics.createdLeads ?? null,
    emailedTo: metrics.emailedTo || null,
    emailId: metrics.emailId || null,
    leads: Array.isArray(latest?.leads)
      ? latest.leads.map((lead) => ({
          id: lead.id || '',
          title: lead.businessName || lead.title || lead.website || 'Lead',
          url: lead.website || lead.url || '',
        }))
      : [],
  }
}

export async function GET(request) {
  const auth = authorized(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const automation = getAutomation(PROOF_AUTOMATION_ID)
  const runs = Array.isArray(automation?.runHistory)
    ? automation.runHistory.slice(0, 10).map((run) => publicRunFromAutomation({ ...automation, runHistory: [run] }))
    : []
  return NextResponse.json({ ok: true, runs })
}

export async function POST(request) {
  const auth = authorized(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  try {
    const body = await request.json().catch(() => ({}))
    const automation = ensureProofAutomation()
    const result = await runAutomation(automation.id, {
      recipientEmail: recipientFrom(body, automation),
    })
    const run = publicRunFromAutomation(result)
    const ok = run.status === 'completed'
    return NextResponse.json({ ok, run, automationId: result.id }, { status: ok ? 200 : 424 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'automation run failed',
    }, { status: 500 })
  }
}
