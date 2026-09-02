'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Mail, PhoneCall, RefreshCw, Search, Trash2, UserRound } from 'lucide-react'

const PAGE_SIZE = 12
const RECENTS_KEY = 'fcc-recent-calls'

function formatPhone(value) {
  if (!value) return 'Unknown number'
  const digits = String(value).replace(/\D/g, '').slice(-10)
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value
}

function formatDate(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function durationLabel(seconds) {
  const total = Number(seconds) || 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function getOperatorCalls() {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]').map((call, index) => ({
      id: `operator-${call.at || index}`,
      source: 'operator',
      title: call.name || 'Outbound call',
      from: call.number,
      startedAt: new Date(call.at || Date.now()).toISOString(),
      direction: 'outbound',
      status: 'completed',
      summary: 'Placed from the Command Center dialer.',
      transcript: [],
    }))
  } catch { return [] }
}

export default function Voicemails({ compact = false } = {}) {
  const [messages, setMessages] = useState([])
  const [operatorCalls, setOperatorCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [direction, setDirection] = useState('all')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    setOperatorCalls(getOperatorCalls())
    try {
      const response = await fetch('/api/voicemails', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Could not load call activity')
      setMessages((data.messages || []).map(message => ({ ...message, source: 'agent' })))
    } catch (loadError) { setError(loadError.message) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [query, source, direction])

  const activity = useMemo(() => [...operatorCalls, ...messages]
    .filter(item => source === 'all' || item.source === source)
    .filter(item => direction === 'all' || String(item.direction || '').toLowerCase() === direction)
    .filter(item => {
      const needle = query.trim().toLowerCase()
      return !needle || [item.title, item.from, item.to, item.agentName, item.summary].some(value => String(value || '').toLowerCase().includes(needle))
    })
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)), [operatorCalls, messages, query, source, direction])

  const pages = Math.max(1, Math.ceil(activity.length / PAGE_SIZE))
  const visible = activity.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const removeItems = async ids => {
    if (!ids.length || !confirm(`Delete ${ids.length} selected call record${ids.length === 1 ? '' : 's'}?`)) return
    setBusy(true)
    const operatorIds = new Set(ids.filter(id => id.startsWith('operator-')))
    const agentIds = ids.filter(id => !id.startsWith('operator-'))
    try {
      if (operatorIds.size) {
        const remaining = operatorCalls.filter(item => !operatorIds.has(item.id))
        localStorage.setItem(RECENTS_KEY, JSON.stringify(remaining.map(item => ({ number: item.from, name: item.title === 'Outbound call' ? '' : item.title, at: new Date(item.startedAt).getTime() }))))
        setOperatorCalls(remaining)
      }
      if (agentIds.length) {
        const response = await fetch('/api/voicemails', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: agentIds }) })
        const result = await response.json()
        if (!response.ok || result.error || result.failed) throw new Error(result.error || `${result.failed} record${result.failed === 1 ? '' : 's'} could not be deleted from ElevenLabs`)
        setMessages(current => current.filter(item => !agentIds.includes(item.id)))
      }
      setSelected(new Set())
      setNotice('Call activity deleted.')
    } catch (deleteError) { setNotice(deleteError.message) }
    setBusy(false)
    setTimeout(() => setNotice(''), 5000)
  }

  const emailSelected = async ids => {
    const agentIds = ids.filter(id => !id.startsWith('operator-'))
    if (!agentIds.length) return setNotice('Email summaries are available for AI agent calls.')
    setBusy(true)
    try {
      const result = await fetch('/api/voicemails/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: agentIds }) }).then(response => response.json())
      setNotice(result.error || `Sent ${result.count} call summar${result.count === 1 ? 'y' : 'ies'} to ${result.sentTo}.`)
    } catch (emailError) { setNotice(emailError.message) }
    setBusy(false)
  }

  return (
    <section className={compact ? '' : 'p-4 sm:p-6'} aria-label="Communications activity">
      {notice && <div role="status" className="mb-3 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--accent-soft)', color: 'var(--text)', border: '1px solid var(--border)' }}>{notice}</div>}

      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
        <label className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <span className="sr-only">Search calls</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, number, agent, or summary"
            className="min-h-11 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text)' }} />
        </label>
        <select aria-label="Call source" value={source} onChange={event => setSource(event.target.value)} className="min-h-11 rounded-md px-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="all">All callers</option><option value="operator">Carl / operator</option><option value="agent">OpenClaw / AI agents</option>
        </select>
        <select aria-label="Call direction" value={direction} onChange={event => setDirection(event.target.value)} className="min-h-11 rounded-md px-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="all">Any direction</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option>
        </select>
        <button type="button" onClick={load} disabled={loading} title="Refresh call activity" className="flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /><span className="sm:hidden">Refresh</span></button>
      </div>

      <div className="mb-3 flex min-h-10 flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{activity.length} matching records</span>
        {selected.size > 0 && <>
          <span>· {selected.size} selected</span>
          <button onClick={() => emailSelected([...selected])} disabled={busy} className="ml-auto flex min-h-9 items-center gap-1.5 rounded-md px-2.5" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}><Mail size={15} /> Email</button>
          <button onClick={() => removeItems([...selected])} disabled={busy} className="flex min-h-9 items-center gap-1.5 rounded-md px-2.5" style={{ border: '1px solid var(--red)', color: 'var(--red)' }}><Trash2 size={15} /> Delete</button>
        </>}
      </div>

      {loading ? <div className="space-y-2" aria-busy="true" aria-label="Loading call activity">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-md" style={{ background: 'var(--surface2)' }} />)}</div>
        : error ? <div className="rounded-md p-4 text-sm" style={{ border: '1px solid var(--red)', color: 'var(--red)' }}>{error}</div>
        : visible.length === 0 ? <div className="rounded-md py-12 text-center text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>No calls match these filters.</div>
        : <div className="overflow-hidden rounded-md" style={{ border: '1px solid var(--border)' }}>
          {visible.map(item => {
            const open = expanded === item.id
            const checked = selected.has(item.id)
            return <article key={item.id} style={{ borderBottom: '1px solid var(--border)', background: checked ? 'var(--accent-soft)' : 'var(--surface)' }}>
              <div className="flex items-center gap-2 p-3 sm:gap-3">
                <input type="checkbox" checked={checked} onChange={() => setSelected(current => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} aria-label={`Select ${item.title}`} className="h-4 w-4 shrink-0" />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: item.source === 'agent' ? 'var(--accent-soft)' : 'var(--surface2)', color: item.source === 'agent' ? 'var(--accent)' : 'var(--text)' }}>{item.source === 'agent' ? <Bot size={18} /> : <UserRound size={18} />}</div>
                <button type="button" onClick={() => setExpanded(open ? null : item.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.title || formatPhone(item.from)}</span><span className="hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase sm:inline" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{item.source === 'agent' ? item.agentName || 'AI agent' : 'Carl'}</span></div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{formatPhone(item.from)} · {item.direction || 'call'} · {formatDate(item.startedAt)}{item.durationSec ? ` · ${durationLabel(item.durationSec)}` : ''}</div>
                </button>
                <a href={`tel:${item.from}`} title={`Call ${formatPhone(item.from)}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color: 'var(--green)', border: '1px solid var(--border)' }}><PhoneCall size={16} /></a>
                <button type="button" onClick={() => setExpanded(open ? null : item.id)} aria-label={open ? 'Collapse details' : 'Expand details'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color: 'var(--text-muted)' }}>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
              </div>
              {open && <div className="px-12 pb-4 text-sm sm:px-16" style={{ color: 'var(--text-muted)' }}>
                <p>{item.summary || 'No summary was recorded for this call.'}</p>
                {item.transcript?.length > 0 && <div className="mt-3 max-h-56 space-y-2 overflow-auto rounded-md p-3" style={{ background: 'var(--surface2)' }}>{item.transcript.map((line, index) => <p key={index}><strong style={{ color: 'var(--text)' }}>{line.role === 'agent' ? 'Agent' : 'Caller'}:</strong> {line.text}</p>)}</div>}
                <button onClick={() => removeItems([item.id])} disabled={busy} className="mt-3 flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold" style={{ border: '1px solid var(--red)', color: 'var(--red)' }}><Trash2 size={14} /> Delete record</button>
              </div>}
            </article>
          })}
        </div>}

      {!loading && activity.length > 0 && <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="min-h-10 rounded-md px-3 disabled:opacity-40" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Previous</button>
        <span style={{ color: 'var(--text-muted)' }}>Page {page} of {pages}</span>
        <button disabled={page === pages} onClick={() => setPage(value => Math.min(pages, value + 1))} className="min-h-10 rounded-md px-3 disabled:opacity-40" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Next</button>
      </div>}
    </section>
  )
}
