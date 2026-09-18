import { readData, writeData } from '@/lib/dataStore'

export function formatDuration(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.round(secs % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function logTimeTrackingSession({ accountId, projectId, projectName, startedAt, stoppedAt, durationSeconds, note }) {
  if (!accountId) throw new Error('accountId required')
  const dur = Math.max(0, Math.round(Number(durationSeconds) || 0))
  if (dur === 0) throw new Error('durationSeconds must be > 0')

  const accountsFile = readData('accounts.json') || { accounts: [] }
  const list = accountsFile.accounts || []
  const account = list.find(a => a.id === accountId)
  if (!account) {
    const error = new Error(`account ${accountId} not found`)
    error.status = 404
    throw error
  }

  // Optional project attribution. A projectId that resolves to a real project on this
  // account wins and supplies the canonical name; a caller-supplied projectName with no
  // resolvable id is kept as a free-text label. Anything that doesn't resolve is dropped
  // rather than failing the whole log — the time still has to land on the account.
  // Existing activities/records have no project fields at all, so downstream readers
  // must treat projectId/projectName as optional.
  let resolvedProjectId = null
  let resolvedProjectName = projectName || null
  if (projectId) {
    const projectsFile = readData('projects.json') || { projects: [] }
    const project = (projectsFile.projects || []).find(p => p.id === projectId && p.accountId === accountId)
    if (project) {
      resolvedProjectId = project.id
      resolvedProjectName = project.name || resolvedProjectName
    }
  }

  account.trackedSeconds = (account.trackedSeconds || 0) + dur
  account.updatedAt = new Date().toISOString()
  accountsFile.lastUpdated = new Date().toISOString()
  writeData('accounts.json', accountsFile)

  const activitiesFile = readData('activities.json') || { activities: [] }
  const activities = activitiesFile.activities || []
  const activity = {
    id: `av_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: 'time_tracked',
    subject: `Time tracked for ${account.name}${resolvedProjectName ? ` (${resolvedProjectName})` : ''}: ${formatDuration(dur)}`,
    body: [
      `Duration: ${formatDuration(dur)} (${dur}s)`,
      resolvedProjectName ? `Project: ${resolvedProjectName}` : null,
      startedAt ? `Started: ${new Date(startedAt).toLocaleString()}` : null,
      stoppedAt ? `Stopped: ${new Date(stoppedAt).toLocaleString()}` : null,
      note ? `Note: ${note}` : null,
    ].filter(Boolean).join('\n'),
    linkedTo: { accountId, ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}) },
    meta: { durationSeconds: dur, startedAt, stoppedAt, note: note || null, projectId: resolvedProjectId, projectName: resolvedProjectName },
  }
  activities.push(activity)
  activitiesFile.activities = activities
  activitiesFile.lastUpdated = new Date().toISOString()
  writeData('activities.json', activitiesFile)

  return {
    activityId: activity.id,
    account: {
      id: account.id,
      name: account.name,
      trackedSeconds: account.trackedSeconds,
      trackedHumanReadable: formatDuration(account.trackedSeconds),
    },
    sessionLogged: {
      durationSeconds: dur,
      durationHumanReadable: formatDuration(dur),
      projectId: resolvedProjectId,
      projectName: resolvedProjectName,
    },
  }
}
