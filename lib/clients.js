// Single source of truth for "clients" — thin wrapper over accounts.json
// where type === 'client'. Preserves existing client IDs (cl_*, etc.)
// so documents/invoices/payments keep working without migration.
import { loadAll, saveAll, findById, create, update, remove, genId } from './entityStore'

const TYPE = 'client'

export function getClients() {
  return loadAll('accounts').filter(a => a.type === TYPE)
}

export function findClient(id) {
  const rec = findById('accounts', id)
  return rec && rec.type === TYPE ? rec : null
}

export function findClientByName(name) {
  if (!name) return null
  const n = name.toLowerCase().trim()
  return getClients().find(c => c.name?.toLowerCase().trim() === n) || null
}

export function createClient(fields = {}) {
  return create('accounts', {
    type: TYPE,
    stage: 'active',
    priority: 'medium',
    website: '',
    industry: '',
    address: '',
    email: '',
    phone: '',
    notes: '',
    tags: [],
    projects: [],
    lastContactedAt: null,
    nextFollowUpAt: null,
    ...fields,
    // Ensure type stays 'client' even if caller accidentally passes something else
    type: TYPE,
  })
}

export function updateClient(id, patch) {
  const current = findClient(id)
  if (!current) return null
  return update('accounts', id, { ...patch, type: TYPE })
}

export function deleteClient(id) {
  const c = findClient(id)
  if (!c) return false
  return remove('accounts', id)
}

// Projects are stored on the client record as a `projects` array.
export function addProject(clientId, project) {
  const c = findClient(clientId)
  if (!c) return null
  const proj = { id: genId('pj'), createdAt: new Date().toISOString(), status: 'active', ...project }
  const projects = [...(c.projects || []), proj]
  update('accounts', clientId, { projects })
  return proj
}

export function updateProject(clientId, project) {
  const c = findClient(clientId)
  if (!c) return null
  const projects = (c.projects || []).map(p => p.id === project.id ? { ...p, ...project } : p)
  update('accounts', clientId, { projects })
  return project
}

export function deleteProject(clientId, projectId) {
  const c = findClient(clientId)
  if (!c) return false
  const projects = (c.projects || []).filter(p => p.id !== projectId)
  update('accounts', clientId, { projects })
  return true
}
