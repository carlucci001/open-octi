import fs from 'fs'
import path from 'path'
import { readData, writeData } from './dataStore'

export const OWNER_INBOXES = [
  {
    id: 'owner-catchall',
    label: 'Owner Catch-all',
    domains: ['personal@example.invalid'],
    aliases: ['gmail', 'forwarded', 'unknown'],
    catchAll: true,
  },
  {
    id: 'farringtondevelopment',
    label: 'Farrington Development',
    domains: ['company.example.com'],
    aliases: ['info', 'hello', 'support', 'sales', 'carl'],
  },
  {
    id: 'ContentHub',
    label: 'ContentHub',
    domains: ['content.example.com'],
    aliases: ['info', 'hello', 'support', 'sales', 'carl'],
  },
  {
    id: 'wnctimes',
    label: 'WNC Times',
    domains: ['wnctimes.com'],
    aliases: ['info', 'hello', 'support', 'news', 'sales'],
  },
  {
    id: 'gorillaskills',
    label: 'Gorilla Skills',
    domains: ['gorillaskills.com'],
    aliases: ['info', 'hello', 'support', 'sales'],
  },
  {
    id: 'trysafehouse',
    label: 'Safehouse',
    domains: ['trysafehouse.com'],
    aliases: ['info', 'hello', 'support', 'sales'],
  },
]

const INBOX_FILE = 'owner-inbox.json'
const NYLAS_BASE_URL = process.env.NYLAS_BASE_URL || 'https://api.us.nylas.com/v3'

const OPPORTUNITY_WORDS = [
  'quote', 'estimate', 'proposal', 'pricing', 'price', 'cost', 'demo', 'interested',
  'website', 'crm', 'automation', 'support', 'help', 'build', 'project', 'call',
  'meeting', 'onboarding', 'invoice', 'contract', 'available', 'launch',
]

const SPAM_WORDS = [
  'seo backlink', 'guest post', 'casino', 'crypto', 'loan approved', 'viagra',
  'winner', 'prize', 'lottery', 'wire transfer', 'urgent investment',
  'unsubscribe', 'black friday', 'limited time offer',
]

function emptyStore() {
  return { lastUpdated: null, lastSyncAt: null, messages: [] }
}

function readStore() {
  const data = readData(INBOX_FILE)
  if (!data || typeof data !== 'object') return emptyStore()
  return { ...emptyStore(), ...data, messages: Array.isArray(data.messages) ? data.messages : [] }
}

function writeStore(data) {
  const next = { ...emptyStore(), ...data, lastUpdated: new Date().toISOString() }
  writeData(INBOX_FILE, next)
  return next
}

function clean(value) {
  return String(value || '').trim()
}

function lower(value) {
  return clean(value).toLowerCase()
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function addressValue(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.email || value.email_address || value.address || value.name || ''
}

function normalizeAddresses(value) {
  return asArray(value).map(addressValue).map(clean).filter(Boolean)
}

function allRecipients(message) {
  return [
    ...normalizeAddresses(message.to),
    ...normalizeAddresses(message.cc),
    ...normalizeAddresses(message.bcc),
  ]
}

function inboxForAddresses(addresses = []) {
  const haystack = addresses.map(lower)
  return OWNER_INBOXES.find(inbox =>
    !inbox.catchAll &&
    inbox.domains.some(domain => haystack.some(address => address.endsWith(`@${domain}`) || address.includes(`@${domain}`)))
  ) || null
}

function catchAllInbox() {
  return OWNER_INBOXES.find(inbox => inbox.catchAll) || null
}

function classifyText(subject, snippet, from, folders = []) {
  const text = lower([subject, snippet, from, ...folders].join(' '))
  const spamSignals = SPAM_WORDS.filter(word => text.includes(word))
  const opportunitySignals = OPPORTUNITY_WORDS.filter(word => text.includes(word))
  const folderSpam = folders.some(folder => /spam|junk|trash/i.test(folder))
  const isSpam = folderSpam || spamSignals.length >= 2
  const priority = isSpam ? 'spam' : opportunitySignals.length >= 2 ? 'high' : opportunitySignals.length === 1 ? 'medium' : 'normal'
  const category = isSpam ? 'spam' : opportunitySignals.length ? 'opportunity' : 'legitimate'
  return { category, priority, spamSignals, opportunitySignals, isSpam }
}

export function listOwnerInboxMessages({ inbox = 'all', includeArchived = false, includeDeleted = false } = {}) {
  const store = readStore()
  const messages = store.messages
    .filter(message => includeDeleted || !message.deleted)
    .filter(message => includeArchived || !message.archived)
    .filter(message => inbox === 'all' || message.inboxId === inbox)
    .sort((a, b) => new Date(b.receivedAt || b.createdAt || 0) - new Date(a.receivedAt || a.createdAt || 0))
  return { ...store, inboxes: OWNER_INBOXES, messages }
}

export function updateOwnerInboxMessages(ids = [], patch = {}) {
  const idSet = new Set(asArray(ids).filter(Boolean))
  const store = readStore()
  const messages = store.messages.map(message => (
    idSet.has(message.id) ? { ...message, ...patch, updatedAt: new Date().toISOString() } : message
  ))
  return writeStore({ ...store, messages })
}

export function deleteOwnerInboxMessages(ids = []) {
  return updateOwnerInboxMessages(ids, {
    deleted: true,
    archived: false,
    unread: false,
    deletedAt: new Date().toISOString(),
  })
}

export function ingestOwnerInboxMessage(input = {}) {
  const store = readStore()
  const from = normalizeAddresses(input.from)[0] || clean(input.from)
  const recipients = allRecipients(input)
  let inbox = input.inboxId
    ? OWNER_INBOXES.find(item => item.id === input.inboxId)
    : inboxForAddresses(recipients)

  const classification = classifyText(input.subject, input.snippet || input.text || input.body, from, input.folders || [])
  if (classification.isSpam && !input.keepSpam) return { ok: false, reason: 'spam_filtered', classification }
  if (!inbox && input.allowCatchAll) inbox = catchAllInbox()
  if (!inbox) return { ok: false, reason: 'unmonitored_recipient' }

  const provider = clean(input.provider) || 'manual'
  const providerMessageId = clean(input.providerMessageId || input.messageId || input.id)
  const id = providerMessageId ? `${provider}:${providerMessageId}` : `manual:${Date.now()}`
  const now = new Date().toISOString()
  const nextMessage = {
    id,
    provider,
    providerMessageId,
    grantId: input.grantId || null,
    inboxId: inbox.id,
    inboxLabel: inbox.label,
    domain: inbox.domains[0],
    catchAll: Boolean(inbox.catchAll),
    from,
    to: recipients,
    kind: clean(input.kind) || 'email',
    phone: clean(input.phone) || null,
    handled: false,
    handledAt: null,
    subject: clean(input.subject) || '(no subject)',
    snippet: clean(input.snippet || input.text || input.body).slice(0, 600),
    body: clean(input.body || input.text || '').slice(0, 30000),
    html: clean(input.html || '').slice(0, 30000),
    receivedAt: input.receivedAt || input.date || now,
    threadId: input.threadId || input.thread_id || null,
    unread: input.unread !== false,
    archived: false,
    sourceUrl: input.sourceUrl || null,
    classification,
    createdAt: now,
    updatedAt: now,
  }

  const existing = store.messages.findIndex(message => message.id === id)
  const messages = [...store.messages]
  if (existing >= 0) messages[existing] = {
    ...messages[existing],
    ...nextMessage,
    archived: messages[existing].archived || false,
    handled: messages[existing].handled || false,
    handledAt: messages[existing].handledAt || null,
  }
  else messages.unshift(nextMessage)
  writeStore({ ...store, messages })
  return { ok: true, message: nextMessage }
}

export function getOwnerInboxMessage(id) {
  const store = readStore()
  return store.messages.find(message => message.id === id) || null
}

// Items still needing attention — feeds the daily "unhandled > 24h" digest.
// Spam never counts; archived/deleted items are considered dealt with.
export function listUnhandledOwnerInboxMessages({ olderThanHours = 0 } = {}) {
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000
  const store = readStore()
  return store.messages.filter(message => (
    !message.deleted && !message.archived && !message.handled
    && message.classification?.category !== 'spam'
    && new Date(message.receivedAt || message.createdAt || 0).getTime() <= cutoff
  ))
}

export async function loadOwnerInboxMessageDetail(id) {
  const store = readStore()
  const index = store.messages.findIndex(message => message.id === id)
  if (index < 0) return { ok: false, error: 'message_not_found' }
  const message = store.messages[index]
  if (message.provider !== 'nylas' || !message.providerMessageId) {
    return { ok: true, message }
  }

  const { apiKey, grantIds } = getNylasConfig()
  if (!apiKey) return { ok: false, error: 'NYLAS_API_KEY is not configured' }
  const grantId = message.grantId || grantIds[0]
  if (!grantId) return { ok: false, error: 'NYLAS_GRANT_ID is not configured' }

  const response = await fetch(`${NYLAS_BASE_URL}/grants/${encodeURIComponent(grantId)}/messages/${encodeURIComponent(message.providerMessageId)}`, {
    headers: nylasHeaders(apiKey),
  })
  if (!response.ok) return { ok: false, error: `Nylas message request failed (${response.status})` }
  const body = await response.json().catch(() => ({}))
  const data = body.data || body || {}
  const updated = {
    ...message,
    body: clean(data.body || message.body || data.snippet || message.snippet).slice(0, 30000),
    html: clean(data.html || data.body || message.html || '').slice(0, 30000),
    snippet: clean(data.snippet || message.snippet || data.body || '').slice(0, 600),
    unread: false,
    detailLoadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const messages = [...store.messages]
  messages[index] = updated
  writeStore({ ...store, messages })
  return { ok: true, message: updated }
}

function readVault() {
  try {
    const p = path.join(process.cwd(), 'data', 'credentials.json')
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function readLocalEnv() {
  try {
    const p = path.join(process.cwd(), '.env.local')
    const text = fs.readFileSync(p, 'utf8')
    const env = {}
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) env[match[1]] = match[2]
    }
    return env
  } catch {
    return {}
  }
}

function getVaultField(vault, nameIncludes, labelRegex) {
  const cred = (vault?.credentials || []).find(c => lower(c?.name).includes(nameIncludes))
  const field = (cred?.fields || []).find(f => labelRegex.test(String(f?.label || '')))
  return clean(field?.value)
}

function getNylasConfig() {
  const vault = readVault()
  const localEnv = readLocalEnv()
  const apiKey = clean(process.env.NYLAS_API_KEY || process.env.NYLAS_KEY || localEnv.NYLAS_API_KEY || localEnv.NYLAS_KEY)
    || getVaultField(vault, 'nylas', /key|token/i)
  const grantEnv = clean(process.env.NYLAS_GRANT_IDS || process.env.NYLAS_GRANT_ID || localEnv.NYLAS_GRANT_IDS || localEnv.NYLAS_GRANT_ID)
  const grantIds = grantEnv
    ? grantEnv.split(',').map(clean).filter(Boolean)
    : [getVaultField(vault, 'nylas', /grant/i)].filter(Boolean)
  return { apiKey, grantIds }
}

function nylasHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
}

async function discoverNylasGrants(apiKey) {
  const response = await fetch(`${NYLAS_BASE_URL}/grants?limit=20`, { headers: nylasHeaders(apiKey) })
  if (!response.ok) throw new Error(`Nylas grants request failed (${response.status})`)
  const body = await response.json().catch(() => ({}))
  return (body.data || [])
    .filter(grant => grant?.grant_status !== 'invalid')
    .map(grant => grant.id)
    .filter(Boolean)
}

function normalizeNylasMessage(message, grantId) {
  const from = normalizeAddresses(message.from)[0] || ''
  const recipients = [
    ...normalizeAddresses(message.to),
    ...normalizeAddresses(message.cc),
    ...normalizeAddresses(message.bcc),
  ]
  const folders = asArray(message.folders || message.folder || message.labels).map(folder => folder?.name || folder?.display_name || folder?.id || folder).filter(Boolean)
  return {
    provider: 'nylas',
    providerMessageId: message.id,
    grantId,
    threadId: message.thread_id,
    from,
    to: recipients,
    cc: normalizeAddresses(message.cc),
    subject: message.subject,
    snippet: message.snippet || message.body || '',
    receivedAt: message.date ? new Date(Number(message.date) * 1000).toISOString() : message.received_at || message.created_at,
    unread: message.unread,
    folders,
  }
}

export async function syncNylasOwnerInbox({ limit = 25 } = {}) {
  const { apiKey, grantIds } = getNylasConfig()
  if (!apiKey) {
    return { ok: false, provider: 'nylas', error: 'NYLAS_API_KEY is not configured', imported: 0, scanned: 0 }
  }

  let grants = grantIds
  if (!grants.length) grants = await discoverNylasGrants(apiKey)
  if (!grants.length) {
    return { ok: false, provider: 'nylas', error: 'No valid Nylas grants found', imported: 0, scanned: 0 }
  }

  let imported = 0
  let scanned = 0
  let successfulGrants = 0
  const filtered = []
  for (const grantId of grants) {
    const url = `${NYLAS_BASE_URL}/grants/${encodeURIComponent(grantId)}/messages?limit=${Math.max(1, Math.min(Number(limit) || 25, 50))}`
    const response = await fetch(url, { headers: nylasHeaders(apiKey) })
    if (!response.ok) {
      filtered.push({ grantId, reason: `messages_request_failed_${response.status}` })
      continue
    }
    successfulGrants += 1
    const body = await response.json().catch(() => ({}))
    for (const raw of body.data || []) {
      scanned += 1
      const result = ingestOwnerInboxMessage({ ...normalizeNylasMessage(raw, grantId), allowCatchAll: true })
      if (result.ok) imported += 1
      else filtered.push({ grantId, messageId: raw?.id, reason: result.reason })
    }
  }

  if (!successfulGrants) {
    return {
      ok: false,
      provider: 'nylas',
      error: 'All Nylas mailbox scans failed',
      imported,
      scanned,
      filtered: filtered.slice(0, 25),
      grants: grants.length,
    }
  }

  const store = readStore()
  writeStore({ ...store, lastSyncAt: new Date().toISOString() })
  return { ok: true, provider: 'nylas', imported, scanned, filtered: filtered.slice(0, 25), grants: grants.length }
}

export function ownerInboxStatus() {
  const { apiKey, grantIds } = getNylasConfig()
  return {
    nylasConfigured: Boolean(apiKey),
    configuredGrantCount: grantIds.length,
    inboxes: OWNER_INBOXES,
  }
}
