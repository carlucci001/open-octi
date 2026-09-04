import { mutateData } from '../dataStore'
import { create, findById, genId, loadAll } from '../entityStore'
import { queryPressContacts } from './query'
import { sendPressCampaign } from './send-gate'
import { sendOutboundEmail } from '../outbound-email'
import { fallbackPressRelease, generatePressReleaseDraft } from './release-model'
import { scorePressRelease } from './release-quality'

export { scorePressRelease } from './release-quality'

const WORKFLOW_FILE = 'press-release-workflows.json'
const MAX_CONTACTS = 20

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function field(profile, key) {
  const value = profile?.fields?.[key]?.value
  return text(Array.isArray(value) ? value.join(', ') : value)
}

function scoped(workflow, scope) {
  return workflow?.tenantId === scope?.tenantId && workflow?.accountId === scope?.accountId
}

export function profileFacts(profile = {}) {
  return {
    businessName: field(profile, 'businessName'),
    businessSummary: field(profile, 'businessSummary'),
    industry: field(profile, 'industry'),
    location: field(profile, 'locations') || field(profile, 'serviceArea'),
    offerings: field(profile, 'offerings') || field(profile, 'keyProducts'),
    audience: field(profile, 'idealCustomers'),
    territory: field(profile, 'territory'),
    differentiators: field(profile, 'differentiators'),
    brandVoice: field(profile, 'brandVoice'),
    contactName: field(profile, 'primaryContactName'),
    contactRole: field(profile, 'primaryContactRole'),
    contactEmail: field(profile, 'primaryEmail'),
    contactPhone: field(profile, 'phone'),
  }
}

export function buildReleaseInterview(profile = {}) {
  const facts = profileFacts(profile)
  const questions = [
    {
      key: 'announcement',
      prompt: 'What is the concrete announcement? Include the date, place and why it is timely.',
      fields: ['announcement', 'date', 'location'],
    },
    {
      key: 'impact',
      prompt: 'Who will this affect, how will it help them, and what client-approved fact supports it?',
      fields: ['audienceImpact', 'proofPoint', 'proofSource', 'background'],
    },
    {
      key: 'quote',
      prompt: 'What exact quote is approved, and what are the speaker’s name and title?',
      fields: ['quote', 'quoteName', 'quoteTitle'],
    },
  ]
  if (!(facts.contactName && facts.contactEmail)) {
    questions.push({
      key: 'contact',
      prompt: 'Who is the media contact, what is their role, and which email or phone may appear?',
      fields: ['contactName', 'contactRole', 'contactEmail', 'contactPhone'],
    })
  }
  return { facts, questions: questions.slice(0, 4) }
}

function normalizeBrief(workflow) {
  const answers = workflow.answers || {}
  const facts = workflow.profileFacts || {}
  const announcement = answers.announcement || {}
  const impact = answers.impact || {}
  const quote = answers.quote || {}
  const contact = answers.contact || {}
  return {
    businessName: text(facts.businessName || workflow.accountName || 'The organization', 140),
    businessSummary: text(facts.businessSummary, 1000),
    offerings: text(facts.offerings, 1000),
    differentiators: text(facts.differentiators, 1000),
    announcement: text(announcement.announcement, 1200),
    date: text(announcement.date, 80),
    location: text(announcement.location || facts.location || facts.territory || 'City, ST, N.C.', 160),
    audienceImpact: text(impact.audienceImpact || facts.audience, 1200),
    proofPoint: text(impact.proofPoint, 800),
    proofSource: text(impact.proofSource || 'Client interview', 300),
    background: text(impact.background, 2400),
    quote: text(quote.quote, 1000),
    quoteName: text(quote.quoteName || facts.contactName, 140),
    quoteTitle: text(quote.quoteTitle || facts.contactRole, 140),
    contactName: text(contact.contactName || facts.contactName || quote.quoteName, 140),
    contactRole: text(contact.contactRole || facts.contactRole || quote.quoteTitle, 140),
    contactEmail: text(contact.contactEmail || facts.contactEmail, 254),
    contactPhone: text(contact.contactPhone || facts.contactPhone, 80),
    beats: Array.isArray(impact.beats) ? impact.beats.map(item => text(item, 80)).filter(Boolean) : ['business'],
    geo: impact.geo || { scope: facts.territory ? 'state' : 'national', state: '', metro: '' },
  }
}

export function draftPressRelease(brief = {}) {
  return fallbackPressRelease(brief)
}

function saveDocument({ workflow, draft }) {
  const now = new Date().toISOString()
  return mutateData('documents.json', current => {
    const data = current && typeof current === 'object' ? current : { documents: [] }
    data.documents = Array.isArray(data.documents) ? data.documents : []
    const document = {
      id: genId('doc'), templateId: 'press-release', templateName: 'Press release', title: draft.title,
      clientId: workflow.accountId, clientName: workflow.accountName, projectId: '',
      linkedTo: { accountId: workflow.accountId, tenantId: workflow.tenantId, pressWorkflowId: workflow.id },
      body: draft.body, values: { rubric: draft.rubric }, requiresSignature: false, signature: null,
      portalVisible: true, status: 'draft', createdAt: now, updatedAt: now,
    }
    data.documents.push(document)
    return { data, result: document }
  })
}

export function startReleaseWorkflow({ session, account, profile }) {
  const scope = { tenantId: text(session?.tenantId, 160), accountId: text(session?.accountId, 160) }
  if (!scope.tenantId || !scope.accountId) throw new Error('Tenant and account scope are required')
  const interview = buildReleaseInterview(profile)
  const now = new Date().toISOString()
  const workflow = {
    id: genId('prw'), ...scope, accountName: text(account?.name || interview.facts.businessName, 140),
    agentId: 'press-release-agent', status: 'interview', profileFacts: interview.facts,
    questions: interview.questions, questionIndex: 0, answers: {}, createdAt: now, updatedAt: now,
  }
  return mutateData(WORKFLOW_FILE, current => {
    const data = current && typeof current === 'object' ? current : { workflows: [] }
    data.workflows = Array.isArray(data.workflows) ? data.workflows : []
    data.workflows.unshift(workflow)
    return { data, result: workflow }
  })
}

export function getReleaseWorkflow(id, scope) {
  const rows = (mutateData(WORKFLOW_FILE, current => ({ data: current || { workflows: [] }, result: current?.workflows || [] })) || [])
  return rows.find(item => item.id === id && scoped(item, scope)) || null
}

export function answerReleaseQuestion(id, scope, answer = {}) {
  return mutateData(WORKFLOW_FILE, current => {
    const data = current && typeof current === 'object' ? current : { workflows: [] }
    const workflow = (data.workflows || []).find(item => item.id === id && scoped(item, scope))
    if (!workflow) throw new Error('Press release interview not found')
    const question = workflow.questions?.[workflow.questionIndex]
    if (!question) throw new Error('The interview is already complete')
    const cleaned = Object.fromEntries(question.fields.map(key => [key, Array.isArray(answer[key]) ? answer[key] : text(answer[key], 2000)]))
    if (!Object.values(cleaned).some(Boolean)) throw new Error('Please answer the current question')
    workflow.answers = { ...(workflow.answers || {}), [question.key]: cleaned }
    workflow.questionIndex += 1
    workflow.status = workflow.questionIndex >= workflow.questions.length ? 'ready_to_draft' : 'interview'
    workflow.updatedAt = new Date().toISOString()
    return { data, result: workflow }
  })
}

export async function createReleaseDraft(id, scope) {
  const currentWorkflow = getReleaseWorkflow(id, scope)
  if (!currentWorkflow || currentWorkflow.status !== 'ready_to_draft') throw new Error('Complete the interview before drafting')
  const brief = normalizeBrief(currentWorkflow)
  const draft = await generatePressReleaseDraft(brief)
  const rubric = draft.rubric || scorePressRelease(draft, brief)
  if (!draft.fallback && !rubric.pass) throw new Error(`Draft did not pass the release rubric (${rubric.score}/5 plus readability gates)`)
  draft.rubric = rubric
  const document = saveDocument({ workflow: currentWorkflow, draft })
  return mutateData(WORKFLOW_FILE, current => {
    const data = current && typeof current === 'object' ? current : { workflows: [] }
    const workflow = (data.workflows || []).find(item => item.id === id && scoped(item, scope))
    if (!workflow || workflow.status !== 'ready_to_draft') throw new Error('Complete the interview before drafting')
    workflow.brief = brief
    workflow.draft = draft
    workflow.documentId = document.id
    workflow.status = 'awaiting_approval'
    workflow.updatedAt = new Date().toISOString()
    return { data, result: { workflow, document } }
  })
}

export function approveRelease(id, scope) {
  return mutateData(WORKFLOW_FILE, current => {
    const data = current && typeof current === 'object' ? current : { workflows: [] }
    const workflow = (data.workflows || []).find(item => item.id === id && scoped(item, scope))
    if (!workflow || workflow.status !== 'awaiting_approval') throw new Error('A reviewable draft is required')
    if (workflow.draft?.fallback || !workflow.draft?.rubric?.pass) throw new Error('A model-generated rubric pass is required before approval')
    const result = queryPressContacts({ beats: workflow.brief.beats, geo: workflow.brief.geo, limit: MAX_CONTACTS, minScore: 0 })
    const contacts = (result.contacts || []).slice(0, MAX_CONTACTS)
    const list = create('pressLists', { ownerUserId: scope.accountId, clientAccountId: scope.accountId, name: `${workflow.draft.title} — reviewed list`, query: result.query, contactIds: contacts.map(item => item.id), builtAt: new Date().toISOString() })
    const personalization = Object.fromEntries(contacts.map(contact => [contact.id, `A concise release for your ${text(contact.beats?.[0] || 'news', 50)} coverage is ready for review. ${workflow.draft.title.slice(0, 60)}`]))
    const campaign = create('pressCampaigns', { ownerUserId: `portal:${scope.accountId}`, source: 'portal-press-release', releaseDocId: workflow.documentId, listId: list.id, clientAccountId: scope.accountId, personalization, sendWindow: null, dryRun: true, explicitApproval: true, requireCarlApproval: true, operatorHold: true, liveSendEnabled: false, status: 'approved-held', sends: [], outcome: { opens: 0, replies: 0, bounces: 0, pickups: [] } })
    workflow.listId = list.id
    workflow.campaignId = campaign.id
    workflow.status = 'approved_held'
    workflow.approvedAt = new Date().toISOString()
    workflow.updatedAt = workflow.approvedAt
    updateDocumentStatus(workflow.documentId, 'approved')
    create('activities', { type: 'press-release-approved', title: 'Press release approved and held', description: workflow.draft.title, at: workflow.approvedAt, linkedTo: { accountId: scope.accountId, pressCampaignId: campaign.id, documentId: workflow.documentId } })
    return { data, result: { workflow, list, campaign, matchCount: contacts.length } }
  })
}

function updateDocumentStatus(documentId, status) {
  return mutateData('documents.json', current => {
    const data = current && typeof current === 'object' ? current : { documents: [] }
    const document = (data.documents || []).find(item => item.id === documentId)
    if (document) { document.status = status; document.updatedAt = new Date().toISOString() }
    return { data, result: document || null }
  })
}

function receiptDocument(workflow, sendResult) {
  const now = new Date().toISOString()
  const list = findById('pressLists', workflow.listId)
  const contactMap = new Map(loadAll('pressContacts').map(contact => [contact.id, contact]))
  const outletMap = new Map(loadAll('pressOutlets').map(outlet => [outlet.id, outlet]))
  const selectedContacts = (list?.contactIds || []).map(id => contactMap.get(id)).filter(Boolean)
  const outlets = [...new Set(selectedContacts.map(contact => outletMap.get(contact.outletId)?.name || contact.outlet).filter(Boolean))]
  const beats = [...new Set(selectedContacts.flatMap(contact => contact.beats || []).filter(Boolean))]
  const month = now.slice(0, 7)
  const monthlyTally = loadAll('pressCampaigns').filter(campaign => campaign.clientAccountId === workflow.accountId && String(campaign.updatedAt || campaign.createdAt).startsWith(month) && /complete|sent/i.test(campaign.status)).length
  return mutateData('documents.json', current => {
    const data = current && typeof current === 'object' ? current : { documents: [] }
    const document = {
      id: genId('doc'), templateId: 'press-release-receipt', templateName: 'Press release receipt',
      title: `Press release receipt — ${workflow.draft.title}`, clientId: workflow.accountId,
      clientName: workflow.accountName, linkedTo: { accountId: workflow.accountId, pressCampaignId: workflow.campaignId, pressWorkflowId: workflow.id },
      body: `# Distribution receipt\n\nRelease: ${workflow.draft.title}\n\nTimestamp: ${now}\n\nMode: Dry run\n\nPrepared recipients: ${sendResult.sends?.length || 0}\n\nOutlets: ${outlets.join(', ') || 'No eligible outlets'}\n\nBeats: ${beats.join(', ') || 'No eligible beats'}\n\n7-day pickup/reply summary: Pending — follow-up is due ${new Date(Date.now() + 7 * 86400000).toISOString()}\n\nMonthly tally: ${monthlyTally} release run(s)\n\nNo journalist email was sent.\n`,
      values: { dryRun: true, preparedRecipients: sendResult.sends?.length || 0, outlets, beats, monthlyTally, followUpAt: new Date(Date.now() + 7 * 86400000).toISOString() }, requiresSignature: false, signature: null,
      portalVisible: true, status: 'completed', createdAt: now, updatedAt: now,
    }
    data.documents.push(document)
    return { data, result: document }
  })
}

export async function dryRunApprovedRelease(id, scope) {
  const workflow = getReleaseWorkflow(id, scope)
  if (!workflow || workflow.status !== 'approved_held') throw new Error('An approved held release is required')
  const sendResult = await sendPressCampaign(workflow.campaignId, { dryRun: true, approved: false })
  const receipt = receiptDocument(workflow, sendResult)
  const now = new Date().toISOString()
  create('activities', { type: 'press-release-receipt', title: 'Press release dry-run receipt filed', description: `${sendResult.sends?.length || 0} recipients prepared; no journalist email sent.`, at: now, linkedTo: { accountId: scope.accountId, pressCampaignId: workflow.campaignId, documentId: receipt.id } })
  let emailReceipt = { status: 'not-sent', reason: 'PRESS_TEST_INBOX is not configured' }
  const inbox = text(process.env.PRESS_TEST_INBOX, 254)
  if (inbox) {
    try {
      const result = await sendOutboundEmail({ to: inbox, subject: `TEST receipt: ${workflow.draft.title}`.slice(0, 160), text: receipt.body })
      emailReceipt = { status: 'sent', id: result?.id || null, to: inbox }
    } catch (error) {
      emailReceipt = { status: 'blocked', reason: text(error?.message, 240), to: inbox }
    }
  }
  mutateData(WORKFLOW_FILE, current => {
    const data = current && typeof current === 'object' ? current : { workflows: [] }
    const row = (data.workflows || []).find(item => item.id === id && scoped(item, scope))
    if (row) { row.status = 'dry_run_complete'; row.receiptDocumentId = receipt.id; row.emailReceipt = emailReceipt; row.completedAt = now; row.updatedAt = now }
    return { data, result: row || null }
  })
  return { workflow: getReleaseWorkflow(id, scope), receipt, emailReceipt, sendResult }
}

export function requestReleaseChanges(id, scope, feedback) {
  return mutateData(WORKFLOW_FILE, current => {
    const data = current && typeof current === 'object' ? current : { workflows: [] }
    const workflow = (data.workflows || []).find(item => item.id === id && scoped(item, scope))
    if (!workflow) throw new Error('Press release workflow not found')
    workflow.feedback = text(feedback, 2000)
    workflow.status = 'ready_to_draft'
    workflow.updatedAt = new Date().toISOString()
    return { data, result: workflow }
  })
}

export function listAccountReleaseWorkflows(scope) {
  return loadAllWorkflows().filter(item => scoped(item, scope)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function loadAllWorkflows() {
  return mutateData(WORKFLOW_FILE, current => ({ data: current || { workflows: [] }, result: current?.workflows || [] })) || []
}
