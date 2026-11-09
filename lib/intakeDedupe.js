// Shared submission-replay dedupe for public lead-intake endpoints.
// Extracted from app/api/website/intake/route.js so the same
// submissionId + 10-minute replay-window behavior is available to
// app/api/products/inquiry/route.js and app/api/portal/demo-request/route.js
// without copy-pasting the matching logic.
import { loadAll } from '@/lib/entityStore'

export const REPLAY_WINDOW_MS = 10 * 60 * 1000

export function cleanForDedupe(value, limit = 500) {
  return String(value || '').trim().slice(0, limit)
}

export function submissionIdFromRequest(request, body) {
  const raw = body.submissionId || body.externalId || body.idempotencyKey || request.headers.get('idempotency-key')
  return cleanForDedupe(raw, 160).replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Finds a previously-created lead that this submission is a replay of.
 * An exact submissionId/externalId/bookingId match always counts.
 *
 * When useFallbackMatch is true (website/intake's original behavior, kept
 * for legacy clients that never sent an id), a same email + source +
 * productOpportunity lead created within the replay window is also treated
 * as the same submission. The fallback is bounded by windowMs (10 minutes by
 * default), so it only collapses rapid retries from one email, never repeat
 * submissions made after the window. Routes may pass useFallbackMatch: false
 * to rely on submissionId alone.
 */
export function findDuplicateLead({ submissionId, email, source, productOpportunity, windowMs = REPLAY_WINDOW_MS, now = Date.now(), useFallbackMatch = true }) {
  const leads = loadAll('leads') || []
  if (submissionId) {
    const exact = leads.find(lead =>
      lead.externalId === submissionId ||
      lead.bookingId === submissionId ||
      lead.submissionId === submissionId
    )
    if (exact) return exact
  }

  if (!useFallbackMatch) return undefined

  const cutoff = now - windowMs
  return leads.find(lead => {
    const createdAt = Date.parse(lead.createdAt || lead.inboundReceivedAt || '')
    return Number.isFinite(createdAt) &&
      createdAt >= cutoff &&
      cleanForDedupe(lead.email, 180).toLowerCase() === email &&
      cleanForDedupe(lead.source, 80) === source &&
      cleanForDedupe(lead.productOpportunity, 180) === productOpportunity
  })
}
