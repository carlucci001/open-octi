const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

export function normalizeLeadClientRequestId(value = '') {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 96)
}

export function createLeadClientRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  return normalizeLeadClientRequestId(uuid || `lead-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// A lost POST response used to look exactly like "nothing happened". Retrying a
// normal POST would risk starting a second paid vendor job, so every attempt
// carries the same clientRequestId. The server returns the already-created run
// when it sees that key again.
export async function startTrackedLeadRun({
  url,
  payload,
  fetchImpl = globalThis.fetch,
  clientRequestId = createLeadClientRequestId(),
  attempts = 3,
  onRetry = () => {},
  sleep = wait,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('Lead run request transport is unavailable.')
  const requestId = normalizeLeadClientRequestId(clientRequestId)
  if (!requestId) throw new Error('Lead run request ID could not be created.')

  let lastError = null
  let attemptsMade = 0
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsMade = attempt
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, clientRequestId: requestId }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data.ok !== false && data.run?.id) {
        return { ...data, clientRequestId: requestId }
      }

      const error = new Error(data.error || (response.ok
        ? 'The server did not start a tracked run.'
        : `Lead run request failed with HTTP ${response.status}.`))
      error.status = response.status
      error.retryable = RETRYABLE_STATUSES.has(response.status) || (response.ok && !data.run?.id)
      throw error
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || 'Lead run request failed'))
      const retryable = lastError.retryable !== false
        && (!Number.isFinite(lastError.status) || RETRYABLE_STATUSES.has(lastError.status) || lastError.status === 200)
      if (!retryable || attempt >= attempts) break
      onRetry({ attempt, nextAttempt: attempt + 1, error: lastError, clientRequestId: requestId })
      await sleep(500 * (2 ** (attempt - 1)))
    }
  }

  throw new Error(`${lastError?.message || 'Lead run request failed.'} No lead run was started after ${attemptsMade} attempt${attemptsMade === 1 ? '' : 's'}.`)
}
