'use client'
// Header bell that lights up red when there are unread direct messages.
// Polls /api/messages every 8 seconds. Click → jumps to the Feed page where
// the user can read and reply.
import { useEffect, useState } from 'react'

export default function MessageBell({ onClick }) {
  const [unread, setUnread] = useState(0)
  const [lastChecked, setLastChecked] = useState(0)

  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const r = await fetch('/api/messages', { cache: 'no-store' }).then(r => r.json())
        if (stop) return
        const n = (r.inbox || []).reduce((s, p) => s + (p.unread || 0), 0)
        setUnread(n)
        setLastChecked(Date.now())
      } catch {}
    }
    tick()
    const t = setInterval(tick, 8000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  const live = unread > 0

  return (
    <button
      onClick={onClick}
      aria-label={live ? `${unread} unread message${unread > 1 ? 's' : ''}` : 'Messages'}
      data-tooltip={live ? `${unread} unread` : 'Messages'}
      data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg relative"
      style={{
        width: 48, height: 48,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        color: live ? '#ef4444' : 'var(--text)',
        boxShadow: live ? '0 0 12px rgba(239,68,68,0.4)' : 'none',
        transition: 'all var(--transition-fast)',
        cursor: 'pointer',
      }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
      {live && (
        <span style={{
          position: 'absolute',
          top: -4, right: -4,
          minWidth: 18, height: 18,
          padding: '0 5px',
          background: '#ef4444',
          color: '#fff',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid var(--bg, #0a0a0a)',
        }}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
