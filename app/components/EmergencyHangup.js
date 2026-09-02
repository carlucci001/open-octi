'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Pause, PhoneCall, PhoneOff, Play } from 'lucide-react'
import {
  buildActiveCallEntries,
  createActiveCallHint,
  formatCallDuration,
} from '@/lib/twilio-call-controls'

const EMPTY_SNAPSHOT = { calls: [], conferences: [] }

function removeTarget(snapshot, target) {
  const calls = Array.isArray(snapshot.calls) ? snapshot.calls : []
  const conferences = Array.isArray(snapshot.conferences) ? snapshot.conferences : []
  if (target.callSid) {
    return { ...snapshot, calls: calls.filter(call => call.sid !== target.callSid) }
  }

  const removed = conferences.filter(conference => (
    conference.sid === target.conferenceSid
    || conference.friendlyName === target.conferenceName
    || conference.friendly_name === target.conferenceName
  ))
  const participantSids = new Set(removed.flatMap(conference => (
    Array.isArray(conference.participants)
      ? conference.participants.map(participant => participant.callSid || participant.call_sid)
      : []
  )))
  return {
    calls: calls.filter(call => !participantSids.has(call.sid)),
    conferences: conferences.filter(conference => !removed.includes(conference)),
  }
}

function CallRow({ entry, busy, holdBusy, now, onHangup, onToggleHold }) {
  const duration = formatCallDuration(entry.startedAt, now)
  const status = String(entry.status || 'active').replace(/-/g, ' ')
  const details = [status, duration].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
      <span aria-hidden="true" style={{ color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
        <PhoneCall size={18} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.label}
        </div>
        {entry.partyLabel && (
          <div
            aria-label={`Parties: ${entry.partyLabel}`}
            title={entry.partyLabel}
            style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {entry.partyLabel}
          </div>
        )}
        <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.3, textTransform: 'capitalize' }}>
          {details}
        </div>
      </div>
      {entry.conferenceName && (
        <button
          type="button"
          onClick={() => onToggleHold(entry)}
          disabled={busy || holdBusy}
          aria-label={entry.held ? `Resume ${entry.label}` : `Hold ${entry.label}`}
          title={entry.held ? `Resume ${entry.label}` : `Hold ${entry.label}`}
          style={{
            minWidth: 48,
            minHeight: 48,
            width: 48,
            height: 48,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: entry.held ? 'color-mix(in srgb, var(--accent) 18%, var(--surface2))' : 'var(--surface2)',
            color: 'var(--text)',
            cursor: busy || holdBusy ? 'wait' : 'pointer',
            opacity: busy || holdBusy ? 0.68 : 1,
          }}
        >
          {entry.held
            ? <Play size={20} strokeWidth={2.3} aria-hidden="true" />
            : <Pause size={20} strokeWidth={2.3} aria-hidden="true" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => onHangup(entry)}
        disabled={busy}
        aria-label={`Hang up ${entry.label}`}
        title={`Hang up ${entry.label}`}
        style={{
          minWidth: 48,
          minHeight: 48,
          width: 48,
          height: 48,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid color-mix(in srgb, var(--red) 76%, white)',
          borderRadius: 12,
          background: 'var(--red)',
          color: '#fff',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.68 : 1,
        }}
      >
        <PhoneOff size={21} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  )
}

export default function EmergencyHangup() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [localHints, setLocalHints] = useState([])
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [busyHoldIds, setBusyHoldIds] = useState(() => new Set())
  const [holdOverrides, setHoldOverrides] = useState(() => new Map())
  const [busyAll, setBusyAll] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [avoidVideoDock, setAvoidVideoDock] = useState(false)
  const [pollDegraded, setPollDegraded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [inactiveRoute] = useState(() => (
    typeof window !== 'undefined' && /^(\/portal|\/login|\/sign\/|\/forms\/)/.test(window.location.pathname)
  ))
  const connectionCleanups = useRef(new Map())

  const baseEntries = useMemo(
    () => buildActiveCallEntries(snapshot, localHints),
    [snapshot, localHints],
  )
  const entries = useMemo(
    () => baseEntries.map(entry => (
      holdOverrides.has(entry.id)
        ? { ...entry, held: holdOverrides.get(entry.id) }
        : entry
    )),
    [baseEntries, holdOverrides],
  )

  const poll = useCallback(async () => {
    if (inactiveRoute) return
    try {
      const response = await fetch('/api/twilio/active', { cache: 'no-store' })
      if (!response.ok) {
        setPollDegraded(true)
        return
      }
      const data = await response.json()
      setPollDegraded(false)
      if (data.configured === false) setSnapshot(EMPTY_SNAPSHOT)
      else setSnapshot({
        calls: Array.isArray(data.calls) ? data.calls : [],
        conferences: Array.isArray(data.conferences) ? data.conferences : [],
      })
    } catch {
      setPollDegraded(true)
    }
  }, [inactiveRoute])

  useEffect(() => {
    if (inactiveRoute) return undefined
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [poll, inactiveRoute])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onActiveCall = event => {
      const hint = createActiveCallHint(event.detail)
      if (!hint) return
      connectionCleanups.current.get(hint.id)?.()
      setLocalHints(current => [...current.filter(item => item.id !== hint.id), hint])

      const finish = () => {
        setLocalHints(current => current.filter(item => item.id !== hint.id))
        connectionCleanups.current.get(hint.id)?.()
        connectionCleanups.current.delete(hint.id)
        setTimeout(poll, 250)
      }
      const events = ['disconnect', 'cancel', 'reject', 'error']
      events.forEach(name => hint.connection?.on?.(name, finish))
      connectionCleanups.current.set(hint.id, () => {
        events.forEach(name => hint.connection?.off?.(name, finish))
      })
      poll()
    }
    window.addEventListener('fcc:active-call', onActiveCall)
    return () => {
      window.removeEventListener('fcc:active-call', onActiveCall)
      connectionCleanups.current.forEach(cleanup => cleanup())
      connectionCleanups.current.clear()
    }
  }, [poll])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const update = () => setAvoidVideoDock(!!(window.__fccCallActive || window.__fccConferenceActive))
    const onVideoStart = () => setAvoidVideoDock(true)
    update()
    window.addEventListener('fcc:start-video-call', onVideoStart)
    const timer = setInterval(update, 1000)
    return () => {
      window.removeEventListener('fcc:start-video-call', onVideoStart)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!entries.length) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [entries.length])

  const showFlash = useCallback((message, error = false) => {
    setFlash({ message, error })
    setTimeout(() => setFlash(null), 3500)
  }, [])

  const hangup = async entry => {
    if (busyIds.has(entry.id)) return
    setBusyIds(current => new Set(current).add(entry.id))
    try {
      const response = await fetch('/api/twilio/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.target),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Hang-up failed')
      try { entry.connection?.disconnect?.() } catch {}
      setSnapshot(current => removeTarget(current, entry.target))
      setLocalHints(current => current.filter(hint => hint.id !== entry.id))
      showFlash(data.terminated ? `${entry.label} disconnected` : `${entry.label} was already disconnected`)
      setTimeout(poll, 600)
    } catch (error) {
      showFlash(error.message || 'Hang-up failed', true)
    } finally {
      setBusyIds(current => {
        const next = new Set(current)
        next.delete(entry.id)
        return next
      })
    }
  }

  const toggleHold = async entry => {
    if (!entry.conferenceName || busyHoldIds.has(entry.id)) return
    const nextHeld = !entry.held
    setBusyHoldIds(current => new Set(current).add(entry.id))
    try {
      const response = await fetch('/api/twilio/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf: entry.conferenceName, hold: nextHeld }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || `${nextHeld ? 'Hold' : 'Resume'} failed`)
      setHoldOverrides(current => new Map(current).set(entry.id, nextHeld))
      showFlash(`${entry.label} ${nextHeld ? 'is on hold' : 'resumed'}`)
      setTimeout(poll, 600)
    } catch (error) {
      showFlash(error.message || `${nextHeld ? 'Hold' : 'Resume'} failed`, true)
    } finally {
      setBusyHoldIds(current => {
        const next = new Set(current)
        next.delete(entry.id)
        return next
      })
    }
  }

  const killAll = async () => {
    setMenuOpen(false)
    if (!window.confirm('End every active Twilio phone call? This disconnects all calls and conferences.')) return
    setBusyAll(true)
    try {
      const response = await fetch('/api/twilio/kill-all', { method: 'POST' })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Emergency hang-up failed')
      localHints.forEach(hint => { try { hint.connection?.disconnect?.() } catch {} })
      setSnapshot(EMPTY_SNAPSHOT)
      setLocalHints([])
      showFlash(`${data.killed || 0} Twilio call${data.killed === 1 ? '' : 's'} disconnected`)
    } catch (error) {
      showFlash(error.message || 'Emergency hang-up failed', true)
    } finally {
      setBusyAll(false)
      setTimeout(poll, 600)
    }
  }

  const side = isMobile || avoidVideoDock ? { left: 12 } : { right: 18 }
  if (!entries.length && !flash) return null

  return (
    <>
      {flash && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed',
          bottom: entries.length ? (isMobile ? 176 : 116) : 24,
          ...side,
          zIndex: 10001,
          maxWidth: 'min(320px, calc(100vw - 24px))',
          padding: '8px 12px',
          borderRadius: 8,
          border: `1px solid ${flash.error ? 'var(--red)' : 'var(--border)'}`,
          background: 'var(--surface2)',
          color: flash.error ? 'var(--red)' : 'var(--text)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          fontSize: 12,
          fontWeight: 750,
        }}>
          {flash.message}
        </div>
      )}
      {entries.length > 0 && (
        <section
          role="region"
          aria-label="Active phone calls"
          style={{
            position: 'fixed',
            bottom: isMobile ? 88 : 18,
            ...side,
            zIndex: 10000,
            width: 'min(340px, calc(100vw - 24px))',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: 'color-mix(in srgb, var(--surface2) 94%, transparent)',
            color: 'var(--text)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.34)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 7px 0 10px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 900, letterSpacing: '0.08em' }}>PHONE</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{entries.length} active</span>
            {pollDegraded && (
              <span role="status" title="Showing the last verified Twilio call status" style={{ color: 'var(--orange, #d97706)', fontSize: 10, fontWeight: 800 }}>
                Call status unavailable
              </span>
            )}
            <button
              type="button"
              aria-label="More call controls"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(open => !open)}
              disabled={busyAll}
              style={{ marginLeft: 'auto', width: 48, height: 48, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <MoreHorizontal size={19} aria-hidden="true" />
            </button>
          </div>
          {menuOpen && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <button
                type="button"
                onClick={killAll}
                disabled={busyAll}
                style={{ width: '100%', minHeight: 48, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--red)', cursor: busyAll ? 'wait' : 'pointer', fontSize: 12, fontWeight: 800 }}
              >
                End all Twilio calls…
              </button>
            </div>
          )}
          <div style={{ maxHeight: 'min(276px, 42vh)', overflowY: 'auto' }}>
            {entries.map(entry => (
              <CallRow
                key={entry.id}
                entry={entry}
                busy={busyIds.has(entry.id)}
                holdBusy={busyHoldIds.has(entry.id)}
                now={now}
                onHangup={hangup}
                onToggleHold={toggleHold}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
