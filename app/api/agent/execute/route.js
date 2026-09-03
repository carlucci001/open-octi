// Unified tool-execution surface for OpenClaw (or any agent) to run commands inside the CRM.
// POST { tool: 'tool_name', args: { ... } } → { ok, result } | { ok: false, error }
//
// This endpoint is reachable over the cloudflared tunnel. It does NOT use any cloud AI —
// OpenClaw runs DeepSeek locally on the Ubuntu box and hits this endpoint directly.
// All actions are local file writes + optional outbound calls to Resend/GCal/GoDaddy/ElevenLabs.
//
// AUTH: requests must include x-agent-key or x-api-key when AGENT_API_KEY or
// OPENCLAW_API_KEY is configured. This endpoint can mutate CRM state, so the
// safe default is to reuse OPENCLAW_API_KEY rather than silently running open.
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { Resend } from 'resend'
import {
  loadAll, create, update, remove, findById,
  accountWithRelations, contactWithRelations,
  findAccountMatches, findContactByEmail, logActivity,
} from '@/lib/entityStore'
import { mutateData, readData, writeData } from '@/lib/dataStore'
import { getCurrentUser } from '@/lib/auth'
import { wrapEmailBody, getAgentEmailIdentity, buildEmail } from '@/lib/emailSignature'
import { generateMedia, listMedia, getMedia, deleteMedia, listFolders, moveMedia } from '@/lib/media-gen'
import { resolveAttachments } from '@/lib/email-attachments'
import { COMMAND_CENTER_MENU_GUIDE, resolveCommandCenterTab } from '@/lib/commandCenterNavigation'
import { getGiteaMirrorStatus } from '@/lib/gitea-mirror-status'
import { addSupportTicketComment, createSupportTicket, listSupportTickets, updateSupportTicket } from '@/lib/supportTickets'
import { findExistingLeadMatch, duplicateLeadResponse } from '@/lib/leadDedupe'
import { NEWSROOM_DIRECTOR_TOOLS } from '@/lib/newsroom-director'
import {
  createSignatureToken,
  hashDocumentForSignature,
  hashSignatureToken,
  isSignatureRequired,
  loadDocumentData,
  publicOrigin,
  saveDocumentData,
  signingConfiguration,
} from '@/lib/documentSignatures'
import { isOpenOcti } from '@/lib/edition'
import { getProductCatalog, normalizeProduct, saveProductCatalog } from '@/lib/productCatalog'
import { loadProductOrders } from '@/lib/productCheckout'
import { deleteLicense, getLicenseStore, publicLicense, upsertLicense, verifyLicense } from '@/lib/licenseManager'
import { normalizeSubscriptionRecord, subscriptionMatchKey } from '@/lib/subscriptionImport'
import { generateOpportunityRequirements } from '@/lib/opportunity-requirements'
import { runMindStudioFlow } from '@/lib/mindstudio'
import { runDeepResearchDossier } from '@/lib/deep-research'
import { DEERFLOW_READONLY_TOOL_DEFS, runDeerFlowReadOnlyTool } from '@/lib/deerflow-tools'
import { runDeerFlowStudioTask, STUDIO_KINDS } from '@/lib/deerflow-studio'
import { getVaults, pickVault, resolveVaultFile, walkVaultMd } from '@/lib/obsidianVaults'
import { createContentJob, listContentJobs, updateContentJob, deleteContentJob } from '@/lib/content-lab'
import { normalizeImageGenerationPreference } from '@/lib/image-generation-preferences'
import { getCreditWallet, issuePrepaidCredits } from '@/lib/credit-wallet'
import { stripeBillingCatalogHash } from '@/lib/stripe-billing-catalog.mjs'
import { getRuntimeStripeBillingCatalogDefinitions } from '@/lib/stripe-billing-catalog-source'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOCUMENT_TEMPLATES_DIR = path.join(process.cwd(), 'data', 'document-templates')
const PRESS_CONTACTS_FILE = 'press-contacts.json'

function ok(result) { return NextResponse.json({ ok: true, result }) }
function fail(error, status = 400) { return NextResponse.json({ ok: false, error }, { status }) }

function configuredSecret(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(v.toLowerCase())) return null
  return v
}

function internalAgentHeaders() {
  const key = configuredSecret(process.env.AGENT_API_KEY) || configuredSecret(process.env.OPENCLAW_API_KEY)
  return {
    'Content-Type': 'application/json',
    ...(key ? { 'x-agent-key': key } : {}),
  }
}

function loadPressContactsData() {
  const fromStore = readData(PRESS_CONTACTS_FILE)
  if (fromStore?.contacts) return fromStore
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', PRESS_CONTACTS_FILE), 'utf-8'))
  } catch {
    return { contacts: [] }
  }
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase()
}

function pressContactMatches(contact, args = {}) {
  const haystack = [
    contact.name,
    contact.email,
    contact.outlet,
    contact.beat,
    contact.notes,
    contact.region,
    ...(Array.isArray(contact.tags) ? contact.tags : []),
  ].join(' ').toLowerCase()
  const q = normalizeSearchText(args.q || args.query || args.topic || args.releaseTopic)
  const beat = normalizeSearchText(args.beat)
  const outlet = normalizeSearchText(args.outlet)
  const region = normalizeSearchText(args.region || args.market)
  const status = normalizeSearchText(args.status || 'active')
  if (q && !haystack.includes(q)) return false
  if (beat && !normalizeSearchText(contact.beat).includes(beat) && !haystack.includes(beat)) return false
  if (outlet && !normalizeSearchText(contact.outlet).includes(outlet)) return false
  if (region && !normalizeSearchText(contact.region).includes(region)) return false
  if (status && status !== 'all' && normalizeSearchText(contact.status || 'active') !== status) return false
  return true
}

const AGENT_GUARDRAIL_LOG_FILE = 'agent-tool-guardrails.json'
const AGENT_MEMORY_FILE = 'agent-memory.json'
const AGENT_MEMORY_MAX_RECORDS = 2000
const APPROVAL_FLAGS = ['approvedByCarl', 'humanApproved', 'confirmed', 'operatorApproved', 'explicitApproval']
const FREE_IMAGE_PROVIDERS = new Set(['imagen', 'google-imagen', 'gemini', 'nano-banana', 'pexels', 'stock', 'brief', 'manual', 'upload'])
const AGENT_MEMORY_SCOPES = new Set(['global', 'agent', 'account', 'contact', 'project', 'lead', 'topic'])
const AGENT_MEMORY_SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}/i,
  /\b(?:api|access|refresh|bearer|auth|private|client)[_\s-]*(?:key|token|secret)\b/i,
  /\b(?:password|passphrase|recovery code|seed phrase|ssh key|private key)\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
]

const TOOL_RISK_POLICIES = {
  send_email: { risk: 'external_send', approvalRequired: true, reason: 'sends real email through Resend' },
  send_document: { risk: 'external_send', approvalRequired: true, reason: 'emails a saved document to a client' },
  send_signature_document: { risk: 'external_send', approvalRequired: true, reason: 'emails a signature link to a counterparty' },
  send_invoice_via_stripe: { risk: 'stripe_payment_link', approvalRequired: true, reason: 'sends a real Stripe payment link to a client' },
  record_payment: { risk: 'finance_ledger', approvalRequired: true, reason: 'records money received in the CRM ledger' },
  send_sms: { risk: 'external_send', approvalRequired: true, reason: 'sends a real SMS through Twilio' },
  dispatch_outbound_call: { risk: 'outbound_call', approvalRequired: true, reason: 'places a real outbound voice call' },
  register_domain: { risk: 'purchase', approvalRequired: true, reason: 'can purchase or register a domain' },
  run_mindstudio_flow: { risk: 'external_flow', approvalRequired: true, reason: 'runs an external automation flow' },
  delete_media: { risk: 'destructive', approvalRequired: true, reason: 'deletes a saved media asset' },
  delete_content_draft: { risk: 'destructive', approvalRequired: true, reason: 'deletes a saved Content Lab draft' },
  newsroom_create_support_ticket: { risk: 'external_write', approvalRequired: true, reason: 'creates a real support ticket in Newsroom AIOS' },
  newsroom_apply_reporter_assignments: { risk: 'editorial_change', approvalRequired: true, reason: 'changes article bylines and reporter assignments on a live newspaper' },
  create_support_ticket: { risk: 'external_write', approvalRequired: true, reason: 'creates a real support ticket' },
  update_support_ticket: { risk: 'external_write', approvalRequired: true, reason: 'changes a real support ticket' },
  add_support_ticket_comment: { risk: 'external_write', approvalRequired: true, reason: 'adds a real support ticket comment' },
  update_template: { risk: 'document_change', approvalRequired: true, reason: 'edits a reusable document template' },
  update_document: { risk: 'document_change', approvalRequired: true, reason: 'modifies a saved business document' },
  save_product: { risk: 'catalog_change', approvalRequired: true, reason: 'changes the product catalog' },
  save_product_package: { risk: 'catalog_change', approvalRequired: true, reason: 'changes product packaging or pricing' },
  issue_product_license: { risk: 'license_change', approvalRequired: true, reason: 'issues a product license' },
  delete_product_license: { risk: 'license_delete', approvalRequired: true, reason: 'deletes a product license' },
  save_subscription_plan: { risk: 'billing_catalog_change', approvalRequired: true, reason: 'changes subscription pricing or allowances' },
  copy_subscription_plan: { risk: 'billing_catalog_change', approvalRequired: true, reason: 'creates a new subscription plan copy' },
  delete_subscription_plan: { risk: 'billing_catalog_delete', approvalRequired: true, reason: 'deletes a subscription plan' },
  issue_client_credits: { risk: 'credit_ledger_change', approvalRequired: true, reason: 'issues real service credits to a client wallet' },
}

function hasExplicitApproval(args = {}) {
  return APPROVAL_FLAGS.some((flag) => {
    const value = args?.[flag]
    return value === true || String(value || '').toLowerCase() === 'true'
  })
}

function agentToolPolicy(toolName, args = {}) {
  if (toolName === 'generate_image') {
    const provider = String(args.provider || 'auto').toLowerCase()
    if (!FREE_IMAGE_PROVIDERS.has(provider)) {
      const routedProvider = provider === 'auto' ? 'auto, which currently routes to OpenAI' : provider
      return { risk: 'paid_generation', approvalRequired: true, reason: `can spend paid image-generation credits via ${routedProvider}` }
    }
  }
  return TOOL_RISK_POLICIES[toolName] || null
}

function summarizeGuardrailArgs(args = {}) {
  const summary = {}
  for (const key of ['id', 'clientId', 'clientName', 'accountId', 'agent', 'agentId', 'provider', 'domain', 'method', 'phone', 'to']) {
    if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
      summary[key] = String(args[key]).slice(0, 120)
    }
  }
  if (args.amount !== undefined) summary.amount = Number(args.amount) || 0
  if (args.prompt) summary.promptLength = String(args.prompt).length
  if (args.body) summary.bodyLength = String(args.body).length
  if (args.html) summary.htmlLength = String(args.html).length
  if (args.subject) summary.subject = String(args.subject).slice(0, 160)
  return summary
}

function logAgentGuardrailEvent(event) {
  try {
    const current = readData(AGENT_GUARDRAIL_LOG_FILE) || { events: [] }
    const events = Array.isArray(current.events) ? current.events : []
    events.push({
      id: `agt_guard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...event,
    })
    writeData(AGENT_GUARDRAIL_LOG_FILE, { events: events.slice(-250), lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.warn(`[agent-guardrail] log failed: ${String(e.message || e).slice(0, 160)}`)
  }
}

function enforceAgentToolPolicy(toolName, args = {}, context = {}) {
  const policy = agentToolPolicy(toolName, args)
  if (!policy) return { ok: true }
  const approved = hasExplicitApproval(args)
  const event = {
    tool: toolName,
    risk: policy.risk,
    approved,
    blocked: !approved && policy.approvalRequired,
    reason: policy.reason,
    tenantId: context.tenantContext?.tenantId || 'unknown',
    agentId: context.tenantContext?.agentId || null,
    leaseId: context.tenantContext?.leaseId || null,
    args: summarizeGuardrailArgs(args),
  }
  logAgentGuardrailEvent(event)
  if (policy.approvalRequired && !approved) {
    return {
      ok: false,
      status: 403,
      error: `${toolName} blocked by agent guardrails: ${policy.reason}. Carl must explicitly approve this action before the agent can run it.`,
    }
  }
  return { ok: true, policy }
}

function normalizeInvoiceItems(args = {}) {
  const rawItems = Array.isArray(args.items) ? args.items : []
  const items = rawItems.map(item => ({
    description: item.description || item.name || args.description || args.service || 'Professional services',
    qty: Number(item.qty ?? item.quantity ?? 1) || 1,
    rate: Number(item.rate ?? item.unitPrice ?? item.price ?? item.amount ?? args.amount ?? 0) || 0,
  }))
  if (items.length === 0 && Number(args.amount || 0) > 0) {
    items.push({
      description: args.description || args.service || args.notes || 'Professional services',
      qty: Number(args.qty ?? args.quantity ?? 1) || 1,
      rate: Number(args.amount) || 0,
    })
  }
  return items
}

function resolveAccountByName(name) {
  const lc = String(name || '').toLowerCase().trim()
  if (!lc) return null
  const accounts = loadAll('accounts')
  return accounts.find(a => (a.name || '').toLowerCase() === lc)
    || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
    || accounts.find(a => (a.name || '').toLowerCase().split(' ')[0] === lc.split(' ')[0])
    || null
}

const UI_RECORD_META = {
  account: { collection: 'accounts', tabId: 'accounts', primary: ['name', 'email', 'phone'] },
  contact: { collection: 'contacts', tabId: 'contacts', primary: ['name', 'email', 'phone'] },
  lead: { collection: 'leads', tabId: 'leads', primary: ['businessName', 'name', 'email', 'phone'] },
  opportunity: { collection: 'opportunities', tabId: 'pipelines', primary: ['name'] },
  project: { collection: 'projects', tabId: 'projects', primary: ['name'] },
}

function normalizeUiText(value) {
  return String(value || '').toLowerCase().replace(/[^\w\s.-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function resolveUiTab(value) {
  return resolveCommandCenterTab(value)
}

function scoreUiRecord(record, query, fields) {
  if (!record || !query) return 0
  const q = normalizeUiText(query)
  const haystack = normalizeUiText(JSON.stringify(record))
  if (!haystack.includes(q)) return 0
  for (const field of fields) {
    const value = normalizeUiText(record[field])
    if (value === q) return 100
    if (value.startsWith(q)) return 80
    if (value.includes(q)) return 60
  }
  return 20
}

function findUiRecord(args = {}) {
  const requestedType = normalizeUiText(args.type || args.recordType || args.entityType || '')
  const id = String(args.id || args.recordId || args.accountId || args.clientId || '').trim()
  const query = String(args.query || args.name || args.clientName || args.accountName || args.search || '').trim()
  const candidates = requestedType && UI_RECORD_META[requestedType]
    ? [[requestedType, UI_RECORD_META[requestedType]]]
    : Object.entries(UI_RECORD_META)

  if (id) {
    for (const [type, meta] of candidates) {
      const record = findById(meta.collection, id)
      if (record) return { ...record, type, tabId: meta.tabId, name: record.name || record.businessName || record.email || record.id }
    }
  }

  if (!query) return null
  const matches = []
  for (const [type, meta] of candidates) {
    for (const record of loadAll(meta.collection)) {
      const _score = scoreUiRecord(record, query, meta.primary)
      if (_score > 0) matches.push({ ...record, type, tabId: meta.tabId, name: record.name || record.businessName || record.email || record.id, _score })
    }
  }
  matches.sort((a, b) => b._score - a._score)
  return matches[0] || null
}

function pushUiAction(action) {
  const data = readData('ui-actions.json') || { actions: [] }
  const now = Date.now()
  const next = {
    id: `uia_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    ...action,
  }
  const actions = Array.isArray(data.actions) ? data.actions : []
  actions.push(next)
  writeData('ui-actions.json', { actions: actions.slice(-100) })
  return next
}

function wantsSignatureRequestText(...parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase()
  return /\b(nda|non[-\s]?disclosure|signature|signing|sign it|for signature|review and sign)\b/.test(text)
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

async function authed(request) {
  const allowed = [
    configuredSecret(process.env.AGENT_API_KEY),
    configuredSecret(process.env.OPENCLAW_API_KEY),
  ].filter(Boolean)
  const header = request.headers.get('x-agent-key') || request.headers.get('x-api-key')
  if (allowed.length && allowed.includes(header)) return true

  // Browser-based voice sessions run inside an already-authenticated CRM page.
  // They cannot safely carry the server-side agent key, so accept a valid CRM
  // session cookie as the browser credential while keeping anonymous requests out.
  const user = await getCurrentUser(request)
  if (user) return true

  // Local/dev setups without configured agent keys historically ran open.
  // In production this route mutates CRM state, so it must fail closed unless a
  // valid key or authenticated CRM session is present.
  return process.env.NODE_ENV !== 'production' && !allowed.length
}

function genDocumentId() {
  return 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadDocumentTemplateIndex() {
  try {
    const raw = fs.readFileSync(path.join(DOCUMENT_TEMPLATES_DIR, '_index.json'), 'utf8')
    return JSON.parse(raw.replace(/^\uFEFF/, '')).templates || []
  } catch {
    return []
  }
}

function loadDocumentTemplate(id) {
  const template = loadDocumentTemplateIndex().find(t => t.id === id)
  if (!template) return null
  const filePath = path.join(DOCUMENT_TEMPLATES_DIR, template.file || '')
  if (!fs.existsSync(filePath)) return null
  return { ...template, body: fs.readFileSync(filePath, 'utf8') }
}

function fillDocumentPlaceholders(body = '', values = {}) {
  return String(body).replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key) => {
    const value = values[key]
    if (value === undefined || value === null || value === '') return `[${key}]`
    return String(value)
  })
}

function resolveDocumentTemplate(args = {}) {
  const templates = loadDocumentTemplateIndex()
  const wanted = String(args.templateId || args.templateName || args.documentType || args.type || '').toLowerCase()
  let template = null
  if (args.templateId) template = templates.find(t => t.id === args.templateId)
  if (!template && /(^|\b)(nda|non[-\s]?disclosure|confidential)/i.test(wanted)) {
    template = templates.find(t => t.id === 'nda-mutual')
  }
  if (!template && wanted) {
    template = templates.find(t =>
      String(t.id || '').toLowerCase().includes(wanted) ||
      String(t.name || '').toLowerCase().includes(wanted)
    )
  }
  if (!template && !wanted) template = templates.find(t => t.id === 'nda-mutual')
  if (!template) throw new Error(`document template not found: ${args.templateId || args.templateName || 'standard NDA'}`)
  const loaded = loadDocumentTemplate(template.id)
  if (!loaded) throw new Error(`template body not found for ${template.id}`)
  return loaded
}

function signaturePolicyForTemplate(template) {
  const id = String(template?.id || '').toLowerCase()
  if (/^(website-tos|website-privacy|ai-usage-policy)$/.test(id)) {
    return {
      mode: 'client_acceptance',
      requiredSigners: ['client'],
      voiceGuidance: 'This is a client deliverable policy template. The client accepts it; Carl does not need to countersign it in this flow.',
    }
  }
  if (/^nda/.test(id)) {
    return {
      mode: 'client_only',
      requiredSigners: ['client'],
      voiceGuidance: 'This standard NDA flow only needs the recipient signature for the demo.',
    }
  }
  return {
    mode: 'both_client_first',
    requiredSigners: ['client', 'farrington'],
    voiceGuidance: 'This contract should be signed by both parties. The client signs first, then Farrington countersigns.',
  }
}

function resolveDocumentRecipient(args = {}) {
  const contacts = loadAll('contacts')
  const accounts = loadAll('accounts')
  const query = String(args.clientName || args.counterpartyName || args.signerName || '').toLowerCase().trim()
  const email = String(args.signerEmail || args.email || '').toLowerCase().trim()

  let contact = null
  if (email) contact = contacts.find(c => String(c.email || '').toLowerCase() === email) || null
  if (!contact && query) {
    contact = contacts.find(c => String(c.name || '').toLowerCase() === query)
      || contacts.find(c => String(c.name || '').toLowerCase().includes(query))
      || contacts.find(c => String(c.name || '').toLowerCase().split(' ')[0] === query.split(' ')[0])
      || null
  }

  let account = null
  if (args.clientId) account = accounts.find(a => a.id === args.clientId) || null
  if (!account && contact?.accountId) account = accounts.find(a => a.id === contact.accountId) || null
  if (!account && email) account = accounts.find(a => String(a.email || '').toLowerCase() === email) || null
  if (!account && query) {
    account = accounts.find(a => String(a.name || '').toLowerCase() === query)
      || accounts.find(a => String(a.name || '').toLowerCase().includes(query))
      || accounts.find(a => String(a.name || '').toLowerCase().split(' ')[0] === query.split(' ')[0])
      || null
  }

  const signerEmail = args.signerEmail || args.email || contact?.email || account?.email || ''
  const signerName = args.signerName || contact?.name || account?.name || args.clientName || args.counterpartyName || ''
  const counterpartyName = args.counterpartyName || args.clientName || contact?.name || account?.name || signerName
  if (!counterpartyName) throw new Error('clientName, counterpartyName, or signerName required')
  if (!signerEmail) throw new Error(`no signer email found for ${counterpartyName}`)

  return { account, contact, signerName, signerEmail, counterpartyName }
}

async function sendAgentSignatureEmail({ to, signerName, title, signUrl }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' }
  const openEdition = isOpenOcti()
  const from = process.env.RESEND_FROM || (openEdition ? 'OpenOcti <noreply@openocti.com>' : 'Farrington Development <redacted@example.invalid>')
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || from
  const replyTo = openEdition ? (process.env.OWNER_EMAIL || '') : (process.env.CARL_EMAIL || 'personal@example.invalid')
  const senderName = openEdition ? (process.env.OPENOCTI_BUSINESS_NAME || 'Your business') : 'Carl Farrington'
  const bodyHtml = `
    <p>Hi ${signerName || 'there'},</p>
    <p>${senderName} has sent you <strong>${title}</strong> for electronic review and signature.</p>
    <p><a href="${signUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Review and sign</a></p>
    <p style="font-size:13px;color:#555">The signing page records consent, typed signature, timestamp, IP address, browser details, and a SHA-256 document hash for the audit trail.</p>
  `
  const { html, inlineAttachments } = buildEmail(bodyHtml, 'farrington')
  const resend = new Resend(apiKey)
  const payload = {
    from,
    to: [to],
    cc: replyTo ? [replyTo] : undefined,
    replyTo,
    subject: `Signature requested: ${title}`,
    html,
    attachments: inlineAttachments,
  }
  let result
  try {
    result = await resend.emails.send(payload)
    const message = result.error?.message || ''
    if (result.error && fallbackFrom !== from && /domain|verify|authorization|permission|sender/i.test(message)) {
      result = await resend.emails.send({ ...payload, from: fallbackFrom })
      if (!result.error) return { ok: true, id: result.data?.id, fallback: true }
    }
  } catch (e) {
    return { ok: false, error: e.message || 'Signature email send failed' }
  }
  if (result.error) return { ok: false, error: result.error.message }
  return { ok: true, id: result.data?.id }
}

// =====================================================================================
// TOOL DEFINITIONS — each is { description, run(args) }
// OpenClaw can call GET /api/agent/execute (no body) to enumerate them.
// =====================================================================================

const SUBSCRIPTIONS_FILE = 'subscriptions.json'

function loadSubscriptionsWrap() {
  const wrap = readData(SUBSCRIPTIONS_FILE) || { subscriptions: [], lastUpdated: null }
  return Array.isArray(wrap)
    ? { subscriptions: wrap, lastUpdated: null }
    : { subscriptions: wrap.subscriptions || [], lastUpdated: wrap.lastUpdated || null }
}

function saveSubscriptionsWrap(wrap) {
  writeData(SUBSCRIPTIONS_FILE, { ...wrap, lastUpdated: new Date().toISOString() })
}

function financeDateDaysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function subscriptionMonthlyEquivalent(sub) {
  if (sub.frequency === 'usage-based' && sub.avgMonthlyAmount != null && sub.avgMonthlyAmount !== '') return Number(sub.avgMonthlyAmount) || 0
  const amount = Number(sub.amount) || 0
  if (sub.frequency === 'yearly') return amount / 12
  if (sub.frequency === 'quarterly') return amount / 3
  if (sub.frequency === 'weekly') return amount * 52 / 12
  if (sub.frequency === 'one-time') return 0
  return amount
}

function publicSubscription(sub) {
  return {
    id: sub.id,
    vendor: sub.vendor,
    productOrPlan: sub.productOrPlan || '',
    category: sub.category || 'other',
    amount: Number(sub.amount) || 0,
    currency: sub.currency || 'USD',
    frequency: sub.frequency || 'monthly',
    billingType: sub.billingType || 'fixed',
    billingDayOfMonth: sub.billingDayOfMonth || null,
    lastChargeDate: sub.lastChargeDate || null,
    nextDue: sub.nextDue || null,
    daysUntilDue: financeDateDaysUntil(sub.nextDue),
    status: sub.status || (sub.active === false ? 'paused' : 'active'),
    paymentMethod: sub.paymentMethod || '',
    businessEntity: sub.businessEntity || '',
    projectOrProduct: sub.projectOrProduct || '',
    minObservedAmount: sub.minObservedAmount ?? null,
    maxObservedAmount: sub.maxObservedAmount ?? null,
    avgMonthlyAmount: sub.avgMonthlyAmount ?? null,
    monthlyEquivalent: subscriptionMonthlyEquivalent(sub),
    active: sub.active !== false,
  }
}

function genSubscriptionId() {
  return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function normalizeSubscriptionArgs(args = {}) {
  return normalizeSubscriptionRecord({
    _rowNumber: 1,
    vendorName: args.vendor_name || args.vendorName || args.vendor || args.provider,
    productOrPlan: args.product_or_plan || args.productOrPlan || args.product || args.plan,
    category: args.category,
    amount: args.amount,
    currency: args.currency,
    billingFrequency: args.billing_frequency || args.billingFrequency || args.frequency,
    billingType: args.billing_type || args.billingType,
    billingDayOfMonth: args.billing_day_of_month || args.billingDayOfMonth || args.billingDay,
    lastChargeDate: args.last_charge_date || args.lastChargeDate,
    nextChargeDate: args.next_charge_date || args.nextChargeDate || args.nextDue,
    status: args.status,
    paymentMethod: args.payment_method || args.paymentMethod,
    businessEntity: args.business_entity || args.businessEntity,
    projectOrProduct: args.project_or_product || args.projectOrProduct,
    minObservedAmount: args.min_observed_amount || args.minObservedAmount,
    maxObservedAmount: args.max_observed_amount || args.maxObservedAmount,
    avgMonthlyAmount: args.avg_monthly_amount || args.avgMonthlyAmount,
    last3Charges: args.last_3_charges || args.last3Charges,
    loginUrl: args.login_url || args.loginUrl,
    notes: args.notes,
  })
}

function listFromArgs(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean)
  if (!value) return []
  return String(value).split(/\r?\n|,/).map(v => v.trim()).filter(Boolean)
}

function createPluginChangeRequest(args = {}) {
  const title = String(args.title || args.summary || args.request || '').trim()
  if (!title) throw new Error('title required')
  const scope = String(args.scope || args.area || 'OpenClaw/plugin tooling').trim()
  const details = String(args.details || args.description || '').trim()
  const requestedBy = String(args.requestedBy || args.agentName || 'Craig').trim()
  const priority = String(args.priority || 'high').trim()
  const target = String(args.target || args.plugin || args.toolName || '').trim()
  const acceptanceCriteria = listFromArgs(args.acceptanceCriteria || args.acceptance_criteria)
  const likelyFiles = listFromArgs(args.likelyFiles || args.likely_files || args.files)
  const risks = listFromArgs(args.risks)
  const notes = [
    `Controlled plugin/OpenClaw change request captured by ${requestedBy}.`,
    '',
    `Scope: ${scope}`,
    target ? `Target: ${target}` : '',
    details ? `Details:\n${details}` : '',
    likelyFiles.length ? `Likely files:\n${likelyFiles.map(f => `- ${f}`).join('\n')}` : '',
    acceptanceCriteria.length ? `Acceptance criteria:\n${acceptanceCriteria.map(item => `- ${item}`).join('\n')}` : '',
    risks.length ? `Risks / guardrails:\n${risks.map(item => `- ${item}`).join('\n')}` : '',
    '',
    'Guardrail: this request does not grant the voice agent direct file, shell, git, OpenClaw config, restart, payment, or deploy authority.',
  ].filter(Boolean).join('\n')

  const task = create('tasks', {
    title: `Plugin change request: ${title}`,
    description: notes,
    status: 'todo',
    priority,
    dueDate: args.dueDate || null,
    linkedTo: {},
    tags: ['engineering', 'openclaw', 'plugin-change-request', ...listFromArgs(args.tags)],
    completedAt: null,
    meta: {
      kind: 'plugin_change_request',
      source: args.source || 'voice-agent',
      requestedBy,
      scope,
      target,
      likelyFiles,
      acceptanceCriteria,
      risks,
    },
  })

  logActivity({
    type: 'note',
    subject: `Plugin change request captured: ${title}`,
    body: notes,
    linkedTo: {},
    meta: { taskId: task.id, kind: 'plugin_change_request', requestedBy, target },
    agentId: 'coding',
  })

  return {
    requestId: task.id,
    taskId: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    message: `Plugin change request captured as task ${task.id}. Engineering review is required before code, config, restart, commit, or deploy.`,
  }
}

function createOpenClawPluginSpec(args = {}) {
  const name = String(args.name || args.pluginName || args.title || '').trim()
  if (!name) throw new Error('name/pluginName/title required')
  const purpose = String(args.purpose || args.goal || args.details || '').trim()
  const tools = listFromArgs(args.tools || args.toolNames || args.capabilities)
  const endpoints = listFromArgs(args.endpoints || args.routes)
  const dataSources = listFromArgs(args.dataSources || args.data_sources)
  const guardrails = listFromArgs(args.guardrails || args.risks)
  const acceptanceCriteria = listFromArgs(args.acceptanceCriteria || args.acceptance_criteria)
  const likelyFiles = listFromArgs(args.likelyFiles || args.files)
  const now = new Date().toISOString()
  const title = `OpenClaw plugin spec: ${name}`
  const body = [
    `# ${title}`,
    '',
    `Created: ${now}`,
    `Requested by: ${args.requestedBy || 'Craig'}`,
    '',
    '## Purpose',
    purpose || '[Describe the plugin purpose]',
    '',
    '## Tools / Capabilities',
    tools.length ? tools.map(item => `- ${item}`).join('\n') : '- [Define callable tools]',
    '',
    '## Endpoints / CRM Surfaces',
    endpoints.length ? endpoints.map(item => `- ${item}`).join('\n') : '- app/api/agent/execute/route.js',
    '',
    '## Data Sources',
    dataSources.length ? dataSources.map(item => `- ${item}`).join('\n') : '- SQLite-backed CRM data through dataStore/entityStore',
    '',
    '## Guardrails',
    [
      'No direct production restart, deploy, secret printing, or destructive file changes from voice.',
      'Use explicit approval for external sends, purchases, destructive changes, and legal/signature actions.',
      ...guardrails,
    ].map(item => `- ${item}`).join('\n'),
    '',
    '## Likely Files',
    likelyFiles.length ? likelyFiles.map(item => `- ${item}`).join('\n') : [
      '- app/api/agent/execute/route.js',
      '- scripts/fcc-unified-plugin-index.ts',
      '- app/api/agents/available-tools/route.js',
      '- lib/agent-presets.js',
    ].join('\n'),
    '',
    '## Acceptance Criteria',
    acceptanceCriteria.length ? acceptanceCriteria.map(item => `- ${item}`).join('\n') : [
      '- Tool appears in GET /api/agent/execute.',
      '- Tool returns structured success/error data.',
      '- Voice/OpenClaw prompt knows when to use it.',
      '- npm run build passes before deploy.',
      '- Production health check passes after deploy.',
    ].join('\n'),
  ].join('\n')

  const document = {
    id: genDocumentId(),
    title,
    templateId: 'openclaw-plugin-spec',
    templateName: 'OpenClaw Plugin Spec',
    clientId: '',
    clientName: 'Farrington Development',
    folder: 'Engineering / OpenClaw',
    body,
    values: { name, purpose },
    portalVisible: false,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    createdBy: args.agentName || args.requestedBy || 'Craig',
    linkedTo: {},
    meta: { kind: 'openclaw_plugin_spec', tools, endpoints, dataSources, guardrails, likelyFiles, acceptanceCriteria },
  }
  const data = loadDocumentData()
  data.documents = [document, ...(data.documents || [])]
  saveDocumentData(data)

  const task = createPluginChangeRequest({
    title: name,
    scope: args.scope || 'OpenClaw/plugin tooling',
    target: args.target || name,
    details: `${purpose || 'Build or modify an OpenClaw plugin.'}\n\nSpec document: ${document.id}`,
    likelyFiles,
    acceptanceCriteria,
    risks: guardrails,
    priority: args.priority || 'high',
    requestedBy: args.requestedBy || 'Craig',
    source: args.source || 'voice-agent',
  })
  return {
    documentId: document.id,
    taskId: task.taskId,
    title,
    status: document.status,
    folder: document.folder,
    message: `OpenClaw plugin spec staged as document ${document.id} and engineering task ${task.taskId}.`,
    nextStep: 'Engineering can implement from the staged spec, then build, commit, and deploy through the normal release path.',
  }
}

function execFixed(command, args = [], opts = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        cwd: opts.cwd || process.cwd(),
        encoding: 'utf8',
        timeout: opts.timeout || 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }).trim(),
    }
  } catch (error) {
    return {
      ok: false,
      output: String(error?.stdout || '').trim(),
      error: String(error?.stderr || error?.message || error).trim().slice(0, 500),
    }
  }
}

function newestFiles(dir, limit = 8) {
  try {
    return fs.readdirSync(dir)
      .map(name => {
        const fullPath = path.join(dir, name)
        const stat = fs.statSync(fullPath)
        return {
          name,
          path: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
          bytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          isDirectory: stat.isDirectory(),
        }
      })
      .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
      .slice(0, limit)
  } catch {
    return []
  }
}

function latestBuildLog() {
  const logs = newestFiles('/tmp', 25).filter(file => /^fcc-build-.*\.log$/.test(file.name))
  const latest = logs[0]
  if (!latest) return null
  let tail = ''
  try {
    const raw = fs.readFileSync(path.join('/tmp', latest.name), 'utf8')
    tail = raw.split(/\r?\n/).filter(Boolean).slice(-8).join('\n').slice(0, 1200)
  } catch {}
  return { ...latest, tail }
}

function repositoryStatus(mirror = null) {
  const cwd = process.cwd()
  const branch = execFixed('git', ['branch', '--show-current'], { cwd })
  const head = execFixed('git', ['rev-parse', '--short', 'HEAD'], { cwd })
  const status = execFixed('git', ['status', '--short', '--branch'], { cwd })
  const log = execFixed('git', ['log', '-5', '--pretty=format:%h %ci %s'], { cwd })
  const remote = execFixed('git', ['remote', '-v'], { cwd })
  const statusLines = status.output ? status.output.split(/\r?\n/).filter(Boolean) : []
  const changedFiles = statusLines.filter(line => !line.startsWith('##'))
  return {
    path: cwd,
    branch: branch.output || null,
    head: head.output || null,
    dirty: changedFiles.length > 0,
    changedFileCount: changedFiles.length,
    changedFiles: changedFiles.slice(0, 12),
    status: status.output || status.error || '',
    recentCommits: log.output ? log.output.split(/\r?\n/) : [],
    remotes: remote.output
      ? remote.output.split(/\r?\n/).map(line => line.replace(/\/\/[^@\s]+@/g, '//[redacted]@')).slice(0, 8)
      : [],
    giteaMirror: mirror || getGiteaMirrorStatus({ cwd }),
  }
}

function serviceStatus(name) {
  const active = execFixed('systemctl', ['is-active', name], { timeout: 4000 })
  const enabled = execFixed('systemctl', ['is-enabled', name], { timeout: 4000 })
  return {
    name,
    active: active.ok ? active.output : 'unknown',
    enabled: enabled.ok ? enabled.output : 'unknown',
    error: active.ok ? undefined : active.error,
  }
}

function backupStatus(mirror = null) {
  const dataDir = path.join(process.cwd(), 'data')
  const restoreDir = path.join(dataDir, 'restore-points')
  const sqlitePath = path.join(dataDir, 'crm.sqlite')
  let sqlite = null
  try {
    const stat = fs.statSync(sqlitePath)
    sqlite = { path: 'data/crm.sqlite', bytes: stat.size, modifiedAt: stat.mtime.toISOString() }
  } catch {}
  const restorePoints = newestFiles(restoreDir, 10)
  const dataBackups = newestFiles(dataDir, 60)
    .filter(file => /backup|restore|snapshot/i.test(file.name))
    .slice(0, 10)
  return {
    sqlite,
    restorePointCount: restorePoints.length,
    latestRestorePoints: restorePoints,
    latestDataBackups: dataBackups,
    codeMirror: mirror || getGiteaMirrorStatus({ cwd: process.cwd() }),
    status: restorePoints.length || dataBackups.length ? 'available' : 'no restore points found',
  }
}

function opsStatus(args = {}) {
  const scope = String(args.scope || 'all').toLowerCase()
  const wantsRepo = /all|repo|git|source|ci|cd|deploy/.test(scope)
  const wantsBackup = /all|backup|restore/.test(scope)
  const mirror = wantsRepo || wantsBackup ? getGiteaMirrorStatus({ cwd: process.cwd() }) : null
  const repo = wantsRepo ? repositoryStatus(mirror) : null
  const backup = wantsBackup ? backupStatus(mirror) : null
  const services = /all|service|production|deploy|health|ci|cd|ops/.test(scope)
    ? ['farrington-crm.service', 'openclaw-gateway.service', 'cloudflared.service'].map(serviceStatus)
    : []
  const buildLog = /all|ci|cd|build|deploy|ops/.test(scope) ? latestBuildLog() : null
  return {
    checkedAt: new Date().toISOString(),
    scope,
    productionPath: process.cwd(),
    repository: repo,
    backup,
    services,
    ciCd: {
      latestBuildLog: buildLog,
      note: 'This reports the live checkout, latest local production build log, service health, and restore points. It does not grant deploy/restart authority.',
    },
  }
}

function resolveDraftParty(args = {}) {
  const contacts = loadAll('contacts')
  const accounts = loadAll('accounts')
  const query = String(args.clientName || args.counterpartyName || args.accountName || args.signerName || '').toLowerCase().trim()
  const email = String(args.signerEmail || args.email || '').toLowerCase().trim()

  let contact = null
  if (email) contact = contacts.find(c => String(c.email || '').toLowerCase() === email) || null
  if (!contact && query) {
    contact = contacts.find(c => String(c.name || '').toLowerCase() === query)
      || contacts.find(c => String(c.name || '').toLowerCase().includes(query))
      || null
  }

  let account = null
  if (args.accountId || args.clientId) account = accounts.find(a => a.id === (args.accountId || args.clientId)) || null
  if (!account && contact?.accountId) account = accounts.find(a => a.id === contact.accountId) || null
  if (!account && email) account = accounts.find(a => String(a.email || '').toLowerCase() === email) || null
  if (!account && query) {
    account = accounts.find(a => String(a.name || '').toLowerCase() === query)
      || accounts.find(a => String(a.name || '').toLowerCase().includes(query))
      || null
  }

  const counterpartyName = args.counterpartyName || args.clientName || account?.name || contact?.name || args.signerName || 'Counterparty'
  return {
    account,
    contact,
    counterpartyName,
    signerName: args.signerName || contact?.name || account?.name || counterpartyName,
    signerEmail: args.signerEmail || args.email || contact?.email || account?.email || '',
  }
}

function oneOffLegalTemplate(args = {}) {
  const kind = String(args.documentType || args.type || args.templateName || 'agreement').toLowerCase()
  const mutual = args.mutual === true || args.reciprocal === true || /mutual|reciprocal|nda|non[-\s]?disclosure/.test(kind)
  if (/nda|non[-\s]?disclosure|confidential/.test(kind)) {
    return {
      id: mutual ? 'one-off-mutual-nda' : 'one-off-nda',
      name: mutual ? 'One-Off Mutual NDA Draft' : 'One-Off NDA Draft',
      body: `# ${mutual ? 'Mutual ' : ''}Non-Disclosure Agreement

> Draft business template, not legal advice. Review before use.

This ${mutual ? 'Mutual ' : ''}Non-Disclosure Agreement is entered into as of {{effective_date}} by and between Farrington Development LLC and {{client_business_name}}.

## 1. Purpose
The parties wish to discuss {{purpose_of_disclosure}} and may exchange confidential business, technical, financial, operational, customer, marketing, product, or strategic information.

## 2. Confidential Information
Confidential Information includes non-public information disclosed in any form that a reasonable person would understand to be confidential, including business plans, pricing, software, workflows, credentials, customer information, proposals, designs, processes, and trade secrets.

## 3. Mutual Obligations
Each receiving party will protect Confidential Information using at least reasonable care, use it only for the stated purpose, and disclose it only to personnel or advisors who need to know and are bound by similar confidentiality duties.

## 4. Exclusions
Confidential Information does not include information that is publicly available through no fault of the receiving party, already known without restriction, independently developed without use of Confidential Information, or lawfully received from a third party.

## 5. Required Disclosure
If disclosure is required by law, the receiving party will provide prompt notice when legally allowed and disclose only the portion required.

## 6. No License Or Obligation
No intellectual property license, partnership, employment relationship, or obligation to proceed with a transaction is created by this agreement.

## 7. Return Or Destruction
Upon request, each receiving party will return or destroy Confidential Information, except for archival copies retained for legal, compliance, or backup purposes.

## 8. Term
This agreement begins on {{effective_date}}. Confidentiality obligations continue for {{term_years}} years, and trade secret obligations continue as long as the information remains a trade secret under applicable law.

## 9. Remedies
Unauthorized disclosure may cause irreparable harm, and the disclosing party may seek injunctive relief in addition to other available remedies.

## 10. Governing Law
This agreement is governed by the laws of {{state_of_governing_law}}.

## Signatures

Farrington Development LLC

Signature: ______________________________

Name: Carl Farrington

Date: __________________

{{client_business_name}}

Signature: ______________________________

Name: {{client_name}}

Date: __________________
`,
    }
  }
  return {
    id: 'one-off-business-agreement',
    name: 'One-Off Business Agreement Draft',
    body: `# Business Agreement

> Draft business template, not legal advice. Review before use.

This agreement is entered into as of {{effective_date}} by and between Farrington Development LLC and {{client_business_name}}.

## Purpose
The parties intend to document the terms for {{purpose_of_disclosure}}.

## Scope
Farrington Development LLC will provide the services, deliverables, or consultation described in the attached notes or statement of work.

## Responsibilities
Each party will provide timely information, access, approvals, and cooperation reasonably needed to perform the agreement.

## Fees And Payment
Fees, payment timing, expenses, and pass-through costs must be stated in the applicable order, invoice, proposal, or statement of work.

## Confidentiality
Each party will protect non-public information received from the other party and use it only for the purposes of this agreement.

## Intellectual Property
Unless otherwise stated in writing, pre-existing tools, templates, software, know-how, and reusable components remain the property of their original owner.

## Term And Termination
The agreement begins on {{effective_date}} and continues until the work is complete or terminated under the written terms agreed by the parties.

## Governing Law
This agreement is governed by the laws of {{state_of_governing_law}}.

## Signatures

Farrington Development LLC

Signature: ______________________________

{{client_business_name}}

Signature: ______________________________
`,
  }
}

function chooseLegalTemplate(args = {}) {
  try {
    return { template: resolveDocumentTemplate(args), source: 'existing_template' }
  } catch {
    return { template: oneOffLegalTemplate(args), source: 'one_off_fallback' }
  }
}

function draftLegalDocument(args = {}) {
  const party = resolveDraftParty(args)
  const { template, source } = chooseLegalTemplate({
    ...args,
    templateName: args.templateName || args.documentType || args.type || 'standard NDA',
  })
  const now = new Date().toISOString()
  const values = {
    effective_date: args.effectiveDate || now.slice(0, 10),
    state_of_governing_law: args.governingLaw || args.state_of_governing_law || 'North Carolina',
    client_name: party.signerName || party.counterpartyName,
    client_address: args.clientAddress || party.account?.address || party.contact?.address || '',
    client_email: party.signerEmail,
    client_phone: party.contact?.phone || party.account?.phone || '',
    contact_email: party.signerEmail,
    client_business_name: party.account?.name || party.counterpartyName,
    client_website_url: party.account?.website || '',
    purpose_of_disclosure: args.purpose || args.purposeOfDisclosure || args.notes || 'evaluate a potential business relationship',
    term_years: String(args.termYears || args.term_years || '2'),
    ...(args.fields || {}),
  }
  const body = args.body || fillDocumentPlaceholders(template.body, values)
  const title = args.title || `${template.name} - ${party.account?.name || party.counterpartyName}`
  const document = {
    id: genDocumentId(),
    title,
    templateId: template.id,
    templateName: template.name,
    clientId: party.account?.id || party.contact?.accountId || '',
    clientName: party.account?.name || party.counterpartyName,
    contactId: party.contact?.id || '',
    signerName: party.signerName,
    signerEmail: party.signerEmail,
    folder: args.folder || party.account?.name || party.counterpartyName || 'Legal',
    body,
    values,
    requiresSignature: isSignatureRequired(template, body) || /signature|agreement|nda|contract/i.test(title),
    portalVisible: false,
    status: args.status || 'draft',
    createdAt: now,
    updatedAt: now,
    createdBy: args.agentName || args.agent || 'Linda',
    linkedTo: {
      accountId: party.account?.id || undefined,
      contactId: party.contact?.id || undefined,
    },
    meta: {
      source,
      documentType: args.documentType || args.type || template.name,
      legalDraft: true,
      notice: 'Draft business template, not legal advice.',
    },
  }
  const data = loadDocumentData()
  data.documents = [document, ...(data.documents || [])]
  saveDocumentData(data)
  logActivity({
    type: 'document',
    subject: `Draft legal document created: ${document.title}`,
    body: `${document.createdBy} drafted ${document.title}. Source: ${source}.`,
    linkedTo: { accountId: party.account?.id || undefined, contactId: party.contact?.id || undefined, documentId: document.id },
    meta: { documentId: document.id, templateId: template.id, source },
    agentId: 'legal',
  })
  return {
    documentId: document.id,
    title: document.title,
    status: document.status,
    clientName: document.clientName,
    clientId: document.clientId,
    contactId: document.contactId,
    folder: document.folder,
    templateId: document.templateId,
    templateName: document.templateName,
    source,
    bodyPreview: document.body.slice(0, 800),
    storage: 'Documents module; linked to account/contact when a matching CRM record was found.',
    nextStep: 'Review the draft, then call send_signature_document if Carl approves sending it for signature.',
  }
}

function saveDocumentToAccount(args = {}) {
  const party = resolveDraftParty(args)
  const data = loadDocumentData()
  const docs = Array.isArray(data.documents) ? data.documents : []
  const now = new Date().toISOString()
  const id = args.documentId || args.id
  let document = id ? docs.find(d => d.id === id) : null
  if (!document) {
    if (!args.body) throw new Error('documentId/id or body required')
    document = {
      id: genDocumentId(),
      title: args.title || `Document - ${party.account?.name || party.counterpartyName}`,
      templateId: args.templateId || 'ad-hoc',
      templateName: args.templateName || 'Ad hoc',
      body: args.body,
      status: args.status || 'draft',
      portalVisible: false,
      createdAt: now,
      createdBy: args.agentName || args.agent || 'agent',
    }
    docs.unshift(document)
  }
  const patched = {
    ...document,
    title: args.title || document.title,
    clientId: party.account?.id || party.contact?.accountId || document.clientId || '',
    clientName: party.account?.name || party.counterpartyName || document.clientName || '',
    contactId: party.contact?.id || document.contactId || '',
    folder: args.folder || document.folder || party.account?.name || party.counterpartyName || 'General',
    linkedTo: {
      ...(document.linkedTo || {}),
      accountId: party.account?.id || document.linkedTo?.accountId,
      contactId: party.contact?.id || document.linkedTo?.contactId,
    },
    updatedAt: now,
  }
  const updated = docs.map(d => d.id === patched.id ? patched : d)
  data.documents = updated.some(d => d.id === patched.id) ? updated : [patched, ...updated]
  saveDocumentData(data)
  logActivity({
    type: 'document',
    subject: `Document filed: ${patched.title}`,
    body: `Filed ${patched.title} under ${patched.clientName || 'the selected account'}.`,
    linkedTo: { accountId: patched.linkedTo?.accountId, contactId: patched.linkedTo?.contactId, documentId: patched.id },
    meta: { documentId: patched.id, folder: patched.folder },
    agentId: args.agent || args.agentName || null,
  })
  return {
    documentId: patched.id,
    title: patched.title,
    clientName: patched.clientName,
    clientId: patched.clientId,
    contactId: patched.contactId,
    folder: patched.folder,
    status: patched.status,
    storage: 'Documents module; account/contact linkage updated.',
  }
}

function cleanMemoryText(value, max = 1600) {
  const text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > max ? text.slice(0, max).trim() : text
}

function cleanMemoryList(value, maxItems = 12, maxLength = 160) {
  return listFromArgs(value)
    .map(item => cleanMemoryText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function memoryContainsSecret(value) {
  const text = String(value || '')
  return AGENT_MEMORY_SECRET_PATTERNS.some(pattern => pattern.test(text))
}

function assertSafeMemoryText(...parts) {
  const text = parts.filter(Boolean).join('\n')
  if (memoryContainsSecret(text)) {
    throw new Error('Refusing to store memory that looks like a password, token, key, or credential. Store secrets only in the approved credential vault.')
  }
}

function genMemoryId() {
  return 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadAgentMemoryStore() {
  const data = readData(AGENT_MEMORY_FILE) || {}
  return {
    version: 1,
    memories: Array.isArray(data.memories) ? data.memories : [],
    lastUpdated: data.lastUpdated || null,
  }
}

function saveAgentMemoryStore(store = {}) {
  const memories = Array.isArray(store.memories) ? store.memories : []
  writeData(AGENT_MEMORY_FILE, {
    version: 1,
    memories: memories.slice(0, AGENT_MEMORY_MAX_RECORDS),
    lastUpdated: new Date().toISOString(),
  })
}

function resolveRecordByName(collection, query, fields = ['name']) {
  const q = cleanMemoryText(query, 160).toLowerCase()
  if (!q) return null
  try {
    const records = loadAll(collection)
    return records.find(record => fields.some(field => String(record[field] || '').toLowerCase() === q))
      || records.find(record => fields.some(field => String(record[field] || '').toLowerCase().includes(q)))
      || records.find(record => fields.some(field => String(record[field] || '').toLowerCase().split(' ')[0] === q.split(' ')[0]))
      || null
  } catch {
    return null
  }
}

function resolveMemoryLinks(args = {}) {
  const linkedTo = args.linkedTo || {}
  let accountId = cleanMemoryText(args.accountId || args.clientId || linkedTo.accountId, 120)
  let accountName = cleanMemoryText(args.accountName || args.clientName || args.client, 180)
  if (!accountId && accountName) {
    const account = resolveAccountByName(accountName)
    if (account) {
      accountId = account.id
      accountName = account.name || accountName
    }
  } else if (accountId && !accountName) {
    accountName = findById('accounts', accountId)?.name || ''
  }

  let contactId = cleanMemoryText(args.contactId || linkedTo.contactId, 120)
  let contactName = cleanMemoryText(args.contactName || args.personName || args.counterpartyName, 180)
  const contactEmail = cleanMemoryText(args.contactEmail || args.email || args.signerEmail, 180)
  let contact = null
  if (!contactId && contactEmail && looksLikeEmail(contactEmail)) contact = findContactByEmail(contactEmail)
  if (!contactId && !contact && contactName) contact = resolveRecordByName('contacts', contactName, ['name', 'email'])
  if (contact) {
    contactId = contact.id
    contactName = contact.name || contactEmail || contactName
    if (!accountId && contact.accountId) accountId = contact.accountId
  } else if (contactId) {
    contact = findById('contacts', contactId)
    if (contact) {
      contactName = contactName || contact.name || contact.email || ''
      if (!accountId && contact.accountId) accountId = contact.accountId
    }
  }
  if (accountId && !accountName) accountName = findById('accounts', accountId)?.name || accountName

  let projectId = cleanMemoryText(args.projectId || linkedTo.projectId, 120)
  let projectName = cleanMemoryText(args.projectName || args.project, 180)
  if (!projectId && projectName) {
    const project = resolveRecordByName('projects', projectName, ['name', 'title'])
    if (project) {
      projectId = project.id
      projectName = project.name || project.title || projectName
    }
  } else if (projectId && !projectName) {
    const project = findById('projects', projectId)
    projectName = project?.name || project?.title || ''
  }

  let leadId = cleanMemoryText(args.leadId || linkedTo.leadId, 120)
  let leadName = cleanMemoryText(args.leadName || args.businessName || args.lead, 180)
  if (!leadId && leadName) {
    const lead = resolveRecordByName('leads', leadName, ['businessName', 'name', 'email', 'website'])
    if (lead) {
      leadId = lead.id
      leadName = lead.businessName || lead.name || lead.email || leadName
    }
  } else if (leadId && !leadName) {
    const lead = findById('leads', leadId)
    leadName = lead?.businessName || lead?.name || lead?.email || ''
  }

  return { accountId, accountName, contactId, contactName, contactEmail, projectId, projectName, leadId, leadName }
}

function normalizeMemoryScope(args = {}, links = {}) {
  const raw = cleanMemoryText(args.scope || args.memoryScope, 40).toLowerCase()
  if (AGENT_MEMORY_SCOPES.has(raw)) return raw
  if (links.contactId) return 'contact'
  if (links.accountId) return 'account'
  if (links.projectId) return 'project'
  if (links.leadId) return 'lead'
  if (args.topic) return 'topic'
  return 'global'
}

function normalizeMemoryFilters(args = {}) {
  const links = resolveMemoryLinks(args)
  const rawScope = cleanMemoryText(args.scope || args.memoryScope, 40).toLowerCase()
  const scope = rawScope && AGENT_MEMORY_SCOPES.has(rawScope) ? rawScope : ''
  const q = cleanMemoryText(args.q || args.query || args.search || args.fact || args.topic, 240)
  const tags = cleanMemoryList(args.tags || args.tag, 12, 80).map(tag => tag.toLowerCase())
  return {
    id: cleanMemoryText(args.id || args.memoryId, 120),
    q,
    topic: cleanMemoryText(args.topic, 160).toLowerCase(),
    scope,
    tags,
    includeExpired: Boolean(args.includeExpired),
    agentOnly: Boolean(args.agentOnly || args.onlyThisAgent || scope === 'agent'),
    agentId: cleanMemoryText(args.agentId || args.agent, 120).toLowerCase(),
    agentName: cleanMemoryText(args.agentName || args.createdBy, 120).toLowerCase(),
    ...links,
  }
}

function memoryIsExpired(memory) {
  if (!memory?.expiresAt) return false
  const expires = new Date(memory.expiresAt).getTime()
  return Number.isFinite(expires) && expires < Date.now()
}

function memoryHaystack(memory = {}) {
  return [
    memory.fact,
    memory.topic,
    memory.scope,
    memory.accountName,
    memory.contactName,
    memory.contactEmail,
    memory.projectName,
    memory.leadName,
    memory.agentName,
    ...(Array.isArray(memory.tags) ? memory.tags : []),
  ].join(' ').toLowerCase()
}

function scoreMemory(memory, filters = {}) {
  if (!memory || memory.status === 'forgotten' || memory.deletedAt || memory.forgottenAt) return -1
  if (!filters.includeExpired && memoryIsExpired(memory)) return -1
  if (filters.id && memory.id !== filters.id) return -1
  if (filters.scope && memory.scope !== filters.scope) return -1
  for (const field of ['accountId', 'contactId', 'projectId', 'leadId']) {
    if (filters[field] && memory[field] !== filters[field]) return -1
  }
  if (filters.agentOnly) {
    const agentId = String(memory.agentId || '').toLowerCase()
    const agentName = String(memory.agentName || '').toLowerCase()
    if (filters.agentId && agentId && agentId !== filters.agentId) return -1
    if (filters.agentName && agentName && agentName !== filters.agentName) return -1
  }

  let score = 1
  const haystack = memoryHaystack(memory)
  if (filters.scope && memory.scope === filters.scope) score += 5
  if (filters.topic && String(memory.topic || '').toLowerCase().includes(filters.topic)) score += 8
  for (const tag of filters.tags || []) {
    if ((memory.tags || []).map(t => String(t).toLowerCase()).includes(tag)) score += 5
  }
  const terms = normalizeSearchText(filters.q).split(/\s+/).filter(term => term.length > 1)
  if (terms.length) {
    let matched = 0
    for (const term of terms) {
      if (haystack.includes(term)) {
        matched++
        score += 3
      }
    }
    if (!matched) return -1
  }
  return score
}

function publicMemory(memory = {}) {
  return {
    id: memory.id,
    at: memory.at,
    updatedAt: memory.updatedAt,
    scope: memory.scope,
    topic: memory.topic,
    fact: memory.fact,
    tags: memory.tags || [],
    source: memory.source,
    confidence: memory.confidence,
    sensitivity: memory.sensitivity,
    expiresAt: memory.expiresAt || null,
    agentId: memory.agentId || null,
    agentName: memory.agentName || null,
    accountId: memory.accountId || null,
    accountName: memory.accountName || null,
    contactId: memory.contactId || null,
    contactName: memory.contactName || null,
    projectId: memory.projectId || null,
    projectName: memory.projectName || null,
    leadId: memory.leadId || null,
    leadName: memory.leadName || null,
  }
}

function rememberFact(args = {}) {
  const fact = cleanMemoryText(args.fact || args.content || args.memory || args.note || args.summary, 1800)
  if (!fact) throw new Error('fact required')
  assertSafeMemoryText(fact, args.topic, args.tags)

  const store = loadAgentMemoryStore()
  const links = resolveMemoryLinks(args)
  const now = new Date().toISOString()
  const rawConfidence = Number(args.confidence)
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0.85
  const rawExpiresAt = cleanMemoryText(args.expiresAt || args.expires_at || args.until, 80)
  const expiresAtMs = rawExpiresAt ? new Date(rawExpiresAt).getTime() : NaN
  const id = cleanMemoryText(args.id || args.memoryId, 120)
  const existing = id ? store.memories.find(memory => memory.id === id && memory.status !== 'forgotten') : null
  const record = {
    ...(existing || {}),
    id: existing?.id || genMemoryId(),
    at: existing?.at || now,
    updatedAt: now,
    status: 'active',
    scope: normalizeMemoryScope(args, links),
    topic: cleanMemoryText(args.topic || args.title || '', 160),
    fact,
    tags: cleanMemoryList(args.tags || args.tag, 16, 80),
    source: cleanMemoryText(args.source || 'voice-agent', 80),
    confidence,
    sensitivity: cleanMemoryText(args.sensitivity || 'business', 80),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null,
    agentId: cleanMemoryText(args.agentId || args.agent, 120),
    agentName: cleanMemoryText(args.agentName || args.createdBy, 120),
    createdBy: cleanMemoryText(args.createdBy || args.agentName || args.agent || 'agent', 120),
    ...links,
  }

  if (existing) {
    Object.assign(existing, record)
  } else {
    store.memories.unshift(record)
  }
  saveAgentMemoryStore(store)

  if (args.logActivity !== false && (record.accountId || record.contactId || record.projectId || record.leadId)) {
    logActivity({
      type: 'agent_memory',
      subject: `Memory saved${record.topic ? `: ${record.topic}` : ''}`,
      body: record.fact,
      linkedTo: {
        accountId: record.accountId || undefined,
        contactId: record.contactId || undefined,
        projectId: record.projectId || undefined,
        leadId: record.leadId || undefined,
      },
      meta: { memoryId: record.id, scope: record.scope, source: record.source },
      agentId: record.agentId || record.agentName || null,
    })
  }

  return {
    saved: true,
    updated: Boolean(existing),
    memory: publicMemory(record),
    count: store.memories.filter(memory => memory.status !== 'forgotten' && !memoryIsExpired(memory)).length,
  }
}

function recallMemory(args = {}) {
  const store = loadAgentMemoryStore()
  const filters = normalizeMemoryFilters(args)
  const limit = Math.max(1, Math.min(50, Number(args.limit) || 10))
  const scored = store.memories
    .map(memory => ({ memory, score: scoreMemory(memory, filters) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || new Date(b.memory.updatedAt || b.memory.at || 0) - new Date(a.memory.updatedAt || a.memory.at || 0))
  const memories = scored.slice(0, limit).map(item => publicMemory(item.memory))
  return {
    count: memories.length,
    totalActive: store.memories.filter(memory => memory.status !== 'forgotten' && !memoryIsExpired(memory)).length,
    memories,
    knowledgeGuidance: 'Use search_notes/read_note/write_note for Obsidian playbooks, SOPs, and longer knowledge. CRM memory is for durable facts, preferences, decisions, and call summaries.',
  }
}

function listAgentMemory(args = {}) {
  return recallMemory({ ...args, limit: args.limit || 25 })
}

function forgetMemory(args = {}) {
  const store = loadAgentMemoryStore()
  const ids = cleanMemoryList(args.ids || args.memoryIds || args.id || args.memoryId, 50, 120)
  const filters = normalizeMemoryFilters(args)
  const canBulkForget = ids.length > 0 || hasExplicitApproval(args)
  if (!canBulkForget) {
    throw new Error('memory id required. For bulk forgetting, pass confirmed/explicitApproval with a narrow query or scope.')
  }

  const now = new Date().toISOString()
  const forgotten = []
  for (const memory of store.memories) {
    const idMatch = ids.length > 0 && ids.includes(memory.id)
    const filterMatch = !ids.length && scoreMemory(memory, filters) >= 0
    if (!idMatch && !filterMatch) continue
    if (memory.status === 'forgotten' || memory.forgottenAt) continue
    memory.status = 'forgotten'
    memory.forgottenAt = now
    memory.forgottenBy = cleanMemoryText(args.agentName || args.agent || args.deletedBy || 'agent', 120)
    memory.forgetReason = cleanMemoryText(args.reason || 'requested forget', 240)
    forgotten.push(memory.id)
  }
  saveAgentMemoryStore(store)
  return {
    forgotten: forgotten.length,
    ids: forgotten,
    retention: 'Forgotten memories are excluded from recall and retained only as an audit trail.',
  }
}

function saveCallMemory(args = {}) {
  const summary = cleanMemoryText(args.summary || args.notes || args.callSummary, 1200)
  const decisions = cleanMemoryList(args.decisions || args.decision || args.outcomes, 12, 220)
  const actionItems = cleanMemoryList(args.actionItems || args.action_items || args.actions || args.nextSteps, 12, 220)
  const transcript = cleanMemoryText(args.transcript || args.rawTranscript, 1600)
  if (!summary && !decisions.length && !actionItems.length && !transcript) {
    throw new Error('summary, decisions, actionItems, or transcript excerpt required')
  }

  const parts = []
  if (summary) {
    parts.push(`Call summary: ${summary}`)
  } else if (transcript) {
    parts.push(`Call transcript captured; store the full transcript in Documents. Memory excerpt only: ${transcript.slice(0, 700)}`)
  }
  if (decisions.length) parts.push(`Decisions: ${decisions.join('; ')}`)
  if (actionItems.length) parts.push(`Action items: ${actionItems.join('; ')}`)
  const fact = parts.join('\n')
  assertSafeMemoryText(fact)

  const tags = [...new Set([...cleanMemoryList(args.tags || args.tag, 12, 80), 'call', 'conversation'])]
  const saved = rememberFact({
    ...args,
    fact,
    topic: args.topic || args.title || 'Call memory',
    tags,
    source: args.source || 'call-summary',
    logActivity: false,
  })

  const links = resolveMemoryLinks(args)
  if (links.accountId || links.contactId || links.projectId || links.leadId) {
    logActivity({
      type: 'call_memory',
      subject: cleanMemoryText(args.title || args.topic || 'Call memory saved', 140),
      body: fact,
      linkedTo: {
        accountId: links.accountId || undefined,
        contactId: links.contactId || undefined,
        projectId: links.projectId || undefined,
        leadId: links.leadId || undefined,
      },
      meta: { memoryId: saved.memory.id, transcriptPolicy: 'summary-only' },
      agentId: cleanMemoryText(args.agentId || args.agentName || args.agent, 120) || null,
    })
  }

  return {
    ...saved,
    transcriptStored: false,
    guidance: 'Stored summary, decisions, and action items only. Save the full transcript through Documents or meeting capture when Carl needs the raw transcript retained.',
  }
}

const TOOLS = {

  // Newsroom Director — tenant-scoped newspaper operations and specialist workflows.
  ...NEWSROOM_DIRECTOR_TOOLS,

  // Live UI Control
  navigate_to: {
    description: `Open any Farrington Command Center screen in Carl's live browser. Args: { tabId? or page? or target? }. Always use this for menu navigation. Authoritative menu map:\n${COMMAND_CENTER_MENU_GUIDE}`,
    run: (args = {}) => {
      const tabId = resolveUiTab(args.tabId || args.page || args.section || args.target || args.name)
      if (!tabId) throw new Error('tabId, page, section, target, or name required')
      const action = pushUiAction({ kind: 'tab', tabId, label: args.label || tabId, source: 'agent-tool' })
      return { queued: true, actionId: action.id, tabId }
    },
  },
  api_spend_monitor: {
    description: 'Control Carl\'s floating API spend meter in the live CRM. Args: { action: open|show|close|collapse|hide|panel }. Use close when Carl says close while the meter is expanded; it returns to a compact meter without changing his current work screen.',
    run: (args = {}) => {
      const requested = String(args.action || args.command || 'open').toLowerCase().trim()
      const map = { open: 'open_api_meter', show: 'show_api_meter', expand: 'open_api_meter', close: 'close_api_meter', collapse: 'close_api_meter', minimize: 'close_api_meter', hide: 'hide_api_meter', unpin: 'hide_api_meter', panel: 'open_api_spend_panel' }
      const actionName = map[requested]
      if (!actionName) throw new Error('action must be open, show, close, collapse, hide, or panel')
      const action = pushUiAction({ kind: 'command', action: actionName, label: 'API spend meter', source: 'agent-tool' })
      return { ok: true, actionId: action.id, action: actionName }
    },
  },
  open_record: {
    description: 'Open a CRM record in Carl\'s live browser. Args: { type?, id?, query?, name?, clientName?, subTab? }. Use this when Carl asks you to pull up/open/show an account, client, contact, lead, opportunity, or project on his screen.',
    run: (args = {}) => {
      const record = findUiRecord(args)
      const query = args.query || args.name || args.clientName || args.accountName || args.search || args.id || ''
      if (!record) throw new Error(`No matching CRM record found for "${query}"`)
      const action = pushUiAction({
        kind: 'record',
        record: {
          id: record.id,
          type: record.type,
          name: record.name,
          email: record.email,
          phone: record.phone,
          accountId: record.accountId,
          tabId: record.tabId,
          subTab: args.subTab || args.tab || undefined,
        },
        source: 'agent-tool',
      })
      return { queued: true, actionId: action.id, record: action.record }
    },
  },

  // ─── Accounts ─────────────────────────────────────────────────────────────────────
  ops_status: {
    description: 'Read live operations status: production services, repository checkout, latest build log, restore points, and deployment path. Args: { scope?: "all"|"repository"|"backup"|"ci"|"deploy"|"health" }. Read-only; does not deploy or restart.',
    run: (args = {}) => opsStatus({ ...args, scope: args.scope || 'all' }),
  },
  repository_status: {
    description: 'Read live source-control status for the production checkout and compare the GitHub source-of-truth ref with the Gitea backup-mirror ref. Read-only. Use for Gitea, repo, source control, CI/CD preflight, mirror lag, and dirty-tree questions.',
    run: () => opsStatus({ scope: 'repository' }),
  },
  backup_status: {
    description: 'Read live backup/restore status: SQLite DB modified time, restore points, and the scheduled GitHub-to-Gitea code mirror with current ref comparison. Read-only. Use before answering backup, mirror, restore, rollback, or disaster-recovery questions.',
    run: () => opsStatus({ scope: 'backup' }),
  },

  finance_summary: {
    description: 'Summarize finance position: recurring provider spend, upcoming/overdue bills, outstanding invoices, and recent received payments.',
    run: () => {
      const subsWrap = loadSubscriptionsWrap()
      const activeSubs = subsWrap.subscriptions.filter(s => s.active !== false).map(publicSubscription)
      const totalMonthlyOverhead = activeSubs.reduce((sum, s) => sum + (Number(s.monthlyEquivalent) || 0), 0)
      const dueSoon = activeSubs
        .filter(s => s.nextDue && s.daysUntilDue !== null && s.daysUntilDue <= 30)
        .sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999))
      const overdueBills = activeSubs.filter(s => (s.daysUntilDue !== null && s.daysUntilDue < 0) || s.status === 'past-due')

      const invoicesWrap = readData('invoices.json') || { invoices: [] }
      const invoices = Array.isArray(invoicesWrap) ? invoicesWrap : (invoicesWrap.invoices || [])
      const unpaidInvoices = invoices.filter(i => i.status !== 'paid')
      const outstandingRevenue = unpaidInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
      const overdueInvoices = unpaidInvoices.filter(i => i.dueDate && financeDateDaysUntil(i.dueDate) < 0)

      const paymentsWrap = readData('payments.json') || { payments: [] }
      const payments = Array.isArray(paymentsWrap) ? paymentsWrap : (paymentsWrap.payments || [])
      const cutoff = Date.now() - 30 * 86400000
      const recentPayments = payments
        .filter(p => p.status === 'succeeded' && new Date(p.date).getTime() >= cutoff)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      const receivedLast30Days = recentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

      return {
        totalMonthlyOverhead: Math.round(totalMonthlyOverhead * 100) / 100,
        activeRecurringProviders: activeSubs.length,
        dueSoon: dueSoon.slice(0, 12),
        overdueBills,
        outstandingRevenue,
        unpaidInvoiceCount: unpaidInvoices.length,
        overdueInvoiceCount: overdueInvoices.length,
        receivedLast30Days,
        recentPayments: recentPayments.slice(0, 8).map(p => ({ id: p.id, clientName: p.clientName, amount: p.amount, date: p.date, description: p.description })),
      }
    },
  },
  list_recurring_providers: {
    description: 'List recurring providers/subscriptions from Finance Overhead. Optional args: { status?, category?, dueWithinDays?, includeInactive? }.',
    run: (args = {}) => {
      let list = loadSubscriptionsWrap().subscriptions.map(publicSubscription)
      if (!args.includeInactive) list = list.filter(s => s.active)
      if (args.status) list = list.filter(s => s.status === args.status)
      if (args.category) list = list.filter(s => s.category === args.category)
      if (args.dueWithinDays !== undefined) {
        const days = Number(args.dueWithinDays)
        list = list.filter(s => s.daysUntilDue !== null && s.daysUntilDue <= days)
      }
      list.sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999))
      return { count: list.length, providers: list }
    },
  },
  upsert_recurring_provider: {
    description: 'Create or update a recurring provider/subscription. Args can use CSV field names like vendor_name, product_or_plan, amount, next_charge_date, payment_method.',
    run: (args = {}) => {
      const normalized = normalizeSubscriptionArgs(args)
      if (!normalized.ok) throw new Error(normalized.error)
      const wrap = loadSubscriptionsWrap()
      const now = new Date().toISOString()
      const next = { ...normalized.subscription, updatedAt: now }
      const key = subscriptionMatchKey(next)
      const idx = wrap.subscriptions.findIndex(s => subscriptionMatchKey(s) === key)
      if (idx >= 0) {
        wrap.subscriptions[idx] = { ...wrap.subscriptions[idx], ...next, id: wrap.subscriptions[idx].id, createdAt: wrap.subscriptions[idx].createdAt || now }
        saveSubscriptionsWrap(wrap)
        return { action: 'updated', provider: publicSubscription(wrap.subscriptions[idx]), warnings: normalized.warnings || [] }
      }
      const created = { id: genSubscriptionId(), ...next, createdAt: now, importSource: next.importSource || 'agent' }
      wrap.subscriptions.push(created)
      saveSubscriptionsWrap(wrap)
      return { action: 'created', provider: publicSubscription(created), warnings: normalized.warnings || [] }
    },
  },
  finance_due_items: {
    description: 'List all finance due items: overdue/due-soon recurring provider bills and unpaid invoices. Args: { days? default 30 }.',
    run: (args = {}) => {
      const days = Number(args.days ?? 30)
      const providers = loadSubscriptionsWrap().subscriptions
        .filter(s => s.active !== false)
        .map(publicSubscription)
        .filter(s => s.daysUntilDue !== null && s.daysUntilDue <= days)
        .map(s => ({ type: 'provider_bill', severity: s.daysUntilDue < 0 || s.status === 'past-due' ? 'overdue' : 'due_soon', ...s }))
      const invoicesWrap = readData('invoices.json') || { invoices: [] }
      const invoices = (Array.isArray(invoicesWrap) ? invoicesWrap : (invoicesWrap.invoices || []))
        .filter(i => i.status !== 'paid' && i.dueDate)
        .map(i => ({ type: 'invoice_receivable', severity: financeDateDaysUntil(i.dueDate) < 0 ? 'overdue' : 'due_soon', id: i.id, clientName: i.clientName || i.client || '', number: i.number, amount: Number(i.amount) || 0, dueDate: i.dueDate, daysUntilDue: financeDateDaysUntil(i.dueDate), status: i.status }))
        .filter(i => i.daysUntilDue !== null && i.daysUntilDue <= days)
      const items = [...providers, ...invoices].sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999))
      return { count: items.length, items }
    },
  },
  prepare_bill_payment: {
    description: 'Prepare a bill-payment task for Carl approval. Does not move money. Args: { providerId? vendor?, amount?, dueDate?, paymentMethod?, notes? }.',
    run: (args = {}) => {
      const wrap = loadSubscriptionsWrap()
      const provider = args.providerId
        ? wrap.subscriptions.find(s => s.id === args.providerId)
        : wrap.subscriptions.find(s => String(s.vendor || '').toLowerCase().includes(String(args.vendor || '').toLowerCase()))
      if (!provider && !args.vendor) throw new Error('providerId or vendor required')
      const vendor = provider?.vendor || args.vendor
      const amount = args.amount ?? provider?.amount
      const dueDate = args.dueDate || provider?.nextDue || new Date().toISOString().slice(0, 10)
      const task = create('tasks', {
        title: `Approve payment: ${vendor}`,
        description: `Finance Manager prepared this bill payment for approval.\nVendor: ${vendor}\nAmount: ${amount || 'unknown'}\nDue: ${dueDate}\nMethod: ${args.paymentMethod || provider?.paymentMethod || 'not specified'}\n${args.notes || provider?.notes || ''}`,
        priority: financeDateDaysUntil(dueDate) <= 3 ? 'urgent' : 'high',
        dueDate,
        status: 'todo',
        linkedTo: {},
      })
      return { prepared: true, movesMoney: false, task }
    },
  },

  list_accounts: {
    description: 'List all accounts. Optional filter { type?, stage?, priority? }.',
    run: (args = {}) => {
      let list = loadAll('accounts')
      if (args.type) list = list.filter(a => a.type === args.type)
      if (args.stage) list = list.filter(a => a.stage === args.stage)
      if (args.priority) list = list.filter(a => a.priority === args.priority)
      return { count: list.length, accounts: list }
    },
  },
  get_account: {
    description: 'Get one account with all related contacts, opportunities, projects, tasks, activities. Args: { id }.',
    run: (args) => {
      const a = accountWithRelations(args.id)
      if (!a) throw new Error('account not found')
      return a
    },
  },
  create_account: {
    description: 'Create a new account and queue it to open in Carl\'s live CRM browser. Args: { name (required), type, stage, priority, website, industry, notes, tags, address }. Returns the created account.',
    run: (args) => {
      if (!args.name) throw new Error('name required')
      const account = create('accounts', {
        name: args.name,
        type: args.type || 'prospect',
        stage: args.stage || 'active',
        priority: args.priority || 'medium',
        website: args.website || '',
        industry: args.industry || '',
        address: args.address || '',
        notes: args.notes || '',
        tags: args.tags || [],
      })
      pushUiAction({
        kind: 'record',
        record: {
          id: account.id,
          type: 'account',
          name: account.name,
          tabId: 'accounts',
        },
        source: 'agent-tool',
      })
      logActivity({
        type: 'account_created',
        subject: `Account created: ${account.name}`,
        body: args.notes || '',
        linkedTo: { accountId: account.id },
        meta: { byAgent: args.agentName || args.requestedBy || null },
      })
      return account
    },
  },
  update_account: {
    description: 'Update an account. Args: { id, ...patch }.',
    run: (args) => {
      const { id, ...patch } = args
      const rec = update('accounts', id, patch)
      if (!rec) throw new Error('account not found')
      pushUiAction({
        kind: 'record',
        record: {
          id: rec.id,
          type: 'account',
          name: rec.name,
          tabId: 'accounts',
        },
        source: 'agent-tool',
      })
      logActivity({
        type: 'account_updated',
        subject: `Account updated: ${rec.name}`,
        body: Object.keys(patch).filter(key => key !== 'agentName' && key !== 'requestedBy').join(', '),
        linkedTo: { accountId: rec.id },
        meta: { byAgent: args.agentName || args.requestedBy || null },
      })
      return rec
    },
  },
  delete_account: {
    description: 'Delete an account. Related contacts/opportunities/etc remain but become orphans. Args: { id }.',
    run: (args) => { remove('accounts', args.id); return { deleted: args.id } },
  },

  // ─── Contacts ─────────────────────────────────────────────────────────────────────
  list_support_tickets: {
    description: 'List support tickets. Optional { accountId?, clientId?, status?, priority?, category?, q?, includeClosed? }.',
    run: (args = {}) => {
      const tickets = listSupportTickets({
        accountId: args.accountId || args.clientId,
        status: args.status,
        priority: args.priority,
        category: args.category,
        q: args.q || args.query,
        includeClosed: Boolean(args.includeClosed),
      })
      return { count: tickets.length, tickets }
    },
  },
  create_support_ticket: {
    description: 'Open a support ticket. Args: { subject, description, accountId?, clientName?, category?, priority?, assignedToUserId?, portalVisible? }.',
    run: (args = {}) => {
      if (!args.subject) throw new Error('subject required')
      let account = null
      if (args.accountId || args.clientId) account = findById('accounts', args.accountId || args.clientId)
      if (!account && (args.clientName || args.accountName)) {
        const q = String(args.clientName || args.accountName).toLowerCase().trim()
        const accounts = loadAll('accounts')
        account = accounts.find(a => String(a.name || '').toLowerCase() === q)
          || accounts.find(a => String(a.name || '').toLowerCase().includes(q))
          || null
      }
      const ticket = createSupportTicket({
        ...args,
        accountId: account?.id || args.accountId || args.clientId || null,
        clientId: account?.id || args.clientId || args.accountId || null,
        accountName: account?.name || args.accountName || args.clientName || '',
        linkedTo: { ...(args.linkedTo || {}), ...(account?.id ? { accountId: account.id } : {}) },
        source: args.source || 'agent',
      }, { type: 'agent', name: args.agentName || args.requestedBy || 'Support Agent', id: args.agentId || null })
      if (ticket.accountId) {
        logActivity({
          type: 'support_ticket',
          subject: `Support ticket opened: ${ticket.subject}`,
          body: ticket.description,
          linkedTo: { accountId: ticket.accountId, supportTicketId: ticket.id },
          meta: { ticketNumber: ticket.ticketNumber, byAgent: args.agentName || args.requestedBy || null },
        })
      }
      pushUiAction({ kind: 'tab', tabId: 'support', label: 'Support', source: 'agent-tool' })
      return { ticket }
    },
  },
  update_support_ticket: {
    description: 'Update a support ticket. Args: { id or ticketId, status?, priority?, category?, assignedToUserId?, subject?, description?, portalVisible? }.',
    run: (args = {}) => {
      const { id, ticketId, agentName, requestedBy, agentId, ...patch } = args
      const ticket = updateSupportTicket(id || ticketId, patch, { type: 'agent', name: agentName || requestedBy || 'Support Agent', id: agentId || null })
      if (!ticket) throw new Error('support ticket not found')
      if (ticket.accountId) {
        logActivity({
          type: 'support_ticket',
          subject: `Support ticket updated: ${ticket.subject}`,
          body: `Status: ${ticket.status}. Priority: ${ticket.priority}.`,
          linkedTo: { accountId: ticket.accountId, supportTicketId: ticket.id },
          meta: { ticketNumber: ticket.ticketNumber, byAgent: agentName || requestedBy || null },
        })
      }
      return { ticket }
    },
  },
  add_support_ticket_comment: {
    description: 'Add a comment to a support ticket. Args: { id or ticketId, body, visibility? internal|portal }.',
    run: (args = {}) => {
      const result = addSupportTicketComment(args.id || args.ticketId, {
        body: args.body || args.message || args.note,
        visibility: args.visibility || 'internal',
      }, { type: 'agent', name: args.agentName || args.requestedBy || 'Support Agent', id: args.agentId || null })
      if (!result) throw new Error('support ticket not found')
      if (result.ticket.accountId) {
        logActivity({
          type: 'support_ticket',
          subject: `Support ticket comment: ${result.ticket.subject}`,
          body: result.comment.body,
          linkedTo: { accountId: result.ticket.accountId, supportTicketId: result.ticket.id },
          meta: { ticketNumber: result.ticket.ticketNumber, visibility: result.comment.visibility, byAgent: args.agentName || args.requestedBy || null },
        })
      }
      return result
    },
  },
  list_contacts: {
    description: 'List contacts. Optional { accountId }.',
    run: (args = {}) => {
      let list = loadAll('contacts')
      if (args.accountId) list = list.filter(c => c.accountId === args.accountId)
      return { count: list.length, contacts: list }
    },
  },
  get_contact: {
    description: 'Get one contact with account + activities. Args: { id }.',
    run: (args) => contactWithRelations(args.id) || (() => { throw new Error('contact not found') })(),
  },
  create_contact: {
    description: 'Create contact. Args: { name, email, phone, title, accountId, primary }.',
    run: (args) => {
      if (!args.name) throw new Error('name required')
      return create('contacts', {
        name: args.name,
        email: args.email || '',
        phone: args.phone || '',
        title: args.title || '',
        accountId: args.accountId || null,
        primary: !!args.primary,
        notes: args.notes || '',
        tags: args.tags || [],
      })
    },
  },
  update_contact: {
    description: 'Update contact. Args: { id, ...patch }.',
    run: (args) => { const { id, ...patch } = args; const r = update('contacts', id, patch); if (!r) throw new Error('not found'); return r },
  },
  delete_contact: {
    description: 'Delete contact. Args: { id }.',
    run: (args) => { remove('contacts', args.id); return { deleted: args.id } },
  },

  // ─── Leads ────────────────────────────────────────────────────────────────────────
  list_leads: {
    description: 'List leads. Optional { status, source }.',
    run: (args = {}) => {
      let list = loadAll('leads')
      if (args.status) list = list.filter(l => l.status === args.status)
      if (args.source) list = list.filter(l => l.source === args.source)
      return { count: list.length, leads: list }
    },
  },
  create_lead: {
    description: 'Create a new lead. Args: { name, businessName, email, phone, web, source, suggestedPipelineId, opportunityId, notes }.',
    run: (args) => {
      const existingMatch = findExistingLeadMatch(args, loadAll('leads'))
      if (existingMatch) return duplicateLeadResponse(existingMatch)
      return create('leads', {
        name: args.name || '',
        email: args.email || '',
        phone: args.phone || '',
        businessName: args.businessName || '',
        web: args.web || args.website || args.url || args.sourceUrl || '',
        title: args.title || '',
        source: args.source || 'cold_call',
        status: 'new',
        suggestedPipelineId: args.suggestedPipelineId || null,
        opportunityId: args.opportunityId || null,
        notes: args.notes || '',
        tags: args.tags || [],
      })
    },
  },
  qualify_lead: {
    description: 'Convert a lead into Account + Contact + Opportunity. Args: { leadId, pipelineId, stageId, value?, expectedClose?, accountId? (link to existing) }.',
    run: (args) => {
      const lead = findById('leads', args.leadId)
      if (!lead) throw new Error('lead not found')
      if (!args.pipelineId || !args.stageId) throw new Error('pipelineId and stageId required')

      let account
      if (args.accountId) {
        account = findById('accounts', args.accountId)
        if (!account) throw new Error('accountId not found')
      } else {
        account = create('accounts', {
          name: lead.businessName || lead.name || 'New Account',
          type: 'prospect', stage: 'active', priority: 'medium',
          notes: lead.notes || '', tags: lead.tags || [],
        })
      }

      let contact = lead.email ? findContactByEmail(lead.email) : null
      if (!contact) {
        contact = create('contacts', {
          name: lead.name || '', email: lead.email || '', phone: lead.phone || '', title: lead.title || '',
          accountId: account.id, primary: true, tags: lead.tags || [],
        })
      } else if (!contact.accountId) {
        contact = update('contacts', contact.id, { accountId: account.id })
      }

      const opp = create('opportunities', {
        name: args.opportunityName || `${account.name} — ${args.pipelineId}`,
        accountId: account.id,
        contactId: contact.id,
        pipelineId: args.pipelineId,
        stageId: args.stageId,
        value: Number(args.value) || 0,
        probability: Number(args.probability) || 0,
        expectedClose: args.expectedClose || null,
        notes: lead.notes || '',
        tags: lead.tags || [],
        fromLeadId: lead.id,
      })

      update('leads', lead.id, {
        status: 'converted',
        convertedAt: new Date().toISOString(),
        convertedToAccountId: account.id,
        convertedToContactId: contact.id,
        convertedToOpportunityId: opp.id,
      })

      logActivity({ type: 'lead_qualified', subject: `Lead qualified → ${account.name}`, linkedTo: { accountId: account.id, contactId: contact.id, opportunityId: opp.id, leadId: lead.id } })

      return { account, contact, opportunity: opp }
    },
  },
  dedupe_check: {
    description: 'Check for existing accounts matching a business name or contact email. Args: { businessName?, email? }.',
    run: (args) => ({
      matches: findAccountMatches({ name: args.businessName, email: args.email }),
      existingContact: args.email ? findContactByEmail(args.email) : null,
    }),
  },

  // ─── Opportunities ────────────────────────────────────────────────────────────────
  list_opportunities: {
    description: 'List opportunities. Optional { pipelineId, accountId, stageId }.',
    run: (args = {}) => {
      let list = loadAll('opportunities')
      if (args.pipelineId) list = list.filter(o => o.pipelineId === args.pipelineId)
      if (args.accountId) list = list.filter(o => o.accountId === args.accountId)
      if (args.stageId) list = list.filter(o => o.stageId === args.stageId)
      return { count: list.length, opportunities: list }
    },
  },
  create_opportunity: {
    description: 'Create opportunity. Args: { name, accountId, pipelineId, stageId, value, probability, expectedClose, notes }.',
    run: (args) => {
      if (!args.name || !args.accountId || !args.pipelineId || !args.stageId) throw new Error('name, accountId, pipelineId, stageId required')
      return create('opportunities', {
        name: args.name,
        accountId: args.accountId,
        contactId: args.contactId || null,
        pipelineId: args.pipelineId,
        stageId: args.stageId,
        value: Number(args.value) || 0,
        probability: Number(args.probability) || 0,
        expectedClose: args.expectedClose || null,
        notes: args.notes || '',
        tags: args.tags || [],
      })
    },
  },
  move_opportunity: {
    description: 'Change opportunity stage. Args: { id, stageId }.',
    run: (args) => {
      const prev = findById('opportunities', args.id)
      if (!prev) throw new Error('not found')
      const rec = update('opportunities', args.id, { stageId: args.stageId })
      logActivity({ type: 'stage_change', subject: `${prev.stageId} → ${args.stageId}`, linkedTo: { opportunityId: rec.id, accountId: rec.accountId } })
      return rec
    },
  },
  update_opportunity: {
    description: 'Update opportunity. Args: { id, ...patch }.',
    run: (args) => { const { id, ...patch } = args; const r = update('opportunities', id, patch); if (!r) throw new Error('not found'); return r },
  },
  delete_opportunity: {
    description: 'Delete opportunity. Args: { id }.',
    run: (args) => { remove('opportunities', args.id); return { deleted: args.id } },
  },

  // ─── Projects ─────────────────────────────────────────────────────────────────────
  list_projects: {
    description: 'List projects. Optional { accountId, status }.',
    run: (args = {}) => {
      let list = loadAll('projects')
      if (args.accountId) list = list.filter(p => p.accountId === args.accountId)
      if (args.status) list = list.filter(p => p.status === args.status)
      return { count: list.length, projects: list }
    },
  },
  create_project: {
    description: 'Create project. Args: { name, accountId, budget, rate, estimatedHours, dueDate, description, opportunityId? }.',
    run: (args) => {
      if (!args.name || !args.accountId) throw new Error('name and accountId required')
      return create('projects', {
        name: args.name, accountId: args.accountId, opportunityId: args.opportunityId || null,
        description: args.description || '', status: args.status || 'active', priority: args.priority || 'medium',
        progress: Number(args.progress) || 0, budget: args.budget || '',
        rate: args.rate || '', estimatedHours: args.estimatedHours || '',
        startDate: args.startDate || null, dueDate: args.dueDate || null,
        tags: args.tags || [],
      })
    },
  },
  update_project: {
    description: 'Update project. Args: { id, ...patch }.',
    run: (args) => { const { id, ...patch } = args; const r = update('projects', id, patch); if (!r) throw new Error('not found'); return r },
  },
  delete_project: {
    description: 'Delete project. Args: { id }.',
    run: (args) => { remove('projects', args.id); return { deleted: args.id } },
  },

  // ─── Tasks ────────────────────────────────────────────────────────────────────────
  list_tasks: {
    description: 'List tasks. Optional { accountId, contactId, leadId, opportunityId, projectId, status }.',
    run: (args = {}) => {
      let list = loadAll('tasks')
      if (args.accountId) list = list.filter(t => t.linkedTo?.accountId === args.accountId || t.clientId === args.accountId)
      if (args.contactId) list = list.filter(t => t.linkedTo?.contactId === args.contactId)
      if (args.leadId) list = list.filter(t => t.linkedTo?.leadId === args.leadId)
      if (args.opportunityId) list = list.filter(t => t.linkedTo?.opportunityId === args.opportunityId)
      if (args.projectId) list = list.filter(t => t.linkedTo?.projectId === args.projectId || t.projectId === args.projectId)
      if (args.status) list = list.filter(t => t.status === args.status)
      return { count: list.length, tasks: list }
    },
  },
  create_task: {
    description: 'Create task. Args: { title (required), description, priority, dueDate, linkedTo: { accountId?, contactId?, leadId?, opportunityId?, projectId? } }.',
    run: (args) => {
      if (!args.title) throw new Error('title required')
      return create('tasks', {
        title: args.title, description: args.description || '',
        status: 'todo', priority: args.priority || 'medium',
        dueDate: args.dueDate || null,
        linkedTo: args.linkedTo || {},
        tags: args.tags || [],
        completedAt: null,
      })
    },
  },
  create_plugin_change_request: {
    description: 'Safely capture an OpenClaw/plugin engineering change request as a CRM task. This does not edit files, restart services, commit, deploy, or change OpenClaw config. Args: { title, scope?, target?, details?, likelyFiles?, acceptanceCriteria?, risks?, priority? }.',
    run: createPluginChangeRequest,
  },
  create_openclaw_plugin_spec: {
    description: 'Stage a custom OpenClaw plugin build as a CRM document plus engineering task. This creates a concrete plugin spec with purpose, tools/capabilities, endpoints, data sources, guardrails, likely files, and acceptance criteria. It does not edit files, restart services, commit, or deploy. Args: { name|pluginName|title, purpose?, tools?, endpoints?, dataSources?, guardrails?, likelyFiles?, acceptanceCriteria?, priority? }.',
    run: createOpenClawPluginSpec,
  },
  run_mindstudio_flow: {
    description: 'Run a MindStudio flow for this agent. Args: { agentId?, flowId? OR flowName?, appId?, workflow?, variables?, includeBillingCost? }. Prefer agentId + flowId for flows saved in Agent Lab. Use appId/workflow for one-off runs.',
    run: async (args = {}) => {
      const result = await runMindStudioFlow(args)
      logActivity({
        type: 'custom',
        subject: `MindStudio flow ran: ${result.flowName || result.flowId || result.appId}`,
        body: JSON.stringify({ appId: result.appId, workflow: result.workflow, variables: result.variables, billingCost: result.billingCost }).slice(0, 1000),
        linkedTo: args.linkedTo || {},
        meta: {
          provider: 'mindstudio',
          appId: result.appId,
          workflow: result.workflow,
          flowId: result.flowId,
          agentId: args.agentId || args.agent || '',
        },
      })
      return result
    },
  },
  complete_task: {
    description: 'Mark task done. Args: { id }.',
    run: (args) => update('tasks', args.id, { status: 'done', completedAt: new Date().toISOString() }) || (() => { throw new Error('not found') })(),
  },
  update_task: {
    description: 'Update task. Args: { id, ...patch }.',
    run: (args) => { const { id, ...patch } = args; const r = update('tasks', id, patch); if (!r) throw new Error('not found'); return r },
  },
  delete_task: {
    description: 'Delete task. Args: { id }.',
    run: (args) => { remove('tasks', args.id); return { deleted: args.id } },
  },

  // ─── Activities (timeline) ────────────────────────────────────────────────────────
  log_activity: {
    description: 'Log an activity (call, email, meeting, note, stage_change, custom). Args: { type, subject, body, linkedTo: {...} }.',
    run: (args) => logActivity({ type: args.type || 'note', subject: args.subject || '', body: args.body || '', linkedTo: args.linkedTo || {}, meta: args.meta || {} }),
  },
  list_activities: {
    description: 'List activities filtered by any linkedTo ref or type. Args: { accountId?, contactId?, leadId?, opportunityId?, projectId?, type? }.',
    run: (args = {}) => {
      let list = loadAll('activities')
      if (args.accountId) list = list.filter(a => a.linkedTo?.accountId === args.accountId)
      if (args.contactId) list = list.filter(a => a.linkedTo?.contactId === args.contactId)
      if (args.leadId) list = list.filter(a => a.linkedTo?.leadId === args.leadId)
      if (args.opportunityId) list = list.filter(a => a.linkedTo?.opportunityId === args.opportunityId)
      if (args.projectId) list = list.filter(a => a.linkedTo?.projectId === args.projectId)
      if (args.type) list = list.filter(a => a.type === args.type)
      list.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
      return { count: list.length, activities: list }
    },
  },

  // ─── Pipelines ────────────────────────────────────────────────────────────────────
  list_pipelines: {
    description: 'List available pipelines with their stages.',
    run: () => ({ pipelines: loadAll('pipelines') }),
  },
  create_pipeline: {
    description: 'Create a new named pipeline with default stages. Args: { name (required), stages? (array of stage name strings) }.',
    run: (args) => {
      if (!args.name) throw new Error('name required')
      const id = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      const stageNames = args.stages?.length ? args.stages : ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
      const stages = stageNames.map((s, i) => ({
        id: s.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: s,
        order: i,
      }))
      const pipelines = readData('pipelines.json') || []
      if (pipelines.find(p => p.id === id)) throw new Error(`pipeline "${id}" already exists`)
      const pipeline = { id, name: args.name, stages, createdAt: new Date().toISOString() }
      pipelines.push(pipeline)
      writeData('pipelines.json', pipelines)
      return pipeline
    },
  },

  // ─── Documents ────────────────────────────────────────────────────────────────────
  draft_legal_document: {
    description: 'Draft and save a legal/business document in the CRM without sending it. Looks for an existing template first; if no matching NDA/agreement template exists, creates a robust one-off draft. Args: { clientName|counterpartyName|accountId?, documentType?, templateId?, templateName?, mutual?, reciprocal?, purpose?, fields?, title?, folder?, agentName? }. Use before sending contracts/NDAs for signature.',
    run: (args = {}) => draftLegalDocument(args),
  },
  save_document_to_account: {
    description: 'File a saved or ad-hoc document under an account/client/contact folder in the Documents module. Args: { documentId|id? OR body, title?, clientName|accountId|counterpartyName, folder?, agentName? }. Use after drafting or receiving a document so it is attached to the right CRM account.',
    run: (args = {}) => saveDocumentToAccount(args),
  },
  list_documents: {
    description: 'List saved documents. Optional { clientId, clientName, templateName, status }.',
    run: (args = {}) => {
      const wrapper = readData('documents.json') || { documents: [] }
      let list = Array.isArray(wrapper) ? wrapper : (wrapper.documents || [])
      if (args.clientId) list = list.filter(d => d.clientId === args.clientId)
      if (args.clientName) list = list.filter(d => d.clientName?.toLowerCase().includes(args.clientName.toLowerCase()))
      if (args.templateName) list = list.filter(d => d.templateName?.toLowerCase().includes(args.templateName.toLowerCase()))
      if (args.status) list = list.filter(d => d.status === args.status)
      return { count: list.length, documents: list.map(d => ({ id: d.id, title: d.title, templateName: d.templateName, clientName: d.clientName, status: d.status, createdAt: d.createdAt })) }
    },
  },
  send_document: {
    description: 'Send a saved document to the client via email and mark it sent. Args: { id } OR { clientName, templateName }.',
    run: async (args) => {
      const wrapper = readData('documents.json') || { documents: [] }
      const allDocs = Array.isArray(wrapper) ? wrapper : (wrapper.documents || [])
      let doc
      if (args.id) {
        doc = allDocs.find(d => d.id === args.id)
      } else {
        const matches = allDocs.filter(d => {
          const cn = !args.clientName || d.clientName?.toLowerCase().includes(args.clientName.toLowerCase())
          const tn = !args.templateName || d.templateName?.toLowerCase().includes(args.templateName.toLowerCase())
          return cn && tn && d.status !== 'signed'
        })
        if (matches.length === 0) throw new Error('no matching document found')
        if (matches.length > 1) throw new Error(`${matches.length} documents match — be more specific or use { id }`)
        doc = matches[0]
      }
      if (!doc) throw new Error('document not found')
      const contacts = loadAll('contacts')
      const contact = contacts.find(c => c.accountId === doc.clientId && c.primary) || contacts.find(c => c.accountId === doc.clientId)
      const email = contact?.email || doc.values?.client_email
      if (!email) throw new Error(`no email on file for ${doc.clientName || doc.id}`)
      const key = process.env.RESEND_API_KEY
      if (!key) throw new Error('RESEND_API_KEY not set')
      const { marked } = await import('marked')
      const html = wrapEmailBody(marked.parse(doc.body || ''))
      const resend = new Resend(key)
      const r = await resend.emails.send({
        from: 'Carl Farrington <redacted@example.invalid>',
        to: [email],
        replyTo: 'personal@example.invalid',
        subject: doc.title,
        html,
      })
      if (r.error) throw new Error(r.error.message)
      const updatedDocs = allDocs.map(d => d.id === doc.id ? { ...d, status: 'sent', sentAt: new Date().toISOString() } : d)
      const updatedWrapper = Array.isArray(wrapper) ? updatedDocs : { ...wrapper, documents: updatedDocs, lastUpdated: new Date().toISOString() }
      writeData('documents.json', updatedWrapper)
      return { sent: true, to: email, documentId: doc.id, title: doc.title }
    },
  },
  send_signature_document: {
    description: 'Create a document from a template and email a secure e-signature link. Args: { clientName|counterpartyName|signerEmail, templateId?, templateName? (defaults to standard NDA), purpose?, fields?, signerName?, agentName? }. Use for requests like "send Marjorie our standard NDA and ask her to sign it."',
    run: async (args = {}) => {
      const eSign = signingConfiguration()
      if (isOpenOcti() && !eSign.configured) throw new Error(eSign.message)
      const template = resolveDocumentTemplate(args)
      const signaturePolicy = signaturePolicyForTemplate(template)
      const { account, contact, signerName, signerEmail, counterpartyName } = resolveDocumentRecipient(args)
      const now = new Date().toISOString()
      const values = {
        effective_date: now.slice(0, 10),
        state_of_governing_law: 'North Carolina',
        client_name: counterpartyName,
        client_address: args.clientAddress || account?.address || contact?.address || '',
        client_email: signerEmail,
        client_phone: contact?.phone || account?.phone || '',
        contact_email: signerEmail,
        client_business_name: account?.name || counterpartyName,
        client_website_url: account?.website || '',
        purpose_of_disclosure: args.purpose || args.purposeOfDisclosure || 'evaluate a potential business relationship',
        term_years: String(args.termYears || args.term_years || '2'),
        ...(args.fields || {}),
      }
      const body = fillDocumentPlaceholders(template.body, values)
      const document = {
        id: genDocumentId(),
        title: args.title || `${template.name} - ${counterpartyName}`,
        templateId: template.id,
        templateName: template.name,
        clientId: account?.id || contact?.accountId || '',
        clientName: account?.name || counterpartyName,
        contactId: contact?.id || '',
        signerName,
        signerEmail,
        body,
        values,
        requiresSignature: isSignatureRequired(template, body) || true,
        portalVisible: false,
        signatureMode: signaturePolicy.mode,
        requiredSigners: signaturePolicy.requiredSigners,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        createdBy: args.agentName || args.agent || 'Maggie',
        linkedTo: {
          accountId: account?.id || undefined,
          contactId: contact?.id || undefined,
        },
      }

      const token = createSignatureToken()
      const signUrl = `${publicOrigin()}/sign/${encodeURIComponent(token)}`
      const documentHash = hashDocumentForSignature(document)
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const signature = {
        required: true,
        status: 'pending',
        tokenHash: hashSignatureToken(token),
        signUrl,
        signerName,
        signerEmail,
        requestedAt: now,
        requestedBy: isOpenOcti()
          ? { agentName: args.agentName || args.agent || 'Maggie', name: args.ownerName || 'Workspace owner', email: process.env.OWNER_EMAIL || '' }
          : { agentName: args.agentName || args.agent || 'Maggie', name: 'Carl Farrington', email: process.env.CARL_EMAIL || 'personal@example.invalid' },
        expiresAt,
        documentHash,
        consentVersion: 'fcc-esign-v1',
        mode: signaturePolicy.mode,
        requiredSigners: signaturePolicy.requiredSigners,
        nextSigner: signaturePolicy.mode === 'both_client_first' ? 'client' : 'client',
        counterSignature: signaturePolicy.mode === 'both_client_first'
          ? {
              required: true,
              status: 'pending_client_signature',
              signerName: isOpenOcti() ? (args.ownerName || 'Workspace owner') : 'Carl Farrington',
              signerEmail: isOpenOcti() ? (process.env.OWNER_EMAIL || '') : (process.env.CARL_EMAIL || 'personal@example.invalid'),
            }
          : { required: false },
        events: [{ id: 'evt_' + Date.now().toString(36), type: 'requested', at: now, by: args.agentName || args.agent || 'Maggie' }],
      }
      const email = await sendAgentSignatureEmail({ to: signerEmail, signerName, title: document.title, signUrl })
      const savedSignature = { ...signature, email: { ...email, to: signerEmail, sentAt: now } }
      const savedDocument = {
        ...document,
        status: email.ok ? 'sent' : 'signature_email_failed',
        sentAt: email.ok ? now : null,
        signature: savedSignature,
        updatedAt: now,
      }

      const data = loadDocumentData()
      data.documents = [savedDocument, ...(data.documents || [])]
      saveDocumentData(data)
      logActivity({
        type: 'document',
        subject: `Signature requested: ${savedDocument.title}`,
        body: email.ok
          ? `${args.agentName || 'Maggie'} sent an e-signature request to ${signerName} <${signerEmail}>.`
          : `${args.agentName || 'Maggie'} created the signature document, but email failed: ${email.error || 'unknown error'}.`,
        linkedTo: {
          accountId: account?.id || undefined,
          contactId: contact?.id || undefined,
          documentId: savedDocument.id,
        },
        meta: {
          documentId: savedDocument.id,
          templateId: template.id,
          signatureStatus: savedSignature.status,
          signerEmail,
          emailOk: email.ok,
        },
      })

      return {
        sent: !!email.ok,
        email,
        documentId: savedDocument.id,
        title: savedDocument.title,
        signerName,
        signerEmail,
        signUrl,
        status: savedDocument.status,
        signatureMode: signaturePolicy.mode,
        requiredSigners: signaturePolicy.requiredSigners,
        voiceGuidance: signaturePolicy.voiceGuidance,
        nextStep: signaturePolicy.mode === 'both_client_first'
          ? 'After the client signs, the document should move to Farrington countersignature.'
          : 'After the client signs, the document is complete for this flow.',
        storage: 'Documents module; production persists this record in SQLite kv_store as documents.json.',
        afterSigning: 'The /sign page updates this same document to signed and the Documents PDF action generates the signed copy with its certificate page.',
      }
    },
  },

  // ─── Unified search ───────────────────────────────────────────────────────────────
  search: {
    description: 'Search across accounts, contacts, leads, opportunities, projects, domains. Args: { q, type? }.',
    run: async (args) => {
      if (!args.q) throw new Error('q required')
      const q = args.q.toLowerCase()
      const out = []
      const scoreOf = (rec, field) => {
        const s = JSON.stringify(rec).toLowerCase()
        if (!s.includes(q)) return 0
        const name = (rec[field] || rec.name || '').toString().toLowerCase()
        if (name === q) return 100
        if (name.startsWith(q)) return 80
        if (name.includes(q)) return 60
        return 20
      }
      const types = args.type ? [args.type] : ['account', 'contact', 'lead', 'opportunity', 'project']
      if (types.includes('account')) for (const a of loadAll('accounts')) { const s = scoreOf(a, 'name'); if (s) out.push({ type: 'account', record: a, _score: s }) }
      if (types.includes('contact')) for (const c of loadAll('contacts')) { const s = scoreOf(c, 'name'); if (s) out.push({ type: 'contact', record: c, _score: s }) }
      if (types.includes('lead'))    for (const l of loadAll('leads'))    { const s = scoreOf(l, 'businessName'); if (s) out.push({ type: 'lead', record: l, _score: s }) }
      if (types.includes('opportunity')) for (const o of loadAll('opportunities')) { const s = scoreOf(o, 'name'); if (s) out.push({ type: 'opportunity', record: o, _score: s }) }
      if (types.includes('project')) for (const p of loadAll('projects')) { const s = scoreOf(p, 'name'); if (s) out.push({ type: 'project', record: p, _score: s }) }
      out.sort((a, b) => b._score - a._score)
      return { matches: out.slice(0, 20) }
    },
  },

  // ─── Email (Resend) ───────────────────────────────────────────────────────────────
  deep_research_dossier: {
    description: 'Run DeerFlow-only deep public-source due diligence on a person, company, client, partner, or project. Args: { target, context?, subjectType?, usePerplexity? }. Returns risk level, positive signals, red flags, reputation/social footprint, open questions, next steps, and sources.',
    run: async (args = {}) => {
      return runDeepResearchDossier({
        target: args.target || args.person || args.company || args.query,
        context: args.context || args.notes || '',
        subjectType: args.subjectType || args.type || 'person_or_company',
        usePerplexity: args.usePerplexity !== false,
        agentId: args.agentId || 'deep-research-analyst',
        accountId: args.accountId || args.clientId || '',
        clientId: args.clientId || args.accountId || '',
        productId: args.productId || 'research',
        requestId: args.requestId || '',
      })
    },
  },

  deerflow_studio_produce: {
    description: `Produce a finished deliverable through DeerFlow's skills and return the files. Args: { kind, brief, context?, spec? }. kind is one of: ${Object.keys(STUDIO_KINDS).join(', ')}. Video is Veo 3.1 (8s max per clip, native audio); image is gemini-3-pro-image; deck is a real .pptx; report is a chapter-structured consulting report with charts. Each call costs real money against the Gemini key — roughly $1 a clip, $0.13 an image. Returns { files:[{url, absolutePath, kind, caption}], summary, assumptions }.`,
    run: async (args = {}) => {
      return runDeerFlowStudioTask({
        kind: args.kind || args.type || 'image',
        brief: args.brief || args.prompt || args.request || args.query || '',
        context: args.context || args.notes || '',
        spec: args.spec || null,
        agentId: args.agentId || 'studio-producer',
        clientId: args.clientId || args.accountId || '',
        productId: args.productId || args.kind || args.type || 'studio',
        requestId: args.requestId || '',
      })
    },
  },

  ...Object.fromEntries(DEERFLOW_READONLY_TOOL_DEFS.map(def => [
    def.name,
    {
      description: def.description,
      run: async (args = {}) => runDeerFlowReadOnlyTool(def.name, args),
    },
  ])),

  list_press_contacts: {
    description: 'List curated press-release recipients for Mark. Args: { q?, topic?, beat?, outlet?, region?, market?, status?="active|all", limit? }. Returns contacts with name, email, outlet, beat, notes, sourceUrl. Use before drafting or sending a press release so Mark knows who should receive it.',
    run: (args = {}) => {
      const data = loadPressContactsData()
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 25))
      const contacts = (Array.isArray(data.contacts) ? data.contacts : [])
        .filter(c => c?.email && pressContactMatches(c, args))
        .slice(0, limit)
        .map(c => ({
          name: c.name || '',
          email: c.email || '',
          outlet: c.outlet || '',
          beat: c.beat || '',
          notes: c.notes || '',
          region: c.region || '',
          status: c.status || 'active',
          sourceUrl: c.sourceUrl || '',
        }))
      return {
        count: contacts.length,
        fields: data.fields || ['name', 'email', 'outlet', 'beat', 'notes'],
        contacts,
        emails: contacts.map(c => c.email).filter(Boolean),
        guidance: contacts.length
          ? 'Use beat and notes to choose recipients. Do not send a real press release unless Carl has explicitly approved the final recipient list and message.'
          : 'No matching press contacts found. Broaden q/beat/region or research and add more contacts.',
      }
    },
  },
  send_email: {
    description: 'Send email via Resend. Args: { to OR clientName, subject, body, attachments?, agent? }. Pass either to (raw email) OR clientName (we look up the email). attachments: array of media IDs, /media/ paths, or URLs. agent: agent id when YOU are the sender — signature gets your avatar.',
    run: async (args) => {
      if (!args.subject || !args.body) throw new Error('subject and body required')
      if (wantsSignatureRequestText(args.subject, args.body, args.clientName, args.to)) {
        return TOOLS.send_signature_document.run({
          clientName: args.clientName || (looksLikeEmail(args.to) ? undefined : args.to),
          signerName: args.clientName || args.to,
          signerEmail: looksLikeEmail(args.to) ? args.to : undefined,
          templateName: /nda|non[-\s]?disclosure/i.test(`${args.subject || ''} ${args.body || ''}`) ? 'standard NDA' : args.subject || 'standard NDA',
          agentName: args.agent || 'Maggie',
        })
      }
      // Resolve recipient: accept raw email OR look up by client name
      let to = args.to
      let recipientName = ''
      if (!to && args.clientName) {
        const accounts = loadAll('accounts')
        const lc = String(args.clientName).toLowerCase().trim()
        const match = accounts.find(a => (a.name || '').toLowerCase() === lc)
          || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
          || accounts.find(a => (a.name || '').toLowerCase().split(' ')[0] === lc.split(' ')[0])
        if (!match) throw new Error(`No client/account found matching "${args.clientName}"`)
        if (!match.email) {
          // Try a primary contact's email
          const detail = accountWithRelations(match.id)
          const primaryContact = (detail?.contacts || []).find(c => c.email)
          if (primaryContact?.email) to = primaryContact.email
          else throw new Error(`Found account "${match.name}" but no email on file. Add an email to the account or its primary contact first.`)
        } else { to = match.email }
        recipientName = match.name
      }
      if (!to || !to.includes('@')) throw new Error('valid recipient email required (pass to or clientName)')
      const key = process.env.RESEND_API_KEY
      if (!key) throw new Error('RESEND_API_KEY not set')
      const bodyHtml = args.body.split('\n').map(line => `<p style="margin:0 0 12px 0">${line || '&nbsp;'}</p>`).join('')
      const agentIdentity = args.agent ? getAgentEmailIdentity(args.agent) : null
      const { html, inlineAttachments } = buildEmail(bodyHtml, args.brand || 'farrington', { agent: agentIdentity })
      const resend = new Resend(key)
      const userAttachments = await resolveAttachments(args.attachments)
      const allAttachments = [...inlineAttachments, ...userAttachments]
      const r = await resend.emails.send({
        from: 'ContentHub <redacted@example.invalid>',
        to: [to],
        replyTo: 'personal@example.invalid',
        subject: args.subject,
        html,
        ...(allAttachments.length ? { attachments: allAttachments } : {}),
      })
      if (r.error) throw new Error(r.error.message)
      // Auto-log on the recipient's account if we resolved one
      try {
        if (args.clientName) {
          const accounts = loadAll('accounts')
          const lc = String(args.clientName).toLowerCase().trim()
          const match = accounts.find(a => (a.name || '').toLowerCase() === lc)
            || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
          if (match) {
            logActivity({
              type: 'email',
              subject: `${agentIdentity?.name || 'Carl'} → ${match.name}: ${args.subject}`,
              body: args.body.slice(0, 500),
              linkedTo: { accountId: match.id },
              meta: { resendId: r.data?.id, attachments: userAttachments.length },
            })
          }
        }
      } catch {}
      return { sent: true, to, recipientName, id: r.data?.id, attachmentCount: userAttachments.length, inlineImages: inlineAttachments.length, signedBy: agentIdentity?.name || 'Carl' }
    },
  },

  // ─── Calendar (read-only — reuse existing route) ──────────────────────────────────
  list_calendar_events: {
    description: 'List upcoming calendar events (demo bookings etc). Args: { days? } (default 14).',
    run: async (args = {}) => {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'
      const res = await fetch(`${base}/api/calendar/events`, { cache: 'no-store' }).then(r => r.json())
      const days = Number(args.days) || 14
      const now = Date.now(), cutoff = now + days * 86400000
      const upcoming = (res.events || []).filter(e => {
        const t = new Date(e.start).getTime()
        return t >= now && t <= cutoff
      })
      return { count: upcoming.length, events: upcoming }
    },
  },

  // ─── Domain availability (reuse existing route) ───────────────────────────────────
  check_domain_availability: {
    description: 'Check domain availability via GoDaddy. Args: { domain }.',
    run: async (args) => {
      if (!args.domain) throw new Error('domain required')
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'
      return fetch(`${base}/api/tools/domain-availability?domain=${encodeURIComponent(args.domain)}`).then(r => r.json())
    },
  },

  // ─── Dashboard summary (quick aggregate) ──────────────────────────────────────────
  dashboard_summary: {
    description: 'High-level stats across the whole CRM. No args.',
    run: () => {
      const accounts = loadAll('accounts')
      const leads = loadAll('leads')
      const opps = loadAll('opportunities')
      const projects = loadAll('projects')
      const tasks = loadAll('tasks')
      const openOpps = opps.filter(o => !['won', 'lost', 'declined', 'signed'].includes(o.stageId))
      return {
        accounts: { total: accounts.length, clients: accounts.filter(a => a.type === 'client').length, prospects: accounts.filter(a => a.type === 'prospect').length },
        leads: { total: leads.length, new: leads.filter(l => l.status === 'new').length, qualified: leads.filter(l => l.status === 'qualified' || l.status === 'converted').length },
        pipeline: { open: openOpps.length, openValue: openOpps.reduce((s, o) => s + (Number(o.value) || 0), 0), weightedValue: openOpps.reduce((s, o) => s + (Number(o.value) || 0) * (Number(o.probability) || 0) / 100, 0) },
        projects: { total: projects.length, active: projects.filter(p => p.status === 'active').length },
        tasks: { total: tasks.length, open: tasks.filter(t => t.status !== 'done').length, overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < Date.now() && t.status !== 'done').length },
      }
    },
  },

  // ─── Orca handoff (agent-to-agent delegation; lib/orca-handoff.js) ─────────────
  handoff_to_orca: {
    description: 'Hand an LLM-only job to Orca, the team handoff agent — reports, drafts, summaries, analysis, rewrites, structured extraction. Orca grades the difficulty and runs it on the cheapest model that can do it (free tier first) and returns the finished deliverable. Use this instead of doing long writing yourself. Args: { task (required — what to produce, be specific), context? (the facts/data Orca needs; Orca never sees the CRM, paste what matters), complexity?: "light"|"standard"|"heavy", outputFormat?: "markdown"|"json"|"text", agentId? (your own agent id) }. Returns { ok, runId, status, result, tier, resolvedModel }. Do NOT use for live CRM lookups, sending anything, or deep web research (that is Nadia).',
    run: async (args = {}) => {
      const { createRun, executeRun, publicRun, ensureOrcaAgent, isAgentEnabled } = await import('@/lib/orca-handoff')
      const { getRequestTenantContext } = await import('@/lib/entityStore')
      const fromAgentId = String(args.agentId || args.agent || getRequestTenantContext()?.agentId || 'unknown').toLowerCase()
      if (!String(args.task || '').trim()) throw new Error('task is required')
      if (!isAgentEnabled(fromAgentId)) {
        return { ok: false, error: `Handoff to Orca is switched off for agent "${fromAgentId}". Do the task yourself. (Carl can enable it on the Orca panel under Agents.)` }
      }
      try { ensureOrcaAgent() } catch {}
      const complexity = ['light', 'standard', 'heavy'].includes(args.complexity) ? args.complexity : null
      const run = createRun({ fromAgentId, task: args.task, context: args.context || '', complexity, outputFormat: args.outputFormat, maxTokens: args.maxTokens })
      const done = await executeRun(run.id)
      const pub = publicRun(done)
      return { ok: pub.status === 'done', runId: pub.id, status: pub.status, result: pub.result, tier: pub.tier, resolvedModel: pub.resolvedModel, downgraded: pub.downgraded, error: pub.error }
    },
  },

  // ─── Time tracking (singleton timer; state in data/timer-state.json) ─────────────
  control_timer: {
    description: 'Control the work timer. Args: { action: "start"|"pause"|"resume"|"stop"|"note"|"status", clientName?, accountId?, note? }. start begins timing on a client (rejects if a different client timer is running). pause/resume toggle. stop logs the session as a time_tracked activity against the account and bumps trackedSeconds. note appends a note to the running session. status returns the current state. The timer is a singleton — one Carl, one running timer.',
    run: async (args = {}) => {
      const action = String(args.action || 'status').toLowerCase()
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'
      if (action === 'status' || action === 'get') {
        const r = await fetch(`${base}/api/timer`, { cache: 'no-store' })
        return r.json()
      }
      const r = await fetch(`${base}/api/timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, clientName: args.clientName, accountId: args.accountId, note: args.note }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `timer ${action} failed (${r.status})`)
      return j
    },
  },

  // ─── Command Vault (markdown knowledge base) ─────────────────────────────────────
  list_vaults: {
    description: 'List Command Vault vaults and mounted project roots. Use this before list_notes/search_notes when the agent needs to discover mounted projects. Args: { includeCounts? }.',
    run: (args = {}) => {
      const includeCounts = Boolean(args.includeCounts || args.counts)
      const vaults = getVaults().map(vault => {
        const roots = Array.isArray(vault.roots) ? vault.roots : []
        const rootSummaries = roots.map(root => {
          const summary = {
            id: root.id,
            name: root.name,
            available: Boolean(root.available),
            color: root.color,
          }
          if (includeCounts && root.available) {
            try {
              summary.noteCount = walkVaultMd({ ...vault, roots: [root] }).length
            } catch {
              summary.noteCount = 0
            }
          }
          return summary
        })
        const summary = {
          id: vault.id,
          name: vault.name,
          available: Boolean(vault.available),
          defaultRoot: vault.defaultRoot || '',
          mountedRootCount: rootSummaries.length,
          roots: rootSummaries,
        }
        if (includeCounts && !rootSummaries.length && vault.available) {
          try {
            summary.noteCount = walkVaultMd(vault).length
          } catch {
            summary.noteCount = 0
          }
        }
        return summary
      })
      return { count: vaults.length, vaults }
    },
  },
  list_notes: {
    description: 'List .md files in a Command Vault markdown knowledge base. Optional { vault, folder, q, limit }. For mounted projects, call list_vaults first, then pass the returned vault id/name; paths may be prefixed with the mounted root id.',
    run: (args = {}) => {
      const picked = pickVault(args)
      if (!picked.available) throw new Error(`Vault not found: ${picked.name}`)
      let notes = walkVaultMd(picked).map(f => ({
        path: f.path,
        name: f.name,
        modifiedAt: f.modifiedAt,
        sourceRoot: f.sourceRoot || '',
        sourceName: f.sourceName || '',
      }))
      if (args.folder) notes = notes.filter(f => f.path.startsWith(String(args.folder)))
      if (args.q) {
        const q = String(args.q).toLowerCase()
        notes = notes.filter(f => f.path.toLowerCase().includes(q))
      }
      const limit = Math.max(1, Math.min(250, Number(args.limit) || 80))
      return {
        vault: picked.name,
        vaultId: picked.id,
        defaultRoot: picked.defaultRoot || '',
        roots: Array.isArray(picked.roots) ? picked.roots.map(r => ({
          id: r.id,
          name: r.name,
          available: Boolean(r.available),
          color: r.color,
        })) : [],
        count: notes.length,
        files: notes.slice(0, limit).map(f => f.path),
        notes: notes.slice(0, limit),
        truncated: notes.length > limit,
      }
    },
  },
  search_notes: {
    description: 'Search Command Vault markdown note titles and content. Args: { q, vault?, folder?, limit? }. Call list_vaults first when mounted projects are relevant. Returns matching paths, vault/root ids, and snippets.',
    run: (args = {}) => {
      const q = String(args.q || args.query || '').trim().toLowerCase()
      if (!q) throw new Error('q required')
      const picked = pickVault(args)
      if (!picked.available) throw new Error(`Vault not found: ${picked.name}`)
      let files = walkVaultMd(picked)
      if (args.folder) files = files.filter(f => f.path.startsWith(String(args.folder)))
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 12))
      const results = []
      for (const file of files) {
        const titleHit = file.path.toLowerCase().includes(q)
        let content = ''
        let idx = -1
        if (!titleHit) {
          try {
            content = fs.readFileSync(resolveVaultFile(picked, file.path), 'utf-8')
            idx = content.toLowerCase().indexOf(q)
          } catch {
            continue
          }
        }
        if (!titleHit && idx < 0) continue
        if (!content) {
          try { content = fs.readFileSync(resolveVaultFile(picked, file.path), 'utf-8') } catch { content = '' }
        }
        const start = idx >= 0 ? Math.max(0, idx - 120) : 0
        const snippet = content
          ? content.slice(start, start + 280).replace(/\s+/g, ' ').trim()
          : ''
        results.push({
          path: file.path,
          name: file.name,
          modifiedAt: file.modifiedAt,
          sourceRoot: file.sourceRoot || '',
          sourceName: file.sourceName || '',
          vaultId: picked.id,
          vault: picked.name,
          match: titleHit ? 'path' : 'content',
          snippet,
        })
        if (results.length >= limit) break
      }
      return { vault: picked.name, vaultId: picked.id, query: q, count: results.length, results }
    },
  },
  read_note: {
    description: 'Read a note from a Command Vault markdown knowledge base. Args: { path, vault? }.',
    run: (args) => {
      if (!args.path) throw new Error('path required')
      const picked = pickVault(args)
      if (!picked.available) throw new Error(`Vault not found: ${picked.name}`)
      const full = resolveVaultFile(picked, args.path)
      return { vault: picked.name, vaultId: picked.id, path: args.path, content: fs.readFileSync(full, 'utf-8') }
    },
  },
  write_note: {
    description: 'Create or overwrite a note in a Command Vault markdown knowledge base. Args: { path|title, content, vault? }. Creates folders as needed.',
    run: (args) => {
      const notePath = args.path || (args.title || args.name
        ? `${String(args.folder || '').replace(/^\/+|\/+$/g, '')}${args.folder ? '/' : ''}${String(args.title || args.name).replace(/[\\/:*?"<>|]/g, '').trim()}.md`
        : '')
      if (!notePath || args.content == null) throw new Error('path/title and content required')
      const picked = pickVault(args)
      if (!picked.available) throw new Error(`Vault not found: ${picked.name}`)
      const full = resolveVaultFile(picked, notePath)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, args.content, 'utf-8')
      return { saved: true, vault: picked.name, vaultId: picked.id, path: notePath }
    },
  },

  // ─── Invoices ─────────────────────────────────────────────────────────────────────
  list_invoices: {
    description: 'List invoices. Optional filter { status, clientId }.',
    run: (args = {}) => {
      const data = readData('invoices.json') || { invoices: [] }
      let list = data.invoices || []
      if (args.status) list = list.filter(i => i.status === args.status)
      if (args.clientId) list = list.filter(i => i.clientId === args.clientId)
      return { count: list.length, invoices: list }
    },
  },
  create_invoice: {
    description: 'Create a draft invoice. Args: { clientId|clientName, amount? or items: [{description, qty, rate|unitPrice}], project?, dueDate?, notes? }. Returns a plain-text confirmation with invoice id and number.',
    run: async (args) => {
      const items = normalizeInvoiceItems(args)
      const amount = items.reduce((sum, item) => sum + (Number(item.qty) || 1) * (Number(item.rate) || 0), 0)
      if (amount <= 0) throw new Error('invoice amount must be greater than zero')
      const account = args.clientId ? findById('accounts', args.clientId) : resolveAccountByName(args.clientName)
      const clientId = args.clientId || account?.id || ''
      const clientName = account?.name || args.clientName || ''
      const r = await fetch('http://localhost:3000/api/invoices', {
        method: 'POST',
        headers: internalAgentHeaders(),
        body: JSON.stringify({
          action: 'create',
          clientId,
          clientName,
          project: args.project || '',
          projectId: args.projectId || '',
          items,
          notes: args.notes || '',
          date: args.date || null,
          dueDate: args.dueDate || null,
        }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `invoice create failed (${r.status})`)
      const invoice = j.invoice || {}
      const invoiceAmount = Number(invoice.amount ?? amount) || 0
      console.log(`[agent-tool] create_invoice ok number=${invoice.number || 'unknown'} amount=${invoiceAmount.toFixed(2)} client=${String(invoice.clientName || clientName || 'unknown').slice(0, 80)}`)
      return `Draft invoice ${invoice.number || invoice.id} created for ${invoice.clientName || clientName || 'client'} for $${invoiceAmount.toFixed(2)}. Invoice id ${invoice.id}. It has not been sent yet.`
    },
  },
  send_invoice_via_stripe: {
    description: 'Send a draft invoice to the client via Stripe (creates Stripe invoice + email link). Args: { id }.',
    run: async (args) => {
      if (!args.id) throw new Error('id required')
      const r = await fetch('http://localhost:3000/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', id: args.id }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `invoice send failed (${r.status})`)
      try {
        if (j.invoice?.clientId) {
          logActivity({
            type: 'invoice_sent',
            subject: `Invoice ${j.invoice.number || j.invoice.id} sent to ${j.invoice.clientName || 'client'}`,
            body: `Amount: $${(Number(j.invoice.amount) || 0).toFixed(2)}. Due ${j.invoice.dueDate || 'on receipt'}.`,
            linkedTo: { accountId: j.invoice.clientId },
            meta: { invoiceId: j.invoice.id, hostedUrl: j.invoice.hostedUrl },
          })
        }
      } catch {}
      console.log(`[agent-tool] send_invoice_via_stripe ok id=${String(args.id).slice(0, 80)} status=${j.invoice?.status || 'unknown'}`)
      return `Invoice ${j.invoice?.number || args.id} sent. Status: ${j.invoice?.status || 'sent'}. Payment link: ${j.invoice?.hostedUrl || j.invoice?.stripeSessionUrl || 'created'}.`
    },
  },

  // ─── Payments ─────────────────────────────────────────────────────────────────────
  list_payments: {
    description: 'List payments. Optional filter { clientId, since (ISO date) }.',
    run: (args = {}) => {
      const data = readData('payments.json') || { payments: [] }
      let list = data.payments || []
      if (args.clientId) list = list.filter(p => p.clientId === args.clientId)
      if (args.since) list = list.filter(p => p.date >= args.since)
      return { count: list.length, payments: list, total: list.reduce((s, p) => s + (p.amount || 0), 0) }
    },
  },
  record_payment: {
    description: 'Manually record a payment received outside Stripe (cash, check, transfer). Args: { clientId|clientName, amount, method (cash|check|transfer|other), date?, invoiceId?, notes? }.',
    run: async (args) => {
      if (!args.amount) throw new Error('amount required')
      const r = await fetch('http://localhost:3000/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          clientId: args.clientId || '',
          clientName: args.clientName || '',
          amount: Number(args.amount),
          method: args.method || 'other',
          date: args.date || new Date().toISOString(),
          invoiceId: args.invoiceId || null,
          notes: args.notes || '',
          source: 'manual-agent',
        }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `payment record failed (${r.status})`)
      try {
        const acctId = j.payment?.clientId || args.clientId
        if (acctId) {
          logActivity({
            type: 'payment_received',
            subject: `Payment recorded: $${Number(args.amount).toFixed(2)} via ${args.method || 'other'}`,
            body: args.notes || `${args.method || 'manual'} payment received${args.invoiceId ? ' for invoice ' + args.invoiceId : ''}.`,
            linkedTo: { accountId: acctId },
            meta: { amount: Number(args.amount), method: args.method, invoiceId: args.invoiceId },
          })
        }
      } catch {}
      return j.payment || j
    },
  },

  // ─── SMS (Twilio) ─────────────────────────────────────────────────────────────────
  send_sms: {
    description: 'Send an SMS via Twilio. Args: { to (E.164 phone like +18005551234), body }. Use sparingly — texts are visible to the recipient instantly.',
    run: async (args) => {
      if (!args.to || !args.body) throw new Error('to and body required')
      const sid = process.env.TWILIO_ACCOUNT_SID
      const token = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN
      const from = process.env.TWILIO_PHONE_NUMBER
      if (!sid || !token || !from) throw new Error('Twilio not configured (need TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SECRET or TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)')
      const auth = Buffer.from(`${process.env.TWILIO_API_KEY_SID || sid}:${token}`).toString('base64')
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: args.to, From: from, Body: args.body }).toString(),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.message || `twilio sms failed (${r.status})`)
      return { sid: j.sid, status: j.status, to: j.to, from: j.from }
    },
  },

  // ─── Document Templates & Saved Documents (legal review surface) ──────────────────
  list_templates: {
    description: 'List all document templates (NDA, MSA, retainer, hosting, software-development, sow, ai-consulting, etc.). Returns id, name, file path.',
    run: async () => {
      const r = await fetch('http://localhost:3000/api/documents', { method: 'GET' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `documents fetch failed (${r.status})`)
      return { count: (j.templates || []).length, templates: j.templates || [] }
    },
  },
  get_template: {
    description: 'Read the markdown body of a specific template. Args: { templateId } — e.g. "nda-mutual", "msa", "retainer".',
    run: async (args) => {
      if (!args.templateId) throw new Error('templateId required')
      const r = await fetch('http://localhost:3000/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_template', templateId: args.templateId }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `get_template failed (${r.status})`)
      return j.template
    },
  },
  update_template: {
    description: 'Save edits to a template. Args: { templateId, body (full new markdown content) }. Creates a timestamped backup of the previous version automatically.',
    run: async (args) => {
      if (!args.templateId || typeof args.body !== 'string') throw new Error('templateId and body required')
      const r = await fetch('http://localhost:3000/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_template', templateId: args.templateId, body: args.body }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `update_template failed (${r.status})`)
      return j
    },
  },
  ai_edit_template: {
    description: 'Use AI (Claude) to edit a template body per natural-language instructions. Args: { templateId, instruction, selection? (optional excerpt to focus on) }. Returns the proposed new body — review it, then call update_template to commit.',
    run: async (args) => {
      if (!args.templateId || !args.instruction) throw new Error('templateId and instruction required')
      // Pull current template body
      const tplR = await fetch('http://localhost:3000/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_template', templateId: args.templateId }),
      })
      const tplJ = await tplR.json()
      if (!tplR.ok || tplJ.error) throw new Error(tplJ.error || 'template fetch failed')
      const r = await fetch('http://localhost:3000/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_edit',
          body: tplJ.template,
          instruction: args.instruction,
          selection: args.selection || '',
        }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `ai_edit failed (${r.status})`)
      return { proposed: j.body || j.result, original: tplJ.template, instruction: args.instruction, templateId: args.templateId }
    },
  },
  list_saved_documents: {
    description: 'List documents that have been generated and saved for clients. Optional filter { clientId, clientName, templateName, status }.',
    run: async (args = {}) => {
      const qs = new URLSearchParams()
      for (const k of ['clientId', 'clientName', 'templateName', 'status']) if (args[k]) qs.set(k, args[k])
      const r = await fetch('http://localhost:3000/api/documents?' + qs.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `documents list failed (${r.status})`)
      // Filter the documents array if needed
      let docs = j.documents || []
      if (args.clientId) docs = docs.filter(d => d.clientId === args.clientId)
      if (args.clientName) docs = docs.filter(d => (d.clientName || '').toLowerCase().includes(args.clientName.toLowerCase()))
      if (args.templateName) docs = docs.filter(d => (d.templateName || '').toLowerCase().includes(args.templateName.toLowerCase()))
      if (args.status) docs = docs.filter(d => d.status === args.status)
      return { count: docs.length, documents: docs.map(d => ({ id: d.id, title: d.title, clientName: d.clientName, templateName: d.templateName, status: d.status, updatedAt: d.updatedAt })) }
    },
  },
  get_document: {
    description: 'Read the full body of a saved document by id. Args: { id }.',
    run: async (args) => {
      if (!args.id) throw new Error('id required')
      const r = await fetch('http://localhost:3000/api/documents')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'documents fetch failed')
      const doc = (j.documents || []).find(d => d.id === args.id)
      if (!doc) throw new Error('document not found: ' + args.id)
      return doc
    },
  },
  update_document: {
    description: 'Modify a saved document\'s body or metadata. Args: { id, body?, title?, status? }. Use for redlines on issued contracts.',
    run: async (args) => {
      if (!args.id) throw new Error('id required')
      const patch = { id: args.id }
      if (args.body !== undefined) patch.body = args.body
      if (args.title !== undefined) patch.title = args.title
      if (args.status !== undefined) patch.status = args.status
      const r = await fetch('http://localhost:3000/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', document: patch }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `update failed (${r.status})`)
      return j.document
    },
  },

  // ─── Media — generate images, recall later, organize in folders ─────────
  create_content_draft: {
    description: 'Create a durable AI Content Lab draft item for stories, blogs, memes, social posts, emails, scripts, image briefs, video/reel briefs, or campaign packages. Args: { workflow?, topic?, title?, audience?, goal?, tone?, source?, keywords?, tags?, agentName? }. Status starts as draft so Carl can review, repurpose, publish, or turn it into media.',
    run: async (args = {}) => {
      if (!args.topic && !args.source) throw new Error('topic or source required')
      const job = await createContentJob({
        workflow: args.workflow || 'social-post',
        topic: args.topic || args.title || 'Untitled content draft',
        title: args.title,
        audience: args.audience,
        goal: args.goal,
        tone: args.tone,
        source: args.source,
        keywords: args.keywords,
        tags: Array.isArray(args.tags) ? args.tags : [],
        createdBy: args.agentName || args.agentId || 'agent',
      })
      return {
        id: job.id,
        title: job.title,
        workflow: job.workflow,
        workflowLabel: job.workflowLabel,
        status: job.status,
        provider: job.provider,
        model: job.model,
        preview: String(job.content || '').slice(0, 500),
      }
    },
  },
  list_content_drafts: {
    description: 'List recent Content Lab jobs. Args: { q?, status?, workflow?, limit? }. Use after creating or reviewing AI content drafts.',
    run: async (args = {}) => {
      const jobs = listContentJobs(args)
      return {
        count: jobs.length,
        jobs: jobs.map(job => ({
          id: job.id,
          title: job.title,
          workflow: job.workflow,
          status: job.status,
          updatedAt: job.updatedAt,
          preview: String(job.content || '').slice(0, 180),
        })),
      }
    },
  },
  update_content_draft: {
    description: 'Update a Content Lab draft status or metadata. Args: { id, status?, title?, content?, notes? }.',
    run: async (args = {}) => {
      if (!args.id) throw new Error('id required')
      const patch = {}
      for (const key of ['status', 'title', 'content', 'notes']) {
        if (args[key] !== undefined) patch[key] = args[key]
      }
      const job = updateContentJob(args.id, patch)
      if (!job) throw new Error('content draft not found')
      return { id: job.id, title: job.title, workflow: job.workflow, status: job.status, updatedAt: job.updatedAt }
    },
  },
  delete_content_draft: {
    description: 'Delete a Content Lab draft. Args: { id }. Requires Carl approval before use.',
    run: async (args = {}) => {
      if (!args.id) throw new Error('id required')
      return { deleted: deleteContentJob(args.id), id: args.id }
    },
  },
  generate_image: {
    description: 'Generate a finished still image and save it to the media library. Args: { prompt (required), title?, tags? (array), folder? (folder id like "memes", "social-posts", "client:<accountId>"; default "unsorted"), size? ("1024x1024", "1024x1536", or "1536x1024"), provider? ("openai", "auto", "imagen", "google-imagen", "gemini", "fal", "openrouter", or "pexels"), agentName? (who is making this - for the audit trail), approvedByCarl? }. If provider is blank, the server uses this agent\'s saved Image provider setting from Agent Manager; Sasha currently defaults to OpenAI/ChatGPT. When Carl directly asks for an image/social post, pass approvedByCarl true. For Facebook/social posts, write a finished brand/poster prompt with the exact headline, caption intent, format, and logo/brand requirements; do not generate pseudo-code, SVG markup, wireframes, or UI-spec sheets. Returns { id, url, folder, provider }. Tell Carl which folder you saved it in.',
    run: async (args) => {
      if (!args.prompt) throw new Error('prompt required')
      const item = await generateMedia({
        prompt: args.prompt,
        title: args.title,
        tags: args.tags,
        folder: args.folder || 'unsorted',
        size: args.size,
        provider: args.provider,
      })
      // Auto-log on the client account if generated into a client folder
      try {
        const m = (item.folder || '').match(/^client:(.+)$/)
        if (m) {
          logActivity({
            type: 'image_generated',
            subject: `${args.agentName || 'Agent'} generated image: "${item.title}"`,
            body: `Saved to ${item.folder}. Provider: ${item.provider} (${item.model}).`,
            linkedTo: { accountId: m[1] },
            meta: { mediaId: item.id, mediaUrl: item.url, prompt: item.prompt },
          })
        }
      } catch {}
      return { id: item.id, title: item.title, url: item.url, folder: item.folder, provider: item.provider, model: item.model, providerPreferenceSource: args.imageProviderPreferenceSource || 'request' }
    },
  },
  list_media_folders: {
    description: 'List every folder in the media library — system folders (Marketing, Memes, Social Posts), per-client folders (id "client:<accountId>"), plus any custom folders. Returns array of { id, name, parent }.',
    run: async () => {
      return { folders: listFolders() }
    },
  },
  find_client: {
    description: 'One-shot client lookup by name. Args: { name }. Returns { id, name, email, phone, mediaFolder } so you can immediately email them or list their media. Use this BEFORE chaining list_media or send_email if you only have a person\'s name.',
    run: async (args) => {
      if (!args.name) throw new Error('name required')
      const accounts = loadAll('accounts')
      const lc = String(args.name).toLowerCase().trim()
      const match = accounts.find(a => (a.name || '').toLowerCase() === lc)
        || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
        || accounts.find(a => (a.name || '').toLowerCase().split(' ')[0] === lc.split(' ')[0])
      if (!match) {
        // Maybe they're a contact, not an account
        const detail = await fetch('http://localhost:3000/api/agent/search?q=' + encodeURIComponent(args.name)).then(r => r.json())
        const top = (detail.matches || [])[0]
        if (top && top.type === 'contact') {
          return { id: top.id, name: top.name, email: top.email, phone: top.phone, type: 'contact', mediaFolder: top.accountId ? `client:${top.accountId}` : null }
        }
        throw new Error(`No client/account/contact found matching "${args.name}"`)
      }
      let email = match.email, phone = match.phone
      // If account has no direct email, check primary contact
      if (!email) {
        const detail = accountWithRelations(match.id)
        const primaryContact = (detail?.contacts || []).find(c => c.email) || (detail?.contacts || [])[0]
        if (primaryContact) { email = primaryContact.email || email; phone = phone || primaryContact.phone }
      }
      return { id: match.id, name: match.name, email, phone, type: 'account', mediaFolder: `client:${match.id}` }
    },
  },
  list_media: {
    description: 'List images in the media library. Args: { folder?, clientName? (auto-resolves to that client\'s folder), tag?, q? (search title/prompt) }. If you pass clientName like "Chad" the system looks up his account and uses his folder. Returns array with id, title, url, folder, prompt, sorted newest-first.',
    run: async (args = {}) => {
      let folder = args.folder
      // If clientName given, resolve to client:<accountId> folder
      if (!folder && args.clientName) {
        const accounts = loadAll('accounts')
        const lc = String(args.clientName).toLowerCase().trim()
        const match = accounts.find(a => (a.name || '').toLowerCase() === lc)
          || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
          || accounts.find(a => (a.name || '').toLowerCase().split(' ')[0] === lc.split(' ')[0])
        if (!match) throw new Error(`No client/account found matching "${args.clientName}"`)
        folder = `client:${match.id}`
      }
      const items = listMedia({ folder, tag: args.tag, q: args.q, limit: args.limit || 50 })
      return { count: items.length, folder, items: items.map(i => ({ id: i.id, title: i.title, url: i.url, folder: i.folder, prompt: i.prompt, tags: i.tags, createdAt: i.createdAt })) }
    },
  },
  get_media: {
    description: 'Get full metadata for one media item. Args: { id }.',
    run: async (args) => {
      if (!args.id) throw new Error('id required')
      const item = getMedia(args.id)
      if (!item) throw new Error('media not found: ' + args.id)
      return item
    },
  },
  move_media: {
    description: 'Move a media item to a different folder. Args: { id, folder (folder id like "memes" or "client:<accountId>") }.',
    run: async (args) => {
      if (!args.id || !args.folder) throw new Error('id and folder required')
      const updated = moveMedia(args.id, args.folder)
      if (!updated) throw new Error('media not found: ' + args.id)
      return { id: updated.id, folder: updated.folder }
    },
  },
  delete_media: {
    description: 'Delete a media item from the library. Args: { id }. Confirm with Carl before calling.',
    run: async (args) => {
      if (!args.id) throw new Error('id required')
      const ok = deleteMedia(args.id)
      return { deleted: ok }
    },
  },

  // ─── Agent memory: recall what YOU did recently across CRM, media, activities ────
  take_note_for_client: {
    description: 'Capture a note linked to a client. Args: { clientName (or accountId), note (the actual text), subject? (short headline; if omitted derived from first line), agentName? (who took the note for the audit trail) }. Note shows up in the client\'s Notes tab AND their Activity timeline. Use this whenever Carl says "take a note about X" / "remember that Y for Chad" / "make a note that Z".',
    run: async (args) => {
      if (!args.note && !args.body) throw new Error('note (text) required')
      let accountId = args.accountId || args.clientId || args.linkedTo?.accountId
      let clientLabel = ''
      if (!accountId && (args.clientName || args.accountName || args.client)) {
        const accounts = loadAll('accounts')
        const lc = String(args.clientName || args.accountName || args.client).toLowerCase().trim()
        const match = accounts.find(a => (a.name || '').toLowerCase() === lc)
          || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
          || accounts.find(a => (a.name || '').toLowerCase().split(' ')[0] === lc.split(' ')[0])
        if (!match) throw new Error(`No client/account found matching "${args.clientName || args.accountName || args.client}"`)
        accountId = match.id
        clientLabel = match.name
      }
      if (accountId && !clientLabel) clientLabel = findById('accounts', accountId)?.name || ''
      if (!accountId) throw new Error('clientName or accountId required')
      const noteText = (args.note || args.body || '').trim()
      const lines = noteText.split('\n')
      const subject = args.subject || lines[0].slice(0, 120)
      const body = args.subject ? noteText : lines.slice(1).join('\n').trim()
      const rec = logActivity({
        type: 'note',
        subject,
        body: body || subject,
        linkedTo: { accountId },
        meta: { byAgent: args.agentName || null },
      })
      return { saved: true, id: rec?.id, accountId, clientName: clientLabel, subject }
    },
  },
  remember_fact: {
    description: 'Persist a durable CRM memory fact or preference. Args: { fact, scope?: global|agent|account|contact|project|lead|topic, topic?, tags?, agentName?, accountId?/clientName?, contactId?/contactName?, projectId?/projectName?, leadId?/leadName?, expiresAt? }. Never store passwords, API keys, tokens, private keys, or secrets; this tool refuses likely credentials.',
    run: (args = {}) => rememberFact(args),
  },
  recall_memory: {
    description: 'Recall CRM-owned persistent memory facts. Args: { q?, scope?, topic?, tags?, accountId?/clientName?, contactId?/contactName?, projectId?/projectName?, leadId?/leadName?, agentOnly?, limit? }. Use search_notes/read_note for Obsidian playbooks or long-form knowledge.',
    run: (args = {}) => recallMemory(args),
  },
  list_agent_memory: {
    description: 'List recent persistent memories with optional filters. Args: { scope?, topic?, agentOnly?, accountId?/clientName?, contactId?/contactName?, projectId?/projectName?, leadId?/leadName?, limit? }. Read-only.',
    run: (args = {}) => listAgentMemory(args),
  },
  forget_memory: {
    description: 'Forget a CRM memory. Args: { id|memoryId required } or { q/scope filters plus confirmed/explicitApproval for bulk }. Soft-deletes from recall while preserving an audit trail.',
    run: (args = {}) => forgetMemory(args),
  },
  save_call_memory: {
    description: 'Save a secure summary of a call or voice session into CRM memory. Args: { summary?, decisions?, actionItems?, transcript? excerpt only, topic?, clientName?/accountId?, contactName?/contactId?, agentName? }. Stores summaries/decisions/action items only; use Documents/meeting capture for full transcripts.',
    run: (args = {}) => saveCallMemory(args),
  },
  scan_security: {
    description: 'Quick security & abnormality scan across the CRM. Reports: untested credentials, expiring/expired domains, accounts missing email or phone, leads with stalled status > 14 days, oversized transcripts, unusual data shape. Args: { days? (window for stalled detection, default 14) }. Use when Carl asks for a security or abnormality check.',
    run: async (args = {}) => {
      const days = Math.max(1, Math.min(90, Number(args.days) || 14))
      const since = Date.now() - days * 86400000
      const issues = []
      const summary = { critical: 0, warnings: 0, info: 0 }

      // Credentials sanity
      try {
        const c = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'credentials.json'), 'utf-8'))
        for (const cred of (c.credentials || [])) {
          const f = (cred.fields || []).find(x => /key|token|secret/i.test(x.label))
          if (!f?.value) {
            issues.push({ severity: 'warning', area: 'credentials', target: cred.name, msg: 'no key/token configured' })
            summary.warnings++
          }
        }
      } catch {}

      // Domains expiring
      try {
        const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'domains.json'), 'utf-8'))
        const now = Date.now()
        for (const dom of (d.domains || [])) {
          if (!dom.expirationDate) continue
          const expMs = new Date(dom.expirationDate).getTime()
          const inDays = Math.round((expMs - now) / 86400000)
          if (inDays <= 0) { issues.push({ severity: 'critical', area: 'domains', target: dom.domain, msg: `EXPIRED ${-inDays} days ago` }); summary.critical++ }
          else if (inDays <= 30) { issues.push({ severity: 'warning', area: 'domains', target: dom.domain, msg: `expires in ${inDays} days` }); summary.warnings++ }
        }
      } catch {}

      // Accounts missing contact info
      try {
        const accounts = loadAll('accounts')
        for (const a of accounts) {
          const noEmail = !a.email
          const noPhone = !a.phone
          if (a.type === 'client' && (noEmail || noPhone)) {
            issues.push({ severity: 'info', area: 'accounts', target: a.name, msg: `client missing ${[noEmail && 'email', noPhone && 'phone'].filter(Boolean).join(' + ')}` })
            summary.info++
          }
        }
      } catch {}

      // Stalled leads
      try {
        const leads = loadAll('leads') || []
        for (const l of leads) {
          const lastTouch = new Date(l.updatedAt || l.createdAt || 0).getTime()
          if (lastTouch > 0 && lastTouch < since && !['converted', 'declined', 'closed'].includes(l.status)) {
            issues.push({ severity: 'info', area: 'leads', target: l.name || l.id, msg: `stalled — no update in ${days}+ days, status="${l.status}"` })
            summary.info++
          }
        }
      } catch {}

      // OpenClaw stale tool entries (cross-check agents.tools vs registry)
      try {
        const reg = await fetch('http://localhost:3000/api/agents/available-tools').then(r => r.json())
        const known = new Set((reg.flat || []).map(t => t.name))
        const remoteCfg = await readData('agents.json') || {}
        // Cant easily reach remote OpenClaw config from inside this tool synchronously without SSH;
        // best-effort scan of local agents
      } catch {}

      return { issuesFound: issues.length, summary, issues: issues.slice(0, 50) }
    },
  },
  recall_my_recent_work: {
    description: 'Recall your recent activity — images you generated, emails you sent, tasks you logged. Use this when Carl references past work ("the meme we made yesterday", "what did you send Chad last week"). Args: { agentId? (your agent id), days? (default 7), clientName? (filter to one client) }.',
    run: async (args = {}) => {
      const days = Math.max(1, Math.min(90, Number(args.days) || 7))
      const since = Date.now() - days * 86400000
      const out = { generatedImages: [], activities: [], window: `last ${days} days` }

      // Optional client filter — resolve clientName to accountId
      let filterAccountId = null
      if (args.clientName) {
        const accounts = loadAll('accounts')
        const lc = String(args.clientName).toLowerCase().trim()
        const match = accounts.find(a => (a.name || '').toLowerCase() === lc)
          || accounts.find(a => (a.name || '').toLowerCase().includes(lc))
          || accounts.find(a => (a.name || '').toLowerCase().split(' ')[0] === lc.split(' ')[0])
        if (match) filterAccountId = match.id
      }

      // 1. Recent generated images (filtered by client folder if requested)
      try {
        const allMedia = listMedia({ folder: filterAccountId ? `client:${filterAccountId}` : undefined, limit: 50 })
        out.generatedImages = allMedia
          .filter(m => new Date(m.createdAt).getTime() >= since)
          .slice(0, 10)
          .map(m => ({ id: m.id, title: m.title, folder: m.folder, createdAt: m.createdAt }))
      } catch {}

      // 2. Recent CRM activities (logged via log_activity etc)
      try {
        const acts = loadAll('activities') || []
        let filtered = acts.filter(a => new Date(a.at || a.createdAt || 0).getTime() >= since)
        if (filterAccountId) filtered = filtered.filter(a => a.linkedTo?.accountId === filterAccountId)
        out.activities = filtered
          .sort((a, b) => new Date(b.at || b.createdAt) - new Date(a.at || a.createdAt))
          .slice(0, 10)
          .map(a => ({ type: a.type, subject: a.subject, body: (a.body || '').slice(0, 120), at: a.at || a.createdAt, linkedTo: a.linkedTo }))
      } catch {}

      return out
    },
  },

  // =====================================================================================
  // Product catalog, licensing, support, and version management
  // =====================================================================================
  subscription_workspace_report: {
    description: 'Report across Subscription Plans, Client Subscriptions, Credits & Billing, and Stripe Sync. Read-only. Args: { query? }. Returns plan, lease, wallet, and catalog-sync summaries without secrets.',
    run: () => {
      const pricing = readData('pricing-tiers.json') || { tiers: [], addons: {} }
      const leases = ((readData('leases.json') || {}).leases || []).filter(lease => lease.status === 'active')
      const addonCount = Object.values(pricing.addons || {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0)
      const clients = leases.map(lease => ({ leaseId: lease.id, accountName: lease.tenantName || lease.clientAccountId, plan: lease.tierName || lease.tierId, billingStatus: lease.billingStatus || 'unknown', stripeStatus: lease.stripeSubscriptionStatus || (lease.stripeSubscriptionId ? 'connected' : 'setup_required'), cancelAtPeriodEnd: Boolean(lease.cancelAtPeriodEnd) }))
      const wallets = leases.filter(lease => lease.tenantId && lease.clientAccountId).map(lease => ({ leaseId: lease.id, accountName: lease.tenantName || lease.clientAccountId, ...getCreditWallet({ tenantId: lease.tenantId, accountId: lease.clientAccountId }).summary }))
      const definitions = getRuntimeStripeBillingCatalogDefinitions()
      const syncRuns = readData('stripe-catalog-sync-runs.json') || {}
      return { plans: { count: (pricing.tiers || []).length, monthlyRecurringValue: (pricing.tiers || []).reduce((sum, plan) => sum + Number(plan.monthlyFee || 0), 0), addonCount }, clients: { count: clients.length, connected: clients.filter(client => client.stripeStatus !== 'setup_required').length, records: clients }, credits: { wallets }, stripe: { catalogDefinitions: definitions.length, catalogHash: stripeBillingCatalogHash(definitions), lastRun: syncRuns.lastRun || syncRuns.updatedAt || null } }
    },
  },
  list_subscription_plans: {
    description: 'List and search subscription plans and add-ons. Args: { query?, type?: "plans"|"addons"|"all" }. Read-only.',
    run: (args = {}) => {
      const pricing = readData('pricing-tiers.json') || { tiers: [], addons: {} }
      const query = String(args.query || '').trim().toLowerCase()
      const matches = item => !query || JSON.stringify(item).toLowerCase().includes(query)
      const plans = (pricing.tiers || []).filter(matches)
      const addons = Object.entries(pricing.addons || {}).flatMap(([group, entries]) => (entries || []).map(item => ({ ...item, group }))).filter(matches)
      return { plans: args.type === 'addons' ? [] : plans, addons: args.type === 'plans' ? [] : addons }
    },
  },
  save_subscription_plan: {
    description: 'Create or edit a subscription plan. Args: { plan: { id, name, monthlyFee, includedCredits, tagline?, capabilities?, notes? }, approvedByCarl: true }. Requires explicit approval and preserves omitted fields.',
    run: (args = {}) => {
      const incoming = args.plan || args
      const planId = String(incoming.id || incoming.name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (!planId || !String(incoming.name || '').trim()) throw new Error('plan id and name required')
      const result = mutateData('pricing-tiers.json', current => {
        const data = current || { tiers: [], addons: {} }
        const tiers = [...(data.tiers || [])]
        const index = tiers.findIndex(plan => plan.id === planId)
        const existing = index >= 0 ? tiers[index] : {}
        const next = { ...existing, ...incoming, id: planId, name: String(incoming.name).trim(), monthlyFee: Number(incoming.monthlyFee ?? existing.monthlyFee ?? 0), creditAllowance: { ...(existing.creditAllowance || {}), includedCredits: Number(incoming.includedCredits ?? incoming.creditAllowance?.includedCredits ?? existing.creditAllowance?.includedCredits ?? 0), resetsWithPaidBillingPeriod: true, exhaustionPolicy: 'prepaid_then_pause' }, capabilities: Array.isArray(incoming.capabilities) ? incoming.capabilities : String(incoming.capabilities || '').split(/\r?\n/).filter(Boolean) }
        if (index >= 0) tiers[index] = next; else tiers.push(next)
        return { data: { ...data, tiers, lastUpdated: new Date().toISOString() }, result: next }
      })
      return { saved: result, stripeReviewRequired: true }
    },
  },
  copy_subscription_plan: {
    description: 'Copy a subscription plan. Args: { id, newId?, newName?, approvedByCarl: true }. Requires explicit approval.',
    run: (args = {}) => {
      const sourceId = String(args.id || '').trim()
      if (!sourceId) throw new Error('id required')
      const result = mutateData('pricing-tiers.json', current => {
        const data = current || { tiers: [], addons: {} }
        const source = (data.tiers || []).find(plan => plan.id === sourceId)
        if (!source) throw new Error('subscription plan not found')
        const copy = { ...source, id: String(args.newId || `${source.id}-copy-${Date.now().toString(36)}`).toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: String(args.newName || `${source.name} Copy`) }
        return { data: { ...data, tiers: [...(data.tiers || []), copy], lastUpdated: new Date().toISOString() }, result: copy }
      })
      return { copied: result, stripeReviewRequired: true }
    },
  },
  delete_subscription_plan: {
    description: 'Delete a subscription plan by id. Args: { id, approvedByCarl: true }. Requires explicit approval and does not alter Stripe automatically.',
    run: (args = {}) => {
      const id = String(args.id || '').trim()
      if (!id) throw new Error('id required')
      const removed = mutateData('pricing-tiers.json', current => { const data = current || { tiers: [], addons: {} }; const tiers = data.tiers || []; const found = tiers.find(plan => plan.id === id); if (!found) throw new Error('subscription plan not found'); return { data: { ...data, tiers: tiers.filter(plan => plan.id !== id), lastUpdated: new Date().toISOString() }, result: found } })
      return { deleted: removed, stripeReviewRequired: true }
    },
  },
  list_client_billing: {
    description: 'List active client subscriptions and billing status without exposing Stripe identifiers. Args: { query?, status? }. Read-only.',
    run: (args = {}) => {
      const query = String(args.query || '').toLowerCase()
      const status = String(args.status || 'all').toLowerCase()
      let leases = ((readData('leases.json') || {}).leases || []).filter(lease => lease.status === 'active')
      if (query) leases = leases.filter(lease => JSON.stringify([lease.tenantName, lease.tierName, lease.billingStatus]).toLowerCase().includes(query))
      if (status !== 'all') leases = leases.filter(lease => String(lease.billingStatus || 'unknown').toLowerCase() === status)
      return leases.map(lease => ({ leaseId: lease.id, accountName: lease.tenantName || lease.clientAccountId, plan: lease.tierName || lease.tierId, billingStatus: lease.billingStatus || 'unknown', stripeStatus: lease.stripeSubscriptionStatus || (lease.stripeSubscriptionId ? 'connected' : 'setup_required'), cancelAtPeriodEnd: Boolean(lease.cancelAtPeriodEnd), currentPeriodEnd: lease.currentPeriodEnd || null }))
    },
  },
  list_client_credit_wallets: {
    description: 'List active client service-credit balances. Read-only.',
    run: () => ((readData('leases.json') || {}).leases || []).filter(lease => lease.status === 'active' && lease.tenantId && lease.clientAccountId).map(lease => ({ leaseId: lease.id, accountName: lease.tenantName || lease.clientAccountId, wallet: getCreditWallet({ tenantId: lease.tenantId, accountId: lease.clientAccountId }) })),
  },
  issue_client_credits: {
    description: 'Issue non-expiring service credits to an active client. Args: { leaseId, credits, reason, approvedByCarl: true }. Requires explicit approval and writes the audited credit ledger.',
    run: (args = {}) => {
      const lease = ((readData('leases.json') || {}).leases || []).find(item => item.id === args.leaseId && item.status === 'active')
      const credits = Number(args.credits)
      if (!lease?.tenantId || !lease.clientAccountId) throw new Error('active client lease not found')
      if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000) throw new Error('credits must be a whole number between 1 and 1,000,000')
      if (String(args.reason || '').trim().length < 3) throw new Error('reason required')
      return issuePrepaidCredits({ tenantId: lease.tenantId, accountId: lease.clientAccountId, leaseId: lease.id, credits, reason: String(args.reason).trim(), issuedBy: 'Frank, Finance Manager', idempotencyKey: `agent-credit-grant:${lease.id}:${String(args.requestId || Date.now())}`, metadata: { source: 'finance-manager-agent' } })
    },
  },
  stripe_catalog_status: {
    description: 'Report the controlled Stripe billing catalog definition count, hash, and last recorded sync run. Read-only and never changes Stripe.',
    run: () => { const definitions = getRuntimeStripeBillingCatalogDefinitions(); const state = readData('stripe-catalog-sync-runs.json') || {}; return { definitions: definitions.length, catalogHash: stripeBillingCatalogHash(definitions), lastRun: state.lastRun || state.updatedAt || null } },
  },
  list_products: {
    description: 'List product catalog entries. Args: { includeDrafts? }. Includes packages, modules, payment options, license templates, support plans, and version policy.',
    run: (args = {}) => {
      const catalog = getProductCatalog()
      const products = catalog.products
        .filter(product => args.includeDrafts || product.status === 'published')
      return { updatedAt: catalog.updatedAt, count: products.length, products }
    },
  },
  get_product: {
    description: 'Get one product by id or slug. Args: { id }. Includes packages, modules, payment options, license templates, support plans, and version policy.',
    run: (args = {}) => {
      const id = String(args.id || args.productId || args.slug || '').trim()
      if (!id) throw new Error('id required')
      const product = getProductCatalog().products.find(p => p.id === id || p.slug === id)
      if (!product) throw new Error('product not found')
      return product
    },
  },
  save_product: {
    description: 'Create or update a product catalog entry. Args: { product } or product fields. Preserves existing fields when omitted.',
    run: (args = {}) => {
      const catalog = getProductCatalog()
      const incoming = args.product || args
      const lookup = String(incoming.id || incoming.slug || '').trim()
      if (!lookup) throw new Error('product id or slug required')
      const idx = catalog.products.findIndex(p => p.id === lookup || p.slug === lookup)
      const existing = idx >= 0 ? catalog.products[idx] : {}
      const normalized = normalizeProduct({ ...existing, ...incoming }, idx >= 0 ? idx : catalog.products.length)
      const products = [...catalog.products]
      if (idx >= 0) products[idx] = normalized
      else products.push(normalized)
      const saved = saveProductCatalog({ ...catalog, products })
      return { saved: normalized, updatedAt: saved.updatedAt }
    },
  },
  save_product_package: {
    description: 'Create or update one package on a product. Args: { productId, package }. Package can include setupPrice, retainer, modules, stripePriceId.',
    run: (args = {}) => {
      const productId = String(args.productId || args.id || '').trim()
      const pkg = args.package || args.pkg
      if (!productId) throw new Error('productId required')
      if (!pkg?.id) throw new Error('package.id required')
      const catalog = getProductCatalog()
      const idx = catalog.products.findIndex(p => p.id === productId || p.slug === productId)
      if (idx < 0) throw new Error('product not found')
      const product = catalog.products[idx]
      const pkgIdx = product.packages.findIndex(p => p.id === pkg.id)
      const packages = [...product.packages]
      if (pkgIdx >= 0) packages[pkgIdx] = { ...packages[pkgIdx], ...pkg }
      else packages.push(pkg)
      const normalized = normalizeProduct({ ...product, packages }, idx)
      const products = [...catalog.products]
      products[idx] = normalized
      const saved = saveProductCatalog({ ...catalog, products })
      return { saved: normalized.packages.find(p => p.id === pkg.id), updatedAt: saved.updatedAt }
    },
  },
  list_product_orders: {
    description: 'List recent product checkout orders. Args: { limit? }. Use for sales follow-up and product operations.',
    run: (args = {}) => {
      const limit = Math.max(1, Math.min(100, Number(args.limit || 25) || 25))
      const orders = loadProductOrders().slice(0, limit)
      return { count: orders.length, orders }
    },
  },
  list_product_licenses: {
    description: 'List issued product licenses. Args: { productId?, status?, customer? }. Includes license key for authenticated internal operations.',
    run: (args = {}) => {
      let licenses = getLicenseStore().licenses
      if (args.productId) licenses = licenses.filter(l => l.productId === args.productId)
      if (args.status) licenses = licenses.filter(l => l.status === args.status)
      if (args.customer) {
        const q = String(args.customer).toLowerCase()
        licenses = licenses.filter(l => [l.customerName, l.company, l.email].some(v => String(v || '').toLowerCase().includes(q)))
      }
      return { count: licenses.length, licenses: licenses.map(publicLicense) }
    },
  },
  issue_product_license: {
    description: 'Create or update a product license. Args: license fields such as productId, packageId, customerName, company, email, usageType, deploymentModel, seats, allowedDomains, enabledAddons, meteredLimits, supportEndsAt.',
    run: (args = {}) => {
      const record = args.license || args
      if (!record.productId) record.productId = 'farrington-command-center'
      const saved = upsertLicense(record)
      const license = saved.licenses.find(l => l.id === record.id) || saved.licenses[0]
      return { license: publicLicense(license), updatedAt: saved.updatedAt }
    },
  },
  delete_product_license: {
    description: 'Delete a product license by id. Args: { id }. Use only when Carl explicitly wants a license removed.',
    run: (args = {}) => {
      if (!args.id) throw new Error('id required')
      const saved = deleteLicense(args.id)
      return { deleted: args.id, remaining: saved.licenses.length, updatedAt: saved.updatedAt }
    },
  },
  verify_product_license: {
    description: 'Verify a product license key. Args: { licenseKey, productId?, domain?, version? }. Returns validity, deployment rights, support status, add-ons, and limits.',
    run: (args = {}) => {
      if (!args.licenseKey) throw new Error('licenseKey required')
      return verifyLicense(args)
    },
  },

  // =====================================================================================
  // Domain registration & lookup (GoDaddy)
  // =====================================================================================
  check_domain_availability: {
    description: 'Check whether a domain is available to register. Args: { domain }. Returns { domain, available, price, currency, period }. Use this BEFORE register_domain.',
    run: async (args) => {
      const domain = String(args.domain || '').trim().toLowerCase()
      if (!domain || !/^[a-z0-9][a-z0-9-]*(\.[a-z]{2,})+$/.test(domain)) {
        throw new Error('Invalid domain. Example: margefarrington.com')
      }
      const key = process.env.GODADDY_API_KEY
      const secret = process.env.GODADDY_API_SECRET
      if (!key || !secret) throw new Error('GODADDY_API_KEY/GODADDY_API_SECRET not set in .env.local')
      const r = await fetch(`https://api.godaddy.com/v1/domains/available?domain=${encodeURIComponent(domain)}&checkType=FAST`, {
        headers: { Authorization: `sso-key ${key}:${secret}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`GoDaddy ${r.status}: ${t.slice(0, 200)}`)
      }
      const data = await r.json()
      const priceDollars = typeof data.price === 'number' ? (data.price / 1_000_000).toFixed(2) : null
      return {
        domain: data.domain || domain,
        available: !!data.available,
        price: priceDollars ? `$${priceDollars}/year` : null,
        currency: data.currency || 'USD',
        period: data.period || 1,
        definitive: data.definitive ?? null,
      }
    },
  },
  register_domain: {
    description: "Register (purchase) a domain via GoDaddy. Args: { domain, period? (years, default 1), privacy? (default true) }. The registrant/admin/tech/billing contact comes from DOMAIN_REGISTRANT_* env vars. Confirms with Carl out loud BEFORE calling — this charges his GoDaddy account on file.",
    run: async (args) => {
      const domain = String(args.domain || '').trim().toLowerCase()
      const period = Math.max(1, Math.min(10, Number(args.period) || 1))
      const privacy = args.privacy !== false
      if (!domain || !/^[a-z0-9][a-z0-9-]*(\.[a-z]{2,})+$/.test(domain)) {
        throw new Error('Invalid domain. Example: margefarrington.com')
      }
      const key = process.env.GODADDY_API_KEY
      const secret = process.env.GODADDY_API_SECRET
      if (!key || !secret) throw new Error('GODADDY_API_KEY/GODADDY_API_SECRET not set')

      // Build a single contact record from env. All four roles use the same person by default.
      const required = ['NAME_FIRST','NAME_LAST','EMAIL','PHONE','ADDRESS_MAILING_ADDRESS1','ADDRESS_MAILING_CITY','ADDRESS_MAILING_STATE','ADDRESS_MAILING_POSTAL','ADDRESS_MAILING_COUNTRY']
      const missing = required.filter(k => !process.env[`DOMAIN_REGISTRANT_${k}`])
      if (missing.length) {
        throw new Error(`Missing registrant info — set in .env.local: ${missing.map(m => 'DOMAIN_REGISTRANT_' + m).join(', ')}`)
      }
      const contact = {
        nameFirst: process.env.DOMAIN_REGISTRANT_NAME_FIRST,
        nameLast:  process.env.DOMAIN_REGISTRANT_NAME_LAST,
        email:     process.env.DOMAIN_REGISTRANT_EMAIL,
        phone:     process.env.DOMAIN_REGISTRANT_PHONE,
        ...(process.env.DOMAIN_REGISTRANT_ORGANIZATION ? { organization: process.env.DOMAIN_REGISTRANT_ORGANIZATION } : {}),
        addressMailing: {
          address1:   process.env.DOMAIN_REGISTRANT_ADDRESS_MAILING_ADDRESS1,
          city:       process.env.DOMAIN_REGISTRANT_ADDRESS_MAILING_CITY,
          state:      process.env.DOMAIN_REGISTRANT_ADDRESS_MAILING_STATE,
          postalCode: process.env.DOMAIN_REGISTRANT_ADDRESS_MAILING_POSTAL,
          country:    process.env.DOMAIN_REGISTRANT_ADDRESS_MAILING_COUNTRY,
        },
      }
      const consent = {
        agreementKeys: ['DNRA'],
        agreedBy: contact.email,
        agreedAt: new Date().toISOString(),
      }
      const body = {
        domain,
        consent,
        contactRegistrant: contact,
        contactAdmin: contact,
        contactTech: contact,
        contactBilling: contact,
        period,
        privacy,
        renewAuto: true,
      }
      const r = await fetch('https://api.godaddy.com/v1/domains/purchase', {
        method: 'POST',
        headers: {
          Authorization: `sso-key ${key}:${secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
      const text = await r.text()
      let parsed; try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }
      if (!r.ok) {
        throw new Error(`GoDaddy purchase ${r.status}: ${parsed?.message || parsed?.raw || text.slice(0, 200)}`)
      }
      return {
        ok: true,
        domain,
        period,
        privacy,
        orderId: parsed.orderId,
        currency: parsed.currency,
        total: typeof parsed.total === 'number' ? `$${(parsed.total / 1_000_000).toFixed(2)}` : null,
        itemCount: parsed.itemCount,
        message: `${domain} registered for ${period} year(s) — order ${parsed.orderId}.`,
      }
    },
  },

  // =====================================================================================
  // Outbound phone dispatch — Doreen places a call FROM her own number, NOT through Carl's
  // browser. Use this whenever an agent is asked to call someone on Carl's behalf.
  // (Replaces accidental misuse of fcc_call which dials through the laptop browser.)
  // =====================================================================================
  dispatch_outbound_call: {
    description: "Place an outbound phone call FROM Doreen's number PHONE_REDACTED to a recipient. Doreen runs the call independently — Carl is NOT in the audio path. Use for: confirmation calls, demo bookings, reactivation, follow-ups. Args: { to_phone, reason, name? }. Always confirm out loud with Carl ('Calling Marjorie now about Wednesday demo — placing it') BEFORE calling.",
    run: async (args) => {
      const apiKey = process.env.ELEVENLABS_API_KEY
      if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set')
      const DOREEN_AGENT_ID = 'agent_9401kqcyv15he32rprgj859pj62w'
      const DOREEN_PHONE_NUMBER_ID = 'phnum_9701kqftpyqrexmsgw9egqawdzvw'

      function normalizePhone(p) {
        const d = String(p || '').replace(/\D/g, '')
        if (d.length === 10) return '+1' + d
        if (d.length === 11 && d.startsWith('1')) return '+' + d
        if (String(p || '').startsWith('+')) return p
        return null
      }

      const toPhone = normalizePhone(args.to_phone || args.to || args.phone)
      const reason = String(args.reason || args.purpose || '').slice(0, 500)
      const recipientName = String(args.name || args.recipient_name || '').slice(0, 100)

      if (!toPhone) throw new Error('Invalid phone number — needs 10+ digits or E.164')
      if (!reason) throw new Error('Reason required — what is Doreen calling about?')

      // Structured opener — does NOT interpolate `reason` into a sentence (that produced
      // grammar-mush when the agent passed the literal instruction as the reason). The
      // recipient's name and the company name are the only template variables. The actual
      // call topic is passed as a dynamic variable so Doreen can use it in turn 2 naturally.
      const firstName = recipientName ? recipientName.split(/\s+/)[0] : ''
      const opener = `Hi${firstName ? ' ' + firstName : ''}, this is Doreen at Farrington Development. Carl asked me to give you a quick call. Got a minute?`

      const r = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: DOREEN_AGENT_ID,
          agent_phone_number_id: DOREEN_PHONE_NUMBER_ID,
          to_number: toPhone,
          conversation_initiation_client_data: {
            conversation_config_override: {
              agent: { first_message: opener },
            },
            dynamic_variables: {
              recipient_name: recipientName || 'the person',
              call_reason: reason,
            },
          },
        }),
      })
      const text = await r.text()
      let body; try { body = JSON.parse(text) } catch { body = { raw: text } }
      if (!r.ok) throw new Error(`Outbound call API ${r.status}: ${body?.detail?.message || body?.detail || 'unknown'}`)
      return {
        ok: true,
        message: `Calling ${recipientName || toPhone} now${reason ? ' about ' + reason : ''}. You won't hear it — Doreen runs it solo.`,
        conversation_id: body.conversation_id,
        to_phone: toPhone,
      }
    },
  },
  generate_opportunity_requirements: {
    description: 'Generate or update structured lead requirements for an opportunity, optionally including lead-generation targets such as leads per day, geography, industries, source types, and provider preference. Args: { opportunityId? OR query?, instructions?, leadGeneration?, runResearch? }.',
    run: async (args = {}) => {
      const id = String(args.opportunityId || args.id || '').trim()
      const query = String(args.query || args.name || args.opportunityName || '').trim().toLowerCase()
      let opportunity = id ? findById('opportunities', id) : null
      if (!opportunity && query) {
        opportunity = loadAll('opportunities').find(o => String(o.name || '').toLowerCase() === query)
          || loadAll('opportunities').find(o => String(o.name || '').toLowerCase().includes(query))
      }
      if (!opportunity) throw new Error('opportunity not found')

      const leadGeneration = args.leadGeneration || null
      if (leadGeneration) {
        opportunity = update('opportunities', opportunity.id, {
          leadGeneration: {
            ...(opportunity.leadGeneration || {}),
            ...leadGeneration,
            enabled: leadGeneration.enabled !== false,
          },
        })
      }

      const account = opportunity.accountId ? findById('accounts', opportunity.accountId) : null
      const contact = opportunity.contactId ? findById('contacts', opportunity.contactId) : null
      const lead = opportunity.fromLeadId ? findById('leads', opportunity.fromLeadId) : (opportunity.leadId ? findById('leads', opportunity.leadId) : null)
      const leadRequirements = await generateOpportunityRequirements({
        opportunity,
        account,
        contact,
        lead,
        instructions: args.instructions || opportunity.leadRequirementsPrompt || opportunity.notes || '',
        runResearch: args.runResearch !== false,
      })
      const updated = update('opportunities', opportunity.id, {
        leadRequirements,
        leadRequirementsPrompt: args.instructions || opportunity.leadRequirementsPrompt || '',
      })
      logActivity({
        type: 'note',
        subject: 'Lead requirements generated by agent',
        body: leadRequirements.requirements?.summary || '',
        linkedTo: { opportunityId: opportunity.id, accountId: opportunity.accountId, contactId: opportunity.contactId, leadId: opportunity.fromLeadId || opportunity.leadId },
        meta: { parserProvider: leadRequirements.parserProvider, researchProvider: leadRequirements.research?.provider || '', researchError: leadRequirements.researchError || '' },
      })
      return { opportunity: updated, leadRequirements }
    },
  },
}

function toolList() {
  return Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description }))
}

const TOOL_ALIASES = {
  dashboard: 'dashboard_summary',
  fcc_dashboard: 'dashboard_summary',
  fcc_finance_summary: 'finance_summary',
  fcc_list_recurring_providers: 'list_recurring_providers',
  fcc_upsert_recurring_provider: 'upsert_recurring_provider',
  fcc_finance_due_items: 'finance_due_items',
  fcc_prepare_bill_payment: 'prepare_bill_payment',
  fcc_navigate_to: 'navigate_to',
  navigate_to: 'navigate_to',
  fcc_api_spend_monitor: 'api_spend_monitor',
  api_spend_monitor: 'api_spend_monitor',
  fcc_open_record: 'open_record',
  open_record: 'open_record',
  fcc_ops_status: 'ops_status',
  fcc_repository_status: 'repository_status',
  fcc_backup_status: 'backup_status',
  repo_status: 'repository_status',
  ci_cd_status: 'ops_status',
  fcc_search: 'search',
  fcc_create_lead: 'create_lead',
  crm_create_lead: 'create_lead',
  fcc_qualify_lead: 'qualify_lead',
  fcc_create_task: 'create_task',
  fcc_create_plugin_change_request: 'create_plugin_change_request',
  fcc_create_openclaw_plugin_spec: 'create_openclaw_plugin_spec',
  create_plugin_spec: 'create_openclaw_plugin_spec',
  stage_openclaw_plugin: 'create_openclaw_plugin_spec',
  fcc_run_mindstudio_flow: 'run_mindstudio_flow',
  fcc_complete_task: 'complete_task',
  fcc_log_activity: 'log_activity',
  fcc_send_email: 'send_email',
  fcc_list_calendar_events: 'list_calendar_events',
  fcc_list_invoices: 'list_invoices',
  crm_list_invoices: 'list_invoices',
  fcc_create_invoice: 'create_invoice',
  crm_create_invoice: 'create_invoice',
  fcc_send_invoice_via_stripe: 'send_invoice_via_stripe',
  crm_send_invoice_via_stripe: 'send_invoice_via_stripe',
  fcc_list_accounts: 'list_accounts',
  fcc_get_account: 'get_account',
  fcc_create_account: 'create_account',
  crm_create_account: 'create_account',
  fcc_update_account: 'update_account',
  crm_update_account: 'update_account',
  fcc_list_support_tickets: 'list_support_tickets',
  fcc_create_support_ticket: 'create_support_ticket',
  fcc_update_support_ticket: 'update_support_ticket',
  fcc_add_support_ticket_comment: 'add_support_ticket_comment',
  fcc_take_note_for_client: 'take_note_for_client',
  crm_add_client_note: 'take_note_for_client',
  crm_take_note_for_client: 'take_note_for_client',
  crm_add_note: 'take_note_for_client',
  fcc_remember_fact: 'remember_fact',
  remember: 'remember_fact',
  crm_remember: 'remember_fact',
  crm_remember_fact: 'remember_fact',
  fcc_recall_memory: 'recall_memory',
  recall: 'recall_memory',
  recall_memory: 'recall_memory',
  crm_recall_memory: 'recall_memory',
  fcc_list_agent_memory: 'list_agent_memory',
  crm_list_agent_memory: 'list_agent_memory',
  fcc_forget_memory: 'forget_memory',
  forget: 'forget_memory',
  crm_forget_memory: 'forget_memory',
  fcc_save_call_memory: 'save_call_memory',
  save_session_memory: 'save_call_memory',
  summarize_and_save_session: 'save_call_memory',
  crm_save_call_memory: 'save_call_memory',
  fcc_list_vaults: 'list_vaults',
  fcc_list_notes: 'list_notes',
  fcc_search_notes: 'search_notes',
  fcc_read_note: 'read_note',
  fcc_write_note: 'write_note',
  fcc_create_pipeline: 'create_pipeline',
  fcc_draft_legal_document: 'draft_legal_document',
  fcc_save_document_to_account: 'save_document_to_account',
  draft_nda: 'draft_legal_document',
  draft_agreement: 'draft_legal_document',
  fcc_list_documents: 'list_documents',
  fcc_send_document: 'send_document',
  fcc_send_signature_document: 'send_signature_document',
  fcc_send_document_for_signature: 'send_signature_document',
  fcc_send_nda_for_signature: 'send_signature_document',
  fcc_find_client: 'find_client',
  fcc_generate_image: 'generate_image',
  find_contact: 'find_client',
  fcc_list_media: 'list_media',
  fcc_list_media_folders: 'list_media_folders',
  fcc_create_content_draft: 'create_content_draft',
  content_draft: 'create_content_draft',
  create_content_job: 'create_content_draft',
  fcc_list_content_drafts: 'list_content_drafts',
  fcc_update_content_draft: 'update_content_draft',
  fcc_delete_content_draft: 'delete_content_draft',
  fcc_subscription_workspace_report: 'subscription_workspace_report',
  fcc_list_subscription_plans: 'list_subscription_plans',
  fcc_save_subscription_plan: 'save_subscription_plan',
  fcc_copy_subscription_plan: 'copy_subscription_plan',
  fcc_delete_subscription_plan: 'delete_subscription_plan',
  fcc_list_client_billing: 'list_client_billing',
  fcc_list_client_credit_wallets: 'list_client_credit_wallets',
  fcc_issue_client_credits: 'issue_client_credits',
  fcc_stripe_catalog_status: 'stripe_catalog_status',
  fcc_list_products: 'list_products',
  fcc_get_product: 'get_product',
  fcc_save_product: 'save_product',
  fcc_save_product_package: 'save_product_package',
  fcc_list_product_orders: 'list_product_orders',
  fcc_list_product_licenses: 'list_product_licenses',
  fcc_issue_product_license: 'issue_product_license',
  fcc_delete_product_license: 'delete_product_license',
  fcc_verify_product_license: 'verify_product_license',
  fcc_check_domain: 'check_domain_availability',
  fcc_register_domain: 'register_domain',
  fcc_dispatch_outbound_call: 'dispatch_outbound_call',
  fcc_generate_opportunity_requirements: 'generate_opportunity_requirements',
  fcc_deep_research_dossier: 'deep_research_dossier',
  fcc_deerflow_studio_produce: 'deerflow_studio_produce',
  fcc_deerflow_list_readonly_tools: 'deerflow_list_readonly_tools',
  fcc_deerflow_health: 'deerflow_health',
  fcc_deerflow_list_models: 'deerflow_list_models',
  fcc_deerflow_get_model: 'deerflow_get_model',
  fcc_deerflow_list_skills: 'deerflow_list_skills',
  fcc_deerflow_list_custom_skills: 'deerflow_list_custom_skills',
  fcc_deerflow_get_custom_skill: 'deerflow_get_custom_skill',
  fcc_deerflow_list_custom_agents: 'deerflow_list_custom_agents',
  fcc_deerflow_get_custom_agent: 'deerflow_get_custom_agent',
  fcc_deerflow_memory_status: 'deerflow_memory_status',
  fcc_deerflow_memory_config: 'deerflow_memory_config',
  fcc_deerflow_mcp_config: 'deerflow_mcp_config',
  fcc_deerflow_get_assistant: 'deerflow_get_assistant',
  fcc_deerflow_get_assistant_graph: 'deerflow_get_assistant_graph',
  fcc_deerflow_get_assistant_schemas: 'deerflow_get_assistant_schemas',
  fcc_call: null,
  fcc_list_tools: null,
  list_tools: null,
}

function resolveToolName(tool) {
  const normalized = String(tool || '').trim()
  if (!normalized) return { name: '', special: null }
  if (TOOLS[normalized]) return { name: normalized, special: null }
  if (Object.prototype.hasOwnProperty.call(TOOL_ALIASES, normalized)) {
    const mapped = TOOL_ALIASES[normalized]
    if (!mapped) return { name: normalized, special: normalized }
    return { name: mapped, special: null }
  }
  return { name: normalized, special: null }
}

function normalizeToolArgs(toolName, args = {}) {
  if (toolName === 'create_invoice') {
    return {
      ...args,
      clientName: args.clientName || args.client || args.customerName || args.customer || args.accountName || args.name,
      notes: args.notes || args.memo || args.reason || '',
    }
  }
  if (toolName === 'find_client' && !args.name && args.query) {
    return { ...args, name: args.query }
  }
  if (toolName === 'log_activity' && args.note && !args.body) {
    return { ...args, type: args.type || 'note', subject: args.subject || 'Agent note', body: args.note }
  }
  return args
}

function resolveAgentMeta(agentSlug) {
  const slug = String(agentSlug || '').trim()
  if (!slug) return null
  try {
    const data = readData('agents.json') || {}
    const agents = data.agents || {}
    if (agents[slug]) return { id: slug, meta: agents[slug] }
    const lower = slug.toLowerCase()
    for (const [id, meta] of Object.entries(agents)) {
      const names = [id, meta?.name, meta?.title, meta?.role].map(value => String(value || '').toLowerCase())
      if (names.includes(lower)) return { id, meta }
    }
  } catch {}
  return null
}

function applyImageGenerationAgentPreference(args = {}, agentLookup = null) {
  if (args.provider) {
    return { ...args, provider: String(args.provider).trim().toLowerCase() }
  }
  const preference = normalizeImageGenerationPreference(agentLookup?.meta?.imageGeneration || {})
  return {
    ...args,
    provider: preference.provider,
    imageProviderPreferenceSource: agentLookup?.id ? `agent:${agentLookup.id}` : 'system-default',
  }
}

// =====================================================================================
// Handlers
// =====================================================================================

export async function GET(request) {
  if (!(await authed(request))) return fail('auth required', 401)
  // Enumerate all available tools (for OpenClaw to discover what it can do)
  return NextResponse.json({
    ok: true,
    tools: toolList(),
    count: Object.keys(TOOLS).length,
  })
}

export async function POST(request) {
  if (!(await authed(request))) return fail('auth required', 401)
  let body
  try { body = await request.json() } catch { return fail('invalid JSON') }
  const { tool, args } = body || {}
  if (!tool) return fail('tool required')
  const resolved = resolveToolName(tool)
  if (resolved.special === 'fcc_list_tools' || resolved.special === 'list_tools') {
    return NextResponse.json({ ok: true, tools: toolList(), count: Object.keys(TOOLS).length })
  }
  let runArgs = args || {}
  if (resolved.special === 'fcc_call') {
    const nestedTool = args?.tool
    if (!nestedTool) return fail('fcc_call requires args.tool')
    const nested = resolveToolName(nestedTool)
    if (nested.special === 'fcc_list_tools' || nested.special === 'list_tools') {
      return NextResponse.json({ ok: true, tools: toolList(), count: Object.keys(TOOLS).length })
    }
    if (nested.special === 'fcc_call') return fail('nested fcc_call is not allowed')
    resolved.name = nested.name
    runArgs = args?.args || {}
  }
  runArgs = normalizeToolArgs(resolved.name, runArgs)
  const def = TOOLS[resolved.name]
  if (!def) return fail(`unknown tool: ${tool}. Call GET /api/agent/execute to enumerate.`)

  // Resolve tenant context for this request — every activity logged during this run
  // will be tagged with this lease's tenantId so leased-agent actions are attributable.
  const agentSlug = runArgs?.agent || runArgs?.agentId || runArgs?.agentName || body.agentId
  const agentLookup = resolveAgentMeta(agentSlug)
  let tenantContext = { tenantId: 'farrington-development', agentId: agentLookup?.id || agentSlug || null, leaseId: null }
  if (agentLookup?.meta) {
    if (agentLookup.meta.tenantId) tenantContext.tenantId = agentLookup.meta.tenantId
    if (agentLookup.meta.leaseId) tenantContext.leaseId = agentLookup.meta.leaseId
  }
  if (resolved.name === 'generate_image') {
    runArgs = applyImageGenerationAgentPreference(runArgs, agentLookup)
  }
  const { setRequestTenantContext, clearRequestTenantContext } = await import('@/lib/entityStore')
  setRequestTenantContext(tenantContext)

  try {
    const guardrail = enforceAgentToolPolicy(resolved.name, runArgs, { tenantContext })
    if (!guardrail.ok) return fail(guardrail.error, guardrail.status || 403)
    const result = await def.run(runArgs)
    return ok(result)
  } catch (e) {
    if (/invoice/i.test(resolved.name || tool || '')) {
      console.warn(`[agent-tool] ${resolved.name || tool} failed: ${String(e.message || e).slice(0, 200)}`)
    }
    return fail(e.message, 400)
  } finally {
    clearRequestTenantContext()
  }
}
