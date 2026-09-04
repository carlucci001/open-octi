import { randomUUID } from 'node:crypto'
import { create, findById, loadAll, update } from '../entityStore'
import { mutateData, readData } from '../dataStore'
import { hasOutboundEmailTransport, sendOutboundEmail } from '../outbound-email'

export const DEFAULT_PRESS_DOMAIN_DAILY_CAP = 5
export const WO_PR1_LIVE_SEND_CAP = 3

const EU_COUNTRY_CODES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
  'PL','PT','RO','SK','SI','ES','SE',
])

function emailValue(contact) {
  return String(contact?.email?.value || contact?.legacyEmail || '').trim().toLowerCase()
}

function emailDomain(email) {
  return String(email || '').split('@')[1]?.toLowerCase() || ''
}

export function isEuPressRecord(contact, outlet) {
  const country = String(contact?.geo?.country || outlet?.geo?.country || '').toUpperCase()
  return EU_COUNTRY_CODES.has(country) || contact?.geo?.region === 'EU' || outlet?.geo?.region === 'EU'
}

export function evaluatePressSend({
  contact,
  outlet,
  personalization,
  suppressions = [],
  sendsToday = [],
  domainCap = DEFAULT_PRESS_DOMAIN_DAILY_CAP,
}) {
  const email = emailValue(contact)
  const domain = emailDomain(email) || String(outlet?.domain || '').toLowerCase()
  const reasons = []
  if (!email) reasons.push('recipient email is missing')
  if (!String(personalization || '').trim()) reasons.push('personalization is empty')
  if (contact?.doNotPitch) reasons.push('contact marked do-not-pitch')
  if (contact?.suppressedAt) reasons.push('contact is suppressed')
  if (isEuPressRecord(contact, outlet)) reasons.push('EU press records are excluded')
  if (suppressions.some(item =>
    (item.email && String(item.email).toLowerCase() === email)
    || (item.domain && String(item.domain).toLowerCase() === domain),
  )) reasons.push('suppression list match')
  const domainSends = sendsToday.filter(send => String(send.targetDomain || '').toLowerCase() === domain).length
  if (domainSends >= Math.max(1, Number(domainCap || DEFAULT_PRESS_DOMAIN_DAILY_CAP))) {
    reasons.push('per-domain daily cap reached')
  }
  return { allowed: reasons.length === 0, reasons, email, domain, domainSends }
}

export function buildComplianceFooter(physicalAddress, unsubscribeUrl) {
  const address = String(physicalAddress || '').trim()
  const url = String(unsubscribeUrl || '').trim()
  if (!address) throw new Error('PRESS_PHYSICAL_ADDRESS is required for a live press send')
  const secure = /^https:\/\//.test(url)
  const localReview = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(url)
  if (!secure && !localReview) throw new Error('A secure unsubscribe URL is required')
  return [
    '<hr style="margin:24px 0;border:0;border-top:1px solid #d1d5db">',
    '<p style="font-size:12px;line-height:1.5;color:#6b7280">',
    'This editorial pitch was sent by Farrington Development. ',
    address.replace(/[<>&"]/g, ''),
    '. <a href="' + url.replace(/"/g, '%22') + '">Unsubscribe from future pitches</a>.',
    '</p>',
  ].join('')
}

export function createPressUnsubscribeToken(email, contactId = '') {
  const token = randomUUID()
  const now = new Date().toISOString()
  mutateData('press-unsubscribe-tokens.json', current => {
    const tokens = (current?.tokens || []).filter(item => !item.usedAt)
    return {
      data: { tokens: [...tokens, { token, email: String(email).toLowerCase(), contactId, createdAt: now }] },
      result: true,
    }
  })
  return token
}

export function consumePressUnsubscribeToken(token) {
  return mutateData('press-unsubscribe-tokens.json', current => {
    const tokens = current?.tokens || []
    const index = tokens.findIndex(item => item.token === token && !item.usedAt)
    if (index < 0) return { data: current || { tokens: [] }, result: null }
    const record = { ...tokens[index], usedAt: new Date().toISOString() }
    const next = [...tokens]
    next[index] = record
    return { data: { tokens: next }, result: record }
  })
}

export function suppressPressAddress({ email = '', domain = '', contactId = '', reason }) {
  const at = new Date().toISOString()
  const suppression = create('pressSuppression', {
    email: String(email).trim().toLowerCase(),
    domain: String(domain).trim().toLowerCase(),
    contactId: String(contactId || ''),
    reason: String(reason || 'unsubscribe'),
    at,
  })
  if (contactId) update('pressContacts', contactId, { suppressedAt: at })
  return suppression
}

export function recordPressBounce({ email, contactId = '' }, suppressor = suppressPressAddress) {
  return suppressor({ email, contactId, reason: 'bounce' })
}

function releaseContent(campaign, args) {
  if (String(args.subject || campaign.subject || '').trim() && String(args.body || campaign.body || '').trim()) {
    return {
      subject: String(args.subject || campaign.subject).trim(),
      body: String(args.body || campaign.body).trim(),
    }
  }
  const data = readData('documents.json') || {}
  const documents = data.documents || data.items || (Array.isArray(data) ? data : [])
  const document = documents.find(item => item.id === campaign.releaseDocId) || {}
  return {
    subject: String(args.subject || campaign.subject || document.title || 'News from Farrington Development').trim(),
    body: String(args.body || campaign.body || document.body || document.content || '').trim(),
  }
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function sendsOnDate(campaigns, date = new Date()) {
  const day = todayKey(date)
  return campaigns.flatMap(campaign => campaign.sends || []).filter(send => String(send.sentAt || '').startsWith(day))
}

async function defaultSender(message) {
  return sendOutboundEmail(message)
}

export async function sendPressCampaign(campaignId, args = {}, options = {}) {
  const campaign = options.campaign || findById('pressCampaigns', campaignId)
  if (!campaign) throw new Error('Press campaign not found')
  const list = options.list || findById('pressLists', campaign.listId)
  if (!list) throw new Error('Saved press list not found')
  const contacts = options.contacts || loadAll('pressContacts')
  const outlets = options.outlets || loadAll('pressOutlets')
  const suppressions = options.suppressions || loadAll('pressSuppression')
  const allCampaigns = options.campaigns || loadAll('pressCampaigns')
  const contactMap = new Map(contacts.map(contact => [contact.id, contact]))
  const outletMap = new Map(outlets.map(outlet => [outlet.id, outlet]))
  const requestedLive = args.dryRun === false
  const testInbox = String(options.testInbox ?? process.env.PRESS_TEST_INBOX ?? '').trim()
  const dryRun = !requestedLive || !testInbox
  const content = releaseContent(campaign, args)
  if (!content.body) throw new Error('Press release body is required')
  if (requestedLive && args.approved !== true) throw new Error('Explicit campaign approval is required for a live send')
  if (requestedLive && campaign.operatorHold === true) throw new Error('Campaign is held by the Press Desk operator')
  if (requestedLive && campaign.requireCarlApproval === true && args.carlApproved !== true) throw new Error('Carl approval is required for this account')
  if (requestedLive && campaign.source === 'portal-press-release' && campaign.liveSendEnabled !== true) throw new Error('Live journalist sending is disabled for this account')
  if (requestedLive && !testInbox) {
    return { campaignId, dryRun: true, forcedDryRun: true, reason: 'PRESS_TEST_INBOX is not configured', sends: [] }
  }
  if (!dryRun) {
    if (!process.env.PRESS_FROM_DOMAIN && !options.fromDomain) throw new Error('PRESS_FROM_DOMAIN is required for a live press send')
    if (!options.sender && !hasOutboundEmailTransport()) throw new Error('Resend is required for a live press send')
  }

  const physicalAddress = String(options.physicalAddress ?? process.env.PRESS_PHYSICAL_ADDRESS ?? '').trim()
  const fromDomain = String(options.fromDomain ?? process.env.PRESS_FROM_DOMAIN ?? '').trim().toLowerCase()
  const existingToday = sendsOnDate(allCampaigns, options.now || new Date())
  const planned = []
  for (const contactId of list.contactIds || []) {
    const contact = contactMap.get(contactId)
    if (!contact) continue
    const outlet = outletMap.get(contact.outletId) || {}
    const personalization = campaign.personalization?.[contactId]
    const gate = evaluatePressSend({
      contact,
      outlet,
      personalization,
      suppressions,
      sendsToday: [...existingToday, ...planned.filter(item => item.sentAt)],
      domainCap: args.domainCap || DEFAULT_PRESS_DOMAIN_DAILY_CAP,
    })
    if (!gate.allowed) {
      planned.push({ contactId, targetDomain: gate.domain, status: 'refused', reasons: gate.reasons })
      continue
    }
    planned.push({
      contactId,
      originalRecipient: gate.email,
      targetDomain: gate.domain,
      personalization: String(personalization).trim(),
      status: 'approved',
    })
  }

  const approved = planned.filter(item => item.status === 'approved')
  if (!dryRun && approved.length > WO_PR1_LIVE_SEND_CAP) {
    throw new Error('WO-PR1 live test sends are capped at ' + WO_PR1_LIVE_SEND_CAP + ' messages')
  }
  if (dryRun) {
    const result = { campaignId, dryRun: true, forcedDryRun: requestedLive && !testInbox, sends: planned }
    if (!options.campaign) update('pressCampaigns', campaignId, { dryRun: true, status: 'dry-run-complete', sends: planned })
    return result
  }

  const sender = options.sender || defaultSender
  const origin = String(options.origin || 'https://crm.company.example.com').replace(/\/$/, '')
  const sent = []
  for (const item of planned) {
    if (item.status !== 'approved') {
      sent.push(item)
      continue
    }
    const token = (options.tokenFactory || createPressUnsubscribeToken)(item.originalRecipient, item.contactId)
    const unsubscribeUrl = origin + '/api/press/unsubscribe?token=' + encodeURIComponent(token)
    const footer = buildComplianceFooter(physicalAddress, unsubscribeUrl)
    const html = '<p>' + item.personalization.replace(/\n/g, '<br>') + '</p>'
      + '<p>' + content.body.replace(/\n/g, '<br>') + '</p>' + footer
    const response = await sender({
      from: 'Press Desk <press@' + fromDomain + '>',
      to: [testInbox],
      subject: content.subject,
      html,
      headers: { 'List-Unsubscribe': '<' + unsubscribeUrl + '>' },
    })
    sent.push({
      ...item,
      actualRecipient: 'PRESS_TEST_INBOX',
      status: 'sent',
      sentAt: (options.now || new Date()).toISOString(),
      messageId: response?.id || '',
      unsubscribeUrl,
    })
  }
  if (!options.campaign) update('pressCampaigns', campaignId, { dryRun: false, status: 'sent', explicitApproval: true, sends: sent })
  return { campaignId, dryRun: false, count: sent.filter(item => item.status === 'sent').length, sends: sent }
}
