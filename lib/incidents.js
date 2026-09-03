import { create, findById, genId, loadAll, saveAll, update } from './entityStore'
import { readData, writeData } from './dataStore'
import { pushNtfy } from './ntfy'

const ALERT_STATE_FILE = 'incident-alert-state.json'
export const INCIDENT_STATUS_FILE = 'incident-platform-status.json'
const ALERT_SUPPRESSION_MS = 60 * 60_000
const MUTE_MS = 7 * 24 * 60 * 60_000
const OPEN_STATUSES = new Set(['open', 'acknowledged'])

function timestamp(value, fallback) {
  const ms = Date.parse(value || '')
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback
}

function numeric(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : fallback
}

export function normalizeIncidentLevel(value) {
  const level = String(value || '').trim().toLowerCase()
  if (['critical', 'fatal', 'error'].includes(level)) return 'error'
  if (['warn', 'warning', 'degraded'].includes(level)) return 'warning'
  return 'info'
}

function note(body, at, actor = 'System') {
  return { at, actor, body }
}

function historyEntry(event, now) {
  return { ts: timestamp(event.lastSeen, now), count: numeric(event.count, 1) }
}

function appendHistory(history, entry) {
  const rows = Array.isArray(history) ? history : []
  const withoutSameTimestamp = rows.filter(row => row?.ts !== entry.ts)
  return [...withoutSameTimestamp, entry]
    .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))
    .slice(-24)
}

function normalizeEvent(event, now) {
  const platformId = String(event?.platformId || '').trim()
  const fingerprint = String(event?.fingerprint || '').trim()
  if (!platformId || !fingerprint) return null
  const firstSeen = timestamp(event.firstSeen, now)
  const lastSeen = timestamp(event.lastSeen, firstSeen)
  return {
    platformId,
    platformName: String(event.platformName || platformId).trim().slice(0, 160),
    fingerprint,
    title: String(event.title || 'Platform incident').trim().slice(0, 300),
    level: normalizeIncidentLevel(event.level),
    count: numeric(event.count, 1),
    firstSeen,
    lastSeen,
    source: event.source === 'health' ? 'health' : 'errors',
    increment: Boolean(event.increment),
  }
}

export function reconcileIncidentEvents(existingIncidents = [], rawEvents = [], {
  now = new Date().toISOString(),
  idFactory = () => genId('inc'),
} = {}) {
  const incidents = existingIncidents.map(row => ({ ...row, notes: Array.isArray(row.notes) ? [...row.notes] : [] }))
  const byKey = new Map(incidents.map((row, index) => [`${row.platformId}:${row.fingerprint}`, index]))
  const alertCandidates = []

  for (const rawEvent of rawEvents) {
    const event = normalizeEvent(rawEvent, now)
    if (!event) continue
    const key = `${event.platformId}:${event.fingerprint}`
    const index = byKey.get(key)
    if (index === undefined) {
      const incident = {
        id: idFactory(),
        platformId: event.platformId,
        platformName: event.platformName,
        fingerprint: event.fingerprint,
        title: event.title,
        level: event.level,
        count: event.count,
        firstSeen: event.firstSeen,
        lastSeen: event.lastSeen,
        status: 'open',
        taskId: null,
        notes: [],
        public: false,
        mutedUntil: null,
        source: event.source,
        countHistory: [historyEntry(event, now)],
        createdAt: now,
        updatedAt: now,
      }
      byKey.set(key, incidents.length)
      incidents.push(incident)
      if (incident.level === 'error') alertCandidates.push({ ...incident, reason: 'new' })
      continue
    }

    const current = incidents[index]
    const nextCount = event.increment ? numeric(current.count) + 1 : Math.max(numeric(current.count), event.count)
    const observationIsNewer = Date.parse(event.lastSeen) > Date.parse(current.lastSeen || '') || nextCount > numeric(current.count)
    const afterResolution = current.status === 'resolved' && (
      Date.parse(event.lastSeen) > Date.parse(current.resolvedAt || current.lastSeen || '')
      || event.count > numeric(current.resolvedCount, numeric(current.count))
    )
    const muteExpired = current.status === 'muted' && Date.parse(current.mutedUntil || '') <= Date.parse(now)
    const shouldReopen = afterResolution || (muteExpired && observationIsNewer)
    const next = {
      ...current,
      platformName: event.platformName || current.platformName,
      title: event.title || current.title,
      level: event.level,
      count: nextCount,
      firstSeen: Date.parse(event.firstSeen) < Date.parse(current.firstSeen || '') ? event.firstSeen : current.firstSeen,
      lastSeen: Date.parse(event.lastSeen) > Date.parse(current.lastSeen || '') ? event.lastSeen : current.lastSeen,
      source: event.source,
      countHistory: observationIsNewer ? appendHistory(current.countHistory, { ts: event.lastSeen, count: nextCount }) : (current.countHistory || []),
      updatedAt: observationIsNewer ? now : current.updatedAt,
    }
    if (shouldReopen) {
      next.status = 'open'
      next.resolvedAt = null
      next.resolvedCount = null
      next.mutedUntil = null
      next.notes = [...next.notes, note('Incident reopened after a new source recurrence.', now)]
      if (next.level === 'error') alertCandidates.push({ ...next, reason: 'reopened' })
    }
    incidents[index] = next
  }

  return { incidents, alertCandidates }
}

export function resolveHealthyPlatformIncidents(incidents = [], healthyPlatformIds = [], { now = new Date().toISOString() } = {}) {
  const healthy = new Set(healthyPlatformIds)
  return incidents.map(incident => {
    if (incident.fingerprint !== 'platform-health' || !healthy.has(incident.platformId) || !OPEN_STATUSES.has(incident.status)) return incident
    return {
      ...incident,
      status: 'resolved',
      resolvedAt: now,
      resolvedCount: numeric(incident.count),
      updatedAt: now,
      notes: [...(incident.notes || []), note('Health endpoint recovered; incident resolved automatically.', now)],
    }
  })
}

export function applyIncidentAction(incident, action, { now = new Date().toISOString(), publicValue } = {}) {
  if (!incident) return null
  const notes = Array.isArray(incident.notes) ? incident.notes : []
  if (action === 'acknowledge') return { ...incident, status: 'acknowledged', acknowledgedAt: now, updatedAt: now, notes: [...notes, note('Incident acknowledged by Carl.', now, 'Carl')] }
  if (action === 'resolve') return { ...incident, status: 'resolved', resolvedAt: now, resolvedCount: numeric(incident.count), mutedUntil: null, updatedAt: now, notes: [...notes, note('Incident resolved by Carl.', now, 'Carl')] }
  if (action === 'mute') return { ...incident, status: 'muted', mutedUntil: new Date(Date.parse(now) + MUTE_MS).toISOString(), updatedAt: now, notes: [...notes, note('Incident muted for seven days by Carl.', now, 'Carl')] }
  if (action === 'set-public') return { ...incident, public: Boolean(publicValue), updatedAt: now, notes: [...notes, note(Boolean(publicValue) ? 'Incident published on the public status page.' : 'Incident removed from the public status page.', now, 'Carl')] }
  throw new Error(`Unknown incident action: ${action}`)
}

export function updateIncidentAction(id, action, options = {}) {
  const current = findById('incidents', id)
  if (!current) return null
  return update('incidents', id, applyIncidentAction(current, action, options))
}

export function createIncidentTask(incident, {
  createTask = create,
  updateIncident = update,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.company.example.com',
  now = new Date().toISOString(),
} = {}) {
  if (!incident) throw new Error('Incident not found.')
  if (incident.taskId) return { taskId: incident.taskId, created: false }
  const backlink = `${String(appUrl).replace(/\/+$/, '')}/?tab=incident-inbox&incident=${encodeURIComponent(incident.id)}`
  const task = createTask('tasks', {
    title: `[${incident.platformName || incident.platformId}] ${incident.title}`,
    description: `Investigate and close Incident Inbox record ${incident.id}.\n\n${backlink}`,
    status: 'todo',
    priority: incident.level === 'error' ? 'high' : 'medium',
    dueDate: null,
    linkedTo: { incidentId: incident.id },
    tags: ['incident', incident.platformId].filter(Boolean),
    assignedTo: 'Carl',
    assignedToUserId: 'carl',
    completedAt: null,
  })
  const updatedIncident = updateIncident('incidents', incident.id, {
    taskId: task.id,
    updatedAt: now,
    notes: [...(incident.notes || []), note(`Created Projects task ${task.id}.`, now, 'Carl')],
  })
  return { task, incident: updatedIncident, taskId: task.id, created: true }
}

export function applyIncidentAlertCandidate(inputState = {}, candidate, {
  nowMs = Date.now(),
  suppressionMs = ALERT_SUPPRESSION_MS,
} = {}) {
  if (normalizeIncidentLevel(candidate?.level) !== 'error') return { state: { ...inputState }, shouldAlert: false }
  const key = `${candidate.platformId}:${candidate.fingerprint}`
  const lastMs = Date.parse(inputState[key] || '')
  if (Number.isFinite(lastMs) && nowMs - lastMs < suppressionMs) return { state: { ...inputState }, shouldAlert: false }
  return { state: { ...inputState, [key]: new Date(nowMs).toISOString() }, shouldAlert: true }
}

export async function processIncidentAlerts(candidates = [], { nowMs = Date.now() } = {}) {
  let state = readData(ALERT_STATE_FILE) || {}
  const alerted = []
  for (const candidate of candidates) {
    const result = applyIncidentAlertCandidate(state, candidate, { nowMs })
    state = result.state
    if (!result.shouldAlert) continue
    alerted.push(candidate)
    await pushNtfy({
      title: `Incident Inbox: ${candidate.platformName || candidate.platformId}`,
      body: String(candidate.title || 'New error-level incident').slice(0, 500),
      priority: 'high',
      tags: ['rotating_light', 'computer'],
    })
  }
  writeData(ALERT_STATE_FILE, state)
  return alerted
}

export function readIncidentStatusState() {
  const state = readData(INCIDENT_STATUS_FILE)
  return state && typeof state === 'object' ? state : { generatedAt: null, platforms: [] }
}

export function buildPublicStatusSnapshot({ statusState = readIncidentStatusState(), incidents = loadAll('incidents') } = {}) {
  return {
    generatedAt: statusState.generatedAt || null,
    platforms: (statusState.platforms || []).map(platform => ({
      platformId: platform.platformId,
      name: platform.name,
      status: ['ok', 'degraded', 'down'].includes(platform.status) ? platform.status : 'unknown',
      version: String(platform.version || ''),
    })),
    incidents: incidents
      .filter(incident => incident.public === true && OPEN_STATUSES.has(incident.status))
      .map(incident => ({
        id: incident.id,
        platformId: incident.platformId,
        title: incident.title,
        level: normalizeIncidentLevel(incident.level),
        status: incident.status,
        lastSeen: incident.lastSeen,
      }))
      .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))),
  }
}

export function listIncidents() {
  return loadAll('incidents').sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
}

export function saveIncidents(incidents) {
  saveAll('incidents', incidents)
}

export function writeIncidentStatusState(state) {
  writeData(INCIDENT_STATUS_FILE, state)
}
