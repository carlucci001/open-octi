'use client'
// Always-visible "N online" pill in the header. Clicking opens a popover with
// the list of currently online users (excluding self). For admins, each row has
// Boot and Suspend buttons.
import { useEffect, useState, useRef } from 'react'

export default function OnlinePill({ variant = 'header' }) {
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [open, setOpen] = useState(false)
  const popoverRef = useRef(null)

  // Refresh online users every 10 seconds.
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const [rMe, rUsers] = await Promise.all([
          fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
          fetch('/api/users/online', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
        ])
        if (stop) return
        setMe(rMe.user || null)
        setUsers(rUsers.users || [])
      } catch {}
    }
    tick()
    const t = setInterval(tick, 10000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  // Click-outside to close the popover.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const others = users.filter(u => u.id !== me?.id)
  const onlineOthers = others.filter(u => u.online)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const menuMode = variant === 'menu'

  const boot = async (id, name) => {
    if (!confirm(`Force ${name} off the CRM? They go back to /login. Account stays.`)) return
    const r = await fetch(`/api/users/${id}/boot`, { method: 'POST' })
    const j = await r.json()
    if (!j.ok) alert(j.error || 'boot failed')
    else setTimeout(() => fetch('/api/users/online').then(r => r.json()).then(j => setUsers(j.users || [])), 500)
  }

  const suspend = async (u) => {
    const next = !u.suspended
    if (!confirm(`${next ? 'Suspend' : 'Reactivate'} ${u.displayName || u.username}?`)) return
    const r = await fetch(`/api/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: next }),
    })
    const j = await r.json()
    if (!j.ok) alert(j.error || 'update failed')
    else setTimeout(() => fetch('/api/users/online').then(r => r.json()).then(j => setUsers(j.users || [])), 500)
  }

  return (
    <div ref={popoverRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={`${onlineOthers.length} other users online`}
        data-tooltip={`${onlineOthers.length} online`}
        data-tooltip-side="bottom"
        className={menuMode ? 'avatar-menu-tool-icon' : 'flex items-center justify-center rounded-lg'}
        style={menuMode ? undefined : {
          height: 48, padding: '0 12px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer',
        }}
      >
        <span style={{
          display: 'inline-block', width: 9, height: 9, borderRadius: 999,
          background: onlineOthers.length > 0 ? '#10b981' : '#6b7280',
          boxShadow: onlineOthers.length > 0 ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
        }} />
        {onlineOthers.length}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 320,
          maxHeight: '70vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          padding: 12,
          zIndex: 100,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            People ({onlineOthers.length} online)
          </div>
          {others.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No other users yet.</div>
          )}
          {others.map(u => (
            <div key={u.id} style={{
              padding: '10px 8px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block', width: 9, height: 9, borderRadius: 999,
                  background: u.online ? '#10b981' : '#6b7280',
                  boxShadow: u.online ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
                  flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                  {u.displayName || u.username}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {u.online ? 'online' : (u.lastSeenAt ? relTime(u.lastSeenAt) : 'never')}
                </span>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {u.online && (
                    <button onClick={() => boot(u.id, u.displayName || u.username)}
                      style={btnSm()}>🚪 Boot</button>
                  )}
                  <button onClick={() => suspend(u)}
                    style={btnSm()}>
                    {u.suspended ? '♻ Reactivate' : '🛑 Suspend'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function btnSm() {
  return {
    flex: 1,
    padding: '6px 10px',
    minHeight: 36,
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--surface2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    cursor: 'pointer',
  }
}

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'just now'
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago'
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago'
  return Math.floor(ms / 86400000) + 'd ago'
}
