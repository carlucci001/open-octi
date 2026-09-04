import { randomUUID } from 'node:crypto'
import { mutateData, readData } from '../dataStore'
import { create, genId, loadAll } from '../entityStore'
import { sendOutboundEmail } from '../outbound-email'

export const PRESS_CADENCE_FREQUENCIES = Object.freeze({ weekly: 7, '2w': 14, monthly: 30 })
const NUDGE_FILE = 'press-cadence-nudges.json'

function clean(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function profileValue(profile, key) {
  const value = profile?.fields?.[key]?.value
  return clean(Array.isArray(value) ? value.join(', ') : value)
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * 86400000).toISOString()
}

function seasonFor(date) {
  const month = new Date(date).getUTCMonth() + 1
  if ([12, 1, 2].includes(month)) return 'winter'
  if ([3, 4, 5].includes(month)) return 'spring'
  if ([6, 7, 8].includes(month)) return 'summer'
  return 'fall'
}

function accountProfile(accountId, tenantId) {
  return ((readData('client-growth-profiles.json') || {}).profiles || []).find(profile => profile.accountId === accountId && (!tenantId || profile.tenantId === tenantId)) || null
}

export function buildCadenceAngles({ profile, pastReleases = [], now = new Date() } = {}) {
  const business = profileValue(profile, 'businessName') || 'Your business'
  const offerings = profileValue(profile, 'offerings') || profileValue(profile, 'keyProducts') || 'your current services'
  const audience = profileValue(profile, 'idealCustomers') || 'the customers in your service area'
  const location = profileValue(profile, 'locations') || profileValue(profile, 'serviceArea') || 'your community'
  const season = seasonFor(now)
  const recentTitles = pastReleases.slice(0, 6).map(item => clean(item.title).toLowerCase())
  const candidates = [
    { kind: 'seasonal-tips', title: `${titleCase(season)} guidance from ${business}`, rationale: `Offer practical ${season} advice tied to ${offerings} for ${audience}.`, sourceFields: ['offerings', 'idealCustomers'] },
    { kind: 'community', title: `${business} and a current need in ${location}`, rationale: `Connect one confirmed service, community job or milestone to readers in ${location}.`, sourceFields: ['locations', 'offerings'] },
    { kind: 'service-data', title: `What ${business} is learning from ${audience}`, rationale: `Share one client-approved data point, milestone, award, hire or service update without inventing a claim.`, sourceFields: ['idealCustomers', 'differentiators'] },
    { kind: 'evergreen', title: `A practical guide to ${offerings}`, rationale: `Explain a durable question clients ask and give sourced, useful steps.`, sourceFields: ['offerings', 'customerNeeds'] },
  ]
  const fresh = candidates.filter(candidate => !recentTitles.some(title => title.includes(candidate.kind) || title.includes(candidate.title.toLowerCase())))
  return [...fresh, ...candidates.filter(candidate => !fresh.includes(candidate))].slice(0, 3).map((item, index) => ({ id: `angle-${index + 1}`, ...item }))
}

function titleCase(value) {
  return clean(value).replace(/\b\w/g, character => character.toUpperCase())
}

export function setPressCadence({ accountId, tenantId, frequency, nextDate, paused = false, source = 'portal' }) {
  if (!PRESS_CADENCE_FREQUENCIES[frequency]) throw new Error('Press cadence must be weekly, every 2 weeks, or monthly')
  return mutateData('accounts.json', current => {
    const data = current && typeof current === 'object' ? current : { accounts: [] }
    const account = (data.accounts || []).find(item => item.id === accountId && (!tenantId || !item.tenantId || item.tenantId === tenantId))
    if (!account) throw new Error('Account not found')
    const now = new Date().toISOString()
    account.pressSchedule = {
      frequency,
      nextDate: new Date(nextDate || addDays(now, PRESS_CADENCE_FREQUENCIES[frequency])).toISOString(),
      paused: Boolean(paused), source, updatedAt: now,
    }
    account.updatedAt = now
    return { data, result: account.pressSchedule }
  })
}

export function pausePressCadence({ accountId, tenantId, paused = true }) {
  return mutateData('accounts.json', current => {
    const data = current && typeof current === 'object' ? current : { accounts: [] }
    const account = (data.accounts || []).find(item => item.id === accountId && (!tenantId || !item.tenantId || item.tenantId === tenantId))
    if (!account?.pressSchedule) throw new Error('Press cadence is not configured')
    account.pressSchedule.paused = Boolean(paused)
    account.pressSchedule.updatedAt = new Date().toISOString()
    return { data, result: account.pressSchedule }
  })
}

function saveNudge(nudge) {
  return mutateData(NUDGE_FILE, current => {
    const data = current && typeof current === 'object' ? current : { nudges: [] }
    data.nudges = Array.isArray(data.nudges) ? data.nudges : []
    data.nudges.unshift(nudge)
    return { data, result: nudge }
  })
}

export function listCadenceNudges({ accountId, tenantId }) {
  return ((readData(NUDGE_FILE) || {}).nudges || []).filter(item => item.accountId === accountId && (!tenantId || item.tenantId === tenantId))
}

export async function runPressCadenceCycle(automation, options = {}) {
  const accountId = clean(options.accountId || automation?.tenantId || automation?.clientAccountId, 160)
  const accounts = (readData('accounts.json') || {}).accounts || []
  const account = accounts.find(item => item.id === accountId)
  if (!account) throw new Error('Cadence account not found')
  const schedule = account.pressSchedule
  const now = new Date(options.now || Date.now())
  if (!schedule || schedule.paused) return { status: 'paused', accountId }
  if (!options.force && new Date(schedule.nextDate).getTime() > now.getTime()) return { status: 'not-due', nextDate: schedule.nextDate, accountId }
  const profile = accountProfile(account.id, account.tenantId)
  const pastReleases = ((readData('documents.json') || {}).documents || []).filter(document => document.clientId === account.id && document.templateId === 'press-release')
  const angles = buildCadenceAngles({ profile, pastReleases, now })
  const nudge = saveNudge({
    id: genId('pnudge'), tenantId: account.tenantId || automation?.tenantLeaseId || '', accountId: account.id,
    frequency: schedule.frequency, angles, status: 'awaiting-pick', oneTapToken: randomUUID(),
    message: 'Pick one or tell me what’s new.', createdAt: now.toISOString(), fallbackAt: addDays(now, 3),
  })
  create('activities', { type: 'press-cadence-nudge', title: 'Three press release angles are ready', description: nudge.message, at: now.toISOString(), linkedTo: { accountId: account.id, pressNudgeId: nudge.id } })
  let email = { status: 'not-sent', reason: 'PRESS_TEST_INBOX is not configured' }
  const inbox = clean(process.env.PRESS_TEST_INBOX, 254)
  if (inbox) {
    try {
      const body = `${nudge.message}\n\n${angles.map((angle, index) => `${index + 1}. ${angle.title} — ${angle.rationale}`).join('\n')}\n\nOpen your portal to choose.`
      const sent = await sendOutboundEmail({ to: inbox, subject: 'TEST: Choose your next press release angle', text: body }, options.emailOptions)
      email = { status: 'sent', id: sent?.id || null, to: inbox }
    } catch (error) { email = { status: 'blocked', reason: clean(error?.message, 240), to: inbox } }
  }
  setPressCadence({ accountId: account.id, tenantId: account.tenantId, frequency: schedule.frequency, nextDate: addDays(now, PRESS_CADENCE_FREQUENCIES[schedule.frequency]), paused: false, source: schedule.source })
  return { status: 'nudge-created', nudge, email }
}

function createCadenceDraft(nudge, angle, status, now) {
  const profile = accountProfile(nudge.accountId, nudge.tenantId)
  const business = profileValue(profile, 'businessName') || 'Client'
  const timestamp = new Date(now || Date.now()).toISOString()
  const document = mutateData('documents.json', current => {
    const data = current && typeof current === 'object' ? current : { documents: [] }
    data.documents = Array.isArray(data.documents) ? data.documents : []
    const row = {
      id: genId('doc'), templateId: 'press-release-cadence-outline', templateName: 'Press release cadence draft',
      title: `${business}: ${angle.title}`, clientId: nudge.accountId, clientName: business,
      linkedTo: { accountId: nudge.accountId, pressNudgeId: nudge.id }, portalVisible: true,
      status: 'needs-client-approval', requiresSignature: false, signature: null,
      body: `# ${angle.title}\n\nDraft angle: ${angle.rationale}\n\nSource fields: ${angle.sourceFields.join(', ')}\n\nBefore release drafting, confirm the news, one proof point, an approved named quote, date/place and media contact. Nothing sends without approval.\n`,
      values: { angle, cadenceStatus: status }, createdAt: timestamp, updatedAt: timestamp,
    }
    data.documents.push(row)
    return { data, result: row }
  })
  create('activities', { type: 'press-cadence-draft', title: `Cadence draft prepared: ${angle.title}`, description: 'Awaiting client facts and approval; nothing was sent.', at: timestamp, linkedTo: { accountId: nudge.accountId, documentId: document.id, pressNudgeId: nudge.id } })
  return document
}

export function pickCadenceAngle({ accountId, tenantId, nudgeId, angleId, now = new Date() }) {
  return mutateData(NUDGE_FILE, current => {
    const data = current && typeof current === 'object' ? current : { nudges: [] }
    const nudge = (data.nudges || []).find(item => item.id === nudgeId && item.accountId === accountId && (!tenantId || item.tenantId === tenantId))
    if (!nudge) throw new Error('Press cadence nudge not found')
    const angle = nudge.angles.find(item => item.id === angleId)
    if (!angle) throw new Error('Press cadence angle not found')
    const document = createCadenceDraft(nudge, angle, 'selected-draft-ready', now)
    nudge.status = 'selected-draft-ready'; nudge.selectedAngleId = angle.id; nudge.documentId = document.id; nudge.respondedAt = new Date(now).toISOString()
    return { data, result: { nudge, document } }
  })
}

export function runEvergreenFallback({ accountId, tenantId, nudgeId, now = new Date() }) {
  return mutateData(NUDGE_FILE, current => {
    const data = current && typeof current === 'object' ? current : { nudges: [] }
    const nudge = (data.nudges || []).find(item => item.id === nudgeId && item.accountId === accountId && (!tenantId || item.tenantId === tenantId))
    if (!nudge) throw new Error('Press cadence nudge not found')
    if (nudge.status !== 'awaiting-pick') return { data, result: { status: 'already-handled', nudge } }
    if (new Date(nudge.fallbackAt).getTime() > new Date(now).getTime()) return { data, result: { status: 'not-due', nudge } }
    const angle = nudge.angles.find(item => item.kind === 'seasonal-tips') || nudge.angles[0]
    const document = createCadenceDraft(nudge, angle, 'evergreen-draft-ready', now)
    nudge.status = 'evergreen-draft-ready'; nudge.selectedAngleId = angle.id; nudge.documentId = document.id; nudge.fallbackTriggeredAt = new Date(now).toISOString()
    return { data, result: { status: 'evergreen-draft-ready', nudge, document, sent: false } }
  })
}

export function rotateCadenceContacts(contacts = [], campaigns = [], { accountId, now = new Date() } = {}) {
  const cutoff = new Date(now).getTime() - 30 * 86400000
  const used = new Set(campaigns.filter(campaign => campaign.clientAccountId === accountId).flatMap(campaign => (campaign.sends || []).filter(send => new Date(send.sentAt || campaign.updatedAt || 0).getTime() >= cutoff).map(send => send.contactId)))
  return contacts.filter(contact => !used.has(contact.id))
}

export function pressMonthlyStatement(accountId, now = new Date()) {
  const month = new Date(now).toISOString().slice(0, 7)
  const account = ((readData('accounts.json') || {}).accounts || []).find(item => item.id === accountId)
  const releases = loadAll('pressCampaigns').filter(campaign => campaign.clientAccountId === accountId && String(campaign.updatedAt || campaign.createdAt || '').startsWith(month) && /complete|sent/i.test(campaign.status))
  const cadence = account?.pressSchedule?.frequency || null
  const planned = cadence === 'weekly' ? 4 : cadence === '2w' ? 2 : cadence === 'monthly' ? 1 : 0
  return { month, cadence, produced: releases.length, planned, releases: releases.map(item => ({ id: item.id, status: item.status, at: item.updatedAt || item.createdAt })) }
}
