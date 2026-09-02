'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import BulkActionsMenu from '../components/BulkActionsMenu'
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const DEFAULT_BOOKING = 'https://calendar.app.google/Lii7ixesgekmiKNn6'
const PAGE_SIZE = 25

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function isToday(iso) { const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString() }
function isPast(iso) { return new Date(iso) < new Date() }
function groupByDay(events) {
  const groups = {}
  for (const e of events) {
    const k = new Date(e.start).toDateString()
    if (!groups[k]) groups[k] = []
    groups[k].push(e)
  }
  return Object.entries(groups).map(([day, evs]) => ({ day, events: evs }))
}

function toLocalInput(iso) {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const get = t => parts.find(p => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
function fromLocalInputToIso(local) {
  if (!local) return ''
  return `${local}:00-04:00`
}

const BLANK_EVENT = { name: '', email: '', phone: '', startLocal: '', durationMin: 30, summary: '', description: '' }

export default function Calendar() {
  const [config, setConfig] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ icalUrl: '', bookingLink: DEFAULT_BOOKING, defaultMeetLink: '' })
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('upcoming')
  const [expandedId, setExpandedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(BLANK_EVENT)
  const [meetLink, setMeetLink] = useState('')
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(BLANK_EVENT)

  const [view, setView] = useState('month') // 'month' | 'week' | 'day' | 'list' — Month is the default view (Carl, 2026-08-21)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [calendarDate, setCalendarDate] = useState(new Date())

  useEffect(() => { if (config?.defaultMeetLink && !meetLink) setMeetLink(config.defaultMeetLink) }, [config, meetLink])
  useEffect(() => { setPage(1); setSelectedIds(new Set()) }, [filter, view])

  const extract = (desc, label) => {
    if (!desc) return ''
    const re = new RegExp(label + '\\s*:\\s*([^\\n\\r]+)', 'i')
    const m = desc.match(re)
    return m ? m[1].trim() : ''
  }
  const showToast = (msg, ms = 3000) => { setToast(msg); setTimeout(() => setToast(''), ms) }

  const loadConfig = async () => {
    const r = await fetch('/api/calendar/config').then(r => r.json())
    setConfig(r)
    setForm({ icalUrl: r.icalUrl || '', bookingLink: r.bookingLink || DEFAULT_BOOKING, defaultMeetLink: r.defaultMeetLink || '' })
    return r
  }
  const loadEvents = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/calendar/events').then(r => r.json())
      if (r.error) { setError(r.error); setEvents([]) }
      else setEvents(r.events || [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { (async () => { const c = await loadConfig(); if (c.icalUrl) await loadEvents(); else setLoading(false) })() }, [])

  useEffect(() => {
    if (!config?.icalUrl) return
    const tick = () => { if (!document.hidden) loadEvents() }
    const id = setInterval(tick, 30000)
    const onVis = () => { if (!document.hidden) loadEvents() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [config?.icalUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveConfig = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/calendar/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json())
      setConfig(r.config)
      setShowSetup(false)
      showToast('✓ Saved')
      if (r.config?.icalUrl) await loadEvents()
    } catch (e) { showToast('⚠ ' + e.message) }
    setSaving(false)
  }

  const beginEdit = (e) => {
    setEditingId(e.id)
    setEditForm({
      name: extract(e.description, 'Name') || e.title.replace(/^.*—\s*/, ''),
      email: extract(e.description, 'Email') || (e.attendees || [])[0] || '',
      phone: extract(e.description, 'Phone') || '',
      startLocal: toLocalInput(e.start),
      durationMin: Math.max(15, Math.round((new Date(e.end || e.start) - new Date(e.start)) / 60000)),
      summary: e.title,
      description: '',
    })
  }
  const cancelEdit = () => { setEditingId(null); setEditForm(BLANK_EVENT) }

  const saveEdit = async (eventId) => {
    setSavingEdit(true)
    try {
      const startIso = fromLocalInputToIso(editForm.startLocal)
      const start = new Date(startIso)
      const end = new Date(start.getTime() + (editForm.durationMin || 30) * 60000)
      const r = await fetch('/api/calendar/update-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId, name: editForm.name, email: editForm.email, phone: editForm.phone,
          startIso, endIso: end.toISOString(),
          summary: editForm.summary || `Client Call - ${editForm.name || 'Guest'}`,
          description: editForm.description,
        }),
      }).then(r => r.json())
      if (r.error) showToast('⚠ ' + r.error)
      else { showToast('✓ Saved'); cancelEdit(); await loadEvents() }
    } catch (e) { showToast('⚠ ' + e.message) }
    setSavingEdit(false)
  }

  const doDelete = async (e) => {
    if (!confirm(`Delete "${e.title}"? Cannot be undone.`)) return
    setDeletingId(e.id)
    try {
      const r = await fetch('/api/calendar/delete-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: e.id }),
      }).then(r => r.json())
      if (r.error) showToast('⚠ ' + r.error)
      else { showToast('✓ Deleted'); setExpandedId(null); await loadEvents() }
    } catch (err) { showToast('⚠ ' + err.message) }
    setDeletingId(null)
  }

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} event${ids.length === 1 ? '' : 's'}? Cannot be undone.`)) return
    setBulkDeleting(true)
    let ok = 0, fail = 0
    for (const id of ids) {
      try {
        const r = await fetch('/api/calendar/delete-event', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: id }),
        }).then(r => r.json())
        if (r.error) fail++; else ok++
      } catch { fail++ }
    }
    setSelectedIds(new Set())
    setBulkDeleting(false)
    showToast(fail ? `✓ ${ok} deleted, ⚠ ${fail} failed` : `✓ ${ok} deleted`, 4000)
    await loadEvents()
  }

  const sendMeet = async (e) => {
    const email = (editForm.email && editForm.email.includes('@'))
      ? editForm.email
      : (extract(e.description, 'Email') || (e.attendees || [])[0] || '')
    if (!email.includes('@')) { showToast('⚠ Enter a valid email'); return }
    setSending(true)
    try {
      const r = await fetch('/api/calendar/send-meet-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          attendeeName: extract(e.description, 'Name') || e.title.split('—').pop().trim(),
          meetLink, eventTitle: e.title, eventStart: e.start,
        }),
      }).then(r => r.json())
      if (r.error) showToast('⚠ ' + r.error)
      else showToast('✓ Video link sent to ' + r.sentTo, 4000)
    } catch (err) { showToast('⚠ ' + err.message) }
    setSending(false)
  }

  const createEvent = async () => {
    if (!createForm.startLocal) { showToast('⚠ Pick a start time'); return }
    if (!createForm.name) { showToast('⚠ Enter a name'); return }
    setCreating(true)
    try {
      const startIso = fromLocalInputToIso(createForm.startLocal)
      const r = await fetch('/api/calendar/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name, email: createForm.email, phone: createForm.phone,
          startIso, durationMinutes: createForm.durationMin || 30,
          summary: createForm.summary || undefined, description: createForm.description,
        }),
      }).then(r => r.json())
      if (!r.ok) showToast('⚠ ' + (r.error || 'Create failed'))
      else { showToast('✓ Created'); setShowCreate(false); setCreateForm(BLANK_EVENT); await loadEvents() }
    } catch (err) { showToast('⚠ ' + err.message) }
    setCreating(false)
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const bookingLink = config?.bookingLink || DEFAULT_BOOKING
  const filtered = events.filter(e => {
    if (filter === 'upcoming') return !isPast(e.end || e.start)
    if (filter === 'today') return isToday(e.start)
    if (filter === 'past') return isPast(e.end || e.start)
    return true
  }).sort((a, b) => new Date(a.start) - new Date(b.start))

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const groups = groupByDay(paged)

  const bigEvents = useMemo(() => events.map(e => ({
    id: e.id, title: e.title, start: new Date(e.start), end: new Date(e.end || e.start), resource: e,
  })), [events])

  const onCalendarSelectSlot = useCallback((slot) => {
    const startLocal = toLocalInput(slot.start.toISOString())
    setCreateForm({ ...BLANK_EVENT, startLocal })
    setShowCreate(true)
  }, [])

  const onCalendarSelectEvent = useCallback((bigEv) => {
    const e = bigEv.resource
    setView('list')
    setExpandedId(e.id)
    setTimeout(() => document.getElementById('event-' + e.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }, [])

  const FIELD_STYLE = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16, padding: '12px 14px', borderRadius: 8, width: '100%' }
  const LABEL_STYLE = { color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const BTN = { padding: '12px 18px', borderRadius: 8, fontSize: 15, fontWeight: 600, minHeight: 48, border: 'none', cursor: 'pointer' }
  const TAB = (active) => ({ ...BTN, padding: '10px 16px', minHeight: 40, fontSize: 14, ...(active ? { background: 'var(--accent)', color: 'var(--accent-text)' } : { background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }) })

  return (
    <div className="command-workspace p-6">
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium animate-fade-in" style={{ background: toast.startsWith('⚠') ? 'var(--red)' : 'var(--green)', color: 'white', minHeight: 44 }}>{toast}</div>}

      <PageHeader
        icon="📅"
        title="Calendar"
        subtitle={config?.calendarName ? `${config.calendarName} · ${filtered.length} event${filtered.length === 1 ? '' : 's'}` : 'Appointments and demos'}
        actions={<>
          <button onClick={() => { setShowCreate(s => !s); setCreateForm(BLANK_EVENT) }} style={{ ...BTN, background: 'var(--green)', color: 'white' }}>
            {showCreate ? '× Cancel' : '+ New Event'}
          </button>
          <a href={bookingLink} target="_blank" rel="noopener noreferrer" style={{ ...BTN, background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>🔗 Booking</a>
          <button onClick={loadEvents} disabled={loading} style={{ ...BTN, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: loading ? 0.6 : 1 }}>{loading ? '⟳ Loading…' : '⟳ Refresh'}</button>
          <button onClick={() => setShowSetup(s => !s)} style={{ ...BTN, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>⚙ Setup</button>
          <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" style={{ ...BTN, background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Google ↗</a>
        </>}
      />

      {showCreate && (
        <div className="rounded-xl p-5 mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text)', fontSize: 16 }}>New Appointment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label style={LABEL_STYLE}>Name *</label><input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} style={FIELD_STYLE} /></div>
            <div><label style={LABEL_STYLE}>Email</label><input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} style={FIELD_STYLE} /></div>
            <div><label style={LABEL_STYLE}>Phone</label><input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} style={FIELD_STYLE} /></div>
            <div><label style={LABEL_STYLE}>Start (Eastern) *</label><input type="datetime-local" value={createForm.startLocal} onChange={e => setCreateForm(f => ({ ...f, startLocal: e.target.value }))} style={FIELD_STYLE} /></div>
            <div><label style={LABEL_STYLE}>Duration (min)</label><input type="number" value={createForm.durationMin} onChange={e => setCreateForm(f => ({ ...f, durationMin: parseInt(e.target.value, 10) || 30 }))} style={FIELD_STYLE} /></div>
            <div><label style={LABEL_STYLE}>Title (override)</label><input value={createForm.summary} onChange={e => setCreateForm(f => ({ ...f, summary: e.target.value }))} placeholder="Client Call - Guest" style={FIELD_STYLE} /></div>
            <div className="md:col-span-2"><label style={LABEL_STYLE}>Notes</label><textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={2} style={FIELD_STYLE} /></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={createEvent} disabled={creating} style={{ ...BTN, background: 'var(--green)', color: 'white', flex: 1, opacity: creating ? 0.5 : 1 }}>{creating ? 'Creating…' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setCreateForm(BLANK_EVENT) }} style={{ ...BTN, background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
          </div>
        </div>
      )}

      {showSetup && (
        <div className="rounded-xl p-5 mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text)', fontSize: 16 }}>Calendar Setup</h3>
          <div className="mb-3"><label style={LABEL_STYLE}>Secret iCal URL</label><textarea value={form.icalUrl} onChange={e => setForm(f => ({ ...f, icalUrl: e.target.value }))} rows={3} style={{ ...FIELD_STYLE, fontFamily: 'monospace', fontSize: 13 }} /></div>
          <div className="mb-3"><label style={LABEL_STYLE}>Booking link</label><input value={form.bookingLink} onChange={e => setForm(f => ({ ...f, bookingLink: e.target.value }))} style={{ ...FIELD_STYLE, fontFamily: 'monospace', fontSize: 13 }} /></div>
          <div className="mb-3"><label style={LABEL_STYLE}>Permanent Meet link</label><input value={form.defaultMeetLink} onChange={e => setForm(f => ({ ...f, defaultMeetLink: e.target.value }))} style={{ ...FIELD_STYLE, fontFamily: 'monospace', fontSize: 13 }} /></div>
          <div className="flex gap-2"><button onClick={saveConfig} disabled={saving} style={{ ...BTN, background: 'var(--accent)', color: 'var(--accent-text)', flex: 1, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button><button onClick={() => setShowSetup(false)} style={{ ...BTN, background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button></div>
        </div>
      )}

      {!config?.icalUrl ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-4xl mb-3">📅</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Connect your calendar (iCal)</h2>
          <button onClick={() => setShowSetup(true)} style={{ ...BTN, background: 'var(--accent)', color: 'var(--accent-text)' }}>Paste iCal URL</button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4, fontWeight: 600 }}>VIEW:</span>
            <button onClick={() => setView('month')} style={TAB(view === 'month')}>🗓 Month</button>
            <button onClick={() => setView('week')} style={TAB(view === 'week')}>📆 Week</button>
            <button onClick={() => setView('day')} style={TAB(view === 'day')}>☼ Day</button>
            <button onClick={() => setView('list')} style={TAB(view === 'list')}>📋 List</button>
            {view === 'list' && (
              <>
                <span style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 8px' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4, fontWeight: 600 }}>FILTER:</span>
                {[{ id: 'upcoming', label: 'Upcoming' }, { id: 'today', label: 'Today' }, { id: 'past', label: 'Past' }, { id: 'all', label: 'All' }].map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)} style={TAB(filter === f.id)}>{f.label}</button>
                ))}
              </>
            )}
          </div>

          {error && <div className="rounded-xl p-4 mb-4 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--border)' }}>⚠ {error}</div>}

          {view !== 'list' ? (
            <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ height: 700 }}>
                <BigCalendar
                  localizer={localizer}
                  events={bigEvents}
                  startAccessor="start"
                  endAccessor="end"
                  view={view === 'month' ? Views.MONTH : view === 'week' ? Views.WEEK : Views.DAY}
                  date={calendarDate}
                  onView={() => {}}
                  onNavigate={d => setCalendarDate(d)}
                  views={[Views.MONTH, Views.WEEK, Views.DAY]}
                  selectable
                  onSelectSlot={onCalendarSelectSlot}
                  onSelectEvent={onCalendarSelectEvent}
                  popup
                  style={{ color: 'var(--text)' }}
                />
              </div>
            </div>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="rounded-xl p-3 mb-3 flex items-center gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <BulkActionsMenu
                    selectedCount={selectedIds.size}
                    totalCount={paged.length}
                    onSelectPage={() => setSelectedIds(new Set(paged.map(event => event.id)))}
                    onClearSelection={() => setSelectedIds(new Set())}
                    onDeleteSelected={bulkDelete}
                    disabled={bulkDeleting}
                  />
                </div>
              )}

              {loading && events.length === 0 ? (
                <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading events…</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No {filter === 'all' ? '' : filter} events.</div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {groups.map(g => (
                      <div key={g.day}>
                        <div className="text-xs uppercase tracking-wider font-semibold mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
                          {new Date(g.day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </div>
                        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          {g.events.map((e, i) => {
                            const isExpanded = expandedId === e.id
                            const isEditing = editingId === e.id
                            const isSelected = selectedIds.has(e.id)
                            const name = extract(e.description, 'Name') || e.title.replace(/^.*—\s*/, '')
                            const phone = extract(e.description, 'Phone')
                            const email = extract(e.description, 'Email') || (e.attendees || [])[0] || ''
                            const gvUrl = phone ? `https://voice.google.com/u/0/calls?a=nc,%2B1${phone.replace(/\D/g, '').slice(-10)}` : null
                            return (
                              <div key={e.id} id={'event-' + e.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                                <div className="w-full px-3 py-3 flex items-start gap-3" style={{ background: isExpanded ? 'var(--surface2)' : 'transparent', minHeight: 64 }}>
                                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)} onClick={ev => ev.stopPropagation()}
                                    style={{ width: 22, height: 22, marginTop: 6, cursor: 'pointer', flexShrink: 0 }} />
                                  <button onClick={() => { setExpandedId(isExpanded ? null : e.id); if (isEditing) cancelEdit() }}
                                    className="flex-1 flex items-start gap-4 text-left"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    <div className="shrink-0 text-right" style={{ minWidth: 90 }}>
                                      <div className="font-semibold font-mono" style={{ color: 'var(--text)', fontSize: 15 }}>{fmtTime(e.start)}</div>
                                      {e.end && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>to {fmtTime(e.end)}</div>}
                                    </div>
                                    <div className="w-1 rounded-full self-stretch shrink-0" style={{ background: 'var(--accent)' }} />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold" style={{ color: 'var(--text)', fontSize: 15 }}>{e.title}</div>
                                      {e.attendees?.length > 0 && <div className="mt-0.5 truncate" style={{ color: 'var(--text-muted)', fontSize: 13 }}>👥 {e.attendees.filter(Boolean).join(', ')}</div>}
                                      {e.description && !isExpanded && <div className="mt-1 line-clamp-2" style={{ color: 'var(--text)', fontSize: 13 }}>{e.description}</div>}
                                    </div>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{isExpanded ? '▾' : '▸'}</span>
                                  </button>
                                </div>

                                {isExpanded && !isEditing && (
                                  <div className="px-5 pb-5 pt-1" style={{ background: 'var(--surface2)' }}>
                                    <div className="grid grid-cols-2 gap-3 mb-4" style={{ fontSize: 14 }}>
                                      {name && <div><div style={LABEL_STYLE}>Name</div><div style={{ color: 'var(--text)' }}>{name}</div></div>}
                                      {phone && <div><div style={LABEL_STYLE}>Phone</div>{gvUrl ? <a href={gvUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>📞 {phone}</a> : <div style={{ color: 'var(--text)' }}>{phone}</div>}</div>}
                                      {email && <div className="col-span-2"><div style={LABEL_STYLE}>Email</div><a href={`mailto:${email}`} style={{ color: 'var(--accent)' }}>{email}</a></div>}
                                    </div>

                                    {config?.defaultMeetLink && (
                                      <div className="mb-3">
                                        <div style={LABEL_STYLE}>Meet link</div>
                                        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                          <span className="font-mono truncate flex-1" style={{ color: 'var(--text)', fontSize: 13 }}>{meetLink}</span>
                                          <button onClick={() => { navigator.clipboard?.writeText(meetLink); showToast('✓ Copied') }} style={{ ...BTN, padding: '8px 12px', minHeight: 36, fontSize: 13, background: 'var(--surface2)', color: 'var(--text-muted)' }}>Copy</button>
                                        </div>
                                        <button onClick={() => sendMeet(e)} disabled={sending || !email} style={{ ...BTN, background: 'var(--green)', color: 'white', width: '100%', opacity: (sending || !email) ? 0.5 : 1 }}>
                                          {sending ? 'Sending…' : `📧 Email Meet link to ${email || 'attendee'}`}
                                        </button>
                                      </div>
                                    )}

                                    <div className="flex gap-2 mt-3 pt-3 flex-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                                      <button onClick={() => beginEdit(e)} style={{ ...BTN, background: 'var(--accent)', color: 'var(--accent-text)' }}>✎ Edit</button>
                                      {e.htmlLink && <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" style={{ ...BTN, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Google ↗</a>}
                                      <div style={{ flex: 1 }} />
                                      <button onClick={() => doDelete(e)} disabled={deletingId === e.id} style={{ ...BTN, background: 'var(--red)', color: 'white', opacity: deletingId === e.id ? 0.5 : 1 }}>
                                        {deletingId === e.id ? 'Deleting…' : '🗑 Delete'}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {isExpanded && isEditing && (
                                  <div className="px-5 pb-5 pt-1" style={{ background: 'var(--surface2)' }}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                      <div><label style={LABEL_STYLE}>Name</label><input value={editForm.name} onChange={ev => setEditForm(f => ({ ...f, name: ev.target.value }))} style={FIELD_STYLE} /></div>
                                      <div><label style={LABEL_STYLE}>Email</label><input type="email" value={editForm.email} onChange={ev => setEditForm(f => ({ ...f, email: ev.target.value }))} style={FIELD_STYLE} /></div>
                                      <div><label style={LABEL_STYLE}>Phone</label><input value={editForm.phone} onChange={ev => setEditForm(f => ({ ...f, phone: ev.target.value }))} style={FIELD_STYLE} /></div>
                                      <div><label style={LABEL_STYLE}>Start (Eastern)</label><input type="datetime-local" value={editForm.startLocal} onChange={ev => setEditForm(f => ({ ...f, startLocal: ev.target.value }))} style={FIELD_STYLE} /></div>
                                      <div><label style={LABEL_STYLE}>Duration (min)</label><input type="number" value={editForm.durationMin} onChange={ev => setEditForm(f => ({ ...f, durationMin: parseInt(ev.target.value, 10) || 30 }))} style={FIELD_STYLE} /></div>
                                      <div><label style={LABEL_STYLE}>Title</label><input value={editForm.summary} onChange={ev => setEditForm(f => ({ ...f, summary: ev.target.value }))} style={FIELD_STYLE} /></div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                      <button onClick={() => saveEdit(e.id)} disabled={savingEdit} style={{ ...BTN, background: 'var(--green)', color: 'white', flex: 1, opacity: savingEdit ? 0.5 : 1 }}>{savingEdit ? 'Saving…' : '✓ Save'}</button>
                                      <button onClick={cancelEdit} style={{ ...BTN, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-5">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        style={{ ...BTN, padding: '10px 16px', minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: page === 1 ? 0.4 : 1 }}>
                        ← Prev
                      </button>
                      <span style={{ padding: '0 14px', color: 'var(--text-muted)', fontSize: 14 }}>Page {page} of {totalPages} · {filtered.length} events</span>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        style={{ ...BTN, padding: '10px 16px', minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: page === totalPages ? 0.4 : 1 }}>
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
