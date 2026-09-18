'use client'
// Admin surface for the agent-tool approval gate: notification channels,
// timing, a live read-only view of the risk classification declared in
// app/api/agent/execute/route.js, and recent guardrail activity. Everything
// here was previously hardcoded with no admin surface at all.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'

function fmtTime(at) {
  try { return new Date(at).toLocaleString() } catch { return at || '' }
}

function outcomeLabel(event) {
  if (event.windowId && !event.tool) return event.approved ? 'window opened' : 'window closed'
  if (event.blocked) return 'blocked — awaiting'
  if (event.approved) return 'allowed'
  return 'denied'
}

function outcomeColor(event) {
  if (event.windowId && !event.tool) return event.approved ? '#10b981' : 'var(--text-muted)'
  if (event.blocked) return '#f59e0b'
  if (event.approved) return '#10b981'
  return '#ef4444'
}

export default function AgentApprovalsSettings() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/admin/agent-approval-settings', { cache: 'no-store' })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body?.ok) throw new Error(body?.error || 'Could not load Agent Approvals settings')
      setData(body)
      setForm({
        notifyPush: body.settings.notifyPush,
        notifyEmail: body.settings.notifyEmail,
        notifyEmailTo: body.settings.notifyEmailTo,
        ttlMinutes: body.settings.ttlMinutes,
        maxWindowMinutes: body.settings.maxWindowMinutes,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!form) return
    setSaving(true)
    setError('')
    setSaveMsg('')
    try {
      const r = await fetch('/api/admin/agent-approval-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', ...form }),
      })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body?.ok) throw new Error(body?.error || 'Save failed')
      setSaveMsg('Saved.')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    if (!form) return
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      const r = await fetch('/api/admin/agent-approval-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          notifyPush: form.notifyPush,
          notifyEmail: form.notifyEmail,
          notifyEmailTo: form.notifyEmailTo,
        }),
      })
      const body = await r.json().catch(() => null)
      if (!body) throw new Error('Test request failed')
      setTestResult(body)
      if (!r.ok && !body.push && !body.email) throw new Error(body.error || 'Test failed')
    } catch (e) {
      setError(e.message)
    } finally {
      setTesting(false)
    }
  }

  const filteredPolicies = useMemo(() => {
    const list = data?.riskCatalog?.policies || []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(p => (
      p.tool.toLowerCase().includes(q)
      || (p.risk || '').toLowerCase().includes(q)
      || (p.reason || '').toLowerCase().includes(q)
    ))
  }, [data, query])

  if (loading && !data) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading Agent Approvals settings…</p>
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {error && <p role="alert" style={{ color: '#ef4444' }}>{error}</p>}

      <section style={panelStyle()}>
        <h2 style={headingStyle()}>Notifications</h2>
        <p style={mutedStyle({ marginTop: 4 })}>How Carl finds out an agent tool call is waiting for approval.</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 16, maxWidth: 520 }}>
          <label style={rowStyle()}>
            <input
              role="switch"
              type="checkbox"
              checked={Boolean(form?.notifyPush)}
              onChange={e => setForm(f => ({ ...f, notifyPush: e.target.checked }))}
            />
            Push notification (ntfy)
          </label>
          <label style={rowStyle()}>
            <input
              role="switch"
              type="checkbox"
              checked={Boolean(form?.notifyEmail)}
              onChange={e => setForm(f => ({ ...f, notifyEmail: e.target.checked }))}
            />
            Email notification (Resend)
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelTextStyle()}>Notify email address</span>
            <input
              type="email"
              value={form?.notifyEmailTo || ''}
              onChange={e => setForm(f => ({ ...f, notifyEmailTo: e.target.value }))}
              style={inputStyle()}
              placeholder="you@example.com"
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={save} disabled={saving || !form} style={primaryButtonStyle()}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={testing || !form || (!form.notifyPush && !form.notifyEmail)}
            style={buttonStyle()}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} aria-hidden="true" />
              {testing ? 'Sending…' : 'Send test notification'}
            </span>
          </button>
          {saveMsg && <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>{saveMsg}</span>}
        </div>

        {testResult && (
          <div style={{ marginTop: 12, display: 'grid', gap: 4, fontSize: 13 }}>
            {testResult.push && (
              <div style={{ color: testResult.push.ok ? '#10b981' : '#ef4444' }}>
                Push: {testResult.push.ok ? 'sent — check your phone' : `failed — ${testResult.push.error}`}
              </div>
            )}
            {testResult.email && (
              <div style={{ color: testResult.email.ok ? '#10b981' : '#ef4444' }}>
                Email: {testResult.email.ok ? 'sent' : `failed — ${testResult.email.error}`}
              </div>
            )}
          </div>
        )}
      </section>

      <section style={panelStyle()}>
        <h2 style={headingStyle()}>Timing</h2>
        <p style={mutedStyle({ marginTop: 4, maxWidth: 640 })}>
          Approval expiry and the largest auto-approve window an admin may open. The window cap is hard-limited to
          240 minutes in code — no setting here can raise it past that, and no setting can disable approvals.
        </p>
        <div style={{ display: 'grid', gap: 14, marginTop: 16, maxWidth: 420, gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelTextStyle()}>Approval expiry (minutes, 1–120)</span>
            <input
              type="number"
              min={1}
              max={120}
              value={form?.ttlMinutes ?? ''}
              onChange={e => setForm(f => ({ ...f, ttlMinutes: e.target.value }))}
              style={inputStyle()}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelTextStyle()}>Max window (minutes, 1–240)</span>
            <input
              type="number"
              min={1}
              max={240}
              value={form?.maxWindowMinutes ?? ''}
              onChange={e => setForm(f => ({ ...f, maxWindowMinutes: e.target.value }))}
              style={inputStyle()}
            />
          </label>
        </div>
      </section>

      <section style={panelStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={headingStyle()}>Risk list</h2>
            <p style={mutedStyle({ marginTop: 4, maxWidth: 640 })}>
              {data?.riskCatalog?.approvalRequiredCount ?? 0} tools require approval · {data?.riskCatalog?.safeToolCount ?? 0} tools
              declared safe to run unattended. Read live from app/api/agent/execute/route.js — this screen does not edit that list.
            </p>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tool, risk, reason…"
            aria-label="Search risk list"
            style={{ ...inputStyle(), minWidth: 240 }}
          />
        </div>
        {data?.riskCatalog?.error && (
          <p role="alert" style={{ color: '#ef4444', marginTop: 10 }}>{data.riskCatalog.error}</p>
        )}
        <div style={{ overflowX: 'auto', marginTop: 14, borderRadius: 8, border: '1px solid var(--border)', maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle()}>Tool</th>
                <th style={thStyle()}>Risk</th>
                <th style={thStyle()}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredPolicies.map(p => (
                <tr key={p.tool} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdStyle()}><code>{p.tool}</code></td>
                  <td style={tdStyle()}>{p.risk || '—'}</td>
                  <td style={tdStyle()}>{p.reason || '—'}</td>
                </tr>
              ))}
              {filteredPolicies.length === 0 && (
                <tr><td colSpan={3} style={{ ...tdStyle(), textAlign: 'center', color: 'var(--text-muted)' }}>No matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={panelStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={headingStyle()}>Recent activity</h2>
          <button type="button" onClick={load} title="Refresh" aria-label="Refresh recent activity" style={buttonStyle()}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
        <p style={mutedStyle({ marginTop: 4 })}>The last {data?.activity?.length ?? 0} entries from the guardrail audit log.</p>
        <div style={{ overflowX: 'auto', marginTop: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle()}>When</th>
                <th style={thStyle()}>Tool</th>
                <th style={thStyle()}>Outcome</th>
                <th style={thStyle()}>Via</th>
                <th style={thStyle()}>Decided by</th>
              </tr>
            </thead>
            <tbody>
              {(data?.activity || []).map(event => (
                <tr key={event.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdStyle()}>{fmtTime(event.at)}</td>
                  <td style={tdStyle()}>{event.tool ? <code>{event.tool}</code> : 'approval window'}</td>
                  <td style={{ ...tdStyle(), color: outcomeColor(event), fontWeight: 700 }}>{outcomeLabel(event)}</td>
                  <td style={tdStyle()}>{event.via || '—'}</td>
                  <td style={tdStyle()}>{event.decidedBy || event.approvalPrincipal || '—'}</td>
                </tr>
              ))}
              {(!data?.activity || data.activity.length === 0) && (
                <tr><td colSpan={5} style={{ ...tdStyle(), textAlign: 'center', color: 'var(--text-muted)' }}>No guardrail activity logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function panelStyle(extra = {}) {
  return { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 18, ...extra }
}

function headingStyle() {
  return { margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }
}

function mutedStyle(extra = {}) {
  return { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, ...extra }
}

function labelTextStyle() {
  return { fontSize: 13, fontWeight: 600, color: 'var(--text)' }
}

function rowStyle() {
  return { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: 'var(--text)' }
}

function inputStyle() {
  return {
    minHeight: 38,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 13,
  }
}

function buttonStyle() {
  return {
    minHeight: 38,
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }
}

function primaryButtonStyle() {
  return {
    minHeight: 38,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function thStyle() {
  return { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0, background: 'var(--surface2)' }
}

function tdStyle() {
  return { padding: '10px 12px', color: 'var(--text)', verticalAlign: 'top' }
}
