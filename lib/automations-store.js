/**
 * Automations store — reusable workflows you build once and either run for your
 * own business (in-house) or assign to a client's agent to run 24/7 (client).
 *
 * Backed by data/automations.json via dataStore (sqlite kv_store in prod, demo
 * redirect aware). Designed for a clean Firebase port: UUID-ish ids, single
 * status string, tenantId reserved for per-client scoping/billing.
 *
 * The API route is the only client of this module.
 */
import { readData, writeData } from './dataStore'
import { getAutomationRunner, runRegisteredAutomation } from './automation-runners'
import { automationStudioTemplateList, getAutomationStudioTemplate } from './automation-studio-templates'

const FILE = 'automations.json'
const VERSION = 1

function load() {
  const data = readData(FILE)
  if (data && data.__version) return data
  return { __version: VERSION, automations: [] }
}

function save(data) {
  data.__version = VERSION
  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function nowISO() { return new Date().toISOString() }

function recordAutomationRunActivity(automation, summary) {
  if (!automation?.tenantId) return
  const activitiesFile = readData('activities.json') || { activities: [] }
  activitiesFile.activities = activitiesFile.activities || []
  activitiesFile.activities.push({
    id: genId('activity'),
    tenantId: automation.tenantId,
    type: 'automation_run',
    subject: `${automation.name || 'Automation'} completed`,
    body: summary || 'Automation run completed.',
    createdAt: nowISO(),
  })
  activitiesFile.lastUpdated = nowISO()
  writeData('activities.json', activitiesFile)
}

function tenantIdFromAccount(account) {
  const slug = (account.name || account.id || 'tenant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `lease-${account.id || slug}`
}

function ensureClientPortalLease(automation) {
  if (automation.scope !== 'client' || !automation.tenantId) return null

  const accountId = automation.tenantId
  const agentId = automation.assignedAgentId
  if (!agentId) return null

  const accountsFile = readData('accounts.json') || { accounts: [] }
  const account = (accountsFile.accounts || []).find(a => a.id === accountId)
  if (!account) throw new Error(`Cannot provision portal: account ${accountId} not found`)

  const agentsFile = readData('agents.json') || { agents: {} }
  const agent = agentsFile.agents?.[agentId]
  if (!agent) throw new Error(`Cannot provision portal: agent ${agentId} not found`)

  const leasesFile = readData('leases.json') || { leases: [] }
  leasesFile.leases = leasesFile.leases || []

  const existingActive = leasesFile.leases.find(l =>
    l.clientAccountId === accountId &&
    l.agentId === agentId &&
    l.status === 'active'
  )
  if (existingActive) return existingActive

  const now = nowISO()
  const tenantId = tenantIdFromAccount(account)
  const lease = {
    id: genId('lease'),
    agentId,
    agentName: agent.name || automation.assignedAgentName || agentId,
    tenantId,
    tenantName: account.name || automation.clientName || accountId,
    clientAccountId: accountId,
    tierId: 'automation-portal',
    tierName: 'Automation portal',
    monthlyFee: 0,
    startDate: now.slice(0, 10),
    status: 'active',
    notes: `Auto-provisioned when automation "${automation.name || automation.id}" was assigned to ${account.name || accountId}.`,
    addons: {
      automationPortal: true,
      automationId: automation.id,
      serviceType: automation.serviceType || null,
    },
    createdAt: now,
    updatedAt: now,
  }

  leasesFile.leases.push(lease)
  leasesFile.lastUpdated = now
  writeData('leases.json', leasesFile)

  agent.tenantId = tenantId
  agent.leaseId = lease.id
  agentsFile.lastUpdated = now
  writeData('agents.json', agentsFile)

  return lease
}

export function listAutomations(filter = {}) {
  const data = load()
  let list = data.automations || []
  if (filter.scope) list = list.filter(a => a.scope === filter.scope)
  if (filter.tenantId) list = list.filter(a => a.tenantId === filter.tenantId)
  return [...list].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
}

export function listAutomationTemplates() {
  return automationStudioTemplateList()
}

export function getAutomation(id) {
  return load().automations.find(a => a.id === id) || null
}

export function createAutomation(input = {}) {
  const data = load()
  const now = nowISO()
  const scope = input.scope === 'client' ? 'client' : 'in-house'
  const automation = {
    id: input.id || genId('auto'),
    ownerUid: null,
    name: input.name || 'Untitled automation',
    description: input.description || '',
    scope,                                   // 'in-house' | 'client'
    tenantId: scope === 'client' ? (input.tenantId || null) : null,
    clientName: scope === 'client' ? (input.clientName || '') : '',
    serviceType: input.serviceType || 'custom',
    templateId: input.templateId || null,
    runtimeProvider: input.runtimeProvider || null,
    safetyLevel: input.safetyLevel || 'approval-gated',
    commercialOffer: input.commercialOffer || '',
    assignedAgentId: input.assignedAgentId || null,
    assignedAgentName: input.assignedAgentName || '',
    cadence: input.cadence || '',
    dataSource: input.dataSource || { provider: 'manual', query: '', fields: [] },
    output: input.output || { format: 'brief', destination: 'crm' },
    approval: input.approval || { required: true, approver: 'Carl' },
    delivery: input.delivery || { method: 'draft', channels: ['email'], recipients: [] },
    campaign: input.campaign || { subject: '', senderProfile: '', cadence: '' },
    metrics: input.metrics || [],
    trigger: {
      type: input.trigger?.type || 'manual',  // 'manual' | 'schedule' | 'webhook' | 'event'
      config: input.trigger?.config || {},
    },
    steps: Array.isArray(input.steps) ? input.steps : [],
    enabled: input.enabled ?? false,
    status: input.status || 'draft',          // 'draft' | 'active' | 'paused'
    runCount: 0,
    lastRunAt: null,
    runHistory: [],
    createdAt: now,
    updatedAt: now,
  }
  const portalLease = ensureClientPortalLease(automation)
  if (portalLease) automation.portalLeaseId = portalLease.id
  data.automations.push(automation)
  save(data)
  return automation
}

export function createAutomationFromTemplate(templateId, patch = {}) {
  const template = getAutomationStudioTemplate(templateId)
  if (!template) throw new Error(`Automation template not found: ${templateId}`)
  return createAutomation({
    ...template,
    ...patch,
    templateId,
    enabled: false,
    status: 'draft',
  })
}

export function updateAutomation(id, patch = {}) {
  const data = load()
  const idx = data.automations.findIndex(a => a.id === id)
  if (idx < 0) throw new Error(`Automation not found: ${id}`)
  const existing = data.automations[idx]
  const scope = patch.scope || existing.scope
  const next = {
    ...existing,
    ...patch,
    scope,
    tenantId: scope === 'client' ? (patch.tenantId ?? existing.tenantId) : null,
    clientName: scope === 'client' ? (patch.clientName ?? existing.clientName) : '',
    serviceType: patch.serviceType ?? existing.serviceType ?? 'custom',
    templateId: patch.templateId ?? existing.templateId ?? null,
    runtimeProvider: patch.runtimeProvider ?? existing.runtimeProvider ?? null,
    safetyLevel: patch.safetyLevel ?? existing.safetyLevel ?? 'approval-gated',
    commercialOffer: patch.commercialOffer ?? existing.commercialOffer ?? '',
    assignedAgentId: patch.assignedAgentId ?? existing.assignedAgentId ?? null,
    assignedAgentName: patch.assignedAgentName ?? existing.assignedAgentName ?? '',
    cadence: patch.cadence ?? existing.cadence ?? '',
    dataSource: patch.dataSource ?? existing.dataSource ?? { provider: 'manual', query: '', fields: [] },
    output: patch.output ?? existing.output ?? { format: 'brief', destination: 'crm' },
    approval: patch.approval ?? existing.approval ?? { required: true, approver: 'Carl' },
    delivery: patch.delivery ?? existing.delivery ?? { method: 'draft', channels: ['email'], recipients: [] },
    campaign: patch.campaign ?? existing.campaign ?? { subject: '', senderProfile: '', cadence: '' },
    metrics: patch.metrics ?? existing.metrics ?? [],
    trigger: { ...(existing.trigger || {}), ...(patch.trigger || {}) },
    steps: Array.isArray(patch.steps) ? patch.steps : existing.steps,
    updatedAt: nowISO(),
  }
  const portalLease = ensureClientPortalLease(next)
  if (portalLease) next.portalLeaseId = portalLease.id
  data.automations[idx] = next
  save(data)
  return next
}

export function toggleAutomation(id) {
  const a = getAutomation(id)
  if (!a) throw new Error(`Automation not found: ${id}`)
  const enabled = !a.enabled
  return updateAutomation(id, { enabled, status: enabled ? 'active' : 'paused' })
}

export async function runAutomation(id, options = {}) {
  const a = getAutomation(id)
  if (!a) throw new Error(`Automation not found: ${id}`)
  const now = nowISO()
  if (getAutomationRunner(a)) {
    const startedRun = {
      id: genId('run'),
      startedAt: now,
      status: 'running',
      executionMode: 'executed_runner',
      note: 'Running automation through the registered execution engine.',
    }
    updateAutomation(id, {
      runHistory: [startedRun, ...(a.runHistory || [])].slice(0, 25),
    })
    try {
      const execution = await runRegisteredAutomation(a, {
        recipientEmail: options.recipientEmail || options.user?.email,
      })
      const result = execution.result
      const legacyLeadSweepNote = `${execution.runnerLabel} returned ${result.returned} records, created ${result.created} CRM leads, and emailed ${result.emailedTo}.`
      const completedRun = {
        ...startedRun,
        finishedAt: nowISO(),
        status: 'completed',
        executionMode: 'executed_runner',
        note: result.summary || legacyLeadSweepNote,
        metrics: result.metrics || {
          returned: result.returned,
          createdLeads: result.created,
          emailedTo: result.emailedTo,
          emailId: result.emailId,
          runnerId: execution.runnerId,
        },
        ...(result.leads ? { leads: result.leads } : {}),
        ...(result.results ? { results: result.results } : {}),
      }
      recordAutomationRunActivity(a, completedRun.note)
      return updateAutomation(id, {
        runCount: (a.runCount || 0) + 1,
        lastRunAt: nowISO(),
        runHistory: [completedRun, ...(a.runHistory || [])].slice(0, 25),
      })
    } catch (error) {
      recordAutomationRunActivity(a, error.message || 'Automation run failed')
      return updateAutomation(id, {
        runCount: (a.runCount || 0) + 1,
        lastRunAt: nowISO(),
        runHistory: [{
          ...startedRun,
          finishedAt: nowISO(),
          status: 'failed',
          executionMode: 'executed_runner',
          note: error.message || 'Automation run failed',
        }, ...(a.runHistory || [])].slice(0, 25),
      })
    }
  }
  const proof = buildGuardedRunProof(a)
  const run = {
    id: genId('run'),
    startedAt: now,
    finishedAt: nowISO(),
    status: 'prepared',
    executionMode: 'guarded_preparation',
    note: proof.note,
    metrics: proof.metrics,
    output: proof.output,
    approvalRequired: proof.approvalRequired,
  }
  recordAutomationRunActivity(a, proof.note)
  return updateAutomation(id, {
    runCount: (a.runCount || 0) + 1,
    lastRunAt: now,
    runHistory: [run, ...(a.runHistory || [])].slice(0, 25),
  })
}

export function recordScheduledRun(id, entry = {}) {
  const a = getAutomation(id)
  if (!a) throw new Error(`Automation not found: ${id}`)
  const ok = entry.ok !== false
  const runEntry = {
    id: genId('run'),
    startedAt: entry.startedAt || nowISO(),
    finishedAt: nowISO(),
    status: ok ? 'completed' : 'failed',
    executionMode: 'scheduled_runner',
    ok,
    ...(ok ? { summary: entry.summary || 'Scheduled run completed.' } : { error: entry.error || 'Scheduled run failed.' }),
  }
  const updated = updateAutomation(id, {
    runCount: (a.runCount || 0) + 1,
    lastRunAt: nowISO(),
    runHistory: [runEntry, ...(a.runHistory || [])].slice(0, 20),
  })
  if (entry.notifyClient !== false) recordAutomationRunActivity(a, runEntry.summary || runEntry.error)
  return updated
}

function buildGuardedRunProof(automation) {
  const steps = Array.isArray(automation.steps) ? automation.steps : []
  const channels = automation.delivery?.channels?.length
    ? automation.delivery.channels.join(', ')
    : (automation.delivery?.method || 'approval queue')
  const source = automation.dataSource?.provider || 'manual'
  const runtime = automation.runtimeProvider || 'crm'
  const approvalRequired = automation.approval?.required !== false

  return {
    note: approvalRequired
      ? `Prepared a guarded ${automation.serviceType || 'automation'} run package from ${source}; no external send, CRM write, scheduling, or spend action was executed.`
      : `Prepared a ${automation.serviceType || 'automation'} run package from ${source}; delivery remains in the configured ${channels} path.`,
    metrics: {
      runtimeProvider: runtime,
      safetyLevel: automation.safetyLevel || 'approval-gated',
      stepsPrepared: steps.length,
      source,
      channels,
      approvalGate: approvalRequired ? (automation.approval?.approver || 'Carl') : 'not required',
    },
    output: {
      title: automation.commercialOffer || automation.name,
      preparedSections: [
        'Input checklist',
        'Research/actions plan',
        'Expected client deliverable',
        'Approval gate',
        'Run evidence log',
      ],
      nextSteps: approvalRequired
        ? ['Review inputs', 'Approve execution scope', 'Run the connected worker/tooling for live collection or delivery']
        : ['Review generated package', 'Connect a live runner when this workflow is ready for unattended operation'],
    },
    approvalRequired,
  }
}

export function cloneAutomation(id, patch = {}) {
  const source = getAutomation(id)
  if (!source) throw new Error(`Automation not found: ${id}`)
  const copy = JSON.parse(JSON.stringify(source))
  delete copy.id
  delete copy.createdAt
  delete copy.updatedAt
  return createAutomation({
    ...copy,
    ...patch,
    name: patch.name || `${source.name} copy`,
    enabled: false,
    status: 'draft',
    runCount: 0,
    lastRunAt: null,
    runHistory: [],
  })
}

export function deleteAutomation(id) {
  const data = load()
  const before = data.automations.length
  data.automations = data.automations.filter(a => a.id !== id)
  save(data)
  return { ok: true, removed: before - data.automations.length }
}
