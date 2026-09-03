'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'
import ProjectDetail from './ProjectDetail'
import PageHeader from '../components/PageHeader'
import { Paginator, usePagination } from '../components/Paginator'
import BoardWorkbench from '../components/BoardWorkbench'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { FolderKanban } from 'lucide-react'
import OpenOctiEmptyState from '../components/OpenOctiEmptyState'
import { isOpenOcti } from '@/lib/edition'

const STATUS = [
  { id: 'active', label: 'Active', color: 'var(--green)', bg: 'var(--green-soft)' },
  { id: 'paused', label: 'Paused', color: 'var(--text-muted)', bg: 'var(--surface2)' },
  { id: 'completed', label: 'Completed', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  { id: 'invoiced', label: 'Invoiced', color: 'var(--amber)', bg: 'var(--amber-soft)' },
]

const PRIORITY = [
  { id: 'low', label: 'Low', color: 'var(--text-muted)' },
  { id: 'medium', label: 'Medium', color: 'var(--accent)' },
  { id: 'high', label: 'High', color: 'var(--amber)' },
  { id: 'urgent', label: 'Urgent', color: 'var(--red)' },
]

const DUE_FILTERS = [
  { id: 'all', label: 'All Due Dates' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due Today' },
  { id: 'week', label: 'Due This Week' },
  { id: 'none', label: 'No Due Date' },
]

const IN_HOUSE_ACCOUNT_ID = '__in_house__'
const IN_HOUSE_LABEL = 'Farrington Development'

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

function getAccountId(project) {
  if (project?.isInternal || project?.ownerOrganization === 'farrington-development') return IN_HOUSE_ACCOUNT_ID
  return project?.accountId || project?.clientId || ''
}

function getAccountName(project) {
  if (project?.isInternal || project?.ownerOrganization === 'farrington-development') return IN_HOUSE_LABEL
  return project?.accountName || project?.clientName || '(no account)'
}

function ProjectForm({ project, accounts, onSave, onClose }) {
  const initial = project
    ? { ...project, accountId: getAccountId(project) }
    : {
        name: '',
        description: '',
        accountId: accounts[0]?.id || '',
        isInternal: false,
        status: 'active',
        priority: 'medium',
        budget: '',
        rate: '',
        estimatedHours: '',
        actualHours: 0,
        progress: 0,
        startDate: '',
        dueDate: '',
        tags: [],
      }
  const [f, setF] = useState(initial)
  const [tagInput, setTagInput] = useState('')
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const addTag = () => {
    const t = tagInput.trim()
    if (t && !(f.tags || []).includes(t)) u('tags', [...(f.tags || []), t])
    setTagInput('')
  }
  const removeTag = (t) => u('tags', (f.tags || []).filter(x => x !== t))
  const setOwner = (value) => {
    if (value === IN_HOUSE_ACCOUNT_ID) {
      setF(p => ({ ...p, accountId: '', isInternal: true, ownerOrganization: 'farrington-development' }))
    } else {
      setF(p => ({ ...p, accountId: value, isInternal: false, ownerOrganization: null }))
    }
  }
  const canSave = f.name.trim() && getAccountId(f)

  return (
    <Modal title={project?.id ? 'Edit Project' : 'Add Project'} onClose={onClose} wide>
      <Field label="Project Name *"><input style={inputStyle} value={f.name} onChange={e => u('name', e.target.value)} placeholder="Website redesign" autoFocus /></Field>

      <Field label="Owner *">
        <ThemedSelect style={inputStyle} value={getAccountId(f)} onChange={e => setOwner(e.target.value)}>
          <option value="">Select account</option>
          <option value={IN_HOUSE_ACCOUNT_ID}>{IN_HOUSE_LABEL}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </ThemedSelect>
      </Field>

      <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={f.description || ''} onChange={e => u('description', e.target.value)} placeholder="Scope, deliverables, context..." /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <ThemedSelect style={inputStyle} value={f.status || 'active'} onChange={e => u('status', e.target.value)}>
            {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Priority">
          <ThemedSelect style={inputStyle} value={f.priority || 'medium'} onChange={e => u('priority', e.target.value)}>
            {PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </ThemedSelect>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Budget ($)"><input type="number" style={inputStyle} value={f.budget || ''} onChange={e => u('budget', e.target.value)} placeholder="0" /></Field>
        <Field label="Rate ($/hr)"><input type="number" style={inputStyle} value={f.rate || ''} onChange={e => u('rate', e.target.value)} placeholder="0" /></Field>
        <Field label="Est. Hours"><input type="number" style={inputStyle} value={f.estimatedHours || ''} onChange={e => u('estimatedHours', e.target.value)} placeholder="0" /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start Date"><input type="date" style={inputStyle} value={f.startDate || ''} onChange={e => u('startDate', e.target.value)} /></Field>
        <Field label="Due Date"><input type="date" style={inputStyle} value={f.dueDate || ''} onChange={e => u('dueDate', e.target.value)} /></Field>
      </div>

      <Field label={`Progress (${f.progress || 0}%)`}>
        <input type="range" min="0" max="100" step="5" value={f.progress || 0} onChange={e => u('progress', Number(e.target.value))} className="w-full" />
      </Field>

      <Field label="Tags">
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', minHeight: 40 }}>
          {(f.tags || []).map(t => (
            <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {t}<button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100" type="button">x</button>
            </span>
          ))}
          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', flex: 1, minWidth: 80, fontSize: 12 }}
            value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
            placeholder="Add tag + Enter" />
        </div>
      </Field>

      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          disabled={!canSave} onClick={() => canSave && onSave(f)}>Save Project</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function DeleteProjectModal({ project, onClose, onDelete }) {
  const [mode, setMode] = useState(project?.mirrorStatus === 'mirrored' ? 'server_and_gitea' : 'record_only')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const destructive = mode === 'server_and_gitea'
  const expected = `DELETE ${project.name}`
  const canDelete = !destructive || confirmText === expected

  const submit = async () => {
    if (!canDelete || busy) return
    setBusy(true)
    setError('')
    try {
      await onDelete(project, { deleteMode: mode, confirmText })
    } catch (err) {
      setError(err.message || 'Delete failed')
      setBusy(false)
    }
  }

  return (
    <Modal title={`Delete ${project.name}`} onClose={busy ? () => {} : onClose} wide>
      <div className="space-y-3 text-sm" style={{ color: 'var(--text)' }}>
        <label className="block rounded-lg p-3 cursor-pointer" style={{ background: mode === 'record_only' ? 'var(--accent-soft)' : 'var(--surface2)', border: '1px solid var(--border)' }}>
          <input type="radio" name="deleteMode" checked={mode === 'record_only'} onChange={() => setMode('record_only')} className="mr-2" />
          Delete CRM project record only
          <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Leaves the Gitea repo and project folders in place.</div>
        </label>

        <label className="block rounded-lg p-3 cursor-pointer" style={{ background: destructive ? 'var(--red-soft)' : 'var(--surface2)', border: '1px solid var(--border)' }}>
          <input type="radio" name="deleteMode" checked={destructive} onChange={() => setMode('server_and_gitea')} className="mr-2" />
          Delete live server workspace, Gitea repo, and CRM record
          <div className="mt-2 grid gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <div>Ubuntu: {project.ubuntuPath || project.repositoryPath || 'no server path recorded'}</div>
            <div>Gitea: {project.giteaRepo || project.repositoryUrl || 'no repo recorded'}</div>
            <div>Windows: {project.windowsPath || project.localPath || 'no Windows path recorded'} is not deleted from the live server.</div>
          </div>
        </label>

        {destructive && (
          <Field label={`Type ${expected} to confirm`}>
            <input style={inputStyle} value={confirmText} onChange={e => setConfirmText(e.target.value)} autoFocus />
          </Field>
        )}

        {error && <div className="rounded-lg p-2 text-xs" style={{ color: 'var(--red)', background: 'var(--red-soft)' }}>{error}</div>}

        <div className="flex gap-2 pt-2">
          <button className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--red)', color: '#fff' }}
            disabled={!canDelete || busy} onClick={submit}>{busy ? 'Deleting...' : destructive ? 'Delete Everywhere Available From Server' : 'Delete CRM Record'}</button>
          <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date)) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getDueDays(d) {
  if (!d) return null
  const due = new Date(d)
  if (isNaN(due)) return null
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - startOfToday().getTime()) / 86400000)
}

function dueLabel(d, status) {
  if (!d || status === 'completed' || status === 'invoiced') return null
  const diffDays = getDueDays(d)
  if (diffDays === null) return null
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, color: 'var(--red)', bg: 'var(--red-soft)' }
  if (diffDays === 0) return { text: 'Due today', color: 'var(--amber)', bg: 'var(--amber-soft)' }
  if (diffDays <= 7) return { text: `In ${diffDays}d`, color: 'var(--accent)', bg: 'var(--accent-soft)' }
  return { text: fmtDate(d), color: 'var(--text-muted)', bg: 'var(--surface2)' }
}

function ProgressBar({ value }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, height: '100%', background: value >= 100 ? 'var(--green)' : 'var(--accent)', transition: 'width var(--transition-smooth)' }} />
    </div>
  )
}

function ProjectCard({ p, tasks, onEdit, onDelete, onOpen, selected = false, onCheck }) {
  const st = STATUS.find(s => s.id === p.status) || STATUS[0]
  const pr = PRIORITY.find(x => x.id === p.priority) || PRIORITY[1]
  const due = dueLabel(p.dueDate, p.status)
  const projectTasks = tasks.filter(t => t.projectId === p.id || t.linkedTo?.projectId === p.id)
  const openTasks = projectTasks.filter(t => t.status !== 'done').length
  const budget = Number(p.budget) || (Number(p.rate) || 0) * (Number(p.estimatedHours) || 0)

  return (
    <div className="rounded-lg p-3 cursor-pointer transition-all"
      style={{ background: 'var(--surface)', border: selected ? '2px solid var(--accent)' : '1px solid var(--border)' }}
      onClick={onOpen || onEdit}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
      <div className="flex items-start gap-3 mb-2">
        {onCheck && <input type="checkbox" checked={selected} onChange={onCheck} onClick={e => e.stopPropagation()} aria-label={`Select ${p.name}`} style={{ marginTop: 4 }} />}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{p.name}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{getAccountName(p)}</div>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider shrink-0" style={{ color: pr.color }}>{pr.label}</span>
        <ItemActionsMenu
          label={`Actions for ${p.name}`}
          actions={[
            { label: 'Open project', onClick: onOpen || onEdit },
            onEdit ? { label: 'Edit project', onClick: onEdit } : null,
            { label: 'Delete project', tone: 'danger', onClick: onDelete },
          ]}
        />
      </div>

      {p.description && <div className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{p.description}</div>}

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        {due && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: due.bg, color: due.color }}>{due.text}</span>}
        {openTasks > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{openTasks} open task{openTasks !== 1 ? 's' : ''}</span>}
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Progress</span>
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text)' }}>{p.progress || 0}%</span>
        </div>
        <ProgressBar value={p.progress} />
      </div>

      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="text-xs font-mono" style={{ color: budget > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
          {budget > 0 ? `$${budget.toLocaleString()}` : '-'}
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({ status, statuses, projects, tasks, onDrop, onEdit, onDelete, onOpen }) {
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
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{projects.length}</span>
      </div>
      <div className="space-y-2">
        {projects.map(p => (
          <div key={p.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', p.id)}>
            <ProjectCard p={p} tasks={tasks} onOpen={onOpen ? () => onOpen(p.id) : undefined} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
            <ThemedSelect
              className="board-card-move mt-2"
              value=""
              aria-label={`Move ${p.name} to another status`}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                e.stopPropagation()
                if (e.target.value) onDrop(p.id, e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Move...</option>
              {(statuses || []).filter(s => s.id !== status.id).map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </ThemedSelect>
          </div>
        ))}
        {projects.length === 0 && <div className="text-center text-[11px] py-8" style={{ color: 'var(--text-muted)' }}>No projects</div>}
      </div>
    </div>
  )
}

export default function ProjectsManager({ onNavigate }) {
  const [projects, setProjects] = useState([])
  const [accounts, setAccounts] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterScope, setFilterScope] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterDue, setFilterDue] = useState('all')
  const [filterTag, setFilterTag] = useState('all')
  const [sortBy, setSortBy] = useState('dueDate')
  const [sortDir, setSortDir] = useState('asc')
  const [editing, setEditing] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [selectedProjects, setSelectedProjects] = useState(new Set())
  const [selectedProjectId, setSelectedProjectId] = useState(null)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('fcc-projects-selected') : null
    if (saved) setSelectedProjectId(saved)
  }, [])

  const openProject = (id) => {
    setSelectedProjectId(id)
    try { localStorage.setItem('fcc-projects-selected', id) } catch {}
  }
  const closeProject = () => {
    setSelectedProjectId(null)
    try { localStorage.removeItem('fcc-projects-selected') } catch {}
  }

  const refresh = async () => {
    setLoadError('')
    try {
      const [projectRes, accountRes, taskRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/accounts'),
        fetch('/api/tasks'),
      ])
      const [p, a, t] = await Promise.all([projectRes.json(), accountRes.json(), taskRes.json()])
      const failed = [
        ['projects', projectRes, p],
        ['accounts', accountRes, a],
        ['tasks', taskRes, t],
      ].find(([, res]) => !res.ok)
      if (failed) {
        const [name, res, body] = failed
        throw new Error(res.status === 401 ? 'Your CRM session needs a fresh sign-in.' : `${name} failed to load: ${body?.error || res.status}`)
      }
      setProjects(p.projects || [])
      setAccounts(a.accounts || [])
      setTasks(t.tasks || [])
    } catch (err) {
      setProjects([])
      setAccounts([])
      setTasks([])
      setLoadError(err.message || 'Projects failed to load.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const handler = (e) => {
      const r = e.detail
      if (!r || r.type !== 'project') return
      if (typeof window !== 'undefined') window.__fccPendingProjectSelect = { id: r.id, ts: Date.now() }
      if (r.subTab || r.itemQuery) {
        window.__fccPendingProjectSubTab = { subTab: r.subTab, itemQuery: r.itemQuery, projectId: r.id, ts: Date.now() }
        setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:record-subtab', {
          detail: { subTab: r.subTab, itemQuery: r.itemQuery, projectId: r.id },
        })), 300)
      }
      const match = projects.find(p => p.id === r.id)
      if (match) { openProject(match.id); window.__fccPendingProjectSelect = null }
    }
    window.addEventListener('fcc:select-record', handler)
    return () => window.removeEventListener('fcc:select-record', handler)
  }, [projects])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const pending = window.__fccPendingProjectSelect
    if (!pending || Date.now() - pending.ts > 10000) return
    const match = projects.find(p => p.id === pending.id)
    if (match) { openProject(match.id); window.__fccPendingProjectSelect = null }
  }, [projects])

  const save = async (form) => {
    const action = form.id ? 'update' : 'add'
    const { clientId, accountName, clientName, ...rest } = form
    const selectedOwner = rest.accountId || clientId
    const inHouse = selectedOwner === IN_HOUSE_ACCOUNT_ID || rest.isInternal
    const project = {
      ...rest,
      accountId: inHouse ? null : selectedOwner,
      isInternal: inHouse,
      ownerOrganization: inHouse ? 'farrington-development' : null,
    }
    await api('/api/projects', { action, project })
    await refresh()
    setEditing(null)
    setShowAdd(false)
  }

  const del = (p) => {
    setDeleting(p)
  }

  const performDelete = async (p, options) => {
    const result = await api('/api/projects', { action: 'delete', id: p.id, ...options })
    if (result.error) throw new Error(result.error)
    await refresh()
    setDeleting(null)
  }

  const bulkDeleteProjects = async () => {
    if (!selectedProjects.size) return
    if (!confirm(`Delete ${selectedProjects.size} selected project record${selectedProjects.size === 1 ? '' : 's'} from CRM only? Server workspaces and Gitea repos will not be deleted.`)) return
    await api('/api/projects', { action: 'bulk_delete', ids: [...selectedProjects] })
    setSelectedProjects(new Set())
    await refresh()
  }

  const moveStatus = async (id, status) => {
    const p = projects.find(x => x.id === id)
    if (!p || p.status === status) return
    await api('/api/projects', { action: 'update', project: { id, status } })
    await refresh()
  }

  const availableTags = useMemo(() => {
    const set = new Set()
    projects.forEach(p => (p.tags || []).forEach(t => set.add(t)))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [projects])

  const filtered = useMemo(() => {
    const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
    let out = projects
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(p => (
        (p.name || '').toLowerCase().includes(q) ||
        getAccountName(p).toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q))
      ))
    }
    if (filterStatus !== 'all') out = out.filter(p => p.status === filterStatus)
    if (filterScope === 'in_house') out = out.filter(p => getAccountId(p) === IN_HOUSE_ACCOUNT_ID)
    if (filterScope === 'account') out = out.filter(p => getAccountId(p) !== IN_HOUSE_ACCOUNT_ID)
    if (filterAccount !== 'all') out = out.filter(p => getAccountId(p) === filterAccount)
    if (filterPriority !== 'all') out = out.filter(p => p.priority === filterPriority)
    if (filterTag !== 'all') out = out.filter(p => (p.tags || []).includes(filterTag))
    if (filterDue !== 'all') {
      out = out.filter(p => {
        const days = getDueDays(p.dueDate)
        if (filterDue === 'none') return days === null
        if (days === null) return false
        if (filterDue === 'overdue') return days < 0
        if (filterDue === 'today') return days === 0
        if (filterDue === 'week') return days >= 0 && days <= 7
        return true
      })
    }
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'priority') cmp = (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9)
      else if (sortBy === 'dueDate') cmp = (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
      else if (sortBy === 'updated') cmp = new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      else if (sortBy === 'progress') cmp = (a.progress || 0) - (b.progress || 0)
      else if (sortBy === 'budget') cmp = (Number(a.budget) || 0) - (Number(b.budget) || 0)
      else if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortBy === 'account') cmp = getAccountName(a).localeCompare(getAccountName(b))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [projects, search, filterStatus, filterScope, filterAccount, filterPriority, filterDue, filterTag, sortBy, sortDir])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 25)

  useEffect(() => {
    setPage(1)
    setSelectedProjects(new Set())
  }, [search, filterStatus, filterScope, filterAccount, filterPriority, filterDue, filterTag, sortBy, sortDir, view, pageSize, setPage])

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    internal: projects.filter(p => getAccountId(p) === IN_HOUSE_ACCOUNT_ID).length,
    completed: projects.filter(p => p.status === 'completed').length,
    invoiced: projects.filter(p => p.status === 'invoiced').length,
    totalValue: projects.reduce((s, p) => s + (Number(p.budget) || (Number(p.rate) || 0) * (Number(p.estimatedHours) || 0)), 0),
  }), [projects])

  const hasFilters = search || filterStatus !== 'all' || filterScope !== 'all' || filterAccount !== 'all' || filterPriority !== 'all' || filterDue !== 'all' || filterTag !== 'all'
  const clearFilters = () => {
    setSearch('')
    setFilterStatus('all')
    setFilterScope('all')
    setFilterAccount('all')
    setFilterPriority('all')
    setFilterDue('all')
    setFilterTag('all')
  }

  const select = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }
  const fmtUSD = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null
  if (selectedProject) {
    const accountName = getAccountName(selectedProject) || accounts.find(a => a.id === getAccountId(selectedProject))?.name
    return (
      <>
        <ProjectDetail
          project={selectedProject}
          accountName={accountName}
          onBack={closeProject}
          onEdit={(p) => setEditing(p)}
          onRefresh={refresh}
        />
        {editing && (
          <ProjectForm project={editing} accounts={accounts}
            onSave={save} onClose={() => setEditing(null)} />
        )}
      </>
    )
  }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<FolderKanban size={22} />}
        title="Projects"
        subtitle={`${stats.total} total / ${stats.active} active / ${fmtUSD(stats.totalValue)} pipeline`}
        actions={<button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setShowAdd(true)}>New Project</button>}
        viewToggle={<ViewModeToggle value={view} onChange={setView} modes={['list', 'card', 'kanban']} />}
      />

      <div className="command-stat-grid grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Active', count: stats.active, color: 'var(--green)', bg: 'var(--green-soft)' },
          { label: 'In House', count: stats.internal, color: 'var(--accent)', bg: 'var(--accent-soft)' },
          { label: 'Completed', count: stats.completed, color: 'var(--accent)', bg: 'var(--accent-soft)' },
          { label: 'Invoiced', count: stats.invoiced, color: 'var(--amber)', bg: 'var(--amber-soft)' },
          { label: 'Total Value', count: fmtUSD(stats.totalValue), color: 'var(--green)', bg: 'var(--green-soft)' },
        ].map(s => (
          <div key={s.label} className="command-stat-card rounded-lg p-3" style={{ background: s.bg, border: '1px solid var(--border)' }}>
            <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.count}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: s.color, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="command-toolbar flex gap-2 items-center flex-wrap mb-4">
        <input style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', flex: 1, minWidth: 200 }}
          placeholder="Search projects, accounts, tags..." value={search} onChange={e => setSearch(e.target.value)} />

        <ThemedSelect style={select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterScope} onChange={e => setFilterScope(e.target.value)}>
          <option value="all">All Project Types</option>
          <option value="account">Account Projects</option>
          <option value="in_house">Farrington Development</option>
        </ThemedSelect>

        <ThemedSelect style={select} value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="all">All Owners</option>
          <option value={IN_HOUSE_ACCOUNT_ID}>{IN_HOUSE_LABEL}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All Priority</option>
          {PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterDue} onChange={e => setFilterDue(e.target.value)}>
          {DUE_FILTERS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={filterTag} onChange={e => setFilterTag(e.target.value)} disabled={availableTags.length === 0}>
          <option value="all">All Tags</option>
          {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
        </ThemedSelect>

        <ThemedSelect style={select} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="dueDate">Sort: Due Date</option>
          <option value="priority">Sort: Priority</option>
          <option value="progress">Sort: Progress</option>
          <option value="budget">Sort: Budget</option>
          <option value="updated">Sort: Updated</option>
          <option value="name">Sort: Name</option>
          <option value="account">Sort: Account</option>
        </ThemedSelect>
        <button style={{ ...select, cursor: 'pointer', minWidth: 38 }} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? 'Asc' : 'Desc'}</button>
        {hasFilters && <button style={{ ...select, cursor: 'pointer' }} onClick={clearFilters}>Clear</button>}

        <BulkActionsMenu
          selectedCount={selectedProjects.size}
          totalCount={paginated.length}
          onSelectPage={() => setSelectedProjects(new Set(paginated.map(project => project.id)))}
          onClearSelection={() => setSelectedProjects(new Set())}
          onDeleteSelected={bulkDeleteProjects}
        />
      </div>

      {loading ? <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        : loadError ? (
          <div className="text-center py-16">
            <div className="text-lg font-semibold mb-2" style={{ color: 'var(--red)' }}>Projects did not load</div>
            <p className="mb-4" style={{ color: 'var(--text-muted)' }}>{loadError}</p>
            <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => { setLoading(true); refresh() }}>Retry</button>
          </div>
        )
        : filtered.length === 0 ? (
          projects.length === 0 && isOpenOcti() ? <OpenOctiEmptyState objectType="projects" title="Plan the work" description="Projects connect delivery milestones and tasks to the accounts you serve." /> : <div className="text-center py-16">
            <div className="text-4xl mb-3">P</div>
            <p style={{ color: 'var(--text-muted)' }}>{projects.length === 0 ? 'No projects yet.' : 'No projects match these filters.'}</p>
          </div>
        ) : view === 'card' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map(p => <ProjectCard key={p.id} p={p} tasks={tasks} selected={selectedProjects.has(p.id)} onCheck={() => setSelectedProjects(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} onOpen={() => openProject(p.id)} onEdit={() => setEditing(p)} onDelete={() => del(p)} />)}
            </div>
            <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="projects" />
          </>
        ) : view === 'list' ? (
          <>
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', width: 36 }}></th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Project</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Account</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Priority</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Progress</th>
                    <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Due</th>
                    <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Budget</th>
                    <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(p => {
                    const st = STATUS.find(s => s.id === p.status) || STATUS[0]
                    const pr = PRIORITY.find(x => x.id === p.priority) || PRIORITY[1]
                    const due = dueLabel(p.dueDate, p.status)
                    const budget = Number(p.budget) || (Number(p.rate) || 0) * (Number(p.estimatedHours) || 0)
                    return (
                      <tr key={p.id} onClick={() => openProject(p.id)} className="cursor-pointer" style={{ borderBottom: '1px solid var(--border)', background: selectedProjects.has(p.id) ? 'var(--accent-soft)' : '' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                        <td className="px-4 py-3"><input type="checkbox" checked={selectedProjects.has(p.id)} onChange={() => setSelectedProjects(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} onClick={e => e.stopPropagation()} aria-label={`Select ${p.name}`} /></td>
                        <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text)' }}>{p.name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{getAccountName(p)}</td>
                        <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                        <td className="px-4 py-3"><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pr.color }}>{pr.label}</span></td>
                        <td className="px-4 py-3 min-w-[100px]"><div className="flex items-center gap-2"><div className="flex-1"><ProgressBar value={p.progress} /></div><span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{p.progress || 0}%</span></div></td>
                        <td className="px-4 py-3 text-xs">{due ? <span className="px-2 py-0.5 rounded-full" style={{ background: due.bg, color: due.color }}>{due.text}</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: budget > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{budget > 0 ? fmtUSD(budget) : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <ItemActionsMenu
                              label={`Actions for ${p.name}`}
                              actions={[
                                { label: 'Open project', onClick: () => openProject(p.id) },
                                { label: 'Edit project', onClick: () => setEditing(p) },
                                { label: 'Delete project', tone: 'danger', onClick: () => del(p) },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="projects" />
          </>
        ) : (
          <>
            <BoardWorkbench label="Project board">
              {STATUS.map(s => (
                <KanbanColumn key={s.id} status={s}
                  statuses={STATUS}
                  projects={paginated.filter(p => p.status === s.id)}
                  tasks={tasks}
                  onDrop={moveStatus} onEdit={setEditing} onDelete={del} onOpen={openProject} />
              ))}
            </BoardWorkbench>
            <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="projects" />
          </>
        )
      }

      {(showAdd || editing) && (
        <ProjectForm project={editing} accounts={accounts}
          onSave={save} onClose={() => { setEditing(null); setShowAdd(false) }} />
      )}
      {deleting && (
        <DeleteProjectModal project={deleting} onClose={() => setDeleting(null)} onDelete={performDelete} />
      )}
    </div>
  )
}
