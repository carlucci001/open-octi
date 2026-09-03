import { create, loadAll, saveAll } from './entityStore'
import { readData, writeData } from './dataStore'

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
  if (objectType === 'leads') { record.status ||= 'new'; record.source ||= 'import' }
  if (objectType === 'accounts') { record.type ||= 'prospect'; record.stage ||= 'active' }
  if (objectType === 'contacts') { record.tags ||= []; record.primary = false }
  if (objectType === 'opportunities') { record.pipelineId ||= 'sales'; record.stageId ||= 'new' }
  if (objectType === 'projects') record.status ||= 'active'
  if (objectType === 'tasks') { record.status ||= 'todo'; record.priority ||= 'medium' }
  return record
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
  let added = 0; let skipped = 0
  for (const item of preview.rows) {
    if (!item.valid || (item.duplicate && options.skipDuplicates !== false)) { skipped += 1; continue }
    create(objectType, { ...resolveRelations(objectType, item.record), importBatchId: batchId, importedAt: new Date().toISOString(), sample: false })
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
