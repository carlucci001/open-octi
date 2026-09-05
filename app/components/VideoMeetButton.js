'use client'
import { useState } from 'react'
import IntegrationGate from './IntegrationGate'

// Reusable video-meet button. Place anywhere you have a recipient email.
// Props:
//   to (email), name (display name), seed (for room-name readability),
//   linkedTo ({ accountId?, contactId?, opportunityId?, leadId? }) — for activity logging,
//   compact (bool) — smaller style,
//   label (string) — override the button label
export default function VideoMeetButton(props) {
  return <IntegrationGate capability={['daily', 'resend']} title="video invitations"><VideoMeetButtonContent {...props} /></IntegrationGate>
}

function VideoMeetButtonContent({ to, name, seed, linkedTo, compact = false, label, instant = false, stopPropagation = false, className = '', style = {} }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    to: to || '',
    name: name || '',
    subject: '',
    note: '',
    when: '',
    persistent: false,
  })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const start = async (event) => {
    if (stopPropagation) event?.stopPropagation()
    if (instant) {
      await startInstant()
      return
    }
    setForm(f => ({ ...f, to: to || f.to, name: name || f.name }))
    setResult(null)
    setOpen(true)
  }

  const startInstant = async () => {
    if (sending) return
    const email = String(to || '').trim()
    if (!email || !email.includes('@')) {
      setResult({ ok: false, error: 'Valid email required' })
      return
    }
    setSending(true)
    setResult(null)
    try {
      const room = await fetch('/api/video/create-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seed || name || 'Meeting', persistent: false }),
      }).then(r => r.json())
      if (!room.url) throw new Error(room.error || 'Failed to start room')

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fcc:start-video-call', {
          detail: {
            url: room.url,
            accountId: linkedTo?.accountId,
            accountName: name || email || 'Video Call',
          },
        }))
      }

      const invite = await fetch('/api/video/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          name: name || email,
          subject: 'Video link from Carl - join when ready',
          note: "Here's the video link. It opens in your browser; no install, password, or account needed.",
          seed: seed || name || 'Meeting',
          linkedTo,
          existingUrl: room.url,
          existingRoom: room.name,
        }),
      }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))

      if (invite.ok) setResult({ ok: true, message: 'Room open; invite sent.' })
      else setResult({ ok: false, error: `${invite.error || 'Email failed'} - room is open.` })
      setTimeout(() => setResult(null), 5000)
    } catch (e) {
      setResult({ ok: false, error: e.message || 'Video start failed' })
    } finally {
      setSending(false)
    }
  }

  const send = async () => {
    if (!form.to || !form.to.includes('@')) { setResult({ ok: false, error: 'Valid email required' }); return }
    setSending(true)
    const r = await fetch('/api/video/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, seed: seed || form.name, linkedTo }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
    setSending(false)
    setResult(r)
    if (r.ok) setTimeout(() => setOpen(false), 1500)
  }

  const startNow = async () => {
    try {
      const r = await fetch('/api/video/create-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seed || name || 'Meeting' }),
      }).then(r => r.json())
      if (r.url) window.open(r.url, '_blank', 'noopener')
      else setResult({ ok: false, error: r.error || 'Failed to start room' })
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
  }

  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

  const btnStyle = compact
    ? { background: 'var(--surface2)', color: 'var(--purple)', border: '1px solid var(--border)', padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer' }
    : { background: 'var(--purple-soft)', color: 'var(--purple)', border: '1px solid var(--purple)', padding: '8px 14px', fontSize: 13, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }
  const hasIconLabel = label != null && typeof label !== 'string' && typeof label !== 'number'

  return (
    <>
      <button
        onClick={start}
        disabled={sending}
        className={className}
        style={{
          ...btnStyle,
          ...style,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? 4 : 6,
          lineHeight: 1,
          verticalAlign: 'middle',
          boxSizing: 'border-box',
          ...(hasIconLabel ? { padding: 0 } : {}),
          opacity: sending ? 0.65 : 1,
          cursor: sending ? 'wait' : 'pointer',
        }}
        data-tooltip={instant ? 'Open a room now and email the join link' : 'Send a video-call link via email'}
      >
        {hasIconLabel
          ? <span className="inline-flex h-full w-full items-center justify-center leading-none">{label}</span>
          : <>🎥 {label || (compact ? 'Video' : 'Video Call')}</>}
      </button>

      {instant && result && (
        <span className="text-[10px]" style={{ color: result.ok ? 'var(--green)' : 'var(--red)' }}>
          {result.ok ? (result.message || 'Invite sent') : result.error}
        </span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => !sending && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl p-6 animate-fade-in" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>🎥 Send video-call invite</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>No install or account needed — opens in any browser.</p>

            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>To * <span className="font-normal opacity-70">(comma-separate multiple emails)</span></label>
              <input type="text" style={inp} value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} placeholder="redacted@example.invalid, redacted@example.invalid" autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3">
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Their name</label>
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Marge" />
              </div>
              <div className="mb-3">
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>When (optional)</label>
                <input type="datetime-local" style={inp} value={form.when} onChange={e => setForm(f => ({ ...f, when: e.target.value }))} />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Subject (optional)</label>
              <input style={inp} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder={`Video call with ${form.name || 'Carl'}`} />
            </div>

            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Message (optional)</label>
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Add a short note..." />
            </div>

            <label className="flex items-center gap-2 text-xs mb-4 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={form.persistent} onChange={e => setForm(f => ({ ...f, persistent: e.target.checked }))} />
              <span>Use a permanent room (same link every time — good for recurring 1:1s)</span>
            </label>

            {result && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{
                background: result.ok ? 'var(--green-soft)' : 'var(--red-soft)',
                color: result.ok ? 'var(--green)' : 'var(--red)',
                border: `1px solid ${result.ok ? 'var(--green)' : 'var(--red)'}`,
              }}>
                {result.ok ? `✓ Invite sent to ${result.sentTo}` : `⚠ ${result.error}`}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={send} disabled={sending || !form.to} className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                {sending ? '⟳ Sending…' : '📧 Send Invite'}
              </button>
              <button onClick={startNow} className="px-3 py-2 rounded-lg text-sm" data-tooltip="Open the room now in a new tab"
                style={{ background: 'var(--green)', color: 'var(--accent-text)' }}>
                ▶ Start Now
              </button>
              <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
