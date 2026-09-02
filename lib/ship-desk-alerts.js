import { readData, writeData } from './dataStore'
import { logActivity } from './entityStore'
import { pushNtfy } from './ntfy'

const STATE_FILE = 'ship-desk-state.json'

export function emptyShipDeskAlertState() {
  return { health: {}, failedReleaseIds: [] }
}

function normalizeState(state) {
  return {
    health: state?.health && typeof state.health === 'object' ? state.health : {},
    failedReleaseIds: Array.isArray(state?.failedReleaseIds) ? state.failedReleaseIds : [],
  }
}

export function applyHealthPoll(inputState, { platformId, name, status }) {
  const state = normalizeState(inputState)
  const current = state.health[platformId] || { badPolls: 0, alerted: false, lastStatus: 'unknown' }
  const unhealthy = status === 'degraded' || status === 'down'
  const nextHealth = unhealthy
    ? { badPolls: current.badPolls + 1, alerted: current.alerted, lastStatus: status }
    : { badPolls: 0, alerted: false, lastStatus: status || 'unknown' }
  const effects = []
  if (unhealthy && nextHealth.badPolls > 2 && !nextHealth.alerted) {
    nextHealth.alerted = true
    effects.push({ kind: 'health', platformId, name, status, badPolls: nextHealth.badPolls })
  }
  return { state: { ...state, health: { ...state.health, [platformId]: nextHealth } }, effects }
}

export function applyFailedReleasePoll(inputState, { platformId, name, release }) {
  const state = normalizeState(inputState)
  if (!release?.id || release.status !== 'failed') return { state, effects: [] }
  const key = `${platformId}:${release.id}`
  if (state.failedReleaseIds.includes(key)) return { state, effects: [] }
  return {
    state: { ...state, failedReleaseIds: [key, ...state.failedReleaseIds].slice(0, 500) },
    effects: [{ kind: 'failed-release', platformId, name, release }],
  }
}

async function emitEffects(effects) {
  for (const effect of effects) {
    if (effect.kind === 'health') {
      const subject = `${effect.name || effect.platformId} health is ${effect.status}`
      const body = `Ship Desk observed ${effect.badPolls} consecutive degraded/down polls.`
      logActivity({ type: 'note', subject, body, meta: { shipDesk: true, platformId: effect.platformId, status: effect.status } })
      await pushNtfy({ title: `Ship Desk: ${subject}`, body, priority: 'high', tags: ['warning', 'computer'] })
    } else if (effect.kind === 'failed-release') {
      await pushNtfy({
        title: `Ship Desk: ${effect.name || effect.platformId} release failed`,
        body: `${effect.release.version || 'Unknown version'} (${effect.release.commit || effect.release.id})`,
        priority: 'high',
        tags: ['rotating_light', 'computer'],
      })
    }
  }
}

export async function processShipDeskAlerts(platforms = []) {
  let state = normalizeState(readData(STATE_FILE))
  const effects = []
  for (const platform of platforms) {
    let result
    if (platform.monitorHealth !== false) {
      result = applyHealthPoll(state, { platformId: platform.platformId, name: platform.name, status: platform.health?.status || 'down' })
      state = result.state
      effects.push(...result.effects)
    }
    for (const release of platform.releases || []) {
      result = applyFailedReleasePoll(state, { platformId: platform.platformId, name: platform.name, release })
      state = result.state
      effects.push(...result.effects)
    }
  }
  writeData(STATE_FILE, state)
  await emitEffects(effects)
  return effects
}

export async function notifyFailedRelease(platformId, release) {
  const state = normalizeState(readData(STATE_FILE))
  const result = applyFailedReleasePoll(state, { platformId, name: 'Command Center', release })
  writeData(STATE_FILE, result.state)
  await emitEffects(result.effects)
  return { alerted: result.effects.length > 0 }
}
