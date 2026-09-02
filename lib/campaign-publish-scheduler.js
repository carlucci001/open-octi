import { runCampaignPublishAutomation } from './campaign-publish-runner'

const STATE_KEY = Symbol.for('fcc.campaign-publish-scheduler')
const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_START_DELAY_MS = 15_000

function schedulerState() {
  if (!globalThis[STATE_KEY]) {
    globalThis[STATE_KEY] = {
      started: false,
      running: false,
      timeout: null,
      interval: null,
    }
  }
  return globalThis[STATE_KEY]
}

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function runCampaignPublishTick(options = {}) {
  const state = schedulerState()
  if (state.running) return { skipped: true, reason: 'run_in_progress' }
  state.running = true
  try {
    return await runCampaignPublishAutomation(
      { runnerId: 'campaign-publish-v1' },
      options
    )
  } finally {
    state.running = false
  }
}

export function startCampaignPublishScheduler(env = process.env) {
  const state = schedulerState()
  if (state.started) return state
  if (String(env.CAMPAIGN_PUBLISH_SCHEDULER_ENABLED || '').toLowerCase() === 'false') return state

  const intervalMs = positiveNumber(env.CAMPAIGN_PUBLISH_INTERVAL_MS, DEFAULT_INTERVAL_MS)
  const startDelayMs = positiveNumber(env.CAMPAIGN_PUBLISH_START_DELAY_MS, DEFAULT_START_DELAY_MS)
  const tick = async () => {
    try {
      await runCampaignPublishTick()
    } catch (error) {
      console.error('[campaign-publish-scheduler] tick failed', error)
    }
  }

  state.started = true
  state.timeout = setTimeout(() => {
    void tick()
    state.interval = setInterval(() => void tick(), intervalMs)
    state.interval.unref?.()
  }, startDelayMs)
  state.timeout.unref?.()
  return state
}
