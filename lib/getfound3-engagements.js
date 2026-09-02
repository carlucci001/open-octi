import { mutateData, readData } from '@/lib/dataStore'
import { logActivity } from '@/lib/entityStore'

const ENGAGEMENT_FILE = 'getfound3-engagements.json'

export const GETFOUND3_ENGAGEMENT_STATUSES = [
  'ready_for_outreach',
  'contacted',
  'demo_referred',
  'demo_scheduled',
  'remediation_opened',
  'won',
  'closed',
]

export const GETFOUND3_ENGAGEMENT_LABELS = {
  ready_for_outreach: 'Ready for outreach',
  contacted: 'Client contacted',
  demo_referred: 'Demo referred',
  demo_scheduled: 'Demo scheduled',
  remediation_opened: 'Remediation opened',
  won: 'Remediation won',
  closed: 'Closed',
}

function text(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function normalizeScores(scores) {
  return Object.fromEntries(
    ['seo', 'aeo', 'geo'].map(key => [key, Number.isFinite(Number(scores?.[key]))
      ? Math.max(0, Math.min(100, Math.round(Number(scores[key]))))
      : null]),
  )
}

export function isGetFound3Document(document) {
  return ['getfound3-api', 'url-report-engine'].includes(document?.meta?.generator)
    && Array.isArray(document?.meta?.types)
    && ['seo', 'aeo', 'geo'].every(type => document.meta.types.includes(type))
}

function scoreCallout(scores) {
  const measured = Object.entries(scores).filter(([, value]) => value !== null)
  if (!measured.length) return 'The report identified measurable search and AI visibility work to review.'
  const [discipline, score] = measured.sort((a, b) => a[1] - b[1])[0]
  return `${discipline.toUpperCase()} is the clearest opening at ${score}/100.`
}

export function buildGetFound3EngagementBrief(document, summary = '') {
  const scores = normalizeScores(document?.meta?.scores)
  const actionPlan = Array.isArray(document?.meta?.actionPlan)
    ? document.meta.actionPlan.slice(0, 6).map(item => ({
        priority: text(item?.priority, 30) || 'medium',
        discipline: text(item?.discipline, 12).toUpperCase(),
        title: text(item?.title, 180),
        why: text(item?.why, 600),
        impact: text(item?.impact, 600),
        effort: text(item?.effort, 60),
      })).filter(item => item.title)
    : []
  const url = text(document?.meta?.url, 500)
  const accountName = text(document?.clientName, 160) || 'the client'
  const executiveSummary = text(
    summary || document?.meta?.engagementSummary,
    1200,
  ) || `A complete SEO, AEO, and GEO report is ready for ${accountName}. ${scoreCallout(scores)}`

  return {
    executiveSummary,
    scoreCallout: scoreCallout(scores),
    opening: `I reviewed the new GetFound3 report for ${accountName}. It measured how the site is understood by search engines, answer engines, and generative AI. I would like to walk you through the highest-impact opportunities and show you what we can correct.`,
    discoveryQuestions: [
      'Which service or location matters most for new business right now?',
      'Who currently makes changes to the website?',
      'Would you like us to prioritize quick wins or manage the full remediation?',
    ],
    handoff: 'Offer a focused demonstration with Farrington Development. Use the measured scores and action items to scope remediation; do not promise rankings or AI citations.',
    actionPlan,
    scores,
    url,
  }
}

function normalizeStore(stored) {
  return {
    version: 1,
    engagements: Array.isArray(stored?.engagements) ? stored.engagements : [],
  }
}

export function getGetFound3Engagements() {
  return normalizeStore(readData(ENGAGEMENT_FILE)).engagements
}

export function registerGetFound3Completion({
  documentId,
  tenantId = '',
  accountId = '',
  summary = '',
  assignedTo = 'Cheryl',
}) {
  const documents = (readData('documents.json') || {}).documents || []
  const document = documents.find(item => item.id === documentId)
  if (!document || !isGetFound3Document(document)) {
    throw new Error('Completed GetFound3 report document was not found')
  }
  const now = new Date().toISOString()
  const brief = buildGetFound3EngagementBrief(document, summary)
  const engagement = mutateData(ENGAGEMENT_FILE, stored => {
    const next = normalizeStore(stored)
    const existingIndex = next.engagements.findIndex(item => item.reportId === document.id)
    const existing = existingIndex >= 0 ? next.engagements[existingIndex] : null
    const value = {
      id: existing?.id || `gf3_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      reportId: document.id,
      tenantId: text(tenantId || existing?.tenantId, 160),
      accountId: text(accountId || document.linkedTo?.accountId || document.clientId, 160),
      status: existing?.status || 'ready_for_outreach',
      assignedTo: text(existing?.assignedTo || assignedTo, 100) || 'Cheryl',
      opportunityId: existing?.opportunityId || null,
      lastNote: existing?.lastNote || '',
      lastContactedAt: existing?.lastContactedAt || null,
      demoReferredAt: existing?.demoReferredAt || null,
      demoScheduledAt: existing?.demoScheduledAt || null,
      convertedAt: existing?.convertedAt || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      brief,
    }
    if (existingIndex >= 0) next.engagements[existingIndex] = value
    else next.engagements.unshift(value)
    return { data: next, result: value }
  })

  logActivity({
    type: 'getfound3_report_ready',
    subject: `GetFound3 report ready: ${document.title}`,
    body: `${brief.scoreCallout} Assigned to ${engagement.assignedTo} for client follow-up and remediation qualification.`,
    linkedTo: { accountId: engagement.accountId, documentId: document.id },
    tenantId: engagement.tenantId || undefined,
    meta: {
      reportId: document.id,
      getFound3Status: engagement.status,
      scores: brief.scores,
    },
  })
  return engagement
}

export function updateGetFound3Engagement(reportId, patch = {}) {
  const normalizedReportId = text(reportId, 160)
  if (!normalizedReportId) throw new Error('reportId is required')
  const status = patch.status ? text(patch.status, 40) : ''
  if (status && !GETFOUND3_ENGAGEMENT_STATUSES.includes(status)) {
    throw new Error('Invalid engagement status')
  }
  const now = new Date().toISOString()
  return mutateData(ENGAGEMENT_FILE, stored => {
    const next = normalizeStore(stored)
    const index = next.engagements.findIndex(item => item.reportId === normalizedReportId)
    if (index < 0) throw new Error('GetFound3 engagement was not found')
    const current = next.engagements[index]
    const updated = {
      ...current,
      status: status || current.status,
      assignedTo: patch.assignedTo === undefined ? current.assignedTo : text(patch.assignedTo, 100),
      lastNote: patch.lastNote === undefined ? current.lastNote : text(patch.lastNote, 1200),
      opportunityId: patch.opportunityId === undefined ? current.opportunityId : text(patch.opportunityId, 160) || null,
      updatedAt: now,
    }
    if (status === 'contacted' && !updated.lastContactedAt) updated.lastContactedAt = now
    if (status === 'demo_referred' && !updated.demoReferredAt) updated.demoReferredAt = now
    if (status === 'demo_scheduled' && !updated.demoScheduledAt) updated.demoScheduledAt = now
    if (status === 'won' && !updated.convertedAt) updated.convertedAt = now
    next.engagements[index] = updated
    return { data: next, result: updated }
  })
}
