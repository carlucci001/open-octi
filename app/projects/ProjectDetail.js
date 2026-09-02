'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

const fmtUSD = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtDate = d => d ? new Date(d).toLocaleDateString() : '—'
const fmtDateTime = d => d ? new Date(d).toLocaleString() : '—'

// Fuzzy resolver for spoken/typed sub-tab names from Matilda.
const PROJECT_SUB_TABS = ['overview', 'tasks', 'activity', 'documents', 'invoices', 'timeline']
export function resolveProjectSubTab(raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase().replace(/[^a-z]/g, '')
  const aliases = {
    overview: 'overview', summary: 'overview', details: 'overview', detail: 'overview',
    task: 'tasks', tasks: 'tasks', todos: 'tasks', todo: 'tasks', work: 'tasks',
    activity: 'activity', activities: 'activity', log: 'activity', history: 'activity', notes: 'activity',
    document: 'documents', documents: 'documents', docs: 'documents', doc: 'documents', files: 'documents', contracts: 'documents',
    invoice: 'invoices', invoices: 'invoices', bills: 'invoices', billing: 'invoices',
    timeline: 'timeline', time: 'timeline', events: 'timeline',
  }
  return aliases[s] || (PROJECT_SUB_TABS.includes(s) ? s : null)
}

const PERSIST_KEY = 'fcc-project-sub'

export default function ProjectDetail({ project, accountName, onBack, onEdit, onRefresh }) {
  const [tab, setTab] = useState('overview')
  const [tasks, setTasks] = useState([])
  const [activities, setActivities] = useState([])
  const [documents, setDocuments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  // Restore last sub-tab on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(PERSIST_KEY) : null
    if (saved && PROJECT_SUB_TABS.includes(saved)) setTab(saved)
  }, [])

  // Persist on change
  const changeTab = (id) => {
    setTab(id)
    try { localStorage.setItem(PERSIST_KEY, id) } catch {}
  }

  // Voice-driven deep-nav — switch sub-tab + rebroadcast item query
  useEffect(() => {
    const apply = ({ subTab, itemQuery, projectId, accountId }) => {
      if (projectId && projectId !== project.id) return
      // Ignore events explicitly targeted at accounts when we're in a project view
      if (!projectId && accountId) return
      const resolved = resolveProjectSubTab(subTab)
      if (resolved) changeTab(resolved)
      if (itemQuery) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:record-item', {
          detail: { itemQuery, projectId: project.id, subTab: resolved || subTab, scope: 'project' },
        })), 200)
      }
    }
    const pending = typeof window !== 'undefined' ? window.__fccPendingProjectSubTab : null
    if (pending && pending.projectId === project.id && Date.now() - pending.ts < 10000) {
      apply(pending)
      window.__fccPendingProjectSubTab = null
    }
    const handler = (e) => apply(e.detail || {})
    window.addEventListener('fcc:record-subtab', handler)
    return () => window.removeEventListener('fcc:record-subtab', handler)
  }, [project.id])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, a, d, inv] = await Promise.all([
        fetch(`/api/tasks?projectId=${project.id}`).then(r => r.json()).catch(() => ({ tasks: [] })),
        fetch(`/api/activities?projectId=${project.id}`).then(r => r.json()).catch(() => ({ activities: [] })),
        fetch(`/api/documents?projectId=${project.id}`).then(r => r.json()).catch(() => ({ documents: [] })),
        fetch(`/api/invoices?projectId=${project.id}`).then(r => r.json()).catch(() => ({ invoices: [] })),
      ])
      setTasks(t.tasks || [])
      setActivities(a.activities || [])
      setDocuments(d.documents || [])
      setInvoices(inv.invoices || [])
    } finally {
      setLoading(false)
    }
  }, [project.id])
  useEffect(() => { load() }, [load])

  const openTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks = tasks.filter(t => t.status === 'done')
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid')
  const paidInvoices = invoices.filter(i => i.status === 'paid')
  const outstanding = unpaidInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const paidTotal = paidInvoices.reduce((s, i) => s + (Number(i.paidAmount || i.amount) || 0), 0)
  const budget = Number(project.budget) || (Number(project.rate) || 0) * (Number(project.estimatedHours) || 0)

  const timeline = useMemo(() => {
    const events = []
    activities.forEach(a => events.push({ ts: a.at || a.createdAt, kind: 'activity', icon: '📝', label: a.subject || a.type, detail: a.body || a.type, data: a }))
    doneTasks.forEach(t => events.push({ ts: t.completedAt || t.updatedAt, kind: 'task-done', icon: '✅', label: `Task completed: ${t.title}`, detail: t.description || '', data: t }))
    invoices.forEach(i => {
      if (i.sentAt) events.push({ ts: i.sentAt, kind: 'invoice-sent', icon: '📤', label: `Invoice ${i.number} sent`, detail: `${fmtUSD(i.amount)} to ${i.clientName || ''}`, data: i })
      if (i.paidAt) events.push({ ts: i.paidAt, kind: 'invoice-paid', icon: '💰', label: `Invoice ${i.number} paid`, detail: `${fmtUSD(i.paidAmount || i.amount)}`, data: i })
    })
    return events.filter(e => e.ts).sort((a, b) => new Date(b.ts) - new Date(a.ts))
  }, [activities, doneTasks, invoices])

  const statusColor = {
    active: 'var(--green)', paused: 'var(--amber)', completed: 'var(--accent)', invoiced: 'var(--accent)',
  }[project.status] || 'var(--text-muted)'

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }
  const labelStyle = { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const btnTab = (active) => ({
    padding: '10px 18px', minHeight: 48, fontSize: 15, fontWeight: 500,
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4 flex-wrap">
        <button
          onClick={onBack}
          style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{project.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {accountName || project.accountName || project.clientName || '(no account)'} · <span style={{ color: statusColor, fontWeight: 600 }}>{project.status || 'active'}</span>
            {project.priority && project.priority !== 'medium' ? ` · ${project.priority} priority` : ''}
          </div>
        </div>
        {onEdit && (
          <button
            onClick={() => onEdit(project)}
            style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent)', borderRadius: 8, cursor: 'pointer' }}
          >
            Edit
          </button>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>{openTasks.length}</div>
          <div style={{ ...labelStyle, marginTop: 4 }}>Open tasks</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: outstanding > 0 ? '#dc2626' : 'var(--text-muted)' }}>{fmtUSD(outstanding)}</div>
          <div style={{ ...labelStyle, marginTop: 4 }}>Outstanding</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--green)' }}>{fmtUSD(paidTotal)}</div>
          <div style={{ ...labelStyle, marginTop: 4 }}>Paid</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>{fmtDate(project.dueDate)}</div>
          <div style={{ ...labelStyle, marginTop: 4 }}>Due</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden mb-4 flex-wrap" style={{ border: '1px solid var(--border)', width: 'fit-content' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: `Tasks (${tasks.length})` },
          { id: 'activity', label: `Activity (${activities.length})` },
          { id: 'documents', label: `Documents (${documents.length})` },
          { id: 'invoices', label: `Invoices (${invoices.length})` },
          { id: 'timeline', label: 'Timeline' },
        ].map(t => (
          <button key={t.id} onClick={() => changeTab(t.id)} style={btnTab(tab === t.id)}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', padding: 16, fontSize: 14 }}>Loading…</div>}

      {!loading && tab === 'overview' && (
        <div className="space-y-4">
          {project.description && (
            <div style={card}>
              <div style={labelStyle}>Description</div>
              <div style={{ marginTop: 6, color: 'var(--text)', fontSize: 14, whiteSpace: 'pre-wrap' }}>{project.description}</div>
            </div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div style={card}><div style={labelStyle}>Budget</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: 'var(--text)' }}>{budget ? fmtUSD(budget) : '—'}</div></div>
            <div style={card}><div style={labelStyle}>Rate</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: 'var(--text)' }}>{project.rate ? `${fmtUSD(project.rate)}/hr` : '—'}</div></div>
            <div style={card}><div style={labelStyle}>Hours</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: 'var(--text)' }}>{project.actualHours || 0} / {project.estimatedHours || '—'}</div></div>
            <div style={card}><div style={labelStyle}>Progress</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: 'var(--text)' }}>{project.progress || 0}%</div></div>
            <div style={card}><div style={labelStyle}>Started</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, color: 'var(--text)' }}>{fmtDate(project.startDate)}</div></div>
          </div>
          {project.tags?.length > 0 && (
            <div style={card}>
              <div style={labelStyle}>Tags</div>
              <div style={{ marginTop: 8 }} className="flex flex-wrap gap-2">
                {project.tags.map(t => (
                  <span key={t} style={{ padding: '4px 10px', fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 999 }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'tasks' && (
        <div style={card}>
          {tasks.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>No tasks linked to this project yet.</div>}
          {tasks.map((t, i) => (
            <div key={t.id} className="flex items-center justify-between gap-3" style={{ padding: '12px 0', borderBottom: i === tasks.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.6 : 1 }}>
                  {t.title}
                </div>
                {t.dueDate && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Due {fmtDate(t.dueDate)}</div>}
              </div>
              <span style={{ padding: '4px 10px', fontSize: 11, borderRadius: 999, background: t.status === 'done' ? 'var(--surface2)' : 'var(--accent-soft)', color: t.status === 'done' ? 'var(--text-muted)' : 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.status || 'todo'}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'activity' && (
        <div style={card}>
          {activities.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>No activity logged for this project yet.</div>}
          {activities.map((a, i) => (
            <div key={a.id} style={{ padding: '12px 0', borderBottom: i === activities.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-muted)' }}>{a.type || 'note'}</span>
                <span style={{ fontSize: 14, color: 'var(--text)' }}>{a.subject || '(no subject)'}</span>
              </div>
              {a.body && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.body}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{fmtDateTime(a.at)}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'documents' && (
        <div style={card}>
          {documents.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>No documents linked to this project yet.</div>}
          {documents.map((d, i) => (
            <div key={d.id} className="flex items-center justify-between gap-3" style={{ padding: '12px 0', borderBottom: i === documents.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{d.title || d.templateName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{d.clientName || ''} · {fmtDate(d.updatedAt || d.createdAt)}</div>
              </div>
              <span style={{ padding: '4px 10px', fontSize: 11, borderRadius: 999, background: 'var(--surface2)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.status || 'draft'}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'invoices' && (
        <div style={card}>
          {invoices.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>No invoices linked to this project yet.</div>}
          {invoices.map((i, idx) => (
            <div key={i.id} className="flex items-center justify-between gap-3" style={{ padding: '12px 0', borderBottom: idx === invoices.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{i.number}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{i.clientName} · {fmtDate(i.date)}{i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 15, fontWeight: 600, color: i.status === 'paid' ? 'var(--green)' : 'var(--text)' }}>{fmtUSD(i.amount)}</span>
                <span style={{ padding: '4px 10px', fontSize: 11, borderRadius: 999, background: i.status === 'paid' ? 'rgba(22,163,74,0.15)' : 'var(--surface2)', color: i.status === 'paid' ? 'var(--green)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.status || 'draft'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'timeline' && (
        <div style={card}>
          {timeline.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>Nothing on the timeline yet.</div>}
          {timeline.map((ev, i) => (
            <div key={`${ev.kind}-${i}`} className="flex items-start gap-3" style={{ padding: '14px 0', borderBottom: i === timeline.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div style={{ fontSize: 18, lineHeight: 1.2, minWidth: 24 }}>{ev.icon}</div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{ev.label}</div>
                {ev.detail && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{ev.detail}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{fmtDateTime(ev.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
