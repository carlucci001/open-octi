'use client'

// Ships client-side faults to /api/client-error, which stores them and pushes ntfy.
// Capped per page load so a render loop cannot flood the box or the phone.
const MAX_REPORTS_PER_LOAD = 5
let sent = 0

export function reportClientError(error, { kind = 'render', componentStack = '' } = {}) {
  try {
    if (typeof window === 'undefined') return
    if (sent >= MAX_REPORTS_PER_LOAD) return
    sent += 1

    const body = JSON.stringify({
      message: error?.message || String(error || 'Unknown client error'),
      stack: error?.stack || '',
      componentStack,
      digest: error?.digest || '',
      url: window.location?.href || '',
      kind,
    })

    // keepalive: the report still lands if the crash is followed by a reload.
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting is best-effort and must never mask the original fault.
  }
}
