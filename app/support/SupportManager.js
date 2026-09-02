'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import {
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  Hammer,
  LifeBuoy,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'

const STATUS_OPTIONS = [
  ['new', 'New'],
  ['triage', 'Triage'],
  ['waiting_on_farrington', 'Waiting on us'],
  ['waiting_on_client', 'Waiting on client'],
  ['scheduled', 'Scheduled'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
  ['closed', 'Closed'],
  ['reopened', 'Reopened'],
]

const PRIORITY_OPTIONS = [
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
]

const CATEGORY_OPTIONS = [
  ['access_login', 'Access / login'],
  ['billing_invoice', 'Billing / invoice'],
  ['website_issue', 'Website issue'],
  ['crm_issue', 'CRM issue'],
  ['automation_agent', 'Automation / agent'],
  ['domain_email', 'Domain / email'],
  ['content_media', 'Content / media'],
  ['feature_request', 'Feature request'],
  ['training_how_to', 'Training / how-to'],
  ['security_privacy', 'Security / privacy'],
  ['other', 'Other'],
]

const emptyDraft = {
  subject: '',
  description: '',
  accountId: '',
  category: 'other',
  priority: 'normal',
  status: 'new',
  assignedToUserId: '',
  portalVisible: true,
}

function label(options, value) {
  return options.find(([id]) => id === value)?.[1] || value || ''
}

function fmtDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  } catch {
    return value
  }
}

function isOverdue(value) {
  return value && new Date(value).getTime() < Date.now()
}

function priorityTone(priority) {
  if (priority === 'urgent') return { color: '#ef4444', bg: 'rgba(239,68,68,.12)' }
  if (priority === 'high') return { color: '#f59e0b', bg: 'rgba(245,158,11,.14)' }
  if (priority === 'low') return { color: 'var(--text-muted)', bg: 'var(--surface2)' }
  return { color: '#3b82f6', bg: 'rgba(59,130,246,.12)' }
}

function statusTone(status) {
  if (status === 'resolved' || status === 'closed') return { color: '#10b981', bg: 'rgba(16,185,129,.12)' }
  if (status === 'waiting_on_client') return { color: '#f59e0b', bg: 'rgba(245,158,11,.14)' }
  if (status === 'urgent') return { color: '#ef4444', bg: 'rgba(239,68,68,.12)' }
  return { color: 'var(--accent)', bg: 'var(--accent-soft)' }
}

function Pill({ children, tone }) {
  return <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    padding: '3px 8px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    color: tone?.color || 'var(--text-muted)',
    background: tone?.bg || 'var(--surface2)',
    whiteSpace: 'nowrap',
  }}>{children}</span>
}

function IconButton({ title, onClick, children, danger = false, disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: danger ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
        opacity: disabled ? .5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function TicketModal({ draft, setDraft, accounts, scopedAccountId, scopedAccountName, saving, onClose, onSave }) {
  const input = {
    width: '100%',
    minHeight: 42,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    padding: '9px 11px',
    fontSize: 13,
  }
  const update = patch => setDraft(d => ({ ...d, ...patch }))
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.58)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 100%)', maxHeight: '88vh', overflow: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', padding: 18, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>{draft.id ? 'Edit support ticket' : 'Open support ticket'}</h3>
          <IconButton title="Close" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <label style={fieldLabel}>Subject<input style={input} value={draft.subject} onChange={e => update({ subject: e.target.value })} placeholder="What needs attention?" /></label>
          {scopedAccountId ? (
            <label style={fieldLabel}>Account<input style={input} value={scopedAccountName || scopedAccountId} disabled /></label>
          ) : (
            <label style={fieldLabel}>Account<select style={input} value={draft.accountId || ''} onChange={e => update({ accountId: e.target.value })}>
              <option value="">Unassigned</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
          )}
          <label style={fieldLabel}>Category<select style={input} value={draft.category} onChange={e => update({ category: e.target.value })}>
            {CATEGORY_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label style={fieldLabel}>Priority<select style={input} value={draft.priority} onChange={e => update({ priority: e.target.value })}>
            {PRIORITY_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label style={fieldLabel}>Status<select style={input} value={draft.status} onChange={e => update({ status: e.target.value })}>
            {STATUS_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label style={fieldLabel}>Assigned to<input style={input} value={draft.assignedToUserId || ''} onChange={e => update({ assignedToUserId: e.target.value })} placeholder="Carl, support, operator..." /></label>
        </div>
        <label style={{ ...fieldLabel, marginTop: 12 }}>Scenario<textarea style={{ ...input, minHeight: 130, resize: 'vertical' }} value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="Client, product/service, what happened, what should happen next." /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--text)', fontSize: 13 }}>
          <input type="checkbox" checked={draft.portalVisible !== false} onChange={e => update({ portalVisible: e.target.checked })} />
          Visible in the client portal
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button type="button" disabled={saving || !draft.subject.trim()} onClick={onSave} style={{ ...primaryBtn, opacity: saving || !draft.subject.trim() ? .55 : 1 }}>{saving ? 'Saving...' : 'Save ticket'}</button>
        </div>
      </div>
    </div>
  )
}

const fieldLabel = { display: 'grid', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }
const primaryBtn = { minHeight: 40, borderRadius: 8, border: 0, padding: '0 14px', background: 'var(--accent)', color: 'var(--accent-text)', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }
const secondaryBtn = { minHeight: 40, borderRadius: 8, border: '1px solid var(--border)', padding: '0 14px', background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }

export default function SupportManager({ scopedAccountId = '', scopedAccountName = '', embedded = false }) {
  const [tickets, setTickets] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState(null)
  const [comment, setComment] = useState('')
  const [filters, setFilters] = useState({ q: '', status: 'open', priority: 'all', category: 'all', client: 'all' })
  const [preset, setPreset] = useState('all')

  // Component configuration layer: configured queue defaults (support.queue).
  const queuePrefs = useComponentSettings('support.queue')
  const userTouchedQueue = useRef(false)
  useEffect(() => {
    if (!queuePrefs.loaded || !queuePrefs.values) return
    if (userTouchedQueue.current) return
    if (queuePrefs.values.defaultPreset) setPreset(queuePrefs.values.defaultPreset)
    if (queuePrefs.values.defaultStatusFilter) setFilters(f => ({ ...f, status: queuePrefs.values.defaultStatusFilter }))
  }, [queuePrefs.loaded])

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (scopedAccountId) params.set('accountId', scopedAccountId)
      if (filters.status !== 'open' && filters.status !== 'all') params.set('status', filters.status)
      if (filters.status === 'all') params.set('includeClosed', 'true')
      if (filters.priority !== 'all') params.set('priority', filters.priority)
      if (filters.category !== 'all') params.set('category', filters.category)
      if (filters.q.trim()) params.set('q', filters.q.trim())
      const res = await fetch(`/api/support?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not load support tickets')
      setTickets(json.tickets || [])
      if (!selectedId && json.tickets?.[0] && !embedded) setSelectedId(json.tickets[0].id)
    } catch (e) {
      setMessage(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [scopedAccountId, filters.status, filters.priority, filters.category])
  useEffect(() => {
    if (scopedAccountId) return
    fetch('/api/accounts', { cache: 'no-store' }).then(r => r.json()).then(j => setAccounts(j.accounts || [])).catch(() => setAccounts([]))
  }, [scopedAccountId])

  const isBreaching = t => isOverdue(t.firstResponseDueAt) && !t.firstRespondedAt
  const filtered = useMemo(() => {
    let list = tickets
    if (filters.q.trim()) {
      const q = filters.q.toLowerCase()
      list = list.filter(t => [t.ticketNumber, t.subject, t.description, t.accountName].some(v => String(v || '').toLowerCase().includes(q)))
    }
    if (filters.client !== 'all') list = list.filter(t => t.accountId === filters.client)
    if (preset === 'unassigned') list = list.filter(t => !t.assignedToUserId)
    else if (preset === 'breaching') list = list.filter(isBreaching)
    else if (preset === 'waiting') list = list.filter(t => t.status === 'waiting_on_client')
    else if (preset === 'urgent') list = list.filter(t => t.priority === 'urgent')
    const breachFirst = queuePrefs.values?.breachFirstSort !== false
    return [...list].sort((a, b) =>
      (breachFirst ? (isBreaching(b) ? 1 : 0) - (isBreaching(a) ? 1 : 0) : 0) ||
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    )
  }, [tickets, filters.q, filters.client, preset, queuePrefs.values])
  const selected = filtered.find(t => t.id === selectedId) || filtered[0] || null
  const stats = useMemo(() => ({
    open: tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length,
    urgent: tickets.filter(t => t.priority === 'urgent').length,
    waiting: tickets.filter(t => t.status === 'waiting_on_client' || t.status === 'waiting_on_farrington').length,
    overdue: tickets.filter(t => isOverdue(t.firstResponseDueAt) && !t.firstRespondedAt).length,
  }), [tickets])

  const saveTicket = async () => {
    setSaving(true)
    try {
      const ticket = {
        ...draft,
        accountId: scopedAccountId || draft.accountId,
        accountName: scopedAccountName || draft.accountName,
      }
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: ticket.id ? 'update' : 'add', ticket }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Save failed')
      setDraft(null)
      setSelectedId(json.ticket.id)
      setMessage('Saved')
      await load()
    } catch (e) {
      setMessage(e.message)
    } finally {
      setSaving(false)
    }
  }

  const runAction = async (action, ticket = selected) => {
    if (!ticket) return
    setSaving(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: ticket.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Action failed')
      setMessage(action === 'send_to_build_board' ? 'Sent to Build Board' : 'Updated')
      await load()
    } catch (e) {
      setMessage(e.message)
    } finally {
      setSaving(false)
    }
  }

  const addComment = async (visibility = 'internal') => {
    if (!selected || !comment.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comment', id: selected.id, comment: { body: comment, visibility } }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Comment failed')
      setComment('')
      setSelectedId(selected.id)
      await load()
    } catch (e) {
      setMessage(e.message)
    } finally {
      setSaving(false)
    }
  }

  const openNew = () => setDraft({ ...emptyDraft, accountId: scopedAccountId, accountName: scopedAccountName })
  const editSelected = ticket => setDraft({ ...emptyDraft, ...ticket })

  return (
    <div style={{ color: 'var(--text)' }}>
      {!embedded && (
        <PageHeader
          icon={<LifeBuoy size={20} />}
          title="Support"
          subtitle="Client tickets, internal service requests, portal handoffs, and support agent queue."
          actions={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ComponentSettings
                componentId="support.queue"
                title="Support queue settings"
                onApplied={(id, values) => {
                  queuePrefs.apply(values)
                  if (values?.defaultPreset) setPreset(values.defaultPreset)
                  if (values?.defaultStatusFilter) setFilters(f => ({ ...f, status: values.defaultStatusFilter }))
                }}
              />
              <button type="button" onClick={openNew} style={primaryBtn}><Plus size={16} />New ticket</button>
            </div>
          )}
        />
      )}

      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} support ticket{filtered.length === 1 ? '' : 's'} for {scopedAccountName}</div>
          <button type="button" onClick={openNew} style={primaryBtn}><Plus size={15} />New ticket</button>
        </div>
      )}

      {!embedded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Stat label="Open" value={stats.open} icon={<LifeBuoy size={16} />} />
          <Stat label="Urgent" value={stats.urgent} icon={<Clock size={16} />} />
          <Stat label="Waiting" value={stats.waiting} icon={<MessageSquare size={16} />} />
          <Stat label="SLA risk" value={stats.overdue} icon={<Filter size={16} />} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {[['all', 'All open'], ['unassigned', 'Unassigned'], ['breaching', 'Breaching SLA'], ['waiting', 'Waiting on client'], ['urgent', 'Urgent']].map(([id, name]) => (
          <button key={id} type="button" onClick={() => { userTouchedQueue.current = true; setPreset(id) }} style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${preset === id ? 'var(--accent)' : 'var(--border)'}`, background: preset === id ? 'var(--accent-soft)' : 'var(--surface2)', color: preset === id ? 'var(--accent)' : 'var(--text-muted)' }}>{name}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
          <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') load() }} placeholder="Search tickets" style={{ width: '100%', minHeight: 38, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '8px 10px 8px 32px', fontSize: 13 }} />
        </div>
        <select value={filters.status} onChange={e => { userTouchedQueue.current = true; setFilters(f => ({ ...f, status: e.target.value })) }} style={filterSelect}>
          <option value="open">Open statuses</option>
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))} style={filterSelect}>
          <option value="all">All priorities</option>
          {PRIORITY_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={filterSelect}>
          <option value="all">All categories</option>
          {CATEGORY_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {!scopedAccountId && (
          <select value={filters.client} onChange={e => setFilters(f => ({ ...f, client: e.target.value }))} style={filterSelect} aria-label="Filter tickets by client">
            <option value="all">All clients</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        )}
        <IconButton title="Refresh" onClick={load}><RefreshCw size={15} /></IconButton>
      </div>

      {message && <div style={{ marginBottom: 10, color: ['Saved', 'Updated', 'Sent to Build Board'].includes(message) ? 'var(--green)' : 'var(--danger, #ef4444)', fontSize: 13 }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: embedded ? '1fr' : 'minmax(320px, .9fr) minmax(360px, 1.1fr)', gap: 14 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>Loading support tickets...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>No support tickets yet.</div>
          ) : filtered.map(ticket => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setSelectedId(ticket.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 0,
                borderBottom: '1px solid var(--border)',
                background: selected?.id === ticket.id ? 'var(--surface2)' : 'transparent',
                padding: 12,
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</div>
                <Pill tone={priorityTone(ticket.priority)}>{label(PRIORITY_OPTIONS, ticket.priority)}</Pill>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <Pill tone={statusTone(ticket.status)}>{label(STATUS_OPTIONS, ticket.status)}</Pill>
                {isBreaching(ticket) && <Pill tone={{ color: '#ef4444', bg: 'rgba(239,68,68,.12)' }}>SLA breach</Pill>}
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{ticket.ticketNumber}</span>
                {ticket.accountName && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{ticket.accountName}</span>}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Updated {fmtDate(ticket.updatedAt || ticket.createdAt)}</div>
            </button>
          ))}
        </div>

        {!embedded && selected && (
          <TicketDetail
            ticket={selected}
            comment={comment}
            setComment={setComment}
            saving={saving}
            onComment={addComment}
            onEdit={() => editSelected(selected)}
            onResolve={() => runAction('resolve', selected)}
            onClose={() => runAction('close', selected)}
            onReopen={() => runAction('reopen', selected)}
            onDelete={() => runAction('delete', selected)}
            onSendToBuildBoard={() => runAction('send_to_build_board', selected)}
          />
        )}
      </div>

      {embedded && selected && (
        <div style={{ marginTop: 14 }}>
          <TicketDetail
            ticket={selected}
            comment={comment}
            setComment={setComment}
            saving={saving}
            onComment={addComment}
            onEdit={() => editSelected(selected)}
            onResolve={() => runAction('resolve', selected)}
            onClose={() => runAction('close', selected)}
            onReopen={() => runAction('reopen', selected)}
            onDelete={() => runAction('delete', selected)}
            onSendToBuildBoard={() => runAction('send_to_build_board', selected)}
          />
        </div>
      )}

      {draft && <TicketModal draft={draft} setDraft={setDraft} accounts={accounts} scopedAccountId={scopedAccountId} scopedAccountName={scopedAccountName} saving={saving} onClose={() => setDraft(null)} onSave={saveTicket} />}
    </div>
  )
}

function Stat({ label, value, icon }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 12 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>{icon}{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 5 }}>{value}</div>
    </div>
  )
}

export function TicketDetail({ ticket, comment, setComment, saving, onComment, onEdit, onResolve, onClose, onReopen, onDelete, onSendToBuildBoard }) {
  const [vis, setVis] = useState('internal')
  const CANNED = [
    ['Acknowledged', 'Thanks — we received this and are on it. You will hear back from us shortly.'],
    ['Need info', 'To move this forward we need a bit more detail: the page or record involved, what you expected, and a screenshot if possible.'],
    ['Fix deployed', 'A fix for this has been deployed. Please try again and let us know if anything still looks off.'],
    ['Resolved recap', 'Marking this resolved. Summary of what we did: '],
  ]
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800 }}>{ticket.ticketNumber}</div>
          <h2 style={{ margin: '3px 0 6px', fontSize: 18 }}>{ticket.subject}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill tone={statusTone(ticket.status)}>{label(STATUS_OPTIONS, ticket.status)}</Pill>
            <Pill tone={priorityTone(ticket.priority)}>{label(PRIORITY_OPTIONS, ticket.priority)}</Pill>
            <Pill>{label(CATEGORY_OPTIONS, ticket.category)}</Pill>
            {ticket.portalVisible && <Pill tone={{ color: '#10b981', bg: 'rgba(16,185,129,.12)' }}>Portal visible</Pill>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <IconButton title="Edit ticket" onClick={onEdit}><Edit3 size={15} /></IconButton>
          <IconButton title="Resolve ticket" onClick={onResolve} disabled={ticket.status === 'resolved'}><CheckCircle2 size={15} /></IconButton>
          <IconButton title="Close ticket" onClick={onClose} disabled={ticket.status === 'closed'}><X size={15} /></IconButton>
          <IconButton title="Reopen ticket" onClick={onReopen}><RefreshCw size={15} /></IconButton>
          {ticket.category === 'feature_request' && <IconButton title={ticket.linkedTo?.buildBoardCardId ? `Build Board card ${ticket.linkedTo.buildBoardCardId}` : 'Send to Build Board'} onClick={onSendToBuildBoard} disabled={saving || Boolean(ticket.linkedTo?.buildBoardCardId)}><Hammer size={15} /></IconButton>}
          <IconButton title="Delete ticket" onClick={onDelete} danger><Trash2 size={15} /></IconButton>
        </div>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{ticket.description || 'No scenario recorded yet.'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Info label="Account" value={ticket.accountName || ticket.accountId || 'Unassigned'} />
        <Info label="Assigned" value={ticket.assignedToUserId || 'Unassigned'} />
        <Info label="First response due" value={fmtDate(ticket.firstResponseDueAt) || 'Not set'} warn={isOverdue(ticket.firstResponseDueAt) && !ticket.firstRespondedAt} />
        <Info label="Resolution due" value={fmtDate(ticket.resolutionDueAt) || 'Not set'} warn={isOverdue(ticket.resolutionDueAt) && !ticket.resolvedAt} />
        {ticket.linkedTo?.buildBoardCardId && <Info label="Build Board" value={buildBoardTagLabel(ticket.linkedTo.buildBoardCardId)} />}
        {(ticket.usageEventCount > 0 || ticket.estCostUsd > 0 || ticket.usageUnknown) && <Info label="Attributed AI cost" value={`$${Number(ticket.estCostUsd || 0).toFixed(2)}${ticket.usageUnknown ? ' + unknown' : ''}`} warn={ticket.usageUnknown} />}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Conversation</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          {(ticket.comments || []).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No comments yet.</div> : ticket.comments.map(c => (
            <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: c.visibility === 'portal' ? 'var(--accent-soft)' : 'var(--surface2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--text-muted)', fontSize: 12, marginBottom: 5 }}>
                <span>{c.authorName || c.authorType}</span>
                <span>{c.visibility} · {fmtDate(c.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{c.body}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          {CANNED.map(([name, text]) => (
            <button key={name} type="button" onClick={() => setComment(c => (c ? c + '\n' : '') + text)} style={{ ...secondaryBtn, minHeight: 30, padding: '0 10px', fontSize: 12 }}>{name}</button>
          ))}
          <select value={vis} onChange={e => setVis(e.target.value)} style={{ ...filterSelect, minHeight: 30, marginLeft: 'auto', fontSize: 12 }}>
            <option value="internal">Internal note</option>
            <option value="portal">Reply to client (portal)</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={vis === 'portal' ? 'Write a reply the client will see in their portal...' : 'Add an internal support note...'} style={{ flex: 1, minHeight: 74, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: 10, fontSize: 13 }} />
          <IconButton title={vis === 'portal' ? 'Send reply to client' : 'Add internal note'} onClick={() => onComment(vis)} disabled={saving || !comment.trim()}><Send size={15} /></IconButton>
        </div>
      </div>
    </section>
  )
}

function buildBoardTagLabel(id) {
  return `[bb-${String(id || '').replace(/^bb-/, '')}]`
}

function Info({ label, value, warn = false }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9, background: warn ? 'rgba(239,68,68,.1)' : 'var(--surface2)' }}>
      <div style={{ color: warn ? '#ef4444' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  )
}

const filterSelect = {
  minHeight: 38,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
}
