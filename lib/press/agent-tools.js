import { create, findById, loadAll, update } from '@/lib/entityStore'
import { ensurePressDeskSeeds } from './store'
import { explainPressContact, queryPressContacts } from './query'
import { sendPressCampaign, suppressPressAddress } from './send-gate'

export const PRESS_AGENT_TOOL_DESCRIPTIONS = {
  fcc_press_query: 'Query ranked, beat-matched press contacts. Args: { beats[], geo:{scope,state,metro}, outletTypes?, limit?, minScore? }. Returns reasons and any metro-to-state-to-national fallback.',
  fcc_press_list_save: 'Save a reviewed Press Desk result for the current operator. Args: { name, query, contactIds[] }.',
  fcc_press_contact_explain: 'Explain a Press Desk contact score and show the last three bylines. Args: { contactId }.',
  fcc_press_campaign_create: 'Create a draft press campaign from an approved release document and saved list. Args: { releaseDocId, listId, clientAccountId?, personalization?, sendWindow? }.',
  fcc_press_campaign_send: 'Preview or send a press campaign through the compliance gate. dryRun defaults true; an explicit approval token is required for any live send.',
  fcc_press_campaign_report: 'Report campaign sends, opens, replies, bounces, suppression, and pickups. Args: { campaignId }.',
  fcc_press_suppress: 'Immediately suppress a press email or domain. Args: { email?, domain?, contactId?, reason }.',
}

export const PRESS_AGENT_TOOL_NAMES = Object.keys(PRESS_AGENT_TOOL_DESCRIPTIONS)

export function parsePressRequest(args = {}) {
  const text = String(args.q || args.query || args.request || args.topic || '').toLowerCase()
  const beats = Array.isArray(args.beats) ? [...args.beats] : []
  if (!beats.length) {
    if (/\blocal sports|high school sports\b/.test(text)) beats.push('local-sports')
    else if (/\bsports\b/.test(text)) beats.push('sports')
    if (/\btech(?:nology)?\b/.test(text)) beats.push('technology')
    if (/\bai\b|artificial intelligence/.test(text)) beats.push('ai')
    if (/\bstartup|venture capital|\bvc\b/.test(text)) beats.push('startups-vc')
    if (/\bhealth\b/.test(text)) beats.push('health')
  }
  const metro = String(args.geo?.metro || args.metro || (
    /\bCity, ST\b/.test(text) ? 'City, ST' : /\bdenver\b/.test(text) ? 'Denver' : ''
  )).trim()
  const state = String(args.geo?.state || args.state || (
    /\bCity, ST\b/.test(text) ? 'NC' : /\bdenver\b/.test(text) ? 'CO' : ''
  )).trim().toUpperCase()
  const requestedScope = args.geo?.scope || args.scope
  const scope = requestedScope || (metro ? 'metro' : state ? 'state' : 'national')
  return { ...args, beats: [...new Set(beats)], geo: { scope, state, metro }, limit: args.limit || 20 }
}

function campaignReport(campaign) {
  const sends = campaign?.sends || []
  const count = status => sends.filter(send => send.status === status).length
  return {
    campaignId: campaign.id,
    status: campaign.status,
    dryRun: campaign.dryRun !== false,
    recipients: Object.keys(campaign.personalization || {}).length,
    sent: sends.filter(send => send.sentAt).length,
    delivered: count('delivered'),
    opens: sends.reduce((sum, send) => sum + Number(send.opens || 0), 0),
    replies: sends.reduce((sum, send) => sum + Number(send.replies || 0), 0),
    bounces: count('bounced'),
    pickups: campaign.outcome?.pickups || [],
    outcome: campaign.outcome || {},
  }
}

export async function runPressAgentTool(name, args = {}, options = {}) {
  ensurePressDeskSeeds()
  if (name === 'fcc_press_query') return queryPressContacts(parsePressRequest(args))

  if (name === 'fcc_press_contact_explain') {
    const result = explainPressContact(String(args.contactId || args.id || ''))
    if (!result) throw new Error('Press contact not found')
    return result
  }

  if (name === 'fcc_press_list_save') {
    const contactIds = [...new Set((args.contactIds || []).map(String).filter(Boolean))]
    if (!String(args.name || '').trim()) throw new Error('Press list name is required')
    const ownerUserId = String(args.ownerUserId || options.ownerUserId || 'agent:ContentStudio-promoter')
    return create('pressLists', {
      ownerUserId,
      name: String(args.name).trim().slice(0, 120),
      query: parsePressRequest(args.query || args),
      contactIds,
      builtAt: new Date().toISOString(),
    })
  }

  if (name === 'fcc_press_campaign_create') {
    const list = findById('pressLists', String(args.listId || ''))
    if (!list) throw new Error('Saved press list not found')
    if (!String(args.releaseDocId || '').trim()) throw new Error('Release document is required')
    return create('pressCampaigns', {
      releaseDocId: String(args.releaseDocId),
      listId: list.id,
      clientAccountId: String(args.clientAccountId || ''),
      personalization: args.personalization || {},
      sendWindow: args.sendWindow || null,
      dryRun: args.dryRun !== false,
      explicitApproval: false,
      status: 'draft',
      sends: [],
      outcome: { opens: 0, replies: 0, bounces: 0, pickups: [] },
    })
  }

  if (name === 'fcc_press_campaign_send') {
    return sendPressCampaign(String(args.campaignId || ''), args)
  }

  if (name === 'fcc_press_campaign_report') {
    const campaign = findById('pressCampaigns', String(args.campaignId || ''))
    if (!campaign) throw new Error('Press campaign not found')
    return campaignReport(campaign)
  }

  if (name === 'fcc_press_suppress') {
    const contact = args.contactId ? findById('pressContacts', String(args.contactId)) : null
    const email = String(args.email || contact?.email?.value || contact?.legacyEmail || '').trim().toLowerCase()
    const domain = String(args.domain || '').trim().toLowerCase()
    if (!email && !domain) throw new Error('An email, domain, or contactId is required')
    return suppressPressAddress({
      email,
      domain,
      contactId: contact?.id || '',
      reason: String(args.reason || 'manual'),
    })
  }

  throw new Error('Unknown Press Desk tool: ' + name)
}
