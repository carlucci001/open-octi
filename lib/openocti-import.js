import path from 'path'
import { createHash } from 'crypto'
import Database from 'better-sqlite3'
import { create, genId, loadAll, saveAll } from './entityStore'
import { readData, writeData } from './dataStore'
import { resolveLeadListForDestination } from './lead-list-routing'
import { loadLeadLists } from './leadLists'
import { dirForFile } from './mode'
import { findExistingLeadMatch } from './leadDedupe'

export const IMPORT_OBJECTS = Object.freeze({
  contacts: { label: 'Contacts', required: ['name|email|phone'], fields: ['name', 'firstName', 'lastName', 'email', 'phone', 'title', 'company', 'notes'] },
  accounts: { label: 'Accounts', required: ['name'], fields: ['name', 'email', 'phone', 'website', 'industry', 'type', 'notes'] },
  leads: { label: 'Leads', required: ['name|email|phone|businessName'], fields: ['name', 'firstName', 'lastName', 'email', 'phone', 'businessName', 'website', 'title', 'source', 'status', 'notes'] },
  opportunities: { label: 'Opportunities / deals', required: ['name'], fields: ['name', 'value', 'stageId', 'pipelineId', 'accountName', 'expectedClose', 'notes'] },
  projects: { label: 'Projects', required: ['name'], fields: ['name', 'accountName', 'status', 'priority', 'dueDate', 'notes'] },
  tasks: { label: 'Tasks', required: ['title'], fields: ['title', 'projectName', 'status', 'priority', 'dueDate', 'description'] },
})

const ALIASES = {
  name: ['name', 'full name', 'contact name', 'deal name', 'deal title', 'opportunity name', 'project name'],
  firstName: ['first name', 'firstname', 'given name'], lastName: ['last name', 'lastname', 'surname', 'family name'],
  email: ['email', 'email address', 'e-mail'], phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'telephone'],
  title: ['job title', 'position', 'role', 'task title'], company: ['company', 'company name', 'organization', 'organisation'],
  businessName: ['business name', 'company', 'company name', 'organization', 'organisation'], accountName: ['account', 'account name', 'organization', 'organisation', 'company'],
  website: ['website', 'web site', 'domain'], industry: ['industry'], type: ['type', 'account type'], notes: ['notes', 'description'],
  source: ['source', 'lead source'], status: ['status', 'lead status', 'project status', 'task status'],
  value: ['value', 'deal value', 'amount'], stageId: ['stage', 'stage id', 'deal stage'], pipelineId: ['pipeline', 'pipeline id'],
  expectedClose: ['expected close', 'close date', 'expected close date'], priority: ['priority'], dueDate: ['due date', 'deadline'],
  projectName: ['project', 'project name'], description: ['description', 'details'],
}

export const IMPORT_PRESETS = Object.freeze(['HubSpot', 'Pipedrive', 'Salesforce', 'Zoho', 'Google Contacts', 'Outlook / CSV', 'vCard'])

export const MIGRATION_SOURCES = Object.freeze({
  hubspot: { label: 'HubSpot', modes: ['file', 'api'] },
  salesforce: { label: 'Salesforce', modes: ['file'] },
  zoho: { label: 'Zoho CRM', modes: ['file'] },
  pipedrive: { label: 'Pipedrive', modes: ['file', 'api'] },
  bitrix24: { label: 'Bitrix24', modes: ['file', 'api'] },
})

const migrationConnections = new Map()

function migrationDbPath(options = {}) {
  return options.dbPath || path.join(dirForFile('accounts.json'), 'crm.sqlite')
}

function ensureMigrationSchema(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_jobs (
      id TEXT PRIMARY KEY,
      source_system TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('file', 'api')),
      status TEXT NOT NULL,
      counts_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      dry_run_report_json TEXT,
      pre_commit_hash TEXT,
      committed_at INTEGER,
      rollback_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migration_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
      source_object TEXT NOT NULL,
      source_id TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      mapped_json TEXT,
      match_decision TEXT,
      target_id TEXT,
      error TEXT,
      resolution_reason TEXT,
      committed_action TEXT,
      UNIQUE(job_id, source_object, source_id)
    );
    CREATE INDEX IF NOT EXISTS migration_rows_job_object_idx ON migration_rows(job_id, source_object);
    CREATE TABLE IF NOT EXISTS migration_crosswalk (
      source_system TEXT NOT NULL,
      source_object TEXT NOT NULL,
      source_id TEXT NOT NULL,
      fcc_object TEXT NOT NULL,
      fcc_id TEXT NOT NULL,
      job_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(source_system, source_object, source_id)
    );
    CREATE INDEX IF NOT EXISTS migration_crosswalk_fcc_idx ON migration_crosswalk(fcc_object, fcc_id);
    CREATE TABLE IF NOT EXISTS migration_snapshots (
      job_id TEXT NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
      fcc_object TEXT NOT NULL,
      fcc_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'merge')),
      before_json TEXT,
      PRIMARY KEY(job_id, fcc_object, fcc_id)
    );
  `)
}

function getMigrationDb(options = {}) {
  const dbPath = migrationDbPath(options)
  let db = migrationConnections.get(dbPath)
  if (!db?.open) {
    db = new Database(dbPath)
    ensureMigrationSchema(db)
    migrationConnections.set(dbPath, db)
  }
  return db
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function publicMigrationJob(row, db) {
  if (!row) return null
  const counts = parseJson(row.counts_json, {})
  const stagedRows = db.prepare('SELECT COUNT(*) AS count FROM migration_rows WHERE job_id = ?').get(row.id)?.count || 0
  return {
    id: row.id,
    sourceSystem: row.source_system,
    mode: row.mode,
    status: row.status,
    counts: { ...counts, stagedRows },
    createdBy: row.created_by,
    config: parseJson(row.config_json, {}),
    dryRunReport: parseJson(row.dry_run_report_json, null),
    committedAt: row.committed_at ? new Date(row.committed_at).toISOString() : null,
    rollbackExpiresAt: row.rollback_expires_at ? new Date(row.rollback_expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function createMigrationJob({ sourceSystem, mode = 'file', createdBy = 'unknown', config = {} }, options = {}) {
  const source = String(sourceSystem || '').toLowerCase()
  if (!MIGRATION_SOURCES[source]) throw new Error('Unsupported migration source')
  if (!MIGRATION_SOURCES[source].modes.includes(mode)) throw new Error(`${MIGRATION_SOURCES[source].label} does not support ${mode} intake yet`)
  const db = getMigrationDb(options)
  const id = genId('mig')
  const now = Date.now()
  db.prepare(`INSERT INTO migration_jobs
    (id, source_system, mode, status, counts_json, created_by, config_json, created_at, updated_at)
    VALUES (?, ?, ?, 'staging', '{}', ?, ?, ?, ?)`)
    .run(id, source, mode, String(createdBy || 'unknown'), JSON.stringify(config || {}), now, now)
  return getMigrationJob(id, options)
}

export function getMigrationJob(jobId, options = {}) {
  const db = getMigrationDb(options)
  return publicMigrationJob(db.prepare('SELECT * FROM migration_jobs WHERE id = ?').get(jobId), db)
}

export function listMigrationJobs(options = {}) {
  const db = getMigrationDb(options)
  return db.prepare('SELECT * FROM migration_jobs ORDER BY created_at DESC LIMIT 100').all().map(row => publicMigrationJob(row, db))
}

export function updateMigrationJobConfig(jobId, patch = {}, options = {}) {
  const db = getMigrationDb(options)
  const row = db.prepare('SELECT config_json FROM migration_jobs WHERE id = ?').get(jobId)
  if (!row) throw new Error('Migration job not found')
  const config = { ...parseJson(row.config_json, {}), ...(patch || {}) }
  db.prepare('UPDATE migration_jobs SET config_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(config), Date.now(), jobId)
  return getMigrationJob(jobId, options)
}

export async function stageMigrationRows(jobId, sourceObject, rows, options = {}) {
  const db = getMigrationDb(options)
  const job = db.prepare('SELECT id, status FROM migration_jobs WHERE id = ?').get(jobId)
  if (!job) throw new Error('Migration job not found')
  if (!['staging', 'staged'].includes(job.status)) throw new Error('Migration job is no longer accepting staged rows')
  const objectName = String(sourceObject || '').trim().toLowerCase()
  if (!objectName) throw new Error('Source object is required')
  const insert = db.prepare(`INSERT INTO migration_rows
    (job_id, source_object, source_id, raw_json) VALUES (?, ?, ?, ?)
    ON CONFLICT(job_id, source_object, source_id) DO UPDATE SET raw_json = excluded.raw_json, mapped_json = NULL,
      match_decision = NULL, target_id = NULL, error = NULL, resolution_reason = NULL, committed_action = NULL`)
  let staged = 0
  const flush = db.transaction(batch => {
    for (const raw of batch) {
      const sourceId = String(raw?.id ?? raw?.Id ?? raw?.ID ?? raw?.['Record ID'] ?? `${objectName}-${staged + 1}`)
      insert.run(jobId, objectName, sourceId, JSON.stringify(raw || {}))
      staged += 1
    }
  })
  let batch = []
  for await (const raw of rows || []) {
    batch.push(raw)
    if (batch.length >= 1000) { flush(batch); batch = [] }
  }
  if (batch.length) flush(batch)
  const counts = Object.fromEntries(db.prepare('SELECT source_object, COUNT(*) AS count FROM migration_rows WHERE job_id = ? GROUP BY source_object').all(jobId).map(row => [row.source_object, row.count]))
  db.prepare("UPDATE migration_jobs SET status = 'staged', counts_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(counts), Date.now(), jobId)
  return { ok: true, jobId, sourceObject: objectName, staged, totalStaged: getMigrationJob(jobId, options).counts.stagedRows }
}

export function migrationRows(jobId, options = {}) {
  const db = getMigrationDb(options)
  return db.prepare('SELECT * FROM migration_rows WHERE job_id = ? ORDER BY id').all(jobId).map(row => ({
    id: row.id,
    jobId: row.job_id,
    sourceObject: row.source_object,
    sourceId: row.source_id,
    raw: parseJson(row.raw_json, {}),
    mapped: parseJson(row.mapped_json, null),
    matchDecision: row.match_decision,
    targetId: row.target_id,
    error: row.error,
    resolutionReason: row.resolution_reason,
    committedAction: row.committed_action,
  }))
}

export function closeMigrationDatabases() {
  for (const db of migrationConnections.values()) try { db.close() } catch {}
  migrationConnections.clear()
}

function cleanHeader(value) { return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') }
export function detectImportMapping(headers, objectType) {
  const allowed = new Set(IMPORT_OBJECTS[objectType]?.fields || [])
  return (headers || []).map(header => {
    const normalized = cleanHeader(header)
    return Object.keys(ALIASES).find(field => allowed.has(field) && ALIASES[field].includes(normalized)) || ''
  })
}

function digits(value) { return String(value || '').replace(/\D/g, '') }
function norm(value) { return String(value || '').trim().toLowerCase() }
function compact(value) { return norm(value).replace(/[^a-z0-9]+/g, '') }
function scalar(value) {
  if (value && typeof value === 'object') return value.id ?? value.ID ?? value.value ?? value.name ?? value.Name ?? ''
  return value ?? ''
}
function pick(row, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row || {}, key)) continue
    const value = scalar(row[key])
    if (value !== '') return value
  }
  return ''
}
function sourceId(row = {}) {
  return String(pick(row, ['id', 'Id', 'ID', 'Record ID', 'hs_object_id', 'CONTACT_ID', 'COMPANY_ID', 'DEAL_ID', 'LEAD_ID']) || '')
}
function displayName(row) { return row.name || row.title || [row.firstName, row.lastName].filter(Boolean).join(' ') }
function companyName(row) { return row.company || row.businessName || row.accountName || '' }
function duplicateKeys(row) {
  const name = norm(displayName(row)); const company = norm(companyName(row)); const email = norm(row.email); const phone = digits(row.phone)
  return [email && `e:${email}`, phone.length >= 7 && `p:${phone}`, name && `n:${name}|${company}`].filter(Boolean)
}
function normalizedRecord(objectType, raw) {
  const record = Object.fromEntries(Object.entries(raw || {}).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
  if (!record.name && (record.firstName || record.lastName)) record.name = [record.firstName, record.lastName].filter(Boolean).join(' ')
  delete record.firstName; delete record.lastName
  if (objectType === 'opportunities') record.value = Number(String(record.value || '0').replace(/[^0-9.-]/g, '')) || 0
  if (objectType === 'leads') { record.status ||= 'new'; record.source ||= 'CSV import' }
  if (objectType === 'accounts') { record.type ||= 'prospect'; record.stage ||= 'active' }
  if (objectType === 'contacts') { record.tags ||= []; record.primary = false }
  if (objectType === 'opportunities') { record.pipelineId ||= 'sales'; record.stageId ||= 'new' }
  if (objectType === 'projects') record.status ||= 'active'
  if (objectType === 'tasks') { record.status ||= 'todo'; record.priority ||= 'medium' }
  return record
}

const SOURCE_OBJECT_ALIASES = Object.freeze({
  hubspot: {
    company: 'companies', companies: 'companies', contact: 'contacts', contacts: 'contacts', deal: 'deals', deals: 'deals',
    ticket: 'tickets', tickets: 'tickets', note: 'notes', notes: 'notes', call: 'calls', calls: 'calls', email: 'emails', emails: 'emails',
    meeting: 'meetings', meetings: 'meetings', task: 'tasks', tasks: 'tasks', engagement: 'activities', engagements: 'activities',
    owner: 'owners', owners: 'owners', pipeline: 'pipelines', pipelines: 'pipelines', association: 'associations', associations: 'associations',
  },
  salesforce: {
    account: 'accounts', accounts: 'accounts', contact: 'contacts', contacts: 'contacts', lead: 'leads', leads: 'leads',
    opportunity: 'deals', opportunities: 'deals', task: 'tasks', tasks: 'tasks', event: 'meetings', events: 'meetings',
    note: 'notes', notes: 'notes', contentnote: 'notes', contentnotes: 'notes', user: 'owners', users: 'owners',
  },
  zoho: {
    account: 'accounts', accounts: 'accounts', contact: 'contacts', contacts: 'contacts', lead: 'leads', leads: 'leads',
    deal: 'deals', deals: 'deals', task: 'tasks', tasks: 'tasks', event: 'meetings', events: 'meetings', note: 'notes', notes: 'notes',
    user: 'owners', users: 'owners', pipeline: 'pipelines', pipelines: 'pipelines',
  },
  pipedrive: {
    organization: 'accounts', organizations: 'accounts', person: 'contacts', persons: 'contacts', deal: 'deals', deals: 'deals',
    activity: 'activities', activities: 'activities', note: 'notes', notes: 'notes', user: 'owners', users: 'owners',
    pipeline: 'pipelines', pipelines: 'pipelines', stage: 'stages', stages: 'stages',
  },
  bitrix24: {
    company: 'accounts', companies: 'accounts', contact: 'contacts', contacts: 'contacts', deal: 'deals', deals: 'deals',
    lead: 'leads', leads: 'leads', activity: 'activities', activities: 'activities', user: 'owners', users: 'owners',
    pipeline: 'pipelines', pipelines: 'pipelines', stage: 'stages', stages: 'stages',
  },
})

const TARGET_OBJECTS = Object.freeze({
  companies: 'accounts', accounts: 'accounts', contacts: 'contacts', leads: 'leads', deals: 'opportunities',
  tickets: 'activities', notes: 'activities', calls: 'activities', emails: 'activities', meetings: 'activities', tasks: 'activities', activities: 'activities',
  owners: null, pipelines: null, stages: null, associations: null,
})

const FIELD_KEYS = Object.freeze({
  name: ['name', 'Name', 'NAME', 'title', 'dealname', 'Deal Name', 'Title', 'TITLE', 'Deal Title', 'Opportunity Name', 'Account Name', 'Organization name'],
  firstName: ['firstName', 'firstname', 'First Name', 'FirstName', 'First_Name', 'NAME'],
  lastName: ['lastName', 'lastname', 'Last Name', 'LastName', 'Last_Name', 'LAST_NAME'],
  email: ['email', 'Email', 'EMAIL', 'Email Address', 'Primary Email'],
  phone: ['phone', 'Phone', 'PHONE', 'Phone Number', 'Mobile', 'MobilePhone'],
  website: ['website', 'Website', 'WEB', 'domain', 'Domain', 'DOMAIN'],
  city: ['city', 'City', 'CITY', 'BillingCity', 'MailingCity'],
  industry: ['industry', 'Industry', 'INDUSTRY'],
  title: ['title', 'Title', 'TITLE', 'Job Title', 'JobTitle'],
  amount: ['amount', 'Amount', 'AMOUNT', 'value', 'Value', 'OPPORTUNITY'],
  body: ['body', 'Body', 'BODY', 'content', 'Content', 'CONTENT', 'note', 'Note', 'comments', 'Comments', 'DESCRIPTION', 'Description'],
  subject: ['subject', 'Subject', 'SUBJECT', 'title', 'Title', 'TITLE'],
  timestamp: ['timestamp', 'Timestamp', 'createdAt', 'CreatedAt', 'Created Date', 'CreatedDate', 'ActivityDate', 'StartDateTime', 'TIME_CREATED', 'add_time', 'due_date'],
  status: ['status', 'Status', 'STATUS', 'type', 'Type', 'TYPE', 'StageName'],
})

const RELATION_KEYS = Object.freeze({
  hubspot: {
    account: ['associatedcompanyid', 'companyId', 'company_id', 'Associated Company ID'], contact: ['contactId', 'contact_id', 'Associated Contact ID'],
    deal: ['dealId', 'deal_id', 'Associated Deal ID'], owner: ['hubspot_owner_id', 'ownerId', 'owner_id'], pipeline: ['pipeline', 'pipelineId'], stage: ['dealstage', 'stage', 'stageId'],
  },
  salesforce: {
    account: ['AccountId'], contact: ['ContactId', 'WhoId'], deal: ['OpportunityId', 'WhatId'], owner: ['OwnerId'], pipeline: ['Pipeline__c'], stage: ['StageName'],
  },
  zoho: {
    account: ['Account_Name', 'Account_Id'], contact: ['Contact_Name', 'Contact_Id', 'Who_Id'], deal: ['Deal_Name', 'Deal_Id', 'What_Id'], owner: ['Owner'], pipeline: ['Pipeline'], stage: ['Stage'],
  },
  pipedrive: {
    account: ['org_id', 'organization_id'], contact: ['person_id'], deal: ['deal_id'], owner: ['owner_id', 'user_id'], pipeline: ['pipeline_id'], stage: ['stage_id'],
  },
  bitrix24: {
    account: ['COMPANY_ID'], contact: ['CONTACT_ID'], deal: ['DEAL_ID', 'OWNER_ID'], owner: ['ASSIGNED_BY_ID', 'RESPONSIBLE_ID'], pipeline: ['CATEGORY_ID'], stage: ['STAGE_ID', 'STATUS_ID'],
  },
})

function canonicalSourceObject(sourceSystem, sourceObject) {
  const source = String(sourceSystem || '').toLowerCase()
  const clean = String(sourceObject || '').trim().toLowerCase().replace(/\.csv$|\.xlsx$/g, '').replace(/[^a-z0-9]+/g, '')
  return SOURCE_OBJECT_ALIASES[source]?.[clean] || clean
}

function relationSourceObject(sourceSystem, kind) {
  if (sourceSystem === 'hubspot' && kind === 'account') return 'companies'
  return ({ account: 'accounts', contact: 'contacts', deal: 'deals', owner: 'owners', pipeline: 'pipelines', stage: 'stages' })[kind]
}

function associationKey(objectName, id) { return `${objectName}:${String(id || '')}` }

export function buildMigrationAssociationIndex(sourceSystem, rows = []) {
  const index = new Map()
  for (const row of rows || []) {
    const fromObject = canonicalSourceObject(sourceSystem, pick(row, ['fromObjectType', 'from_object_type', 'From Object Type', 'sourceObject']))
    const fromId = pick(row, ['fromObjectId', 'from_object_id', 'From Object ID', 'sourceId'])
    const toObject = canonicalSourceObject(sourceSystem, pick(row, ['toObjectType', 'to_object_type', 'To Object Type', 'targetObject']))
    const toId = pick(row, ['toObjectId', 'to_object_id', 'To Object ID', 'targetId'])
    if (!fromObject || !fromId || !toObject || !toId) continue
    const add = (aObject, aId, bObject, bId) => {
      const key = associationKey(aObject, aId)
      const list = index.get(key) || []
      if (!list.some(item => item.sourceObject === bObject && item.sourceId === String(bId))) list.push({ sourceObject: bObject, sourceId: String(bId) })
      index.set(key, list)
    }
    add(fromObject, fromId, toObject, toId)
    add(toObject, toId, fromObject, fromId)
  }
  return index
}

function customFields(raw, usedKeys) {
  const out = {}
  for (const [key, value] of Object.entries(raw || {})) {
    if (usedKeys.has(key) || value === '' || value === null || value === undefined) continue
    if (typeof value === 'object' && Object.keys(value).length === 0) continue
    out[key] = value
  }
  return out
}

export function mapMigrationRow(sourceSystem, sourceObject, raw = {}, associationIndex = new Map()) {
  const source = String(sourceSystem || '').toLowerCase()
  if (!MIGRATION_SOURCES[source]) throw new Error('Unsupported migration source')
  const canonical = canonicalSourceObject(source, sourceObject)
  const fccObject = TARGET_OBJECTS[canonical] ?? null
  const id = sourceId(raw)
  const used = new Set(['id', 'Id', 'ID', 'Record ID', 'hs_object_id'])
  const read = field => {
    const keys = FIELD_KEYS[field] || []
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(raw, key)) used.add(key)
    return pick(raw, keys)
  }
  const relations = {}
  for (const [kind, keys] of Object.entries(RELATION_KEYS[source] || {})) {
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(raw, key)) used.add(key)
    const value = pick(raw, keys)
    if (value !== '') relations[kind] = { sourceObject: relationSourceObject(source, kind), sourceId: String(value) }
  }
  for (const linked of associationIndex.get(associationKey(canonical, id)) || []) {
    const kind = linked.sourceObject === 'companies' || linked.sourceObject === 'accounts' ? 'account'
      : linked.sourceObject === 'contacts' ? 'contact'
        : linked.sourceObject === 'deals' ? 'deal'
          : linked.sourceObject === 'owners' ? 'owner' : ''
    if (kind && !relations[kind]) relations[kind] = linked
  }

  if (!fccObject) return { sourceObject: canonical, sourceId: id, fccObject: null, record: {}, relations, customFields: customFields(raw, used) }
  const firstName = read('firstName'); const lastName = read('lastName')
  const record = {
    name: read('name') || [firstName, lastName].filter(Boolean).join(' '),
    email: read('email'), phone: read('phone'), website: read('website'), city: read('city'), industry: read('industry'), title: read('title'),
  }
  if (fccObject === 'opportunities') {
    record.value = Number(String(read('amount') || '0').replace(/[^0-9.-]/g, '')) || 0
    record.stageId = scalar(relations.stage?.sourceId) || 'new'
    record.pipelineId = scalar(relations.pipeline?.sourceId) || 'sales'
  } else if (fccObject === 'activities') {
    record.type = canonical === 'activities' ? norm(read('status')) || 'activity' : canonical.replace(/s$/, '')
    record.subject = read('subject') || `${MIGRATION_SOURCES[source].label} ${record.type}`
    record.body = read('body')
    const at = read('timestamp')
    record.at = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date(0).toISOString()
  } else if (fccObject === 'leads') {
    record.businessName = read('name')
    record.status = norm(read('status')) || 'new'
    record.source = `${source}-migration`
  }
  for (const key of Object.keys(record)) if (record[key] === '') delete record[key]
  const extra = customFields(raw, used)
  if (Object.keys(extra).length) record.customFields = extra
  return { sourceObject: canonical, sourceId: id, fccObject, record, relations, customFields: extra }
}

export function detectMigrationObjectFromFilename(sourceSystem, filename) {
  const base = String(filename || '').replace(/^.*[\\/]/, '').replace(/\.(csv|xlsx)$/i, '')
  const withoutSuffix = base.replace(/[-_ ]+(export|data|all|records|[0-9]{4}[-_][0-9]{2}[-_][0-9]{2})$/i, '')
  return canonicalSourceObject(sourceSystem, withoutSuffix)
}

export async function stageMigrationBundle(jobId, bundle = {}, options = {}) {
  const counts = {}
  for (const [sourceObject, rows] of Object.entries(bundle || {})) {
    const result = await stageMigrationRows(jobId, sourceObject, rows || [], options)
    counts[result.sourceObject] = (counts[result.sourceObject] || 0) + result.staged
  }
  return { ok: true, jobId, counts, totalStaged: Object.values(counts).reduce((sum, count) => sum + count, 0) }
}

const API_OBJECTS = Object.freeze({
  hubspot: [
    ['companies', '/crm/v3/objects/companies'], ['contacts', '/crm/v3/objects/contacts'], ['deals', '/crm/v3/objects/deals'],
    ['tickets', '/crm/v3/objects/tickets'], ['notes', '/crm/v3/objects/notes'], ['calls', '/crm/v3/objects/calls'],
    ['emails', '/crm/v3/objects/emails'], ['meetings', '/crm/v3/objects/meetings'], ['tasks', '/crm/v3/objects/tasks'], ['owners', '/crm/v3/owners'],
  ],
  pipedrive: [
    ['organizations', '/v1/organizations'], ['persons', '/v1/persons'], ['deals', '/v1/deals'], ['activities', '/v1/activities'],
    ['notes', '/v1/notes'], ['users', '/v1/users'], ['pipelines', '/v1/pipelines'], ['stages', '/v1/stages'],
  ],
  bitrix24: [
    ['companies', 'crm.company.list'], ['contacts', 'crm.contact.list'], ['deals', 'crm.deal.list'], ['leads', 'crm.lead.list'],
    ['activities', 'crm.activity.list'], ['users', 'user.get'], ['pipelines', 'crm.category.list'], ['stages', 'crm.status.list'],
  ],
})

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function fetchMigrationJson(url, init, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const sleepImpl = options.sleepImpl || delay
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl(url, init)
    if (response.status !== 429) {
      if (!response.ok) throw new Error(`Migration source request failed (${response.status})`)
      return response.json()
    }
    if (attempt === 3) throw new Error('Migration source rate limit did not clear')
    const seconds = Number(response.headers.get('retry-after') || 1)
    await sleepImpl(Math.max(0, seconds) * 1000)
  }
  throw new Error('Migration source request failed')
}

async function * hubspotRows(endpoint, credential, baseUrl, options) {
  let after = ''
  do {
    const url = new URL(endpoint, baseUrl || 'https://api.hubapi.com')
    url.searchParams.set('limit', '100')
    if (after) url.searchParams.set('after', after)
    const data = await fetchMigrationJson(url, { headers: { authorization: `Bearer ${credential.token}` } }, options)
    for (const item of data.results || []) yield { id: item.id, ...(item.properties || item), associations: item.associations || undefined }
    after = String(data.paging?.next?.after || '')
  } while (after)
}

async function * pipedriveRows(endpoint, credential, baseUrl, options) {
  let start = 0
  let more = true
  while (more) {
    const url = new URL(endpoint, baseUrl || 'https://api.pipedrive.com')
    url.searchParams.set('start', String(start)); url.searchParams.set('limit', '500'); url.searchParams.set('api_token', credential.token)
    const data = await fetchMigrationJson(url, {}, options)
    for (const item of data.data || []) yield item
    const pagination = data.additional_data?.pagination || {}
    more = Boolean(pagination.more_items_in_collection)
    start = Number(pagination.next_start || 0)
  }
}

async function * bitrixRows(method, credential, baseUrl, options) {
  let start = 0
  do {
    const root = String(baseUrl || credential.webhookUrl || '').replace(/\/?$/, '/')
    if (!root) throw new Error('Bitrix24 webhook URL is required')
    const url = new URL(`${method}.json`, root)
    url.searchParams.set('start', String(start))
    const data = await fetchMigrationJson(url, {}, options)
    const list = Array.isArray(data.result) ? data.result : (data.result?.items || [])
    for (const item of list) yield item
    start = data.next === undefined || data.next === null ? 0 : Number(data.next)
  } while (start)
}

export async function pullMigrationApi({ jobId, sourceSystem, credential = {}, baseUrl = '' }, options = {}) {
  const source = String(sourceSystem || '').toLowerCase()
  if (!['hubspot', 'pipedrive', 'bitrix24'].includes(source)) throw new Error('API migration is not available for this source')
  if (source !== 'bitrix24' && !credential.token) throw new Error('Migration credential is required')
  const counts = {}
  const bundle = {}
  for (const [sourceObject, endpoint] of API_OBJECTS[source]) {
    const rows = source === 'hubspot' ? hubspotRows(endpoint, credential, baseUrl, options)
      : source === 'pipedrive' ? pipedriveRows(endpoint, credential, baseUrl, options)
        : bitrixRows(endpoint, credential, baseUrl, options)
    if (jobId) {
      const staged = await stageMigrationRows(jobId, sourceObject, rows, options)
      counts[staged.sourceObject] = staged.staged
    } else {
      bundle[sourceObject] = []
      for await (const row of rows) bundle[sourceObject].push(row)
      counts[sourceObject] = bundle[sourceObject].length
    }
  }
  return { ok: true, sourceSystem: source, jobId: jobId || null, counts, bundle: jobId ? undefined : bundle }
}

const MIGRATION_ORDER = Object.freeze(['pipelines', 'accounts', 'contacts', 'leads', 'opportunities', 'activities'])

function domain(value) {
  return norm(value).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0]
}

function rowName(record = {}) { return record.name || record.businessName || record.subject || record.email || record.phone || '' }

function crosswalkTarget(db, sourceSystem, sourceObject, id) {
  if (!id) return null
  return db.prepare(`SELECT fcc_object AS fccObject, fcc_id AS fccId FROM migration_crosswalk
    WHERE source_system = ? AND source_object = ? AND source_id = ?`).get(sourceSystem, canonicalSourceObject(sourceSystem, sourceObject), String(id)) || null
}

function existingRecords() {
  return Object.fromEntries(MIGRATION_ORDER.map(type => [type, loadAll(type)]))
}

function opportunityAccountId(mapped, db, sourceSystem, stagedTargets = new Map()) {
  const relation = mapped.relations?.account
  if (!relation) return ''
  return crosswalkTarget(db, sourceSystem, relation.sourceObject, relation.sourceId)?.fccId
    || stagedTargets.get(associationKey(canonicalSourceObject(sourceSystem, relation.sourceObject), relation.sourceId))
    || ''
}

function findMigrationMatches(mapped, current, db, sourceSystem, stagedTargets = new Map()) {
  const crosswalk = crosswalkTarget(db, sourceSystem, mapped.sourceObject, mapped.sourceId)
  if (crosswalk) return { matches: current.filter(record => record.id === crosswalk.fccId), reason: 'source ID crosswalk' }
  const candidate = mapped.record || {}
  if (mapped.fccObject === 'contacts') {
    const email = norm(candidate.email); const phone = digits(candidate.phone); const name = compact(candidate.name)
    const accountId = opportunityAccountId(mapped, db, sourceSystem, stagedTargets)
    const byEmail = email ? current.filter(record => norm(record.email) === email) : []
    if (byEmail.length) return { matches: byEmail, reason: 'exact email' }
    const byPhone = phone.length >= 7 ? current.filter(record => digits(record.phone) === phone) : []
    if (byPhone.length) return { matches: byPhone, reason: 'exact phone digits' }
    const byNameCompany = name ? current.filter(record => compact(record.name) === name && (!accountId || record.accountId === accountId)) : []
    return { matches: byNameCompany, reason: accountId ? 'name + company' : 'name fallback', fallback: !accountId && byNameCompany.length > 0 }
  }
  if (mapped.fccObject === 'accounts') {
    const web = domain(candidate.website); const name = compact(candidate.name); const city = compact(candidate.city); const phone = digits(candidate.phone)
    const byDomain = web ? current.filter(record => domain(record.website) === web) : []
    if (byDomain.length) return { matches: byDomain, reason: 'website domain' }
    const byNameCity = name ? current.filter(record => compact(record.name) === name && (!city || compact(record.city) === city)) : []
    if (byNameCity.length) return { matches: byNameCity, reason: city ? 'name + city' : 'name fallback', fallback: !city }
    const byPhone = phone.length >= 7 ? current.filter(record => digits(record.phone) === phone) : []
    return { matches: byPhone, reason: 'exact phone digits' }
  }
  if (mapped.fccObject === 'leads') {
    const match = findExistingLeadMatch(candidate, current)
    return { matches: match?.lead ? [match.lead] : [], reason: match?.reason || 'no match' }
  }
  if (mapped.fccObject === 'opportunities') {
    const name = compact(candidate.name); const accountId = opportunityAccountId(mapped, db, sourceSystem, stagedTargets); const value = Number(candidate.value || 0)
    const matches = current.filter(record => {
      if (compact(record.name) !== name || (accountId && record.accountId !== accountId)) return false
      const existingValue = Number(record.value || 0)
      if (!value && !existingValue) return true
      return Math.abs(existingValue - value) <= Math.max(1, Math.abs(value) * 0.01)
    })
    return { matches, reason: accountId ? 'name + account + amount' : 'name + amount fallback', fallback: !accountId && matches.length > 0 }
  }
  return { matches: [], reason: 'always create activity' }
}

function relationFallbackName(kind, raw = {}) {
  const keys = kind === 'account' ? ['Account Name', 'Account_Name', 'Organization', 'Organization name', 'company', 'Company', 'COMPANY_TITLE']
    : kind === 'contact' ? ['Contact Name', 'Contact_Name', 'person_name', 'CONTACT_NAME']
      : kind === 'deal' ? ['Deal Name', 'Opportunity Name', 'deal_name'] : []
  return String(pick(raw, keys) || '')
}

function inspectRelations(mapped, stagedIds, db, sourceSystem, config = {}) {
  const unresolved = []
  const fallbacks = []
  for (const [kind, relation] of Object.entries(mapped.relations || {})) {
    if (kind === 'owner') {
      if (!config.ownerMappings?.[relation.sourceId]) unresolved.push({ kind, ...relation, reason: 'owner mapping required' })
      continue
    }
    if (kind === 'pipeline' || kind === 'stage') {
      const pipelineKey = mapped.relations?.pipeline?.sourceId || 'default'
      const mappedPipeline = config.pipelineMappings?.[pipelineKey]
      const resolved = kind === 'pipeline' ? mappedPipeline?.pipelineId : mappedPipeline?.stages?.[relation.sourceId]
      if (!resolved && !config.createMissingPipelines) unresolved.push({ kind, ...relation, reason: `${kind} mapping required` })
      continue
    }
    const canonical = canonicalSourceObject(sourceSystem, relation.sourceObject)
    if (crosswalkTarget(db, sourceSystem, canonical, relation.sourceId) || stagedIds.has(associationKey(canonical, relation.sourceId))) continue
    const fallbackName = relationFallbackName(kind, mapped.raw)
    const targetObject = kind === 'account' ? 'accounts' : kind === 'contact' ? 'contacts' : kind === 'deal' ? 'opportunities' : ''
    const found = fallbackName && targetObject ? loadAll(targetObject).find(record => norm(record.name) === norm(fallbackName)) : null
    if (found) fallbacks.push({ kind, ...relation, targetId: found.id, reason: 'name fallback' })
    else unresolved.push({ kind, ...relation, reason: 'source ID is absent from the bundle and crosswalk' })
  }
  return { unresolved, fallbacks }
}

function validMigrationRecord(mapped) {
  if (!mapped.sourceId) return { valid: false, error: 'Source ID is required' }
  if (!mapped.fccObject) return { valid: true, metadata: true }
  if (mapped.fccObject === 'activities') return { valid: Boolean(mapped.record.subject || mapped.record.body), error: 'Activity subject or body is required' }
  return { valid: Boolean(rowName(mapped.record)), error: 'An identifying name, email, or phone is required' }
}

function emptyReport(job) {
  return {
    jobId: job.id,
    sourceSystem: job.sourceSystem,
    rowsPerObject: {},
    counts: { total: 0, create: 0, merge: 0, skip: 0, review: 0, invalid: 0 },
    unresolvedRelations: [],
    nameFallbackRelations: [],
    invalidRows: [],
    unmappedOwners: [],
    unmappedStages: [],
    attachmentsOutOfScope: 0,
  }
}

export function dryRunMigrationJob(jobId, options = {}) {
  const db = getMigrationDb(options)
  const job = getMigrationJob(jobId, options)
  if (!job) throw new Error('Migration job not found')
  if (!['staged', 'dry-run'].includes(job.status)) throw new Error('Migration job is not ready for a dry run')
  const rows = db.prepare('SELECT * FROM migration_rows WHERE job_id = ? ORDER BY id').all(jobId)
  const associationRows = rows.filter(row => canonicalSourceObject(job.sourceSystem, row.source_object) === 'associations').map(row => parseJson(row.raw_json, {}))
  const associations = buildMigrationAssociationIndex(job.sourceSystem, associationRows)
  const stagedIds = new Set(rows.map(row => associationKey(canonicalSourceObject(job.sourceSystem, row.source_object), row.source_id)))
  const current = existingRecords()
  const report = emptyReport(job)
  const update = db.prepare(`UPDATE migration_rows SET mapped_json = ?, match_decision = ?, target_id = ?, error = ?, resolution_reason = ? WHERE id = ?`)
  const processRows = db.transaction(() => {
    for (const row of rows) {
      const raw = parseJson(row.raw_json, {})
      const mapped = { ...mapMigrationRow(job.sourceSystem, row.source_object, raw, associations), raw }
      const attachmentKey = ['attachmentCount', 'attachments_count', 'Attachment Count', 'Attachments', 'attachments'].find(key => Object.prototype.hasOwnProperty.call(raw, key))
      const attachmentValue = attachmentKey ? raw[attachmentKey] : null
      report.attachmentsOutOfScope += Array.isArray(attachmentValue) ? attachmentValue.length : Number(attachmentValue || 0) || (attachmentValue ? 1 : 0)
      const object = mapped.fccObject || mapped.sourceObject
      report.rowsPerObject[object] = (report.rowsPerObject[object] || 0) + 1
      if (!mapped.fccObject) {
        update.run(JSON.stringify(mapped), 'skip', null, null, 'mapping metadata', row.id)
        continue
      }
      report.counts.total += 1
      const validation = validMigrationRecord(mapped)
      const relations = inspectRelations(mapped, stagedIds, db, job.sourceSystem, job.config)
      for (const issue of relations.unresolved) {
        const detail = { rowId: row.id, sourceObject: mapped.sourceObject, sourceId: mapped.sourceId, ...issue }
        report.unresolvedRelations.push(detail)
        if (issue.kind === 'owner') report.unmappedOwners.push(detail)
        if (issue.kind === 'pipeline' || issue.kind === 'stage') report.unmappedStages.push(detail)
      }
      for (const fallback of relations.fallbacks) report.nameFallbackRelations.push({ rowId: row.id, sourceObject: mapped.sourceObject, sourceId: mapped.sourceId, ...fallback })
      if (!validation.valid) {
        report.counts.invalid += 1; report.counts.skip += 1
        report.invalidRows.push({ rowId: row.id, sourceObject: mapped.sourceObject, sourceId: mapped.sourceId, column: 'identity', error: validation.error })
        update.run(JSON.stringify(mapped), 'skip', null, validation.error, 'invalid row', row.id)
        continue
      }
      const match = findMigrationMatches(mapped, current[mapped.fccObject] || [], db, job.sourceSystem)
      mapped.matchCandidates = match.matches.slice(0, 10).map(record => ({ id: record.id, name: record.name || record.businessName || '', email: record.email || '', phone: record.phone || '', website: record.website || '', value: record.value ?? null }))
      const decision = match.matches.length > 1 ? 'review' : match.matches.length === 1 ? 'merge' : 'create'
      const targetId = match.matches.length === 1 ? match.matches[0].id : null
      report.counts[decision] += 1
      if (match.fallback) report.nameFallbackRelations.push({ rowId: row.id, sourceObject: mapped.sourceObject, sourceId: mapped.sourceId, targetId, reason: match.reason })
      update.run(JSON.stringify(mapped), decision, targetId, null, match.reason, row.id)
    }
  })
  processRows.immediate()
  report.unmappedOwners = [...new Map(report.unmappedOwners.map(item => [item.sourceId, item])).values()]
  report.unmappedStages = [...new Map(report.unmappedStages.map(item => [`${item.kind}:${item.sourceId}`, item])).values()]
  db.prepare(`UPDATE migration_jobs SET status = 'dry-run', counts_json = ?, dry_run_report_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(report.counts), JSON.stringify(report), Date.now(), jobId)
  return report
}

export function setMigrationDecisions(jobId, decisions = [], options = {}) {
  const db = getMigrationDb(options)
  const allowed = new Set(['create', 'merge', 'skip', 'review'])
  const update = db.prepare('UPDATE migration_rows SET match_decision = ?, target_id = ?, resolution_reason = ? WHERE job_id = ? AND id = ?')
  const apply = db.transaction(() => {
    for (const decision of decisions || []) {
      if (!allowed.has(decision.action)) throw new Error('Unsupported migration decision')
      if (decision.action === 'merge' && !decision.targetId) throw new Error('Merge decisions require a target record')
      update.run(decision.action, decision.targetId || null, decision.reason || 'operator decision', jobId, Number(decision.rowId))
    }
  })
  apply.immediate()
  return { ok: true, jobId, updated: decisions.length }
}

function recordHash() {
  const payload = Object.fromEntries(MIGRATION_ORDER.map(object => [object, loadAll(object)]))
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function fieldGroup(field) {
  if (['name', 'businessName', 'title'].includes(field)) return 'identity'
  if (['email', 'phone', 'website'].includes(field)) return 'contact'
  if (['pipelineId', 'stageId', 'status', 'value'].includes(field)) return 'workflow'
  return 'details'
}

function mergeMigrationRecord(existing, incoming, policyConfig = 'fill-blanks') {
  const next = { ...existing }
  for (const [field, value] of Object.entries(incoming || {})) {
    if (value === '' || value === null || value === undefined) continue
    const policy = typeof policyConfig === 'string' ? policyConfig : (policyConfig?.[fieldGroup(field)] || 'fill-blanks')
    if (field === 'customFields') {
      next.customFields = policy === 'keep-existing' ? { ...(value || {}), ...(existing.customFields || {}) }
        : policy === 'overwrite' ? { ...(existing.customFields || {}), ...(value || {}) }
          : Object.fromEntries([...Object.entries(value || {}), ...Object.entries(existing.customFields || {})])
    } else if (policy === 'overwrite' || (policy === 'fill-blanks' && (next[field] === '' || next[field] === null || next[field] === undefined))) next[field] = value
  }
  next.updatedAt = new Date().toISOString()
  return next
}

function relationTarget(kind, relation, mapped, db, job, records) {
  if (!relation) return { id: '', fallback: false }
  if (kind === 'owner') return { id: job.config.ownerMappings?.[relation.sourceId] || '', fallback: false }
  if (kind === 'pipeline' || kind === 'stage') {
    const pipelineKey = mapped.relations?.pipeline?.sourceId || 'default'
    const config = job.config.pipelineMappings?.[pipelineKey]
    return { id: kind === 'pipeline' ? config?.pipelineId || '' : config?.stages?.[relation.sourceId] || '', fallback: false }
  }
  const target = crosswalkTarget(db, job.sourceSystem, relation.sourceObject, relation.sourceId)
  if (target) return { id: target.fccId, fallback: false }
  const targetObject = kind === 'account' ? 'accounts' : kind === 'contact' ? 'contacts' : kind === 'deal' ? 'opportunities' : ''
  const name = relationFallbackName(kind, mapped.raw)
  const record = name && targetObject ? (records[targetObject] || []).find(item => norm(item.name) === norm(name)) : null
  return { id: record?.id || '', fallback: Boolean(record) }
}

function applyRelationships(mapped, db, job, records) {
  const record = { ...mapped.record }
  const linkedTo = {}
  const unresolved = []
  for (const [kind, field] of [['account', 'accountId'], ['contact', 'contactId'], ['deal', 'opportunityId']]) {
    const relation = mapped.relations?.[kind]
    if (!relation) continue
    const target = relationTarget(kind, relation, mapped, db, job, records)
    if (!target.id) unresolved.push({ kind, ...relation, reason: 'relationship could not be resolved during commit' })
    else if (mapped.fccObject === 'activities') linkedTo[field] = target.id
    else record[field] = target.id
  }
  const owner = relationTarget('owner', mapped.relations?.owner, mapped, db, job, records)
  if (owner.id) {
    if (mapped.fccObject === 'activities') record.authorId = owner.id
    else record.ownerId = owner.id
  }
  const pipeline = relationTarget('pipeline', mapped.relations?.pipeline, mapped, db, job, records)
  const stage = relationTarget('stage', mapped.relations?.stage, mapped, db, job, records)
  if (pipeline.id) record.pipelineId = pipeline.id
  if (stage.id) record.stageId = stage.id
  if (mapped.fccObject === 'activities') record.linkedTo = linkedTo
  return { record, unresolved }
}

function persistCrosswalk(db, job, mapped, fccId) {
  const now = Date.now()
  db.prepare(`INSERT INTO migration_crosswalk
    (source_system, source_object, source_id, fcc_object, fcc_id, job_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_system, source_object, source_id) DO UPDATE SET fcc_object = excluded.fcc_object,
      fcc_id = excluded.fcc_id, updated_at = excluded.updated_at`)
    .run(job.sourceSystem, mapped.sourceObject, mapped.sourceId, mapped.fccObject, fccId, job.id, now, now)
}

function migrationSlug(value, fallback) {
  return compact(value).slice(0, 48) || fallback
}

function ensureMissingPipelines(job, rows, db, snapshots) {
  if (!job.config.createMissingPipelines) return
  const pipelines = loadAll('pipelines')
  let changed = false
  const mappings = { ...(job.config.pipelineMappings || {}) }
  for (const row of rows) {
    const mapped = parseJson(row.mapped_json, {})
    if (mapped.fccObject !== 'opportunities') continue
    const pipelineSourceId = mapped.relations?.pipeline?.sourceId || 'default'
    const stageSourceId = mapped.relations?.stage?.sourceId || 'new'
    if (mappings[pipelineSourceId]?.pipelineId && mappings[pipelineSourceId]?.stages?.[stageSourceId]) continue
    let pipeline = mappings[pipelineSourceId]?.pipelineId ? pipelines.find(item => item.id === mappings[pipelineSourceId].pipelineId) : null
    if (!pipeline) {
      const pipelineId = `mig-${job.sourceSystem}-${migrationSlug(pipelineSourceId, 'default')}`
      pipeline = pipelines.find(item => item.id === pipelineId)
      if (!pipeline) {
        const now = new Date().toISOString()
        pipeline = { id: pipelineId, name: `${MIGRATION_SOURCES[job.sourceSystem].label} ${pipelineSourceId}`, color: '#6c7086', stages: [], createdAt: now, updatedAt: now, importJobId: job.id }
        pipelines.push(pipeline)
        snapshots.run(job.id, 'pipelines', pipeline.id, 'create', null)
        changed = true
      }
    }
    const stageId = `mig-${job.sourceSystem}-${migrationSlug(stageSourceId, 'new')}`
    if (!pipeline.stages.some(stage => stage.id === stageId)) {
      pipeline.stages.push({ id: stageId, label: String(stageSourceId), color: '#89b4fa', probability: 10 })
      changed = true
    }
    mappings[pipelineSourceId] = { pipelineId: pipeline.id, stages: { ...(mappings[pipelineSourceId]?.stages || {}), [stageSourceId]: stageId } }
  }
  if (changed) saveAll('pipelines', pipelines)
  job.config.pipelineMappings = mappings
  db.prepare('UPDATE migration_jobs SET config_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(job.config), Date.now(), job.id)
}

export function commitMigrationJob(jobId, options = {}) {
  const db = getMigrationDb(options)
  const job = getMigrationJob(jobId, options)
  if (!job) throw new Error('Migration job not found')
  if (job.status !== 'dry-run') throw new Error('Run the migration report before commit')
  const review = db.prepare("SELECT COUNT(*) AS count FROM migration_rows WHERE job_id = ? AND match_decision = 'review'").get(jobId)?.count || 0
  if (review) throw new Error(`${review} conflict rows still require a decision`)
  const preCommitHash = recordHash()
  const snapshots = db.prepare(`INSERT OR REPLACE INTO migration_snapshots (job_id, fcc_object, fcc_id, action, before_json) VALUES (?, ?, ?, ?, ?)`)
  const mark = db.prepare('UPDATE migration_rows SET target_id = ?, committed_action = ?, error = ? WHERE id = ?')
  const counts = { created: 0, merged: 0, skipped: 0, invalid: 0, unresolvedRelations: 0 }
  const rows = db.prepare(`SELECT * FROM migration_rows WHERE job_id = ? AND mapped_json IS NOT NULL ORDER BY id`).all(jobId)
  ensureMissingPipelines(job, rows, db, snapshots)
  const records = existingRecords()
  for (const object of MIGRATION_ORDER) {
    let changed = false
    for (const row of rows.filter(item => parseJson(item.mapped_json, {})?.fccObject === object)) {
      const mapped = parseJson(row.mapped_json, {})
      if (row.match_decision === 'skip') { counts.skipped += 1; if (row.error) counts.invalid += 1; continue }
      const related = applyRelationships(mapped, db, job, records)
      if (related.unresolved.length && object === 'activities') {
        counts.skipped += 1; counts.unresolvedRelations += related.unresolved.length
        mark.run(null, 'skip', related.unresolved.map(item => item.reason).join('; '), row.id)
        continue
      }
      const now = new Date().toISOString()
      if (row.match_decision === 'merge') {
        const index = records[object].findIndex(record => record.id === row.target_id)
        if (index < 0) throw new Error(`Merge target missing for migration row ${row.id}`)
        const before = records[object][index]
        snapshots.run(jobId, object, before.id, 'merge', JSON.stringify(before))
        records[object][index] = mergeMigrationRecord(before, related.record, job.config.fieldPolicy || 'fill-blanks')
        persistCrosswalk(db, job, mapped, before.id)
        mark.run(before.id, 'merge', related.unresolved.length ? JSON.stringify(related.unresolved) : null, row.id)
        counts.merged += 1; changed = true
      } else {
        const id = genId(({ accounts: 'ac', contacts: 'ct', leads: 'ld', opportunities: 'op', activities: 'av' })[object])
        const incoming = object === 'accounts' && !related.record.type ? { ...related.record, type: job.config.accountType || 'client' } : related.record
        const record = { id, createdAt: now, updatedAt: now, ...normalizedRecord(object, incoming), importJobId: jobId, importedAt: now, sample: false }
        snapshots.run(jobId, object, id, 'create', null)
        records[object].unshift(record)
        persistCrosswalk(db, job, mapped, id)
        mark.run(id, 'create', related.unresolved.length ? JSON.stringify(related.unresolved) : null, row.id)
        counts.created += 1; changed = true
      }
      counts.unresolvedRelations += related.unresolved.length
    }
    if (changed) saveAll(object, records[object])
  }
  const now = Date.now(); const expires = now + 30 * 24 * 60 * 60 * 1000
  db.prepare(`UPDATE migration_jobs SET status = 'committed', counts_json = ?, pre_commit_hash = ?, committed_at = ?, rollback_expires_at = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(counts), preCommitHash, now, expires, now, jobId)
  return { ok: true, jobId, counts, preCommitHash, rollbackExpiresAt: new Date(expires).toISOString() }
}

export function rollbackMigrationJob(jobId, options = {}) {
  const db = getMigrationDb(options)
  const row = db.prepare('SELECT * FROM migration_jobs WHERE id = ?').get(jobId)
  if (!row) throw new Error('Migration job not found')
  if (row.status !== 'committed') throw new Error('Only a committed migration can be rolled back')
  if (!row.rollback_expires_at || Date.now() > row.rollback_expires_at) throw new Error('The 30-day rollback window has expired')
  const snapshots = db.prepare('SELECT * FROM migration_snapshots WHERE job_id = ?').all(jobId)
  const byObject = new Map()
  for (const snapshot of snapshots) {
    const list = byObject.get(snapshot.fcc_object) || []
    list.push(snapshot); byObject.set(snapshot.fcc_object, list)
  }
  for (const object of [...MIGRATION_ORDER].reverse()) {
    const objectSnapshots = byObject.get(object) || []
    if (!objectSnapshots.length) continue
    let records = loadAll(object)
    const created = new Set(objectSnapshots.filter(item => item.action === 'create').map(item => item.fcc_id))
    records = records.filter(record => !created.has(record.id))
    for (const snapshot of objectSnapshots.filter(item => item.action === 'merge')) {
      const before = parseJson(snapshot.before_json, null)
      const index = records.findIndex(record => record.id === snapshot.fcc_id)
      if (index >= 0) records[index] = before
      else records.push(before)
    }
    saveAll(object, records)
  }
  db.prepare('DELETE FROM migration_crosswalk WHERE job_id = ?').run(jobId)
  const restoredHash = recordHash()
  const hashVerified = restoredHash === row.pre_commit_hash
  db.prepare("UPDATE migration_jobs SET status = 'rolled-back', updated_at = ? WHERE id = ?").run(Date.now(), jobId)
  return { ok: true, jobId, hashVerified, preCommitHash: row.pre_commit_hash, restoredHash }
}
function resolveRelations(objectType, record) {
  const next = { ...record }
  if (next.accountName) {
    const account = loadAll('accounts').find(item => norm(item.name) === norm(next.accountName))
    if (account) next.accountId = account.id
    delete next.accountName
  }
  if (next.company && objectType === 'contacts') {
    const account = loadAll('accounts').find(item => norm(item.name) === norm(next.company))
    if (account) next.accountId = account.id
    delete next.company
  }
  if (next.projectName && objectType === 'tasks') {
    const project = loadAll('projects').find(item => norm(item.name) === norm(next.projectName))
    if (project) next.linkedTo = { ...(next.linkedTo || {}), projectId: project.id }
    delete next.projectName
  }
  return next
}

export function previewOpenOctiImport(objectType, rows = []) {
  if (!IMPORT_OBJECTS[objectType]) throw new Error('Unsupported import object')
  const existingKeys = new Map()
  loadAll(objectType).forEach(record => duplicateKeys(record).forEach(key => existingKeys.set(key, record.id)))
  const seen = new Set()
  const preview = rows.map((raw, index) => {
    const record = normalizedRecord(objectType, raw)
    const keys = duplicateKeys(record)
    const existingId = keys.map(key => existingKeys.get(key)).find(Boolean) || null
    const inFileDuplicate = !existingId && keys.some(key => seen.has(key))
    keys.forEach(key => seen.add(key))
    const valid = (IMPORT_OBJECTS[objectType].required || []).every(group => group.split('|').some(field => String(record[field] || '').trim()))
    return { index, valid, duplicate: Boolean(existingId || inFileDuplicate), existingId, inFileDuplicate, record, errors: valid ? [] : ['A required identifying field is missing'] }
  })
  return { rows: preview, valid: preview.filter(item => item.valid).length, duplicates: preview.filter(item => item.duplicate).length, invalid: preview.filter(item => !item.valid).length }
}

export function commitOpenOctiImport(objectType, rows = [], options = {}) {
  const preview = previewOpenOctiImport(objectType, rows)
  const batchId = `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const destination = String(options.destination || 'farrington_dev').trim()
  const leadList = objectType === 'leads' ? resolveLeadListForDestination({ leadLists: loadLeadLists(), destination, requestedId: options.leadListId }) : null
  let added = 0; let skipped = 0
  for (const item of preview.rows) {
    if (!item.valid || (item.duplicate && options.skipDuplicates !== false)) { skipped += 1; continue }
    const routed = objectType === 'leads'
      ? { ...item.record, source: 'CSV import', brandContext: destination, leadListId: leadList?.id || null }
      : item.record
    create(objectType, { ...resolveRelations(objectType, routed), importBatchId: batchId, importedAt: new Date().toISOString(), sample: false })
    added += 1
  }
  return { ok: true, objectType, batchId, added, skipped, duplicates: preview.duplicates, invalid: preview.invalid }
}

export function undoOpenOctiImport(batchId) {
  if (!batchId) throw new Error('Import batch ID is required')
  const removed = {}
  for (const objectType of Object.keys(IMPORT_OBJECTS)) {
    const current = loadAll(objectType); const next = current.filter(record => record.importBatchId !== batchId)
    if (next.length !== current.length) { removed[objectType] = current.length - next.length; saveAll(objectType, next) }
  }
  return { ok: true, batchId, removed, totalRemoved: Object.values(removed).reduce((sum, count) => sum + count, 0) }
}

function csvCell(value) { const text = Array.isArray(value) ? value.join('; ') : typeof value === 'object' && value ? JSON.stringify(value) : String(value ?? ''); return `"${text.replaceAll('"', '""')}"` }
export function exportOpenOctiCsv(objectType) {
  const config = IMPORT_OBJECTS[objectType]
  if (!config) throw new Error('Unsupported export object')
  const rows = loadAll(objectType).filter(record => !record.sample)
  const fields = ['id', ...config.fields.filter(field => !['firstName', 'lastName', 'company', 'accountName', 'projectName'].includes(field)), 'createdAt', 'updatedAt']
  return [fields.map(csvCell).join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\r\n') + '\r\n'
}

export function importPresets() { return readData('openocti-import-presets.json')?.presets || [] }
export function saveImportPreset(preset) {
  const name = String(preset?.name || '').trim().slice(0, 80)
  if (!name) throw new Error('Preset name is required')
  const presets = importPresets().filter(item => item.name !== name)
  presets.push({ name, objectType: preset.objectType, mapping: preset.mapping || [], updatedAt: new Date().toISOString() })
  writeData('openocti-import-presets.json', { presets })
  return presets
}
