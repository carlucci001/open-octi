'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// Small inline switch for the top brand row.
// Off = live CRM. On = demo CRM. The global red banner is intentionally
// suppressed so recordings keep the normal Command Center frame.
export default function DemoModeSwitch() {
  const router = useRouter()
  const [mode, setMode] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/mode', { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) {
        setMode(j.mode)
        setExpiresAt(j.meta?.expiresAt || null)
      }
    } catch {
      setMessage('Mode unavailable')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const activeSessionLabel = () => {
    if (typeof window === 'undefined') return ''
    if (window.__fccConferenceActive) return 'conference'
    if (window.__fccCallActive) return 'video call'
    if (window.__fccPhoneCallActive) return 'phone call'
    if (window.__fccVoiceActive || window.__fccVoiceSessionActive) return 'voice session'
    return ''
  }

  const toggle = async () => {
    if (busy || mode == null) return
    setBusy(true)
    setMessage('')
    const next = mode === 'demo' ? 'real' : 'demo'
    const activeSession = activeSessionLabel()
    try {
      const response = await fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Mode switch failed')
      }
      setMode(result.mode)
      setExpiresAt(result.meta?.expiresAt || null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fcc:mode-changed', { detail: { mode: result.mode } }))
      }
      if (activeSession) {
        setBusy(false)
        setMessage(`${result.mode === 'demo' ? 'Demo' : 'Real'} data is on. ${activeSession} kept live.`)
        router.refresh()
        return
      }
      window.location.reload()
    } catch (e) {
      setBusy(false)
      setMessage(e.message || 'Mode switch failed')
    }
  }

  if (mode == null) return null

  const on = mode === 'demo'
  const accent = on ? 'var(--accent)' : 'var(--text-muted)'
  const expiresLabel = on && expiresAt ? new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={toggle}
        disabled={busy}
        data-tooltip={on ? 'Demo CRM is on - click to return to the live CRM' : 'Click to use the demo CRM'}
        data-tooltip-side="bottom"
        aria-label={on ? 'Use live CRM' : 'Use demo CRM'}
        aria-pressed={on}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          minHeight: 36,
          padding: '6px 10px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.65 : 1,
        }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: accent,
        }}>
          {on ? 'Demo CRM' : 'Live CRM'}
        </span>
        <span style={{
          position: 'relative',
          width: 34,
          height: 18,
          borderRadius: 999,
          background: on ? 'var(--accent)' : 'var(--surface)',
          border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'),
          transition: 'background 160ms ease, border-color 160ms ease',
        }}>
          <span style={{
            position: 'absolute',
            top: 1,
            left: on ? 17 : 1,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: on ? 'var(--accent-text)' : 'var(--text-muted)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.24)',
            transition: 'left 160ms ease',
          }} />
        </span>
      </button>
      {message && (
        <span style={{ fontSize: 12, color: message.includes('failed') || message.includes('unavailable') ? 'var(--red)' : 'var(--text-muted)' }}>
          {message}
        </span>
      )}
      {!message && expiresLabel && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Auto-returns to Live CRM at {expiresLabel}
        </span>
      )}
    </span>
  )
}
