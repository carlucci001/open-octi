import { listAutomations, recordScheduledRun } from './automations-store'
import { runRegisteredAutomation } from './automation-runners'
import { maybeRunNightlyUsageMaintenance } from './usage-events'

const STATE_KEY = Symbol.for('fcc.automation-scheduler')
const TICK_INTERVAL_MS = 5 * 60 * 1000

const CADENCE_INTERVAL_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

function schedulerState() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = { started: false, running: false, interval: null }
  }
  return globalThis[STATE_KEY]
}

export function cadenceIntervalMs(automation) {
  const config = automation?.trigger?.config || {}
  const intervalMinutes = Number(config.intervalMinutes ?? automation?.trigger?.intervalMinutes)
  if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) return intervalMinutes * 60_000
  const cadence = String(config.cadence || automation?.cadence || '').trim().toLowerCase()
  return CADENCE_INTERVAL_MS[cadence] || null
}

export function isAutomationDue(automation, now = Date.now()) {
  if (!automation || automation.trigger?.type !== 'schedule') return false
  const intervalMs = cadenceIntervalMs(automation)
  if (!intervalMs) return false
  if (!automation.lastRunAt) return true
  const last = Date.parse(automation.lastRunAt)
  if (!Number.isFinite(last)) return true
  return (now - last) >= intervalMs
}

export async function runSchedulerTick(options = {}) {
  const state = schedulerState()
  if (state.running) return { skipped: true, reason: 'run_in_progress' }
  state.running = true
  const results = []
  try {
    const now = Number.isFinite(options.now) ? options.now : Date.now()
    if (process.env.NODE_ENV !== 'test') {
      try { maybeRunNightlyUsageMaintenance({ now: new Date(now) }) }
      catch (error) { console.warn('[usage-events] nightly maintenance failed:', error?.message || error) }
    }
    const due = listAutomations()
      .filter(a => a.enabled && a.trigger?.type === 'schedule' && isAutomationDue(a, now))

    for (const automation of due) {
      const startedAt = new Date(now).toISOString()
      try {
        const execution = await runRegisteredAutomation(automation, options.runOptions || {})
        if (!execution) {
          recordScheduledRun(automation.id, {
            startedAt,
            ok: false,
            error: 'No registered runner for this automation; scheduled run skipped.',
            notifyClient: false,
          })
          results.push({ id: automation.id, ok: false, skipped: true })
          continue
        }
        const summary = execution.result?.summary || `${execution.runnerLabel} completed.`
        recordScheduledRun(automation.id, { startedAt, ok: true, summary })
        results.push({ id: automation.id, ok: true })
      } catch (error) {
        recordScheduledRun(automation.id, {
          startedAt,
          ok: false,
          error: error?.message || 'Automation run failed',
        })
        results.push({ id: automation.id, ok: false, error: error?.message })
      }
    }
    try {
      const maybeRunVideoHubContactSync = options.VideoHubSync
        || (process.env.NODE_ENV === 'test' ? null : (await import('./VideoHub/sync')).maybeRunVideoHubContactSync)
      if (maybeRunVideoHubContactSync) await maybeRunVideoHubContactSync({ now: new Date(now) })
    } catch (error) { console.warn('[VideoHub] hourly contact sync failed:', error?.message || error) }
    return { ok: true, ranCount: results.length, results }
  } finally {
    state.running = false
  }
}

export function startAutomationScheduler(env = process.env) {
  const state = schedulerState()
  if (state.started) return state
  const enabled = env.AUTOMATION_SCHEDULER === 'on' || env.NODE_ENV === 'production'
  if (!enabled) return state

  state.started = true
  state.interval = setInterval(() => { void runSchedulerTick() }, TICK_INTERVAL_MS)
  state.interval.unref?.()
  return state
}
