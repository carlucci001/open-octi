import { readData, writeData } from '@/lib/dataStore'
import { myvtcCredential, listContactMessages } from './client'
import { ensureMyvtcChannel } from './channel'
import { ingestContactMessage } from './webhook'

const FILE = 'myvtc-sync-state.json'
const HOUR_MS = 60 * 60 * 1000
const MAX_PAGES = 40
const STATE_KEY = Symbol.for('fcc.myvtc-contact-sync')

export function getMyvtcSyncState() {
  const state = readData(FILE) || {}
  return {
    lastRunAt: state.lastRunAt || null,
    lastResult: state.lastResult || null,
  }
}

function persistSyncState(lastRunAt, lastResult) {
  writeData(FILE, { lastRunAt, lastResult })
}

export async function syncContactMessages({ now = new Date() } = {}) {
  const channel = ensureMyvtcChannel()
  let cursor
  let scanned = 0
  let created = 0
  let skipped = 0
  let pages = 0
  let stoppedEarly = false
  let hasMore = false

  for (; pages < MAX_PAGES; pages += 1) {
    const result = await listContactMessages({ cursor, limit: 25 })
    for (const message of result.data) {
      scanned += 1
      const ingestion = await ingestContactMessage(message, { channel })
      if (ingestion.skipped) skipped += 1
      else created += 1
    }

    if (!result.nextCursor) {
      pages += 1
      hasMore = false
      break
    }
    if (result.nextCursor === cursor) {
      pages += 1
      stoppedEarly = true
      hasMore = true
      break
    }
    hasMore = true
    cursor = result.nextCursor
  }

  if (pages >= MAX_PAGES && hasMore) stoppedEarly = true
  const lastRunAt = new Date(now).toISOString()
  const lastResult = { scanned, created, skipped, pages, stoppedEarly }
  persistSyncState(lastRunAt, lastResult)
  return lastResult
}

export async function maybeRunMyvtcContactSync({ now = new Date() } = {}) {
  if (!myvtcCredential()?.key) return { skipped: true, reason: 'not_configured' }
  const nowDate = now instanceof Date ? now : new Date(now)
  const nowMs = nowDate.getTime()
  const previous = Date.parse(getMyvtcSyncState().lastRunAt || '')
  if (Number.isFinite(previous) && nowMs - previous < HOUR_MS) {
    return { skipped: true, reason: 'not_due' }
  }

  if (!globalThis[STATE_KEY]) globalThis[STATE_KEY] = { running: false }
  if (globalThis[STATE_KEY].running) return { skipped: true, reason: 'run_in_progress' }
  globalThis[STATE_KEY].running = true
  try {
    return await syncContactMessages({ now: nowDate })
  } catch {
    const result = { error: 'MyVTC contact sync failed.' }
    persistSyncState(nowDate.toISOString(), result)
    return { skipped: true, reason: 'sync_failed', ...result }
  } finally {
    globalThis[STATE_KEY].running = false
  }
}
