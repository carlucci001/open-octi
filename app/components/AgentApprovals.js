'use client'
// Compact floating panel for agent-tool approvals. Polls
// /api/admin/agent-approvals every 10s (paused while the tab is hidden),
// lets Carl approve/deny individual requests and open/close a temporary
// auto-approve window. When idle (nothing pending, no open window) it
// collapses to a small unobtrusive pill that still exposes the 15/30/60m
// auto-approve controls via a click-to-open popover, so a window can be
// opened before a demo even when nothing is pending yet. Fails silently
// (never throws, never console-spams, renders nothing at all — not even
// the pill) on any fetch/auth problem so non-admin sessions see nothing.

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_MS = 10000
const TICK_MS = 15000
const WINDOW_CHOICES = [15, 30, 60]

const RISK_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
}

function riskColor(risk) {
  return RISK_COLORS[String(risk || '').toLowerCase()] || 'var(--accent, #3b82f6)'
}

function toolLabel(tool) {
  if (!tool) return 'an action'
  return String(tool)
    .replace(/[_.-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function relTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const ms = Date.now() - then
  const abs = Math.abs(ms)
  if (abs < 60000) return 'just now'
  if (abs < 3600000) return `${Math.floor(abs / 60000)}m ago`
  if (abs < 86400000) return `${Math.floor(abs / 3600000)}h ago`
  return `${Math.floor(abs / 86400000)}d ago`
}

function countdown(iso) {
  if (!iso) return ''
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) return ''
  const ms = target - Date.now()
  if (ms <= 0) return 'expired'
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  const hours = Math.floor(ms / 3600000)
  const mins = Math.round((ms % 3600000) / 60000)
  return `${hours}h ${mins}m`
}

// Normalizes argsSummary (string, array, or object) into compact key/value rows.
function summarizeArgs(argsSummary) {
  if (argsSummary == null) return []
  if (typeof argsSummary === 'string') {
    return argsSummary.trim() ? [{ key: '', value: argsSummary }] : []
  }
  if (Array.isArray(argsSummary)) {
    return argsSummary.slice(0, 6).map((value, i) => ({
      key: String(i),
      value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
    }))
  }
  if (typeof argsSummary === 'object') {
    return Object.entries(argsSummary).slice(0, 6).map(([key, value]) => ({
      key,
      value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
    }))
  }
  return [{ key: '', value: String(argsSummary) }]
}

function isWindowOpen(win) {
  if (!win) return false
  if (!win.expiresAt) return true
  const t = new Date(win.expiresAt).getTime()
  return Number.isFinite(t) ? t > Date.now() : true
}

export default function AgentApprovals() {
  const [data, setData] = useState(null)
  const [busyId, setBusyId] = useState('')
  const [windowBusy, setWindowBusy] = useState(false)
  const [pillOpen, setPillOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [, setTick] = useState(0)
  const inFlightRef = useRef(false)
  const pillRef = useRef(null)

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const response = await fetch('/api/admin/agent-approvals', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) { setData(null); return }
      const body = await response.json().catch(() => null)
      if (!body || body.ok !== true) { setData(null); return }
      setData(body)
    } catch {
      setData(null)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(() => {
      if (!document.hidden) refresh()
    }, POLL_MS)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refresh])

  // Ticks the countdown/relative-time labels forward without a full refetch.
  useEffect(() => {
    const timer = setInterval(() => setTick(v => v + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // Always returns a result (never throws) so callers can surface failures
  // instead of the caller finding out only via a stale/missing refresh.
  const post = async (body) => {
    let result
    try {
      const response = await fetch('/api/admin/agent-approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const parsed = await response.json().catch(() => null)
      const ok = response.ok && !!parsed && parsed.ok === true
      result = { ok, status: response.status, body: parsed, error: (parsed && parsed.error) || null }
    } catch (err) {
      result = { ok: false, status: 0, body: null, error: (err && err.message) || 'Network error' }
    }
    await refresh()
    return result
  }

  // Builds the one-line message shown for a failed action.
  const describeFailure = (prefix, result) => {
    const detail = result.error || (result.status ? `status ${result.status}` : 'network error')
    return `${prefix} — ${detail}`
  }

  const approve = async (id) => {
    if (busyId) return
    setBusyId(id)
    try {
      const result = await post({ action: 'approve', id })
      setActionError(result.ok ? '' : describeFailure("Couldn't approve", result))
    } finally {
      setBusyId('')
    }
  }
  const deny = async (id) => {
    if (busyId) return
    setBusyId(id)
    try {
      const result = await post({ action: 'deny', id })
      setActionError(result.ok ? '' : describeFailure("Couldn't deny", result))
    } finally {
      setBusyId('')
    }
  }
  const openWindow = async (minutes) => {
    if (windowBusy) return
    setWindowBusy(true)
    try {
      const result = await post({ action: 'open_window', minutes: Math.min(120, Math.max(1, minutes)) })
      setActionError(result.ok ? '' : describeFailure("Couldn't open the window", result))
    } finally {
      setWindowBusy(false)
    }
  }
  const closeWindow = async (id) => {
    if (windowBusy) return
    setWindowBusy(true)
    try {
      const result = await post({ action: 'close_window', id })
      setActionError(result.ok ? '' : describeFailure("Couldn't close the window", result))
    } finally {
      setWindowBusy(false)
    }
  }

  const pending = data && Array.isArray(data.pending) ? data.pending : []
  const recent = data && Array.isArray(data.recent) ? data.recent : []
  const windows = data && Array.isArray(data.windows) ? data.windows : []
  const activeWindow = windows.find(isWindowOpen) || null
  const idle = pending.length === 0 && !activeWindow

  // Collapse the popover automatically once there's something to show
  // (a pending request or an open window) so the pill doesn't reopen stale.
  useEffect(() => {
    if (!idle) setPillOpen(false)
  }, [idle])

  // Close the idle popover on outside click or Escape.
  useEffect(() => {
    if (!pillOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPillOpen(false)
    }
    const onPointerDown = (e) => {
      if (pillRef.current && !pillRef.current.contains(e.target)) setPillOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [pillOpen])

  if (!data) return null

  if (idle) {
    return (
      <aside
        ref={pillRef}
        aria-label="Agent action approvals"
        style={{
          position: 'fixed',
          left: 18,
          bottom: 18,
          zIndex: 73,
        }}
      >
        <button
          type="button"
          aria-expanded={pillOpen}
          aria-label="Agent approvals. Open to set a temporary auto-approve window."
          onClick={() => setPillOpen(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 26,
            padding: '5px 11px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--surface, #fff) 82%, transparent)',
            color: 'var(--text-muted)',
            fontWeight: 600,
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
            opacity: 0.82,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 12 }}>🔒</span>
          Agent approvals
        </button>

        {pillOpen && (
          <div
            role="dialog"
            aria-label="Approve agent actions for a time window"
            style={{
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              padding: '8px 10px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--surface, #fff) 94%, transparent)',
              boxShadow: '0 16px 44px rgba(0,0,0,0.24)',
              backdropFilter: 'blur(18px)',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Auto-approve:</span>
            {WINDOW_CHOICES.map(minutes => (
              <button
                key={minutes}
                type="button"
                aria-label={`Approve agent actions for ${minutes} minutes`}
                title={`Approve agent actions for ${minutes} minutes`}
                onClick={() => openWindow(minutes)}
                disabled={windowBusy}
                style={{
                  minHeight: 28,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: 'var(--surface2, #f1f5f9)',
                  color: 'var(--text)',
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: windowBusy ? 'default' : 'pointer',
                  opacity: windowBusy ? 0.6 : 1,
                }}
              >{minutes}m</button>
            ))}
            {actionError && (
              <div style={{ width: '100%', fontSize: 11, color: '#ef4444' }}>{actionError}</div>
            )}
          </div>
        )}
      </aside>
    )
  }

  const recentDecided = recent.filter(item => item.status && item.status !== 'pending').slice(0, 3)

  return (
    <aside
      aria-label="Agent action approvals"
      style={{
        position: 'fixed',
        left: 18,
        bottom: 18,
        zIndex: 73,
        width: 'min(380px, calc(100vw - 24px))',
        display: 'grid',
        gap: 8,
      }}
    >
      {activeWindow && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #f59e0b',
            background: 'color-mix(in srgb, #f59e0b 18%, var(--surface, #fff))',
            color: 'var(--text)',
            fontSize: 13,
            fontWeight: 700,
            boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            Agent actions auto-approved for another {countdown(activeWindow.expiresAt) || 'a while'}
          </span>
          <button
            type="button"
            aria-label="Close auto-approval window now"
            onClick={() => closeWindow(activeWindow.id)}
            disabled={windowBusy}
            style={{
              minHeight: 32,
              padding: '4px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface, #fff)',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: 12,
              cursor: windowBusy ? 'default' : 'pointer',
              opacity: windowBusy ? 0.6 : 1,
            }}
          >Close</button>
        </div>
      )}

      {pending.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: 'color-mix(in srgb, var(--surface, #fff) 94%, transparent)',
            boxShadow: '0 16px 44px rgba(0,0,0,0.24)',
            backdropFilter: 'blur(18px)',
            padding: 12,
            display: 'grid',
            gap: 10,
            maxHeight: '54vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
            Agent approvals needed ({pending.length})
          </div>
          {pending.map(item => {
            const rows = summarizeArgs(item.argsSummary)
            const busy = busyId === item.id
            return (
              <div
                key={item.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '9px 10px',
                  background: 'var(--surface2, #f1f5f9)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: 999, background: riskColor(item.risk), flexShrink: 0 }}
                  />
                  <strong style={{ fontSize: 13, color: 'var(--text)' }}>{toolLabel(item.tool)}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    &middot; asked by {item.requestedByAgent || 'an agent'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    expires in {countdown(item.expiresAt) || 'unknown'}
                  </span>
                </div>
                {item.reason && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.reason}</div>
                )}
                {rows.length > 0 && (
                  <div style={{ display: 'grid', gap: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                    {rows.map((row, i) => (
                      <div key={row.key || i} style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                        {row.key && <span style={{ fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{row.key}:</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    aria-label={`Approve ${toolLabel(item.tool)} requested by ${item.requestedByAgent || 'an agent'}`}
                    onClick={() => approve(item.id)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      minHeight: 34,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--accent, #3b82f6)',
                      background: 'var(--accent, #3b82f6)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                    }}
                  >{busy ? 'Working…' : 'Approve'}</button>
                  <button
                    type="button"
                    aria-label={`Deny ${toolLabel(item.tool)} requested by ${item.requestedByAgent || 'an agent'}`}
                    onClick={() => deny(item.id)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      minHeight: 34,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface, #fff)',
                      color: 'var(--text)',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                    }}
                  >Deny</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>Auto-approve:</span>
        {WINDOW_CHOICES.map(minutes => (
          <button
            key={minutes}
            type="button"
            aria-label={`Approve agent actions for ${minutes} minutes`}
            title={`Approve agent actions for ${minutes} minutes`}
            onClick={() => openWindow(minutes)}
            disabled={windowBusy}
            style={{
              minHeight: 28,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface2, #f1f5f9)',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: 11,
              cursor: windowBusy ? 'default' : 'pointer',
              opacity: windowBusy ? 0.6 : 1,
            }}
          >{minutes}m</button>
        ))}
      </div>

      {actionError && (
        <div style={{ fontSize: 11, color: '#ef4444', padding: '0 2px' }}>{actionError}</div>
      )}

      {recentDecided.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'grid', gap: 2, padding: '0 2px' }}>
          {recentDecided.map(item => (
            <div key={item.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.status} {toolLabel(item.tool)} {relTime(item.decidedAt)}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
