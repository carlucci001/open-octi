import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { readData } from '@/lib/dataStore'
import { create, findById, loadAll, logActivity } from '@/lib/entityStore'
import {
  buildGetFound3EngagementBrief,
  getGetFound3Engagements,
  isGetFound3Document,
  registerGetFound3Completion,
  updateGetFound3Engagement,
} from '@/lib/getfound3-engagements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function allReportDocuments() {
  return ((readData('documents.json') || {}).documents || [])
    .filter(isGetFound3Document)
    .sort((first, second) => String(second.createdAt || '').localeCompare(String(first.createdAt || '')))
}

function reportRecord(document, context) {
  const engagement = context.engagements.get(document.id)
  const accountId = document.linkedTo?.accountId || document.clientId || ''
  const account = context.accounts.get(accountId)
  const brief = engagement?.brief || buildGetFound3EngagementBrief(document)
  const opportunity = engagement?.opportunityId
    ? context.opportunities.get(engagement.opportunityId) || null
    : null
  return {
    reportId: document.id,
    title: document.title,
    createdAt: document.createdAt,
    accountId,
    accountName: account?.name || document.clientName || '(unknown account)',
    accountType: account?.type || null,
    url: document.meta?.url || '',
    reportUrl: document.meta?.getFound3ReportUrl || '',
    scores: brief.scores,
    actionPlan: brief.actionPlan,
    brief,
    status: engagement?.status || 'ready_for_outreach',
    assignedTo: engagement?.assignedTo || 'Cheryl',
    lastNote: engagement?.lastNote || '',
    opportunity,
    engagementCreated: Boolean(engagement),
  }
}

function buildPayload() {
  const engagements = new Map(getGetFound3Engagements().map(item => [item.reportId, item]))
  const accounts = new Map(loadAll('accounts').map(item => [item.id, item]))
  const opportunities = new Map(loadAll('opportunities').map(item => [item.id, item]))
  const reports = allReportDocuments().map(document => reportRecord(document, { engagements, accounts, opportunities }))
  return {
    reports,
    metrics: {
      totalReports: reports.length,
      readyForOutreach: reports.filter(item => item.status === 'ready_for_outreach').length,
      demoReferrals: reports.filter(item => ['demo_referred', 'demo_scheduled'].includes(item.status)).length,
      remediations: reports.filter(item => item.opportunity).length,
      wins: reports.filter(item => item.status === 'won').length,
    },
  }
}

function findReport(reportId) {
  return allReportDocuments().find(document => document.id === reportId) || null
}

function ensureEngagement(document) {
  return getGetFound3Engagements().find(item => item.reportId === document.id)
    || registerGetFound3Completion({
      documentId: document.id,
      accountId: document.linkedTo?.accountId || document.clientId || '',
      summary: document.meta?.engagementSummary || '',
    })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return json({ ok: true, ...buildPayload() })
}

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  const reportId = String(body.reportId || '').trim()
  const document = findReport(reportId)
  if (!document) return json({ ok: false, error: 'GetFound3 report not found' }, 404)
  const engagement = ensureEngagement(document)

  if (action === 'update_engagement') {
    let updated
    try {
      updated = updateGetFound3Engagement(reportId, {
        status: body.status,
        assignedTo: body.assignedTo,
        lastNote: body.lastNote,
      })
    } catch (updateError) {
      return json({ ok: false, error: updateError.message }, 400)
    }
    logActivity({
      type: 'getfound3_engagement',
      subject: `GetFound3 follow-up: ${document.title}`,
      body: `${updated.status.replaceAll('_', ' ')}${updated.lastNote ? ` — ${updated.lastNote}` : ''}`,
      linkedTo: {
        accountId: updated.accountId,
        documentId: reportId,
        opportunityId: updated.opportunityId || null,
      },
      tenantId: updated.tenantId || undefined,
      meta: {
        reportId,
        getFound3Status: updated.status,
        updatedBy: user?.id || user?.email || '',
      },
    })
    return json({ ok: true, engagement: updated, ...buildPayload() })
  }

  if (action === 'create_remediation_opportunity') {
    if (engagement.opportunityId) {
      const existing = findById('opportunities', engagement.opportunityId)
      if (existing) return json({ ok: true, opportunity: existing, idempotent: true, ...buildPayload() })
    }

    const pipelines = loadAll('pipelines')
    const pipeline = pipelines.find(item => item.id === 'farrington_dev')
      || pipelines.find(item => /farrington development/i.test(item.name || ''))
      || pipelines[0]
      || null
    const stage = pipeline?.stages?.find(item => item.id === 'discovery')
      || pipeline?.stages?.find(item => !item.terminal)
      || pipeline?.stages?.[0]
      || null
    const accountId = document.linkedTo?.accountId || document.clientId
    const account = findById('accounts', accountId)
    if (!account) return json({ ok: false, error: 'The report account no longer exists' }, 409)

    const opportunity = create('opportunities', {
      name: `Website visibility remediation — ${account.name}`,
      accountId,
      contactId: null,
      pipelineId: pipeline?.id || null,
      stageId: stage?.id || null,
      value: Math.max(0, Number(body.estimatedValue || 0)),
      probability: Number(stage?.probability || 0),
      expectedClose: null,
      notes: `Created from GetFound3 report ${document.id}. ${engagement.brief?.scoreCallout || ''}`.trim(),
      tags: ['getfound3', 'website-remediation'],
      source: 'getfound3_report',
      sourceReportId: document.id,
    })
    const updated = updateGetFound3Engagement(reportId, {
      status: 'remediation_opened',
      opportunityId: opportunity.id,
      lastNote: body.lastNote || engagement.lastNote,
    })
    logActivity({
      type: 'getfound3_conversion',
      subject: `Remediation opportunity opened: ${account.name}`,
      body: `Created from ${document.title}. Continue qualification in Pipelines.`,
      linkedTo: { accountId, documentId: reportId, opportunityId: opportunity.id },
      tenantId: engagement.tenantId || undefined,
      meta: {
        reportId,
        opportunityId: opportunity.id,
        updatedBy: user?.id || user?.email || '',
      },
    })
    return json({ ok: true, opportunity, engagement: updated, ...buildPayload() })
  }

  return json({ ok: false, error: 'Unknown action' }, 400)
}
