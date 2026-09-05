'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import IntegrationGate from '../components/IntegrationGate'
import { slugifyForRoom } from '@/lib/videoMeet'
import { Video } from 'lucide-react'
import { reportClientError } from '../components/reportClientError'

/**
 * IMPORTANT — iframe lifecycle:
 * Daily's iframe pauses its media tracks if it's unmounted or hidden via
 * display:none. We therefore keep the meeting iframe mounted continuously
 * while a meeting is live. "Minimize" only shrinks the frame's visible
 * height — the iframe element itself stays in the DOM so the audio
 * connection on the other side is never dropped.
 */

const STORAGE = 'fcc.conference.viewState.v1'
const loadView = () => {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(STORAGE) || '{}') } catch { return {} }
}
const saveView = (v) => {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(STORAGE, JSON.stringify(v)) } catch {}
}

async function createDailyRoom(seed, persistent = false) {
  const r = await fetch('/api/video/create-room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: seed || 'meeting', persistent }),
  }).then(r => r.json())
  if (!r.url) throw new Error(r.error || 'Failed to create room')
  return { url: r.url, name: r.name }
}

async function api(action, body = {}) {
  const r = await fetch('/api/conference', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  return r.json()
}

async function sendInviteEmail({ to, name, subject, note, when, url }) {
  return fetch('/api/video/invite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, name, subject, note, when, persistent: !!when, seed: name, urlOverride: url }),
  }).then(r => r.json()).catch(() => null)
}

// ============================================================================
function ConferenceCenterContent({ compact = false } = {}) {
  const [meetings, setMeetings] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeMeeting, setActiveMeeting] = useState(null)
  const [minimized, setMinimized] = useState(false)
  const [toast, setToast] = useState(null)
  const intentionallyEndedMeetingIdsRef = useRef(new Set())

  const initial = loadView()
  const [mode, setMode] = useState(initial.mode || 'now')

  useEffect(() => { saveView({ mode }) }, [mode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__fccConferenceActive = !!activeMeeting
    return () => { window.__fccConferenceActive = false }
  }, [activeMeeting])

  const flash = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/conference', { cache: 'no-store' }).then(r => r.json())
      if (!r.ok) throw new Error(r.error || 'Load failed')
      setMeetings(r.meetings || [])
      setRooms(r.rooms || [])
    } catch (e) {
      flash(`Load failed: ${e.message}`, 'err')
    } finally { setLoading(false) }
  }, [flash])

  useEffect(() => { reload() }, [reload])

  // Keep activeMeeting in sync with the latest server state, but never let it
  // briefly drop to null and back (which would unmount the iframe).
  useEffect(() => {
    if (!activeMeeting) {
      const live = meetings.find(m => (
        m.status === 'live' && !intentionallyEndedMeetingIdsRef.current.has(m.id)
      ))
      if (live) setActiveMeeting(live)
      return
    }
    const updated = meetings.find(m => m.id === activeMeeting.id)
    if (intentionallyEndedMeetingIdsRef.current.has(activeMeeting.id)) {
      setActiveMeeting(null)
      setMinimized(false)
      return
    }
    if (updated && updated.status !== 'live' && activeMeeting.status === 'live') {
      setActiveMeeting(null)
      setMinimized(false)
      return
    }
    if (updated && updated !== activeMeeting) setActiveMeeting(updated)
  }, [meetings, activeMeeting])

  // -------- Actions --------
  const startInstant = async ({ title, contact, participants = [] }) => {
    const seed = slugifyForRoom(title || contact?.name || 'instant')
    const { url, name } = await createDailyRoom(seed, false)
    const r = await api('create_meeting', {
      meeting: {
        type: 'instant', title: title || `Meeting with ${contact?.name || 'guest'}`,
        room: name, url, participants, linkedTo: contact?.linkedTo || {},
      },
    })
    if (!r.ok) throw new Error(r.error || 'Could not create meeting')
    setActiveMeeting(r.meeting)
    setMinimized(false)
    await reload()
    flash('Meeting started')
  }

  const scheduleMeeting = async ({ title, scheduledAt, durationMinutes, contact, participants = [], note }) => {
    const seed = slugifyForRoom(title || contact?.name || 'scheduled')
    const { url, name } = await createDailyRoom(seed, true)
    const r = await api('create_meeting', {
      meeting: {
        type: 'scheduled', title, scheduledAt, durationMinutes,
        room: name, url, participants, linkedTo: contact?.linkedTo || {},
        notes: note || '',
      },
    })
    if (!r.ok) throw new Error(r.error || 'Could not schedule')
    let sent = 0
    for (const p of participants) {
      if (p.email) {
        const inv = await sendInviteEmail({ to: p.email, name: title, subject: title || 'Meeting invite', note, url, when: scheduledAt })
        if (inv?.ok || inv?.id) sent++
      }
    }
    await reload()
    flash(`Scheduled — ${sent} invite${sent === 1 ? '' : 's'} sent`)
  }

  const joinUrl = async (urlOrRoom) => {
    const looksLikeUrl = /^https?:\/\//.test(urlOrRoom)
    const sub = process.env.NEXT_PUBLIC_DAILY_SUBDOMAIN || 'farringtondev'
    if (!looksLikeUrl && !sub) {
      flash('Daily is not configured. Add NEXT_PUBLIC_DAILY_SUBDOMAIN in Settings → Integrations.', 'err')
      return
    }
    const url = looksLikeUrl ? urlOrRoom : `https://${sub}.daily.co/${urlOrRoom.replace(/^.*\//, '')}`
    const r = await api('create_meeting', {
      meeting: { type: 'instant', title: `Joined ${urlOrRoom.replace(/^https?:\/\//, '').slice(0, 40)}`, room: null, url },
    })
    if (!r.ok) throw new Error(r.error || 'Could not join')
    setActiveMeeting(r.meeting)
    setMinimized(false)
    await reload()
  }

  const finishMeeting = async (meeting) => {
    if (!meeting) return
    const endsForEveryone = !!meeting.room
    const confirmation = endsForEveryone
      ? 'End this meeting for everyone? All participants will be disconnected.'
      : 'Leave this meeting? This closes your CRM meeting view only.'
    if (!confirm(confirmation)) return

    try {
      if (endsForEveryone) {
        const response = await fetch('/api/video/end-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: meeting.room }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.ok) throw new Error(result.error || 'Daily could not end the meeting')
        intentionallyEndedMeetingIdsRef.current.add(meeting.id)
        if (activeMeeting?.id === meeting.id) {
          setActiveMeeting(null)
          setMinimized(false)
        }
      }

      const result = await api('end_meeting', { id: meeting.id })
      if (!result.ok) throw new Error(result.error || 'Could not update the meeting record')
      if (!endsForEveryone) {
        intentionallyEndedMeetingIdsRef.current.add(meeting.id)
        if (activeMeeting?.id === meeting.id) {
          setActiveMeeting(null)
          setMinimized(false)
        }
      }
      await reload()
      flash(endsForEveryone ? 'Meeting ended' : 'Meeting left')
    } catch (e) {
      // Route the failure to /api/client-error so it reaches the journal and the
      // ntfy topic. This path was previously invisible on the server: the
      // end-room route logged nothing on any branch, so a failed "End meeting"
      // left no trace at all to debug from.
      reportClientError(e, { kind: 'video-end-meeting' })
      const stillLive = /still reports|remains active/i.test(e.message || '')
      flash(
        stillLive
          ? `Still ending — Daily hasn't released everyone yet. Give it a few seconds and press End again.`
          : `${endsForEveryone ? 'End' : 'Leave'} failed: ${e.message}`,
        'err',
      )
    }
  }

  const endActive = () => finishMeeting(activeMeeting)

  const useRoom = async (room) => {
    await api('bump_room', { id: room.id })
    const r = await api('create_meeting', {
      meeting: { type: 'instant', title: room.name, room: room.slug, url: room.url, linkedTo: room.linkedTo || {} },
    })
    if (r.ok) { setActiveMeeting(r.meeting); setMinimized(false); await reload() }
  }

  const toggleRoomPin = async (room) => {
    await api('update_room', { id: room.id, patch: { isPinned: !room.isPinned } })
    await reload()
  }

  const deleteRoom = async (room) => {
    if (!confirm(`Delete saved room "${room.name}"?`)) return
    await api('delete_room', { id: room.id })
    await reload()
  }

  const saveRoomFromMeeting = async () => {
    if (!activeMeeting?.url) return
    const name = prompt('Save this room as:', activeMeeting.title || 'Saved Room')
    if (!name) return
    await api('create_room', { room: { name, slug: activeMeeting.room, url: activeMeeting.url, isPinned: true, linkedTo: activeMeeting.linkedTo } })
    await reload()
    flash('Room saved')
  }

  // Today's meetings
  const today = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    return meetings.filter(m => {
      if (m.status === 'live') return true
      if (m.status === 'scheduled' && m.scheduledAt) {
        const t = new Date(m.scheduledAt)
        return t >= start && t < end
      }
      return false
    })
  }, [meetings])

  return (
    <div className={compact ? '' : 'command-workspace p-4 sm:p-5'} style={{ paddingBottom: activeMeeting && minimized ? 120 : undefined }}>
      {!compact && <PageHeader icon={<Video size={20} />} title="Conference" subtitle={`${meetings.filter(m => m.status === 'live').length} live · ${today.length} today · ${rooms.length} saved`} />}
      <Toast toast={toast} />

      {/* Active meeting — full or minimized. Iframe ALWAYS stays mounted while
          activeMeeting is set, so the audio connection never drops. */}
      {activeMeeting && (
        <ActiveMeeting
          meeting={activeMeeting}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setMinimized(false)}
          onEnd={endActive}
          onSave={saveRoomFromMeeting}
        />
      )}

      {/* Two columns fill the viewport: compose on the left, everything live on the right. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(330px,390px)_1fr] gap-4 lg:gap-5 items-start">
        <div className="lg:sticky lg:top-2">
          <HeroCTA mode={mode} setMode={setMode} onStartNow={startInstant} onSchedule={scheduleMeeting} onJoin={joinUrl} flash={flash} />
        </div>

        <div className="min-w-0">
          <Section title="Today">
            {today.length === 0 ? (
              <div className="text-sm rounded-lg px-3 py-3" style={{ color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>Nothing scheduled or live today.</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {today.map(m => (
                  <MeetingCard key={m.id} meeting={m}
                    onJoin={() => { setActiveMeeting(m); setMinimized(false) }}
                    onEnd={() => finishMeeting(m)}
                    onDelete={async () => { if (confirm('Delete this meeting?')) { await api('delete_meeting', { id: m.id }); reload() } }} />
                ))}
              </div>
            )}
          </Section>

          <SavedRoomsSection rooms={rooms} onUse={useRoom} onPin={toggleRoomPin} onDelete={deleteRoom} />

          <RecentSection meetings={meetings.filter(m => m.status === 'ended').slice(0, 8)} loading={loading} />
        </div>
      </div>
    </div>
  )
}

export default function ConferenceCenter(props = {}) {
  return (
    <IntegrationGate capability="daily" title="Daily video">
      <ConferenceCenterContent {...props} />
    </IntegrationGate>
  )
}

// ============================================================================
function ActiveMeeting({ meeting, minimized, onMinimize, onMaximize, onEnd, onSave }) {
  const copy = () => navigator.clipboard?.writeText(meeting.url)
  const endLabel = meeting.room ? 'End meeting' : 'Leave meeting'

  // The iframe element below is rendered identically in both states; only its
  // wrapper height + position changes. This guarantees the media tracks stay
  // alive when the user collapses the window.
  return (
    <>
      {/* Top banner is always present so user sees status. */}
      <div className="rounded-2xl mb-5" style={{ background: 'var(--surface)', border: '2px solid #10b981', boxShadow: '0 0 0 4px rgba(16,185,129,0.12)' }}>
        <div className="p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'rgba(16,185,129,0.08)', borderRadius: minimized ? '14px' : '14px 14px 0 0' }}>
          <div className="flex items-center gap-3 min-w-0">
            <span style={{ width: 12, height: 12, background: '#10b981', borderRadius: 6, boxShadow: '0 0 0 4px rgba(16,185,129,0.25)' }} />
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ fontSize: 16, color: 'var(--text)' }}>🔴 LIVE — {meeting.title}</div>
              <div className="font-mono truncate text-xs" style={{ color: 'var(--text-muted)' }}>{meeting.url}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button style={btnGhost} onClick={copy}>📋 Copy link</button>
            <button style={btnGhost} onClick={onSave}>★ Save room</button>
            {minimized
              ? <button style={btnGhost} onClick={onMaximize}>▢ Maximize</button>
              : <button style={btnGhost} onClick={onMinimize} title="Audio stays connected when minimized">_ Minimize</button>}
            <button style={btnDanger} onClick={onEnd}>{endLabel}</button>
          </div>
        </div>

        {/* Iframe wrapper — kept mounted; height collapses on minimize. */}
        <div style={{
          height: minimized ? 0 : 480,
          overflow: 'hidden',
          transition: 'height 0.2s ease',
          borderRadius: '0 0 14px 14px',
          background: '#000',
        }}>
          <iframe
            src={meeting.url}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
            style={{ width: '100%', height: 480, border: 'none', display: 'block' }}
            title={meeting.title}
          />
        </div>
      </div>

      {/* When minimized, render a fixed audio-status strip at the bottom.
          The iframe above is height:0 but still mounted, so audio continues. */}
      {minimized && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--surface)', borderTop: '2px solid #10b981', boxShadow: '0 -4px 16px rgba(0,0,0,0.15)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ width: 10, height: 10, background: '#10b981', borderRadius: 5, animation: 'fdc-pulse 1.5s infinite' }} />
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>🔊 {meeting.title} — audio is live</div>
          </div>
          <div className="flex gap-2">
            <button style={btnPrimary} onClick={onMaximize}>▢ Show video</button>
            <button style={btnDanger} onClick={onEnd}>{endLabel}</button>
          </div>
        </div>
      )}

      <style>{`@keyframes fdc-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7) } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,0) } }`}</style>
    </>
  )
}

// ============================================================================
function HeroCTA({ mode, setMode, onStartNow, onSchedule, onJoin, flash }) {
  return (
    <div className="rounded-xl p-3.5 sm:p-4 mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex gap-1 mb-3.5 p-1 rounded-lg" style={{ background: 'var(--surface2)' }}>
        {[
          { id: 'now', label: 'Start now' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'join', label: 'Join' },
        ].map(t => (
          <button key={t.id} onClick={() => setMode(t.id)}
            style={{
              flex: 1, minHeight: 36, padding: '0 12px',
              fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
              background: mode === t.id ? 'var(--accent)' : 'transparent',
              color: mode === t.id ? 'var(--accent-text)' : 'var(--text)',
              transition: 'background 0.15s',
            }}>{t.label}</button>
        ))}
      </div>
      {mode === 'now' && <NowPanel onStart={onStartNow} flash={flash} />}
      {mode === 'schedule' && <SchedulePanel onSchedule={onSchedule} flash={flash} />}
      {mode === 'join' && <JoinPanel onJoin={onJoin} flash={flash} />}
    </div>
  )
}

function NowPanel({ onStart, flash }) {
  const [title, setTitle] = useState('')
  const [contact, setContact] = useState(null)
  const [participants, setParticipants] = useState([])
  const [busy, setBusy] = useState(false)

  const onContactPick = (c) => {
    setContact(c)
    if (c?.email && !participants.some(p => p.email === c.email)) setParticipants(arr => [...arr, { email: c.email, name: c.name }])
    if (!title && c?.name) setTitle(`Meeting with ${c.name}`)
  }

  const start = async () => {
    setBusy(true)
    try { await onStart({ title: title.trim(), contact, participants }); setTitle(''); setContact(null); setParticipants([]) }
    catch (e) { flash(`Start failed: ${e.message}`, 'err') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <ContactPicker value={contact} onChange={onContactPick} />
      <Field label="Title (optional)">
        <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="What's this meeting about?" />
      </Field>
      <ParticipantChips value={participants} onChange={setParticipants} />
      <button style={btnPrimary} onClick={start} disabled={busy}>
        {busy ? 'Creating room…' : 'Start meeting now'}
      </button>
    </div>
  )
}

function SchedulePanel({ onSchedule, flash }) {
  const [title, setTitle] = useState('')
  const [contact, setContact] = useState(null)
  const [participants, setParticipants] = useState([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('14:00')
  const [duration, setDuration] = useState(30)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const onContactPick = (c) => {
    setContact(c)
    if (c?.email && !participants.some(p => p.email === c.email)) setParticipants(arr => [...arr, { email: c.email, name: c.name }])
    if (!title && c?.name) setTitle(`Meeting with ${c.name}`)
  }

  const schedule = async () => {
    if (!date || !time) { flash('Pick a date and time', 'err'); return }
    if (!title.trim()) { flash('Add a title', 'err'); return }
    setBusy(true)
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString()
      await onSchedule({ title: title.trim(), scheduledAt, durationMinutes: Number(duration) || 30, contact, participants, note })
      setTitle(''); setContact(null); setParticipants([]); setDate(''); setNote('')
    } catch (e) { flash(`Schedule failed: ${e.message}`, 'err') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <ContactPicker value={contact} onChange={onContactPick} />
      <Field label="Title">
        <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="What's this meeting about?" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date">
          <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <input type="time" style={inp} value={time} onChange={e => setTime(e.target.value)} />
        </Field>
        <Field label="Duration (min)">
          <input type="number" style={inp} value={duration} onChange={e => setDuration(e.target.value)} min={5} max={480} />
        </Field>
      </div>
      <ParticipantChips value={participants} onChange={setParticipants} />
      <Field label="Note (sent in invite)">
        <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything to include in the invite email?" />
      </Field>
      <button style={btnPrimary} onClick={schedule} disabled={busy}>
        {busy ? 'Scheduling…' : 'Schedule + send invites'}
      </button>
    </div>
  )
}

function JoinPanel({ onJoin, flash }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const join = async () => {
    if (!val.trim()) return
    setBusy(true)
    try { await onJoin(val.trim()); setVal('') }
    catch (e) { flash(`Join failed: ${e.message}`, 'err') }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <Field label="Room name or full URL">
        <input style={inp} value={val} onChange={e => setVal(e.target.value)} placeholder="https://your-team.daily.co/meeting-name" onKeyDown={e => e.key === 'Enter' && join()} />
      </Field>
      <button style={btnPrimary} onClick={join} disabled={busy || !val.trim()}>{busy ? 'Joining…' : 'Join room'}</button>
    </div>
  )
}

// ============================================================================
function ContactPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const debounce = useRef(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!query.trim()) { setResults([]); return }
    debounce.current = setTimeout(async () => {
      const [accountsR, contactsR, leadsR] = await Promise.all([
        fetch('/api/accounts').then(r => r.json()).catch(() => null),
        fetch('/api/contacts').then(r => r.json()).catch(() => null),
        fetch(`/api/leads?q=${encodeURIComponent(query)}&limit=8`).then(r => r.json()).catch(() => null),
      ])
      const q = query.toLowerCase()
      const matches = []
      for (const a of (accountsR?.accounts || [])) {
        if ((a.name || '').toLowerCase().includes(q)) matches.push({ kind: 'account', id: a.id, name: a.name, email: a.email, linkedTo: { accountId: a.id } })
      }
      for (const c of (contactsR?.contacts || [])) {
        if ((c.name || '').toLowerCase().includes(q)) matches.push({ kind: 'contact', id: c.id, name: c.name, email: c.email, linkedTo: { contactId: c.id, accountId: c.accountId } })
      }
      for (const l of (leadsR?.leads || [])) {
        if ((l.name || '').toLowerCase().includes(q)) matches.push({ kind: 'lead', id: l.id, name: l.name, email: l.email, linkedTo: { leadId: l.id } })
      }
      setResults(matches.slice(0, 12))
    }, 180)
    return () => clearTimeout(debounce.current)
  }, [query])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: 'var(--accent-soft, rgba(59,130,246,0.1))', border: '1px solid var(--accent, #3b82f6)' }}>
        <div className="min-w-0">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{value.kind}</div>
          <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{value.name}</div>
          {value.email && <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{value.email}</div>}
        </div>
        <button style={btnGhost} onClick={() => onChange(null)}>Change</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Field label="Find someone in your CRM (optional)">
        <input style={inp} value={query} onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          placeholder="Type a name — leads, accounts, contacts" />
      </Field>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg max-h-72 overflow-auto"
             style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
          {results.map(r => (
            <button key={`${r.kind}-${r.id}`} className="w-full text-left px-3 py-2"
              style={{ borderBottom: '1px solid var(--border)', background: 'transparent', minHeight: 56, cursor: 'pointer' }}
              onClick={() => { onChange(r); setQuery(''); setResults([]); setOpen(false) }}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.kind}</div>
              </div>
              {r.email && <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{r.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
function ParticipantChips({ value, onChange }) {
  const [input, setInput] = useState('')
  const add = () => {
    const email = input.trim()
    if (email && email.includes('@') && !value.some(v => v.email === email)) onChange([...value, { email }])
    setInput('')
  }
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i))
  return (
    <Field label="Invitees (email)">
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', minHeight: 48 }}>
        {value.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {p.name ? `${p.name} <${p.email}>` : p.email}
            <button onClick={() => remove(i)} className="opacity-60" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
          </span>
        ))}
        <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', flex: 1, minWidth: 140, fontSize: 13, padding: '4px' }}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); add() } else if (e.key === 'Backspace' && !input && value.length) { remove(value.length - 1) } }}
          placeholder="Add email + Enter" />
      </div>
    </Field>
  )
}

// ============================================================================
function MeetingCard({ meeting, onJoin, onEnd, onDelete }) {
  const isLive = meeting.status === 'live'
  const when = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null
  const timeStr = when ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid ' + (isLive ? '#10b981' : 'var(--border)') }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold truncate" style={{ color: 'var(--text)', fontSize: 15 }}>{meeting.title}</div>
          {timeStr && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeStr} · {meeting.durationMinutes || 30} min</div>}
        </div>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: isLive ? '#10b981' : 'var(--surface2)', color: isLive ? '#fff' : 'var(--text-muted)', fontWeight: 600 }}>
          {isLive ? '● LIVE' : 'Scheduled'}
        </span>
      </div>
      {meeting.participants?.length > 0 && (
        <div className="text-xs truncate mb-3" style={{ color: 'var(--text-muted)' }}>
          With {meeting.participants.map(p => p.name || p.email).join(', ')}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button style={{ ...btnPrimary, flex: 1, minHeight: 44 }} onClick={onJoin}>{isLive ? '⤴ Rejoin' : '▶ Join'}</button>
        {isLive && <button style={btnDanger} onClick={onEnd}>{meeting.room ? 'End meeting' : 'Leave meeting'}</button>}
        <button style={btnGhost} onClick={onDelete}>🗑</button>
      </div>
    </div>
  )
}

// ============================================================================
function SavedRoomsSection({ rooms, onUse, onPin, onDelete }) {
  const [open, setOpen] = useState(rooms.length > 0)
  return (
    <Section title={`Saved rooms${rooms.length ? ` (${rooms.length})` : ''}`} open={open} onToggle={() => setOpen(o => !o)} collapsible>
      {open && (rooms.length === 0 ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No saved rooms yet. After starting a meeting, click ★ Save room to keep its URL for next time.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rooms.map(r => (
            <div key={r.id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{r.isPinned && '★ '}{r.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.url}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button style={btnGhostSm} onClick={() => onPin(r)} title={r.isPinned ? 'Unpin' : 'Pin'}>★</button>
                <button style={btnGhostSm} onClick={() => onDelete(r)} title="Delete">🗑</button>
                <button style={{ ...btnPrimary, minHeight: 40, padding: '6px 14px' }} onClick={() => onUse(r)}>Use</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </Section>
  )
}

function RecentSection({ meetings, loading }) {
  const [open, setOpen] = useState(false)
  return (
    <Section title={`Recent meetings${meetings.length ? ` (${meetings.length})` : ''}`} open={open} onToggle={() => setOpen(o => !o)} collapsible>
      {open && (loading ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : meetings.length === 0 ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No past meetings yet.</div>
      ) : (
        <ul className="flex flex-col">
          {meetings.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-2 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <div className="truncate text-sm" style={{ color: 'var(--text)' }}>{m.title}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.endedAt ? new Date(m.endedAt).toLocaleString() : '—'}</div>
              </div>
            </li>
          ))}
        </ul>
      ))}
    </Section>
  )
}

// ============================================================================
function Section({ title, children, open, onToggle, collapsible }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</h2>
        {collapsible && <button style={btnGhostSm} onClick={onToggle}>{open ? '▴ Hide' : '▾ Show'}</button>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className="fixed top-4 left-1/2 z-50 px-4 py-3 rounded-lg" style={{
      transform: 'translateX(-50%)',
      background: toast.kind === 'err' ? '#dc2626' : '#10b981', color: '#fff',
      fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    }}>{toast.msg}</div>
  )
}

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, outline: 'none', minHeight: 40, fontFamily: 'inherit' }
const btnPrimary = { background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 40 }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', minHeight: 34 }
const btnGhostSm = { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '5px 9px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }
const btnDanger = { background: '#dc2626', color: '#fff', border: '1px solid #b91c1c', padding: '9px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 48 }
