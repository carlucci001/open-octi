'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Mail, Send } from 'lucide-react'

// Global video call window. Mounted once in app/layout.js so the iframe persists
// across route changes — navigating between menu items no longer drops the call.
// Two modes: 'expanded' (large overlay) and 'pip' (small draggable corner window).
// Auto-minimizes to PiP when the user navigates away from the page that started the call.
export default function ActiveVideoCall() {
  const [call, setCall] = useState(null) // { url, accountId, accountName }
  const [mode, setMode] = useState('expanded')
  const [pos, setPos] = useState({ right: 24, bottom: 24 })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const dragRef = useRef(null)
  const pathname = usePathname()
  const startedAtPathRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Pick up any pending request that fired before we mounted (race-condition safety
    // for the voice-driven flow that may set this just before navigating).
    const pending = window.__fccPendingVideoCall
    if (pending && pending.url && Date.now() - pending.ts < 10000) {
      setCall({ url: pending.url, accountId: pending.accountId, accountName: pending.accountName || 'Video Call' })
      setMode('expanded')
      setInviteEmail('')
      setInviteStatus('')
      startedAtPathRef.current = pathname
      window.__fccPendingVideoCall = null
    }

    const onStart = (e) => {
      const { url, accountId, accountName } = e.detail || {}
      if (!url) return
      setCall({ url, accountId, accountName: accountName || 'Video Call' })
      setMode('expanded')
      setInviteEmail('')
      setInviteStatus('')
      startedAtPathRef.current = pathname
    }
    window.addEventListener('fcc:start-video-call', onStart)
    return () => window.removeEventListener('fcc:start-video-call', onStart)
    // pathname intentionally omitted from deps — we only want to capture the path at the moment a call starts.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-minimize to PiP when navigating away from the page that started the call.
  useEffect(() => {
    if (!call) return
    if (mode === 'expanded' && startedAtPathRef.current && pathname !== startedAtPathRef.current) {
      setMode('pip')
    }
  }, [pathname, call, mode])

  // Expose call-active flag so other components (e.g. DemoModeSwitch) can avoid
  // actions that would tear down the iframe while a call is in progress.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccCallActive = !!call
    return () => { window.__fccCallActive = false }
  }, [call])

  // PiP drag handling.
  useEffect(() => {
    if (mode !== 'pip') return
    const onMove = (e) => {
      if (!dragRef.current) return
      const { startX, startY, startRight, startBottom } = dragRef.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      // Anchored bottom-right: dragging right/down should shrink right/bottom offsets.
      const w = window.innerWidth
      const h = window.innerHeight
      setPos({
        right: Math.max(0, Math.min(w - 200, startRight - dx)),
        bottom: Math.max(0, Math.min(h - 160, startBottom - dy)),
      })
    }
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [mode])

  if (!call) return null

  const isPip = mode === 'pip'
  const sendInvite = async () => {
    const to = inviteEmail.trim()
    if (!to || !to.includes('@') || inviteBusy) {
      setInviteStatus('Enter an email')
      return
    }
    setInviteBusy(true)
    setInviteStatus('')
    try {
      const res = await fetch('/api/video/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          name: to.split('@')[0],
          existingUrl: call.url,
          seed: call.accountName || 'conference',
          subject: 'Join my video room',
          note: 'Join the active video call here:',
          linkedTo: call.accountId ? { accountId: call.accountId } : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Invite failed')
      setInviteEmail('')
      setInviteStatus('Invite sent')
    } catch (err) {
      setInviteStatus(err.message || 'Invite failed')
    } finally {
      setInviteBusy(false)
    }
  }

  const containerStyle = isPip
    ? {
        position: 'fixed',
        right: pos.right,
        bottom: pos.bottom,
        width: 360,
        height: 240,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        background: '#000',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        border: '2px solid #3b7dd8',
      }
    : {
        position: 'fixed',
        top: '4vh',
        left: '4vw',
        right: '4vw',
        bottom: '4vh',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        background: '#000',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
      }

  const startDrag = (e) => {
    if (!isPip) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
    }
    document.body.style.userSelect = 'none'
  }

  const btn = {
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    border: 'none',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    minHeight: isPip ? 24 : 32,
  }

  return (
    <div style={containerStyle}>
      <div
        onMouseDown={startDrag}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isPip ? '6px 10px' : '12px 18px',
          background: 'rgba(20,22,30,0.96)',
          color: '#fff',
          fontSize: isPip ? 12 : 15,
          cursor: isPip ? 'move' : 'default',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📹 {call.accountName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {!isPip && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onMouseDown={e => e.stopPropagation()}>
              <Mail size={15} aria-hidden="true" />
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendInvite() }}
                placeholder="email"
                aria-label="Invite someone by email"
                style={{
                  width: 170,
                  minHeight: 30,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: '0 8px',
                  outline: 'none',
                  fontSize: 13,
                }}
              />
              <button onClick={sendInvite} disabled={inviteBusy} style={btn} title="Send invite to current call">
                <Send size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          <button onClick={() => setMode(isPip ? 'expanded' : 'pip')} style={btn} title={isPip ? 'Expand' : 'Minimize'}>
            {isPip ? '⛶' : '–'}
          </button>
          <a href={call.url} target="_blank" rel="noopener noreferrer" style={btn} title="Open in new tab">↗</a>
          <button
            onClick={() => { setCall(null); setMode('expanded') }}
            style={{ ...btn, background: '#dc2626' }}
            title="Leave call"
          >
            {isPip ? '✕' : 'Leave'}
          </button>
        </div>
      </div>
      {!isPip && inviteStatus && (
        <div style={{ background: 'rgba(20,22,30,0.96)', color: inviteStatus === 'Invite sent' ? '#86efac' : '#fca5a5', fontSize: 12, padding: '0 18px 8px' }}>
          {inviteStatus}
        </div>
      )}
      <iframe
        src={call.url}
        allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *"
        style={{ flex: 1, width: '100%', border: 'none', background: '#000' }}
      />
    </div>
  )
}
