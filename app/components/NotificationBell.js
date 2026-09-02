'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SEVERITY = {
  info:    { color: 'var(--accent)',  label: 'Info'    },
  success: { color: 'var(--green)',   label: 'OK'      },
  warn:    { color: 'var(--amber)',   label: 'Warning' },
  error:   { color: '#ef4444',        label: 'Error'   },
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!then) return ''
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationBell({ variant = 'header', open: controlledOpen, onOpenChange }) {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [internalOpen, setInternalOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(false)
  const popRef = useRef(null)
  const btnRef = useRef(null)
  const menuMode = variant === 'menu'
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen
  const setOpen = useCallback((next) => {
    const value = typeof next === 'function' ? next(open) : next
    if (typeof controlledOpen !== 'boolean') setInternalOpen(value)
    onOpenChange?.(value)
  }, [controlledOpen, onOpenChange, open])

  const refresh = async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' })
      const j = await r.json()
      if (j?.ok) {
        setItems(j.notifications || [])
        setUnread(j.unread || 0)
      }
    } catch {}
  }

  useEffect(() => {
    refresh()
    const h = setInterval(refresh, 5000)
    const onPush = () => refresh()
    const onOpen = () => setOpen(true)
    const onFocus = () => refresh()
    window.addEventListener('fcc:notifications-changed', onPush)
    window.addEventListener('fcc:open-notifications', onOpen)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(h)
      window.removeEventListener('fcc:notifications-changed', onPush)
      window.removeEventListener('fcc:open-notifications', onOpen)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    const sync = () => setMobilePanel(typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  useEffect(() => {
    if (!open || menuMode) return
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const patch = async (body) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      refresh()
    } catch {}
  }

  const onItemClick = (n) => {
    if (!n.read) patch({ action: 'read', id: n.id })
    if (n.link?.record) {
      window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: n.link.record }))
      setOpen(false)
    } else if (n.link?.tab) {
      window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: n.link.tab }))
      if (n.link.sub) {
        window.dispatchEvent(new CustomEvent('fcc:finance-sub', { detail: n.link.sub }))
      }
      if (n.link.section) {
        try { localStorage.setItem(`fcc-${n.link.tab}-section`, n.link.section) } catch {}
        window.dispatchEvent(new CustomEvent(`fcc:${n.link.tab}-section`, { detail: n.link.section }))
      }
      setOpen(false)
    } else if (n.link?.url) {
      window.open(n.link.url, '_blank', 'noopener,noreferrer')
    }
  }
  const panelStyle = menuMode
    ? {
        position: 'static',
        width: '100%',
        maxWidth: '100%',
        maxHeight: 'min(46dvh, 380px)',
        background: 'var(--surface)',
        border: '1px solid color-mix(in srgb, var(--accent) 34%, var(--border))',
        borderRadius: 10,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : mobilePanel
      ? {
          position: 'fixed',
          top: 62,
          left: 10,
          right: 10,
          width: 'auto',
          maxWidth: 'none',
          maxHeight: 'calc(100dvh - 76px)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }
      : {
          position: 'absolute',
          top: 56,
          right: 0,
          width: 'min(380px, calc(100vw - 24px))',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'min(520px, calc(100dvh - 96px))',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }

  return (
    <div className={menuMode ? 'notification-menu-shell' : undefined} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        data-tooltip={unread > 0 ? `${unread} unread` : 'Notifications'}
        data-tooltip-side="bottom"
        className={menuMode ? 'avatar-menu-tool-icon relative' : 'flex items-center justify-center rounded-lg relative'}
        style={menuMode ? undefined : {
          width: 48,
          height: 48,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          transition: 'all var(--transition-fast)',
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.6 1.4L4 17h5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a3 3 0 006 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 4, right: 4,
              background: '#ef4444',
              color: 'white',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 18, height: 18,
              padding: '0 5px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
              border: '1.5px solid var(--surface)',
            }}
            aria-hidden="true"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className={menuMode ? 'notification-menu-panel' : undefined}
          style={panelStyle}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface2)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              Notifications {unread > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {unread} unread</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {unread > 0 && (
                <button
                  onClick={() => patch({ action: 'read-all' })}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
                >Mark all read</button>
              )}
              {items.length > 0 && (
                <button
                  onClick={() => patch({ action: 'clear' })}
                  style={{ fontSize: 12, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
                >Clear</button>
              )}
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Nothing yet — system messages will land here.
              </div>
            )}
            {items.map(n => {
              const sev = SEVERITY[n.severity] || SEVERITY.info
              return (
                <div
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border)',
                    cursor: n.link ? 'pointer' : 'default',
                    background: n.read ? 'transparent' : 'var(--accent-soft, rgba(99,102,241,0.08))',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : 'var(--accent-soft, rgba(99,102,241,0.08))' }}
                >
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: 999,
                      background: sev.color,
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                    aria-hidden="true"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, lineHeight: 1.3 }}>
                        {n.title}
                        {n.count > 1 && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>×{n.count}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(n.createdAt)}</div>
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
                      {n.source}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); patch({ action: 'dismiss', id: n.id }) }}
                    aria-label="Dismiss"
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', padding: 2, marginLeft: 4, lineHeight: 1, fontSize: 16,
                    }}
                    title="Dismiss"
                  >×</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
