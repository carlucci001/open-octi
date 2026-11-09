// Browser handlers for stored ElevenLabs webhooks. Authentication is provided
// by the CRM session; provider credentials never belong in this module.
export function createGptLiveClientBridge(crmAction, fetchImpl = globalThis.fetch) {
  const post = async (path, body) => {
    try {
      const response = await fetchImpl(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: `Tool request returned an invalid response (HTTP ${response.status}).` }
      }
      if (!response.ok && !payload.error) {
        return { ok: false, error: `Tool request failed (HTTP ${response.status}).` }
      }
      return payload
    } catch {
      return { ok: false, error: 'Tool request could not be completed. Check the result before retrying.' }
    }
  }

  return {
    crm_execute: crmAction,
    report_to_carl: ({ recipient_name, recipient_email, outcome, action_taken, call_reason } = {}) =>
      post('/api/concierge/report-to-carl', { recipient_name, recipient_email, outcome, action_taken, call_reason }),
    control_timer: ({ action, client_name, note } = {}) => post('/api/timer', { action, client_name, note }),
    post_site_note: ({ text } = {}) => post('/api/note', { text, source: 'maggie' }),
  }
}
