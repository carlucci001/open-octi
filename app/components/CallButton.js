'use client'
import { useEffect, useState, useRef } from 'react'

// In-browser Twilio Voice SDK call button.
// Audio routes through the user's computer speakers and mic — no external phone.
// Drop-in replacement for tel: or gvCallUrl anchor tags across the CRM.
// Conference-based under the hood so Hold/Resume with Twilio's default music works natively.

export default function CallButton({
  phone,
  name = '',
  label,
  inline = false,
  stopPropagation = false,
  className = 'hover:underline',
  style = {},
}) {
  const [state, setState] = useState('idle') // idle | connecting | ringing | in-call | held | error
  const [errorMsg, setErrorMsg] = useState('')
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const confRef = useRef(null)

  const endCall = (e) => {
    if (stopPropagation && e) e.stopPropagation()
    // Belt-and-suspenders: disconnect the browser leg AND tell the server to terminate
    // every participant in the conference, so no leg is left ringing or connected to silence.
    try { callRef.current?.disconnect() } catch {}
    if (confRef.current) {
      const conf = confRef.current
      fetch('/api/twilio/hangup-conf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf }),
      }).catch(() => {})
    }
    callRef.current = null
    confRef.current = null
    setState('idle')
  }

  const toggleHold = async (e) => {
    if (stopPropagation && e) e.stopPropagation()
    if (!confRef.current) return
    const holdNow = state !== 'held'
    try {
      const r = await fetch('/api/twilio/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf: confRef.current, hold: holdNow }),
      }).then(res => res.json())
      if (r.ok) setState(holdNow ? 'held' : 'in-call')
      else { setErrorMsg(r.error || 'Hold failed'); setTimeout(() => setErrorMsg(''), 4000) }
    } catch (err) {
      setErrorMsg(err.message); setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  const call = async (e) => {
    if (stopPropagation && e) e.stopPropagation()
    setErrorMsg('')
    setState('connecting')
    try {
      const { Device } = await import('@twilio/voice-sdk')
      const tokenRes = await fetch('/api/twilio/token').then(r => r.json())
      if (tokenRes.error) throw new Error(tokenRes.error)

      const device = new Device(tokenRes.token, { codecPreferences: ['opus', 'pcmu'] })
      deviceRef.current = device

      // Unique conference name per call — server uses this to bridge both legs + enable hold
      const confName = 'ff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      confRef.current = confName

      const connection = await device.connect({ params: { To: phone, Conf: confName } })
      callRef.current = connection
      setState('ringing')

      connection.on('accept', () => setState('in-call'))
      connection.on('disconnect', () => { setState('idle'); callRef.current = null; confRef.current = null; try { device.destroy() } catch {} })
      connection.on('cancel', () => { setState('idle'); callRef.current = null; confRef.current = null })
      connection.on('reject', () => { setState('error'); setErrorMsg('Rejected'); callRef.current = null; confRef.current = null })
      connection.on('error', (err) => { setState('error'); setErrorMsg(err?.message || 'call error'); callRef.current = null; confRef.current = null })
    } catch (err) {
      setState('error')
      setErrorMsg(err?.message || 'Failed to start call')
      setTimeout(() => { setState('idle'); setErrorMsg('') }, 5000)
    }
  }

  const customLabelNode = label != null && typeof label !== 'string' && typeof label !== 'number'
  const displayLabel = label ?? phone
  const prefix = inline ? '' : '📞 '

  const text = customLabelNode
    ? (state === 'error' ? '⚠' : displayLabel)
    : ({
      idle: `${prefix}${displayLabel}`,
      connecting: `${prefix}Connecting...`,
      ringing: `${prefix}Ringing ${name || ''}...`.trim(),
      'in-call': `${prefix}On call · Hang up`,
      held: `${prefix}On HOLD · Hang up`,
      error: `⚠ ${errorMsg}`,
    }[state])

  const color = state === 'error' ? 'var(--red)' : state === 'in-call' ? 'var(--green)' : state === 'held' ? 'var(--amber)' : 'var(--accent)'

  const isActive = state === 'ringing' || state === 'in-call' || state === 'held' || state === 'connecting'

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccPhoneCallActive = isActive
    return () => { window.__fccPhoneCallActive = false }
  }, [isActive])

  return (
    <span className="inline-flex items-center gap-2" style={{ width: style?.width }}>
      <button
        onClick={isActive ? endCall : call}
        className={className}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color, ...style }}
        title={isActive ? 'Click to hang up' : `Call ${name || phone}`}
      >
        {text}
      </button>
      {(state === 'in-call' || state === 'held') && (
        <button
          onClick={toggleHold}
          className="text-xs px-2 py-0.5 rounded"
          style={{
            background: state === 'held' ? 'var(--amber)' : 'var(--surface2)',
            color: state === 'held' ? 'var(--accent-text)' : 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
          title={state === 'held' ? 'Resume call' : 'Put on hold (plays Twilio hold music)'}
        >
          {state === 'held' ? '▶ Resume' : '⏸ Hold'}
        </button>
      )}
    </span>
  )
}
