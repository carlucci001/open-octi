// Shared by the browser voice providers. Keep existing-invoice operations on
// the authenticated agent route so its approval gate remains authoritative.
export function createVoiceInvoiceTools(fetchImpl = globalThis.fetch) {
  const invoke = async (tool, args) => {
    try {
      const response = await fetchImpl('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tool, args }),
      })
      const payload = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, tool, error: `Invoice request returned an invalid response (HTTP ${response.status}).` }
      }
      // Approval responses are HTTP 202 with ok:false. Preserve their status,
      // approvalId and explanation for the model; do not retry or approve here.
      if (payload.ok === false) {
        const continuation = tool === 'send_invoice_via_stripe' && payload.status === 'awaiting_approval'
          ? {
            tool,
            args: { id: args.id },
            instruction: 'Nothing has been sent. Approve the request, then tell me to continue or retry. Approval only grants permission; retry this exact tool and invoice ID, and report sent only after a successful tool result.',
          }
          : null
        return { ...payload, tool, ...(continuation ? { continuation } : {}) }
      }
      if (!response.ok || payload.ok !== true || !Object.prototype.hasOwnProperty.call(payload, 'result')) {
        return { ok: false, tool, error: payload.error || `Invoice request failed (HTTP ${response.status}).` }
      }
      return { ...payload, tool }
    } catch (error) {
      return { ok: false, tool, error: error?.message || 'Invoice request failed.' }
    }
  }

  return {
    list_invoices: (args = {}) => invoke('list_invoices', {
      ...(args.status ? { status: String(args.status) } : {}),
      ...(args.clientId ? { clientId: String(args.clientId) } : {}),
    }),
    invoice_payment_link: (args = {}) => {
      const id = String(args.id || '').trim()
      if (!id) return Promise.resolve({ ok: false, tool: 'invoice_payment_link', error: 'An existing invoice ID is required. Use list_invoices first.' })
      return invoke('invoice_payment_link', { id })
    },
    check_invoice_payment: (args = {}) => {
      const id = String(args.id || '').trim()
      if (!id) return Promise.resolve({ ok: false, tool: 'check_invoice_payment', error: 'An existing invoice ID is required. Use list_invoices first.' })
      return invoke('check_invoice_payment', { id })
    },
    send_invoice_via_stripe: (args = {}) => {
      const id = String(args.id || '').trim()
      if (!id) return Promise.resolve({ ok: false, tool: 'send_invoice_via_stripe', error: 'An existing invoice ID is required. Use list_invoices first.' })
      return invoke('send_invoice_via_stripe', { id })
    },
  }
}
