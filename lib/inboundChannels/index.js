// Inbound Channels orchestrator.
// Reads data/inbound-channels.json, starts a listener per enabled channel,
// stops them on demand. Singleton on globalThis so Next.js HMR doesn't spawn
// duplicate listeners on every file edit.
import { readData } from '@/lib/dataStore'
import { startFirestoreChannel } from './firestoreAdapter'
import { insertLeadFromChannel } from './leadInsert'

const FILE = 'inbound-channels.json'

function registry() {
  if (!globalThis.__fccInboundChannels) {
    globalThis.__fccInboundChannels = {
      handles: new Map(),  // channelId -> { unsubscribe }
      states: new Map(),   // channelId -> state object
    }
  }
  return globalThis.__fccInboundChannels
}

function freshState() {
  return {
    running: false,
    startedAt: null,
    lastEventAt: null,
    importedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastError: null,
    lastImported: null,
  }
}

export function listChannels() {
  const data = readData(FILE) || { channels: [] }
  return data.channels || []
}

export function getChannelStatus(channelId) {
  const reg = registry()
  const state = reg.states.get(channelId) || freshState()
  return { channelId, ...state }
}

export function getAllStatuses() {
  return listChannels().map(c => ({ channel: c, status: getChannelStatus(c.id) }))
}

export function startChannel(channel) {
  const reg = registry()
  if (reg.handles.has(channel.id)) return getChannelStatus(channel.id)

  const state = reg.states.get(channel.id) || freshState()
  reg.states.set(channel.id, state)

  try {
    if (channel.type === 'firestore') {
      const handle = startFirestoreChannel(channel, state)
      reg.handles.set(channel.id, handle)
      state.running = true
      state.startedAt = new Date().toISOString()
      state.lastError = null
      console.log(`[channels] started ${channel.id} (firestore)`)
    } else if (channel.type === 'webhook') {
      // Webhook channels don't run a process — they're driven by /api/leads/inbound.
      // Mark as "armed" so the UI shows green.
      state.running = true
      state.startedAt = new Date().toISOString()
      state.lastError = null
      reg.handles.set(channel.id, { unsubscribe: () => {} })
      console.log(`[channels] armed ${channel.id} (webhook)`)
    } else {
      throw new Error(`Unknown channel type: ${channel.type}`)
    }
  } catch (err) {
    state.errorCount++
    state.lastError = `${new Date().toISOString()}: start failed — ${err.message}`
    console.error(`[channels] ${channel.id} start failed:`, err.message)
  }
  return getChannelStatus(channel.id)
}

export function stopChannel(channelId) {
  const reg = registry()
  const handle = reg.handles.get(channelId)
  if (handle) {
    try { handle.unsubscribe() } catch {}
    reg.handles.delete(channelId)
  }
  const state = reg.states.get(channelId)
  if (state) state.running = false
}

// One-time cleanup: yesterday's prior listener stored its unsubscribe on
// globalThis.__fccDemoBookingsState. After the refactor this singleton became
// orphaned but its onSnapshot callback is still alive and racing the new code.
function killLegacyListeners() {
  const legacy = globalThis.__fccDemoBookingsState
  if (!legacy) return
  if (legacy.unsubscribe) {
    try { legacy.unsubscribe() } catch {}
  }
  legacy.unsubscribe = null
  legacy.running = false
  console.log('[channels] killed legacy demo-bookings listener')
}

export function restartAll() {
  killLegacyListeners()
  const reg = registry()
  const channels = listChannels()

  // Force-stop every handle so config changes (e.g. type swap webhook→firestore)
  // take effect, then start each enabled channel fresh.
  for (const id of Array.from(reg.handles.keys())) {
    stopChannel(id)
  }
  for (const channel of channels) {
    if (!channel.enabled) continue
    startChannel(channel)
  }

  return getAllStatuses()
}

// Used by the universal webhook endpoint (Phase D) to insert via the same
// path as the firestore listener.
export async function ingestPayload({ channelId, payload, externalId, sourceMeta }) {
  const channel = listChannels().find(c => c.id === channelId)
  if (!channel) throw new Error(`Unknown channelId: ${channelId}`)
  if (!channel.enabled) throw new Error(`Channel disabled: ${channelId}`)
  const state = registry().states.get(channelId) || freshState()
  registry().states.set(channelId, state)
  try {
    const result = await insertLeadFromChannel({ channel, payload, externalId, sourceMeta })
    state.lastEventAt = new Date().toISOString()
    if (result.skipped) state.skippedCount++
    else if (result.lead) {
      state.importedCount++
      state.lastImported = {
        at: new Date().toISOString(),
        name: result.lead.name,
        email: result.lead.email,
        externalId: externalId || null,
        leadId: result.lead.id,
      }
    }
    return result
  } catch (err) {
    state.errorCount++
    state.lastError = `${new Date().toISOString()}: ingest failed — ${err.message}`
    throw err
  }
}

// One-shot fetch for firestore channels — used by "Sync now" buttons.
export async function syncOnce(channelId) {
  const channel = listChannels().find(c => c.id === channelId)
  if (!channel) throw new Error(`Unknown channelId: ${channelId}`)
  if (channel.type !== 'firestore') {
    return { ok: false, error: 'syncOnce only supports firestore channels' }
  }
  // Trigger by stopping + restarting; the snapshot listener will fire 'added' for
  // every existing doc matching the where clause on first attach.
  stopChannel(channelId)
  startChannel(channel)
  return { ok: true, channelId, message: 'Listener restarted; existing matching docs will re-emit and import.' }
}
