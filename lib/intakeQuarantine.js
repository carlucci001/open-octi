// Quarantine store for public-intake submissions flagged as spam by
// lib/intakeSpamGuard.js. Nothing here creates a lead/account/contact/
// opportunity — it just keeps a bounded audit trail so a human can review
// what got blocked, through the same dataStore/entityStore mechanism the
// intake routes already use (kv_store row per data/*.json file on sqlite,
// data/*.json file otherwise).
import { mutateData } from '@/lib/dataStore'

const QUARANTINE_FILE = 'intake-quarantine.json'
const MAX_ENTRIES = 500

/**
 * Appends one quarantined-submission record and trims the collection to the
 * most recent MAX_ENTRIES entries. Never throws — a quarantine-store failure
 * must not take down the request path that is trying to keep a bot's noise
 * out of the CRM.
 */
/**
 * A plausible-looking entity id for the fake success response returned to a
 * spam submission, so the response shape matches a real one without
 * depending on entityStore (and its mocks) for an id nothing was created
 * for.
 */
export function fakeEntityId(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function recordQuarantine({ route, reasons = [], score = 0, fields = {}, clientMeta = {} }) {
  const entry = {
    timestamp: new Date().toISOString(),
    route,
    reasons,
    score,
    fields,
    clientMeta,
  }
  try {
    mutateData(QUARANTINE_FILE, (data) => {
      const list = Array.isArray(data?.entries) ? data.entries : []
      const next = list.concat([entry]).slice(-MAX_ENTRIES)
      return { data: { entries: next }, result: entry }
    })
  } catch (err) {
    console.warn('[intake-quarantine] failed to record entry:', err?.message || err)
  }
  return entry
}
