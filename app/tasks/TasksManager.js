'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'
import PageHeader from '../components/PageHeader'
import { Paginator, usePagination } from '../components/Paginator'
import BoardWorkbench from '../components/BoardWorkbench'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { CheckCircle2, Circle, Pencil, RotateCcw, Trash2 } from 'lucide-react'

const STATUS = [
  { id: 'todo', label: 'To Do', color: 'var(--text-muted)', bg: 'var(--surface2)' },
  { id: 'in_progress', label: 'In Progress', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  { id: 'blocked', label: 'Blocked', color: 'var(--red)', bg: 'var(--red-soft)' },
  { id: 'done', label: 'Done', color: 'var(--green)', bg: 'var(--green-soft)' },
]
const PRIORITY = [
  { id: 'low', label: 'Low', color: 'var(--text-muted)' },
  { id: 'medium', label: 'Medium', color: 'var(--accent)' },
  { id: 'high', label: 'High', color: 'var(--amber)' },
  { id: 'urgent', label: 'Urgent', color: 'var(--red)' },
]

const ACTION_TONES = {
  accent: 'var(--accent)',
  danger: 'var(--red)',
  green: 'var(--green)',
  muted: 'var(--text-muted)',
}

function ActionIconButton({ label, icon: Icon, onClick, tone = 'muted', className = '', disabled = false }) {
  const bg = tone === 'green' ? 'var(--green-soft)' : tone === 'danger' ? 'var(--red-soft)' : 'transparent'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-grid place-items-center rounded-full ${className}`}
      style={{
        width: 28,
        height: 28,
        minWidth: 28,
        background: bg,
        color: ACTION_TONES[tone] || ACTION_TONES.muted,
        border: '1px solid var(--border)',
        opacity: disabled ? 0.55 : 1,
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation()
        if (!disabled) onClick?.(e)
      }}
    >
      <Icon size={14} strokeWidth={2.15} aria-hidden="true" />
    </button>
  )
}

function api(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto`} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

function TaskForm({ task, clients, projects, onSave, onClose }) {
  const [f, setF] = useState(task || { title: '', description: '', status: 'todo', priority: 'medium', dueDate: '', clientId: '', projectId: '', tags: [] })
  const [tagInput, setTagInput] = useState('')
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const addTag = () => {
    const t = tagInput.trim()
    if (t && !(f.tags || []).includes(t)) u('tags', [...(f.tags || []), t])
    setTagInput('')
  }
  const removeTag = (t) => u('tags', (f.tags || []).filter(x => x !== t))

  const projectsForClient = f.clientId ? projects.filter(p => p.clientId === f.clientId) : []

  return (
    <Modal title={task?.id ? 'Edit Task' : 'Add Task'} onClose={onClose} wide>
      <Field label="Title *"><input style={inputStyle} value={f.title} onChange={e => u('title', e.target.value)} placeholder="What needs to be done?" autoFocus /></Field>
      <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={f.description} onChange={e => u('description', e.target.value)} placeholder="Context, links, notes..." /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <ThemedSelect style={inputStyle} value={f.status} onChange={e => u('status', e.target.value)}>
            {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Priority">
          <ThemedSelect style={inputStyle} value={f.priority} onChange={e => u('priority', e.target.value)}>
            {PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </ThemedSelect>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Due Date"><input type="date" style={inputStyle} value={f.dueDate || ''} onChange={e => u('dueDate', e.target.value)} /></Field>
        <Field label="Client">
          <ThemedSelect style={inputStyle} value={f.clientId || ''} onChange={e => { u('clientId', e.target.value); u('projectId', '') }}>
            <option value="">â€” None â€”</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </ThemedSelect>
        </Field>
      </div>

      {f.clientId && projectsForClient.length > 0 && (
        <Field label="Project">
          <ThemedSelect style={inputStyle} value={f.projectId || ''} onChange={e => u('projectId', e.target.value)}>
            <option value="">â€” None â€”</option>
            {projectsForClient.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </ThemedSelect>
        </Field>
      )}

      <Field label="Tags">
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', minHeight: 40 }}>
          {(f.tags || []).map(t => (
            <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {t}<button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100">Ã—</button>
            </span>
          ))}
          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', flex: 1, minWidth: 80, fontSize: 12 }}
            value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
            placeholder="Add tag + Enter" />
        </div>
      </Field>

      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => f.title.trim() && onSave(f)}>Save Task</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date)) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dueLabel(d) {
  if (!d) return null
  const due = new Date(d)
  if (isNaN(due)) return null
  const now = new Date()
  const diffDays = Math.ceil((due.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86400000)
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, color: 'var(--red)', bg: 'var(--red-soft)' }
  if (diffDays === 0) return { text: 'Today', color: 'var(--amber)', bg: 'var(--amber-soft)' }
  if (diffDays === 1) return { text: 'Tomorrow', color: 'var(--amber)', bg: 'var(--amber-soft)' }
  if (diffDays <= 7) return { text: `In ${diffDays}d`, color: 'var(--accent)', bg: 'var(--accent-soft)' }
  return { text: fmtDate(d), color: 'var(--text-muted)', bg: 'var(--surface2)' }
}

function TaskRow({ t, clientName, projectName, onToggle, onEdit, onDelete, checked, onCheck }) {
  const st = STATUS.find(s => s.id === t.status) || STATUS[0]
  const pr = PRIORITY.find(p => p.id === t.priority) || PRIORITY[1]
  const due = dueLabel(t.dueDate)
  const done = t.status === 'done'
  return (
    <div className="task-list-row flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: checked ? 'var(--accent-soft)' : 'transparent', transition: 'background var(--transition-fast)' }}>
      <input type="checkbox" className="mt-1" checked={checked} onChange={onCheck} onClick={e => e.stopPropagation()} />
      <button onClick={onToggle} className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: done ? 'var(--green)' : 'transparent', border: `1.5px solid ${done ? 'var(--green)' : 'var(--border)'}`, cursor: 'pointer' }}>
        {done && <span style={{ color: 'var(--accent-text)', fontSize: 10 }}>âœ“</span>}
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-medium" style={{ color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: pr.color }}>{pr.label}</span>
          {due && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: due.bg, color: due.color }}>{due.text}</span>}
        </div>
        {(clientName || projectName || (t.tags?.length > 0)) && (
          <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
            {clientName && <span>ðŸ‘¤ {clientName}</span>}
            {projectName && <span>ðŸ“ {projectName}</span>}
            {(t.tags || []).map(tag => <span key={tag} className="px-1.5 rounded" style={{ background: 'var(--surface2)' }}>#{tag}</span>)}
          </div>
        )}
      </div>
      <div className="flex gap-1 flex-nowrap justify-end shrink-0" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <ActionIconButton
          label={done ? 'Reopen task' : 'Resolve task'}
          icon={done ? RotateCcw : CheckCircle2}
          tone={done ? 'muted' : 'green'}
          onClick={onToggle}
        />
        <ActionIconButton label="Edit task" icon={Pencil} onClick={onEdit} />
        <ActionIconButton label="Delete task" icon={Trash2} tone="danger" onClick={onDelete} />
        <ItemActionsMenu
          label={`Actions for ${t.title}`}
          actions={[
            { label: 'Edit task', onClick: onEdit },
            { label: done ? 'Mark open' : 'Mark done', onClick: onToggle },
            { label: 'Delete task', tone: 'danger', onClick: onDelete },
          ]}
        />
      </div>
    </div>
  )
}

function BoardColumn({ status, statuses, tasks, clients, projects, onDrop, onEdit, onToggle }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, status.id) }}
      className="board-column rounded-xl p-3"
      style={{ background: over ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid var(--border)', transition: 'background var(--transition-fast)' }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: status.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: status.color }}>{status.label}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map(t => {
          const client = clients.find(c => c.id === t.clientId)
          const project = projects.find(p => p.id === t.projectId)
          const pr = PRIORITY.find(p => p.id === t.priority) || PRIORITY[1]
          const due = dueLabel(t.dueDate)
          return (
            <div key={t.id}
              draggable
              onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
              onClick={() => onEdit(t)}
              className="rounded-lg p-3 cursor-grab active:cursor-grabbing"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm font-medium flex-1" style={{ color: 'var(--text)' }}>{t.title}</div>
                <ActionIconButton
                  label={t.status === 'done' ? 'Reopen task' : 'Resolve task'}
                  icon={t.status === 'done' ? RotateCcw : CheckCircle2}
                  tone={t.status === 'done' ? 'muted' : 'green'}
                  onClick={() => onToggle(t)}
                  className="shrink-0"
                />
                <span className="text-[9px] font-bold uppercase tracking-wider shrink-0" style={{ color: pr.color }}>{pr.label}</span>
              </div>
              {t.description && <div className="text-[11px] mb-2 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{t.description}</div>}
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                {due && <span className="px-1.5 py-0.5 rounded-full" style={{ background: due.bg, color: due.color }}>{due.text}</span>}
                {client && <span style={{ color: 'var(--text-muted)' }}>ðŸ‘¤ {client.name}</span>}
                {project && <span style={{ color: 'var(--text-muted)' }}>ðŸ“ {project.name}</span>}
              </div>
              <ThemedSelect
                className="board-card-move mt-2"
                value=""
                aria-label={`Move ${t.title} to another status`}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  e.stopPropagation()
                  if (e.target.value) onDrop(t.id, e.target.value)
                  e.target.value = ''
                }}
              >
                <option value="">Move...</option>
                {(statuses || []).filter(s => s.id !== status.id).map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </ThemedSelect>
            </div>
          )
        })}
        {tasks.length === 0 && <div className="text-center text-[11px] py-8" style={{ color: 'var(--text-muted)' }}>No tasks</div>}
      </div>
    </div>
  )
}

export default function TasksManager() {
  const [tasks, setTasks] = useState([])
  const [accounts, setAccounts] = useState([])
  const clients = accounts // compat alias â€” JSX still references `clients` in many places
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list') // list | card | kanban
  const activeView = view === 'board' ? 'kanban' : view
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterClient, setFilterClient] = useState('all')
  const [filterDue, setFilterDue] = useState('all') // all | today | week | overdue
  const [sortBy, setSortBy] = useState('priority') // priority | due | updated | created
  const [sortDir, setSortDir] = useState('asc')
  const [editing, setEditing] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const refresh = async () => {
    const [t, c, p] = await Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
    ])
    setTasks(t.tasks || [])
    setAccounts(c.accounts || [])
    setProjects(p.projects || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    const resetFromMainNav = (event) => {
      if (event?.detail?.tab !== 'tasks') return
      setView('card')
      setEditing(null)
      setShowAdd(false)
      setSelected(new Set())
    }
    window.addEventListener('fcc:main-nav', resetFromMainNav)
    return () => window.removeEventListener('fcc:main-nav', resetFromMainNav)
  }, [])

  const save = async (form) => {
    const action = form.id ? 'update' : 'add'
    await api('/api/tasks', { action, task: form })
    await refresh()
    setEditing(null); setShowAdd(false)
  }

  const toggleDone = async (t) => {
    const nextStatus = t.status === 'done' ? 'todo' : 'done'
    await api('/api/tasks', { action: 'update', task: { id: t.id, status: nextStatus } })
    await refresh()
  }

  const del = async (id) => {
    if (!confirm('Delete this task?')) return
    await api('/api/tasks', { action: 'delete', id })
    await refresh()
  }

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} task(s)?`)) return
    await api('/api/tasks', { action: 'bulk_delete', ids: [...selected] })
    setSelected(new Set())
    await refresh()
  }

  const bulkMark = async (status) => {
    await api('/api/tasks', { action: 'bulk_status', ids: [...selected], status })
    setSelected(new Set())
    await refresh()
  }

  const dropToColumn = async (taskId, status) => {
    await api('/api/tasks', { action: 'update', task: { id: taskId, status } })
    await refresh()
  }

  const filtered = useMemo(() => {
    const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
    const now = Date.now()
    let out = tasks
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.tags || []).some(x => x.toLowerCase().includes(q)))
    }
    if (filterStatus !== 'all') out = out.filter(t => t.status === filterStatus)
    if (filterPriority !== 'all') out = out.filter(t => t.priority === filterPriority)
    if (filterClient !== 'all') out = out.filter(t => t.clientId === filterClient)
    if (filterDue !== 'all') {
      out = out.filter(t => {
        if (!t.dueDate) return false
        const diff = new Date(t.dueDate).getTime() - now
        if (filterDue === 'overdue') return diff < 0 && t.status !== 'done'
        if (filterDue === 'today') return diff >= -86400000 && diff < 86400000
        if (filterDue === 'week') return diff >= 0 && diff <= 7 * 86400000
        return true
      })
    }
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'priority') cmp = (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9)
      else if (sortBy === 'due') cmp = (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
      else if (sortBy === 'updated') cmp = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      else if (sortBy === 'created') cmp = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [tasks, search, filterStatus, filterPriority, filterClient, filterDue, sortBy, sortDir])

  const stats = useMemo(() => {
    const now = Date.now()
    return {
      todo: tasks.filter(t => t.status === 'todo').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
      done: tasks.filter(t => t.status === 'done').length,
      overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done').length,
      dueToday: tasks.filter(t => {
        if (!t.dueDate) return false
        const d = new Date(t.dueDate).getTime()
        return d >= now - 86400000 && d < now + 86400000 && t.status !== 'done'
      }).length,
    }
  }, [tasks])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 25)
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [search, filterStatus, filterPriority, filterClient, filterDue, sortBy, sortDir, activeView, pageSize, setPage])

  const select = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<CheckCircle2 size={20} />}
        title="Tasks"
        subtitle={`${tasks.length} total Â· ${stats.in_progress} active Â· ${stats.overdue} overdue`}
        actions={null}
        viewToggle={<ViewModeToggle value={activeView} onChange={setView} modes={['list', 'card', 'kanban']} />}
      />

      {/* Stat pills */}
      <div className="command-stat-grid grid grid-cols-3 md:grid-cols-6 gap-2 mb-5">
        {[
          { label: 'To Do', count: stats.todo, color: 'var(--text-muted)', bg: 'var(--surface2)' },
          { label: 'In Progress', count: stats.in_progress, color: 'var(--accent)', bg: 'var(--accent-soft)' },
          { label: 'Blocked', count: stats.blocked, color: 'var(--red)', bg: 'var(--red-soft)' },
          { label: 'Done', count: stats.done, color: 'var(--green)', bg: 'var(--green-soft)' },
          { label: 'Due Today', count: stats.dueToday, color: 'var(--amber)', bg: 'var(--amber-soft)' },
          { label: 'Overdue', count: stats.overdue, color: 'var(--red)', bg: 'var(--red-soft)' },
        ].map(s => (
          <div key={s.label} className="command-stat-card rounded-lg p-3" style={{ background: s.bg, border: '1px solid var(--border)' }}>
            <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.count}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: s.color, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="command-toolbar flex gap-2 items-center flex-wrap mb-4">
        <input style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', flex: 1, minWidth: 200 }}
          placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />

        <ThemedSelect style={select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All Priority</option>
          {PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="all">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterDue} onChange={e => setFilterDue(e.target.value)}>
          <option value="all">Any Due</option>
          <option value="overdue">Overdue</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
        </ThemedSelect>

        <ThemedSelect style={select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="priority">Sort: Priority</option>
          <option value="due">Sort: Due Date</option>
          <option value="updated">Sort: Updated</option>
          <option value="created">Sort: Created</option>
        </ThemedSelect>
        <button style={{ ...select, cursor: 'pointer', minWidth: 32 }} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? 'â†‘' : 'â†“'}</button>

        <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setShowAdd(true)}>New Task</button>
        <BulkActionsMenu
          selectedCount={selected.size}
          totalCount={paginated.length}
          onSelectPage={() => setSelected(new Set(paginated.map(task => task.id)))}
          onClearSelection={() => setSelected(new Set())}
          onDeleteSelected={bulkDelete}
          actions={[
            { label: 'Mark done', onClick: () => bulkMark('done'), disabled: selected.size === 0 },
            { label: 'Mark active', onClick: () => bulkMark('in_progress'), disabled: selected.size === 0 },
          ]}
        />
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded-lg" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
            <ActionIconButton label="Resolve selected tasks" icon={CheckCircle2} tone="green" onClick={() => bulkMark('done')} />
            <ActionIconButton label="Mark selected tasks active" icon={RotateCcw} onClick={() => bulkMark('in_progress')} />
            <ActionIconButton label="Delete selected tasks" icon={Trash2} tone="danger" onClick={bulkDelete} />
          </div>
          <button className="text-xs ml-auto" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Body */}
      {loading ? <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">âœ…</div>
            <p style={{ color: 'var(--text-muted)' }}>{tasks.length === 0 ? 'No tasks yet. Add your first task to get started.' : 'No tasks match these filters.'}</p>
          </div>
        ) : activeView === 'list' ? (
          <>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {paginated.map(t => (
              <TaskRow key={t.id} t={t}
                clientName={clients.find(c => c.id === t.clientId)?.name}
                projectName={projects.find(p => p.id === t.projectId)?.name}
                checked={selected.has(t.id)}
                onCheck={() => setSelected(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })}
                onToggle={() => toggleDone(t)}
                onEdit={() => setEditing(t)}
                onDelete={() => del(t.id)} />
            ))}
          </div>
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="tasks" />
          </>
        ) : activeView === 'card' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {paginated.map(t => {
                const st = STATUS.find(s => s.id === t.status) || STATUS[0]
                const pr = PRIORITY.find(p => p.id === t.priority) || PRIORITY[1]
                const due = dueLabel(t.dueDate)
                const done = t.status === 'done'
                const clientName = clients.find(c => c.id === t.clientId)?.name
                const projectName = projects.find(p => p.id === t.projectId)?.name
                return (
                  <div key={t.id} className="rounded-lg flex flex-col" style={{ background: 'var(--surface)', border: selected.has(t.id) ? '2px solid var(--accent)' : '1px solid var(--border)', padding: 12, gap: 10, cursor: 'pointer' }} onClick={() => setEditing(t)}>
                    <div className="flex gap-3 min-w-0">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => setSelected(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })} onClick={e => e.stopPropagation()} aria-label={`Select ${t.title}`} style={{ alignSelf: 'start', marginTop: 4 }} />
                      <button className="rounded-md grid place-items-center" style={{ width: 32, height: 32, background: done ? 'var(--green-soft)' : 'var(--surface2)', color: done ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)', flex: '0 0 auto', fontSize: 0 }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleDone(t) }} aria-label={done ? `Mark ${t.title} open` : `Mark ${t.title} done`} title={done ? 'Mark open' : 'Mark done'}>
                        {done ? <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" /> : <Circle size={16} strokeWidth={2.2} aria-hidden="true" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm leading-tight truncate" style={{ color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
                        <div className="text-xs truncate mt-1" style={{ color: 'var(--text-muted)' }}>{clientName || 'No client'} Â· {projectName || 'No project'}</div>
                      </div>
                      <ItemActionsMenu
                        label={`Actions for ${t.title}`}
                        actions={[
                          { label: 'Edit task', onClick: () => setEditing(t) },
                          { label: done ? 'Mark open' : 'Mark done', onClick: () => toggleDone(t) },
                          { label: 'Delete task', tone: 'danger', onClick: () => del(t.id) },
                        ]}
                      />
                    </div>
                    <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                      <ActionIconButton
                        label={done ? 'Reopen task' : 'Resolve task'}
                        icon={done ? RotateCcw : CheckCircle2}
                        tone={done ? 'muted' : 'green'}
                        onClick={() => toggleDone(t)}
                      />
                      <ActionIconButton label="Edit task" icon={Pencil} onClick={() => setEditing(t)} />
                      <ActionIconButton label="Delete task" icon={Trash2} tone="danger" onClick={() => del(t.id)} />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      <span className="text-xs px-2 py-1 rounded-full font-semibold uppercase" style={{ background: 'var(--surface2)', color: pr.color }}>{pr.label}</span>
                      {due && <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: due.bg, color: due.color }}>{due.text}</span>}
                    </div>
                    {t.description && <div className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-muted)' }}>{t.description}</div>}
                    {(t.tags || []).length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {(t.tags || []).slice(0, 5).map(tag => <span key={tag} className="text-[11px] px-1.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>#{tag}</span>)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="tasks" />
          </>
        ) : (
          <BoardWorkbench label="Task board">
            {STATUS.map(s => (
              <BoardColumn key={s.id} status={s}
                statuses={STATUS}
                tasks={filtered.filter(t => t.status === s.id)}
                clients={clients} projects={projects}
                onDrop={dropToColumn} onEdit={setEditing} onToggle={toggleDone} />
            ))}
          </BoardWorkbench>
        )
      }

      {(showAdd || editing) && (
        <TaskForm task={editing} clients={clients} projects={projects}
          onSave={save} onClose={() => { setEditing(null); setShowAdd(false) }} />
      )}
    </div>
  )
}
