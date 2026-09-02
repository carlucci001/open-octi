'use client'
// Floating time-tracking widget — bottom-left corner, stays on every page.
// Pick a client, hit Start. Pause/resume keeps the elapsed counter accurate.
// Stop POSTs to /api/time-tracking/log which:
//   - increments the client's trackedSeconds
//   - appends a 'time_tracked' activity to that client's activity stream
//
// Persists running state in localStorage so a page navigation or refresh doesn't
// lose the timer.

import { useEffect, useState, useCallback, useRef } from 'react'

const STORAGE_KEY = 'farrington.timeTracker.v1'

function fmt(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function loadState() {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
function saveState(s) {
  if (typeof window === 'undefined') return
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export default function TimeTracker({ variant = 'header', open: controlledOpen, onOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [search, setSearch] = useState('')
  const [running, setRunning] = useState(false)        // is the clock currently ticking?
  const [paused, setPaused] = useState(false)          // is there an active session that's currently paused?
  const [accumulatedMs, setAccumulatedMs] = useState(0) // total ms recorded in this session before the latest tick
  const [tickStartedAt, setTickStartedAt] = useState(null) // ms timestamp when the current run-segment started
  const [tickNow, setTickNow] = useState(Date.now())   // ticks every 250ms while running for display
  const [sessionStartedAt, setSessionStartedAt] = useState(null) // ISO string of when the very first start happened
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen
  const setOpen = useCallback((next) => {
    const value = typeof next === 'function' ? next(open) : next
    if (typeof controlledOpen !== 'boolean') setInternalOpen(value)
    onOpenChange?.(value)
  }, [controlledOpen, onOpenChange, open])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setMobilePanel(query.matches)
    update()
    try {
      query.addEventListener('change', update)
      return () => query.removeEventListener('change', update)
    } catch {
      query.addListener(update)
      return () => query.removeListener(update)
    }
  }, [])

  // Load accounts once
  useEffect(() => {
    fetch('/api/accounts', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        const list = j.accounts || j || []
        setAccounts(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
  }, [])

  // Restore state from localStorage on mount
  useEffect(() => {
    const s = loadState()
    if (!s) return
    setAccountId(s.accountId || '')
    setNote(s.note || '')
    setAccumulatedMs(s.accumulatedMs || 0)
    setSessionStartedAt(s.sessionStartedAt || null)
    if (s.running && s.tickStartedAt) {
      setTickStartedAt(s.tickStartedAt)
      setRunning(true)
      setPaused(false)
      setOpen(true)
    } else if (s.paused) {
      setRunning(false)
      setPaused(true)
      setOpen(true)
    }
  }, [])

  // Poll server-side timer state — voice agents (Maggie) write here when they start/stop
  // the timer, so the UI must reflect those changes within ~2 seconds.
  useEffect(() => {
    let cancelled = false
    let lastSeenStatus = null
    let lastSeenAccountId = null
    const sync = async () => {
      try {
        const r = await fetch('/api/timer', { cache: 'no-store' })
        const j = await r.json()
        if (cancelled || !j.ok) return
        const s = j.state || {}
        // Only adopt server state if it's different from current — and only when the change
        // came from a voice agent (not from this component's own writes)
        const serverActive = s.status === 'running' || s.status === 'paused'
        const localActive = running || paused
        const accountChanged = s.accountId && s.accountId !== accountId
        const statusChanged = s.status !== lastSeenStatus
        const idChanged = s.accountId !== lastSeenAccountId

        if (serverActive && (!localActive || accountChanged || statusChanged)) {
          // Adopt server state
          setAccountId(s.accountId || '')
          setNote(s.note || '')
          setSessionStartedAt(s.sessionStartedAt || null)
          setAccumulatedMs(s.accumulatedMs || 0)
          if (s.status === 'running' && s.runStartedAt) {
            setTickStartedAt(new Date(s.runStartedAt).getTime())
            setRunning(true); setPaused(false)
          } else if (s.status === 'paused') {
            setTickStartedAt(null)
            setRunning(false); setPaused(true)
          }
          if (idChanged || statusChanged) flash(`Timer ${s.status} for ${s.accountName}`)
        } else if (!serverActive && localActive && lastSeenStatus !== null && lastSeenStatus !== 'idle') {
          // Voice stopped/discarded — reset local
          setRunning(false); setPaused(false)
          setAccumulatedMs(0); setTickStartedAt(null); setSessionStartedAt(null); setNote('')
        }
        lastSeenStatus = s.status
        lastSeenAccountId = s.accountId
      } catch {}
    }
    sync()
    const i = setInterval(sync, 2000)
    return () => { cancelled = true; clearInterval(i) }
  }, [])

  // Persist running state
  useEffect(() => {
    if (!running && !paused) { saveState(null); return }
    saveState({
      accountId, note, accumulatedMs, tickStartedAt, sessionStartedAt, running, paused,
    })
  }, [running, paused, accountId, note, accumulatedMs, tickStartedAt, sessionStartedAt])

  // Tick the display while running
  useEffect(() => {
    if (!running) return
    const i = setInterval(() => setTickNow(Date.now()), 250)
    return () => clearInterval(i)
  }, [running])

  const elapsedSec = useCallback(() => {
    let total = accumulatedMs
    if (running && tickStartedAt) total += (tickNow - tickStartedAt)
    return Math.max(0, Math.floor(total / 1000))
  }, [accumulatedMs, running, tickStartedAt, tickNow])

  const flash = (msg, isErr = false) => {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 4000)
  }

  const account = accounts.find(a => a.id === accountId)
  const filteredAccounts = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return accounts.slice(0, 8)
    return accounts.filter(a => (a.name || '').toLowerCase().includes(q)).slice(0, 8)
  })()

  // Helper: POST to /api/timer — single source of truth for timer state.
  // Both UI and voice agents mutate state through here.
  const callTimer = async (payload) => {
    const r = await fetch('/api/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return r.json()
  }

  const onStart = async () => {
    if (!accountId) { flash('Pick a client first', true); return }
    setBusy(true)
    try {
      const noteToSend = note.trim() || undefined
      const j = await callTimer({ action: 'start', account_id: accountId, note: noteToSend })
      if (!j.ok) throw new Error(j.error || 'Start failed')
      // Server state now authoritative — the poll loop will sync UI within ~2s,
      // but set local state immediately for snappier feel
      const now = Date.now()
      setSessionStartedAt(j.state.sessionStartedAt || new Date(now).toISOString())
      setTickStartedAt(j.state.runStartedAt ? new Date(j.state.runStartedAt).getTime() : now)
      setTickNow(now)
      setRunning(true); setPaused(false)
    } catch (e) {
      flash(`Start failed: ${e.message}`, true)
    } finally { setBusy(false) }
  }

  const onPause = async () => {
    if (!running) return
    setBusy(true)
    try {
      const j = await callTimer({ action: 'pause' })
      if (!j.ok) throw new Error(j.error || 'Pause failed')
      setAccumulatedMs(j.state.accumulatedMs || 0)
      setTickStartedAt(null)
      setRunning(false); setPaused(true)
    } catch (e) {
      flash(`Pause failed: ${e.message}`, true)
    } finally { setBusy(false) }
  }

  const onResume = async () => {
    setBusy(true)
    try {
      const j = await callTimer({ action: 'resume' })
      if (!j.ok) throw new Error(j.error || 'Resume failed')
      const t = j.state.runStartedAt ? new Date(j.state.runStartedAt).getTime() : Date.now()
      setTickStartedAt(t); setTickNow(t)
      setRunning(true); setPaused(false)
    } catch (e) {
      flash(`Resume failed: ${e.message}`, true)
    } finally { setBusy(false) }
  }

  const onStop = async () => {
    setBusy(true)
    try {
      const j = await callTimer({ action: 'stop', note: note.trim() || undefined })
      if (!j.ok) throw new Error(j.error || 'Stop failed')
      flash(j.message || 'Logged.')
      setRunning(false); setPaused(false)
      setAccumulatedMs(0); setTickStartedAt(null); setSessionStartedAt(null); setNote('')
    } catch (e) {
      flash(`Stop failed: ${e.message}`, true)
    } finally { setBusy(false) }
  }

  const onCancel = async () => {
    if (!confirm('Discard this session without logging?')) return
    setBusy(true)
    try {
      await callTimer({ action: 'discard' })
      setRunning(false); setPaused(false)
      setAccumulatedMs(0); setTickStartedAt(null); setSessionStartedAt(null); setNote('')
    } catch {} finally { setBusy(false) }
  }

  const live = elapsedSec()
  const menuMode = variant === 'menu'
  const panelStyle = menuMode
    ? {
        position: 'static',
        zIndex: 1,
        width: '100%',
        maxWidth: 'none',
        maxHeight: 'min(46dvh, 380px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'var(--surface, #fff)',
        border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))',
        borderRadius: 10,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        padding: 12,
        color: 'var(--text)',
      }
    : mobilePanel
    ? {
        position: 'fixed',
        top: 70,
        left: 'calc(10px - (100vw - min(88vw, 340px)))',
        right: 10,
        zIndex: 10000,
        width: 'auto',
        maxWidth: 'none',
        maxHeight: 'calc(100dvh - 90px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'var(--surface, #fff)',
        border: '2px solid var(--accent, #3b82f6)',
        borderRadius: 14,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        padding: 14,
        color: 'var(--text)',
      }
    : {
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        zIndex: 9999,
        width: 380,
        maxWidth: 'calc(100vw - 40px)',
        background: 'var(--surface, #fff)',
        border: '2px solid var(--accent, #3b82f6)',
        borderRadius: 14,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        padding: 18,
        color: 'var(--text)',
      }

  // Header icon — sits in the top-right header bar, anchors a dropdown panel.
  return (
    <div className={menuMode ? 'time-tracker-menu-shell' : undefined} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={running ? `Tracking time for ${account?.name || 'a client'} — ${fmt(live)}` : 'Open time tracker'}
        aria-label="Time tracker"
        className={menuMode ? 'avatar-menu-tool-icon' : undefined}
        style={menuMode ? undefined : {
          width: 48, height: 48, padding: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface2)',
          color: 'var(--text)',
          cursor: 'pointer', fontWeight: 700,
          gap: 2,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: running ? 14 : 16,
            lineHeight: 1,
            display: 'inline-block',
            color: running ? '#dc2626' : 'currentColor',
            animation: running ? 'tt-icon-blink 0.9s steps(1, end) infinite' : 'none',
          }}
        >⏱</span>
        {(running || paused) && (
          <span style={{ fontSize: 10, lineHeight: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700, color: 'var(--text)' }}>{fmt(live).slice(3)}</span>
        )}
        <style>{`
          @keyframes tt-icon-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.25; } }
        `}</style>
      </button>

      {!open && null}

      {open && (
        <div className={menuMode ? 'time-tracker-menu-panel' : undefined} style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>⏱ Time Tracker</div>
            <button
              onClick={() => setOpen(false)}
              title="Close (timer keeps running in the header icon)"
              style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
            >×</button>
          </div>

      {/* Big clock */}
      <div style={{
        textAlign: 'center', padding: '14px 0', marginBottom: 14,
        background: 'var(--surface2, #f1f5f9)', borderRadius: 10,
        fontSize: 38, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: running ? '#dc2626' : (paused ? '#d97706' : 'var(--text)'),
        letterSpacing: 2,
      }}>
        {fmt(live)}
        {paused && !running && <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, marginTop: 4, color: '#d97706' }}>PAUSED</div>}
        {running && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: '#dc2626' }}>● RECORDING</div>}
      </div>

      {/* Client picker — disabled once a session has started so you can't change targets mid-stream */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Client</label>
        {(!sessionStartedAt) ? (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts…"
              style={{ width: '100%', padding: '8px 10px', minHeight: 36, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: 'var(--surface, #fff)', color: 'var(--text)' }}
            />
            <div style={{ maxHeight: 140, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {filteredAccounts.length === 0 && <div style={{ padding: 10, fontSize: 13, color: 'var(--text-muted)' }}>No matches.</div>}
              {filteredAccounts.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setAccountId(a.id); setSearch('') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    width: '100%', textAlign: 'left',
                    padding: '8px 10px', minHeight: 36, fontSize: 14,
                    background: accountId === a.id ? 'var(--accent, #3b82f6)' : 'transparent',
                    color: accountId === a.id ? '#fff' : 'var(--text)',
                    border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                  {a.trackedSeconds ? <span style={{ flex: '0 0 auto', fontSize: 11, opacity: 0.7 }}>{fmt(a.trackedSeconds)}</span> : null}
                </button>
              ))}
            </div>
            {account && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--surface2, #f1f5f9)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>Selected: <strong>{account.name}</strong></span>
                {account.trackedSeconds ? <span style={{ flex: '0 0 auto', color: 'var(--text-muted)' }}>previously: {fmt(account.trackedSeconds)}</span> : null}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '8px 10px', background: 'var(--surface2, #f1f5f9)', borderRadius: 8, fontSize: 14 }}>
            <strong>{account?.name || accountId}</strong>
            <span style={{ float: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Stop or cancel to switch</span>
          </div>
        )}
      </div>

      {/* Note (optional) */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>Note (optional)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What was this session about?"
          style={{ width: '100%', padding: '8px 10px', minHeight: 36, fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface, #fff)', color: 'var(--text)' }}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!running && !paused && (
          <button onClick={onStart} disabled={!accountId || busy}
            style={btn('#10b981')}
          >▶ Start</button>
        )}
        {running && (
          <button onClick={onPause} disabled={busy} style={btn('#f59e0b')}>⏸ Pause</button>
        )}
        {paused && !running && (
          <button onClick={onResume} disabled={busy} style={btn('#10b981')}>▶ Resume</button>
        )}
        {(running || paused) && (
          <button onClick={onStop} disabled={busy} style={btn('#dc2626')}>{busy ? 'Logging…' : '⏹ Stop & Log'}</button>
        )}
        {(running || paused) && (
          <button onClick={onCancel} disabled={busy} style={btn('var(--surface2, #e2e8f0)', 'var(--text)')}>Discard</button>
        )}
      </div>

      {toast && (
        <div style={{
          marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: toast.isErr ? '#fef2f2' : '#dcfce7',
          color: toast.isErr ? '#7f1d1d' : '#064e3b',
          border: '1px solid ' + (toast.isErr ? '#ef4444' : '#10b981'),
        }}>{toast.msg}</div>
      )}
        </div>
      )}
    </div>
  )
}

function btn(bg, color = '#fff') {
  return {
    flex: '1 1 auto', padding: '10px 14px', minHeight: 44, fontSize: 14, fontWeight: 700,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    background: bg, color,
  }
}
