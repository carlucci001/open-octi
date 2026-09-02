'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'
import PaymentForm from '../components/PaymentForm'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import { Paginator, usePagination } from '../components/Paginator'
import { gvCallUrl } from '@/lib/google-voice'
import CallButton from './../components/CallButton'
import { useActiveRecord } from '@/lib/active-record'

const STATUS_STYLES = {
  active: { bg: 'rgba(166,227,161,0.15)', color: 'var(--green)' },
  completed: { bg: 'rgba(137,180,250,0.15)', color: 'var(--accent)' },
  invoiced: { bg: 'rgba(249,226,175,0.15)', color: 'var(--amber)' },
  paused: { bg: 'rgba(127,132,156,0.15)', color: 'var(--text-muted)' },
}

const STAGE = [
  { id: 'prospect', label: 'Prospect', color: 'var(--text-muted)', bg: 'var(--surface2)' },
  { id: 'onboarding', label: 'Onboarding', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  { id: 'active', label: 'Active', color: 'var(--green)', bg: 'var(--green-soft)' },
  { id: 'paused', label: 'Paused', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  { id: 'archived', label: 'Archived', color: 'var(--text-muted)', bg: 'var(--surface2)' },
]
const PRIORITY = [
  { id: 'low', label: 'Low', color: 'var(--text-muted)' },
  { id: 'medium', label: 'Medium', color: 'var(--accent)' },
  { id: 'high', label: 'High', color: 'var(--amber)' },
  { id: 'vip', label: 'VIP', color: 'var(--red)' },
]

function initials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
}

function stageBadge(stage) { return STAGE.find(s => s.id === stage) || STAGE[2] }
function priorityMeta(p) { return PRIORITY.find(x => x.id === p) || PRIORITY[1] }

function fmtRelative(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  const diffDays = Math.round((Date.now() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function overdueFollowUp(c) { return c.nextFollowUpAt && new Date(c.nextFollowUpAt).getTime() < Date.now() }

function api(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text', area }) {
  const style = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: area ? 'vertical' : undefined }
  return (
    <div className="mb-3">
      <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {area ? <textarea style={{ ...style, minHeight: 60 }} value={value} onChange={onChange} placeholder={placeholder} /> :
        <input style={style} type={type} value={value} onChange={onChange} placeholder={placeholder} />}
    </div>
  )
}

function ClientForm({ client, onSave, onClose }) {
  const [f, setF] = useState(client || {
    name: '', company: '', email: '', phone: '', website: '', address: '', notes: '',
    stage: 'active', priority: 'medium', tags: [],
    lastContactedAt: '', nextFollowUpAt: '',
  })
  const [tagInput, setTagInput] = useState('')
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const addTag = () => { const t = tagInput.trim(); if (t && !(f.tags || []).includes(t)) u('tags', [...(f.tags || []), t]); setTagInput('') }
  const removeTag = (t) => u('tags', (f.tags || []).filter(x => x !== t))
  const selectStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  return (
    <Modal title={client?.id ? 'Edit Client' : 'Add Client'} onClose={onClose}>
      <Input label="Name *" value={f.name} onChange={e => u('name', e.target.value)} placeholder="Client name" />
      <Input label="Company" value={f.company} onChange={e => u('company', e.target.value)} placeholder="Acme Corp" />
      <Input label="Email" value={f.email} onChange={e => u('email', e.target.value)} placeholder="email@example.com" type="email" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Phone" value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="PHONE_REDACTED" />
        <Input label="Website" value={f.website} onChange={e => u('website', e.target.value)} placeholder="example.com" />
      </div>
      <Input label="Address" value={f.address} onChange={e => u('address', e.target.value)} placeholder="123 Main St, City, State" />

      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Stage</label>
          <ThemedSelect style={selectStyle} value={f.stage || 'active'} onChange={e => u('stage', e.target.value)}>
            {STAGE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </ThemedSelect>
        </div>
        <div className="mb-3">
          <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Priority</label>
          <ThemedSelect style={selectStyle} value={f.priority || 'medium'} onChange={e => u('priority', e.target.value)}>
            {PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </ThemedSelect>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Last Contacted" value={f.lastContactedAt ? f.lastContactedAt.slice(0, 10) : ''} onChange={e => u('lastContactedAt', e.target.value)} type="date" />
        <Input label="Next Follow-up" value={f.nextFollowUpAt ? f.nextFollowUpAt.slice(0, 10) : ''} onChange={e => u('nextFollowUpAt', e.target.value)} type="date" />
      </div>

      <div className="mb-3">
        <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Tags</label>
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', minHeight: 40 }}>
          {(f.tags || []).map(t => (
            <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {t}<button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100">×</button>
            </span>
          ))}
          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', flex: 1, minWidth: 80, fontSize: 12 }}
            value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
            placeholder="Add tag + Enter" />
        </div>
      </div>

      <Input label="Notes" value={f.notes} onChange={e => u('notes', e.target.value)} placeholder="Notes about this client..." area />
      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => f.name && onSave(f)}>Save</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function ProjectForm({ project, onSave, onClose }) {
  const [f, setF] = useState(project || { name: '', description: '', status: 'active', rate: '', estimatedHours: '' })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={project?.id ? 'Edit Project' : 'Add Project'} onClose={onClose}>
      <Input label="Project Name *" value={f.name} onChange={e => u('name', e.target.value)} placeholder="Website redesign" />
      <Input label="Description" value={f.description} onChange={e => u('description', e.target.value)} placeholder="Scope and details..." area />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Rate ($)" value={f.rate} onChange={e => u('rate', e.target.value)} placeholder="0.00" type="number" />
        <Input label="Est. Hours" value={f.estimatedHours} onChange={e => u('estimatedHours', e.target.value)} placeholder="0" type="number" />
      </div>
      <div className="mb-3">
        <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Status</label>
        <ThemedSelect style={{ background: 'var(--surface2)', border: '1px solid #2a2d42', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none' }}
          value={f.status} onChange={e => u('status', e.target.value)}>
          {Object.keys(STATUS_STYLES).map(s => <option key={s} value={s}>{s}</option>)}
        </ThemedSelect>
      </div>
      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => f.name && onSave(f)}>Save</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function InvoiceForm({ client, onClose }) {
  const [projId, setProjId] = useState('')
  const [items, setItems] = useState([{ description: '', qty: 1, rate: 0 }])
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [generating, setGenerating] = useState(false)

  const addItem = () => setItems(p => [...p, { description: '', qty: 1, rate: 0 }])
  const updateItem = (i, k, v) => setItems(p => p.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i))
  const total = items.reduce((s, i) => s + (i.qty || 0) * (i.rate || 0), 0)

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, projectId: projId, items, notes, dueDate }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `invoice-${client.name.replace(/\s/g, '-')}.pdf`; a.click()
        URL.revokeObjectURL(url)
        onClose()
      }
    } catch (err) { console.error(err) }
    setGenerating(false)
  }

  return (
    <Modal title={`Invoice — ${client.name}`} onClose={onClose}>
      {client.projects?.length > 0 && (
        <div className="mb-3">
          <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Project</label>
          <ThemedSelect style={{ background: 'var(--surface2)', border: '1px solid #2a2d42', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none' }}
            value={projId} onChange={e => setProjId(e.target.value)}>
            <option value="">— Select project —</option>
            {client.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </ThemedSelect>
        </div>
      )}

      <div className="mb-3">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Line Items</label>
          <button className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }} onClick={addItem}>+ Item</button>
        </div>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 mb-2 items-end">
            <div className="flex-1">
              <input style={{ background: 'var(--surface2)', border: '1px solid #2a2d42', color: 'var(--text)', width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                placeholder="Description" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} />
            </div>
            <input style={{ background: 'var(--surface2)', border: '1px solid #2a2d42', color: 'var(--text)', width: 50, padding: '6px 8px', borderRadius: 6, fontSize: 12, outline: 'none', textAlign: 'center' }}
              type="number" placeholder="Qty" value={item.qty} onChange={e => updateItem(i, 'qty', parseInt(e.target.value) || 0)} />
            <input style={{ background: 'var(--surface2)', border: '1px solid #2a2d42', color: 'var(--text)', width: 80, padding: '6px 8px', borderRadius: 6, fontSize: 12, outline: 'none' }}
              type="number" placeholder="Rate" value={item.rate} onChange={e => updateItem(i, 'rate', parseFloat(e.target.value) || 0)} />
            <span className="text-xs font-mono" style={{ color: 'var(--green)', minWidth: 60, textAlign: 'right' }}>${((item.qty || 0) * (item.rate || 0)).toFixed(2)}</span>
            {items.length > 1 && <button className="text-xs" style={{ color: 'var(--red)' }} onClick={() => removeItem(i)}>✕</button>}
          </div>
        ))}
        <div className="text-right text-sm font-mono font-bold mt-2" style={{ color: 'var(--green)' }}>Total: ${total.toFixed(2)}</div>
      </div>

      <Input label="Due Date" value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="March 15, 2026" />
      <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, additional notes..." area />

      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--green)', color: 'var(--accent-text)' }} onClick={generate} disabled={generating}>
          {generating ? '⏳ Generating...' : '📄 Generate Invoice PDF'}
        </button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function ClientDetail({ client, payments, tasks = [], onBack, onEdit, onAddProject, onEditProject, onDeleteProject, onInvoice, onRefresh, onTaskChange }) {
  const [showPayment, setShowPayment] = useState(false)
  const [quickTask, setQuickTask] = useState('')
  const clientPayments = payments.filter(p => p.clientId === client.id || p.clientName === client.name)
  const clientTasks = tasks.filter(t => t.clientId === client.id)
  const openTasks = clientTasks.filter(t => t.status !== 'done')
  const doneTasks = clientTasks.filter(t => t.status === 'done')
  const totalPaid = clientPayments.filter(p => p.status === 'succeeded').reduce((s, p) => s + p.amount, 0)
  const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const stage = stageBadge(client.stage)
  const pr = priorityMeta(client.priority)

  const toggleTaskDone = async (t) => {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', task: { id: t.id, status: t.status === 'done' ? 'todo' : 'done' } }) })
    onTaskChange?.()
  }
  const addQuickTask = async () => {
    const title = quickTask.trim()
    if (!title) return
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', task: { title, clientId: client.id, status: 'todo', priority: 'medium' } }) })
    setQuickTask('')
    onTaskChange?.()
  }

  return (
    <>
    <div className="animate-fade-in">
      <button className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onBack}>
        ← Back to Clients
      </button>

      <div className="flex justify-between items-start mb-6 gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-base shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            {initials(client.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{client.name}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span>
              {client.priority === 'vip' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: 'white' }}>VIP</span>}
              {client.priority && client.priority !== 'medium' && client.priority !== 'vip' && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pr.color }}>{pr.label}</span>}
            </div>
            {client.company && <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{client.company}</div>}
            <div className="text-sm mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
              {client.email && <span>{client.email}</span>}
              {client.email && client.phone && <span>•</span>}
              {client.phone && <CallButton phone={client.phone} name={client.name} />}
              {client.website && <><span>•</span><a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--accent)' }}>🌐 {client.website}</a></>}
            </div>
            {client.address && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{client.address}</div>}
            {(client.lastContactedAt || client.nextFollowUpAt) && (
              <div className="text-xs mt-2 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                {client.lastContactedAt && <span>Last contacted: {fmtRelative(client.lastContactedAt)}</span>}
                {client.nextFollowUpAt && (
                  <span style={{ color: overdueFollowUp(client) ? 'var(--red)' : 'var(--text-muted)' }}>
                    Next follow-up: {new Date(client.nextFollowUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {overdueFollowUp(client) && ' (overdue)'}
                  </span>
                )}
              </div>
            )}
            {(client.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {client.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>#{t}</span>)}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--green)', color: 'var(--accent-text)' }} onClick={() => setShowPayment(true)}>💳 Take Payment</button>
          <button className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--peach)', border: '1px solid #2a2d42' }} onClick={() => onInvoice(client)}>📄 Invoice</button>
          <button className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid #2a2d42' }} onClick={() => onEdit(client)}>Edit</button>
        </div>
      </div>

      {client.notes && <p className="text-sm italic mb-6" style={{ color: 'var(--text-muted)' }}>{client.notes}</p>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xl font-bold font-mono" style={{ color: 'var(--green)' }}>{fmt(totalPaid)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Lifetime Paid</div>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{client.projects?.length || 0}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Projects</div>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xl font-bold font-mono" style={{ color: openTasks.length > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{openTasks.length}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Open Tasks</div>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xl font-bold font-mono" style={{ color: 'var(--purple)' }}>{clientPayments.length}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Payments</div>
        </div>
      </div>

      {/* Projects */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Projects</h3>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={onAddProject}>+ Add Project</button>
        </div>
        {!client.projects?.length ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No projects yet.</p>
        ) : (
          <div className="space-y-2">
            {client.projects.map(p => {
              const st = STATUS_STYLES[p.status] || STATUS_STYLES.active
              return (
                <div key={p.id} className="rounded-lg p-4 flex justify-between items-center group" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</div>
                    {p.description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.description}</div>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{p.status}</span>
                      {p.rate && <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>${p.rate}/hr</span>}
                      {p.estimatedHours && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.estimatedHours}h est.</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }} onClick={() => onEditProject(p)}>Edit</button>
                    <button className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }} onClick={() => onDeleteProject(p.id)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Tasks <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {openTasks.length} open, {doneTasks.length} done</span></h3>
        </div>
        <div className="flex gap-2 mb-3">
          <input style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', flex: 1 }}
            placeholder="Quick add task — press Enter"
            value={quickTask} onChange={e => setQuickTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuickTask() } }} />
          <button className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={addQuickTask} disabled={!quickTask.trim()}>Add</button>
        </div>
        {clientTasks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No tasks for this client.</p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[...openTasks, ...doneTasks].map((t, i) => {
              const done = t.status === 'done'
              const priColor = { urgent: 'var(--red)', high: 'var(--amber)', medium: 'var(--accent)', low: 'var(--text-muted)' }[t.priority] || 'var(--accent)'
              const due = t.dueDate ? new Date(t.dueDate) : null
              const overdueTask = due && due.getTime() < Date.now() && !done
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: i < clientTasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <button onClick={() => toggleTaskDone(t)} className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: done ? 'var(--green)' : 'transparent', border: `1.5px solid ${done ? 'var(--green)' : 'var(--border)'}`, cursor: 'pointer' }}>
                    {done && <span style={{ color: 'var(--accent-text)', fontSize: 10 }}>✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</div>
                    {(due || t.tags?.length) && (
                      <div className="text-[11px] flex items-center gap-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {due && <span style={{ color: overdueTask ? 'var(--red)' : 'var(--text-muted)' }}>Due {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{overdueTask ? ' (overdue)' : ''}</span>}
                        {(t.tags || []).map(tag => <span key={tag}>#{tag}</span>)}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: priColor }}>{t.priority}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div>
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text)' }}>Payment History</h3>
        {clientPayments.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No payments recorded for this client.</p>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }}>
            {clientPayments.map((p, i) => (
              <div key={p.id} className="flex justify-between items-center px-4 py-3" style={{ borderBottom: i < clientPayments.length - 1 ? '1px solid #1a1d30' : 'none' }}>
                <div>
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{p.description || '—'}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {p.type === 'recurring' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(203,166,247,0.15)', color: 'var(--purple)' }}>recurring</span>}
                  </div>
                </div>
                <div className="text-sm font-mono font-semibold" style={{ color: 'var(--green)' }}>{fmt(p.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {showPayment && (
      <PaymentForm
        prefillClient={{ id: client.id, name: client.name, email: client.email }}
        onClose={() => setShowPayment(false)}
        onSuccess={() => { setShowPayment(false); onRefresh?.(); }}
      />
    )}
    </>
  )
}

export default function ClientsManager() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [editClient, setEditClient] = useState(null)
  const [editProject, setEditProject] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [invoiceClient, setInvoiceClient] = useState(null)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [view, setView] = useState('list')
  const [filterStage, setFilterStage] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortBy, setSortBy] = useState('updated')
  const [sortDir, setSortDir] = useState('desc')

  useActiveRecord('client', selected ? { id: selected.id, name: selected.name, email: selected.email, phone: selected.phone, company: selected.company, projects: (selected.projects || []).map(p => ({ name: p.name, status: p.status, budget: p.budget })), notes: selected.notes } : null, [selected?.id])

  // Voice-driven record selection
  useEffect(() => {
    const handler = (e) => {
      const r = e.detail
      if (r?.type !== 'client') return
      const c = clients.find(x => x.id === r.id)
      if (c) setSelected(c)
    }
    window.addEventListener('fcc:select-record', handler)
    return () => window.removeEventListener('fcc:select-record', handler)
  }, [clients])
  const toggleBulk = (id, e) => { e.stopPropagation(); setBulkSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next }) }
  const toggleBulkAll = () => setBulkSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)))
  const bulkDeleteClients = async () => {
    if (!confirm(`Delete ${bulkSelected.size} client(s)?`)) return
    for (const id of bulkSelected) await api('/api/clients', { action: 'delete', id })
    await refresh(); setBulkSelected(new Set())
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/payments').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()).catch(() => ({ tasks: [] })),
    ]).then(([c, p, t]) => {
      setClients(c.clients || [])
      setPayments(p.payments || [])
      setTasks(t.tasks || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const refresh = async () => {
    const [c, p, t] = await Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/payments').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()).catch(() => ({ tasks: [] })),
    ])
    setClients(c.clients || [])
    setPayments(p.payments || [])
    setTasks(t.tasks || [])
    if (selected) setSelected(c.clients.find(cl => cl.id === selected.id) || null)
  }

  const saveClient = async (form) => {
    const action = form.id ? 'update' : 'add'
    await api('/api/clients', { action, client: form })
    await refresh()
    setEditClient(null); setShowAdd(false)
  }

  const deleteClient = async (id) => {
    if (!confirm('Delete this client?')) return
    await api('/api/clients', { action: 'delete', id })
    await refresh(); setSelected(null)
  }

  const saveProject = async (form) => {
    const action = form.id ? 'update_project' : 'add_project'
    await api('/api/clients', { action, clientId: selected.id, project: form })
    await refresh()
    setEditProject(null); setShowAddProject(false)
  }

  const deleteProject = async (projId) => {
    if (!confirm('Delete this project?')) return
    await api('/api/clients', { action: 'delete_project', clientId: selected.id, projectId: projId })
    await refresh()
  }

  const getClientPaymentTotal = (client) => {
    return payments.filter(p => p.clientId === client.id || p.clientName === client.name)
      .filter(p => p.status === 'succeeded').reduce((s, p) => s + p.amount, 0)
  }

  const filtered = useMemo(() => {
    const priOrder = { vip: 0, high: 1, medium: 2, low: 3 }
    let out = clients
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q))
      )
    }
    if (filterStage !== 'all') out = out.filter(c => (c.stage || 'active') === filterStage)
    if (filterPriority !== 'all') out = out.filter(c => (c.priority || 'medium') === filterPriority)
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'priority') cmp = (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9)
      else if (sortBy === 'lifetime') cmp = getClientPaymentTotal(b) - getClientPaymentTotal(a)
      else if (sortBy === 'nextFollowUp') cmp = (a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Infinity) - (b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Infinity)
      else if (sortBy === 'updated') cmp = new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [clients, payments, search, filterStage, filterPriority, sortBy, sortDir])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 50)

  // Component configuration layer: configured defaults for this list.
  const listPrefs = useComponentSettings('clients.list')
  useEffect(() => {
    if (!listPrefs.loaded || !listPrefs.values) return
    setView(listPrefs.values.view)
    setPageSize(listPrefs.values.pageSize)
  }, [listPrefs.loaded])

  useEffect(() => { setPage(1) }, [search, filterStage, filterPriority, sortBy, sortDir, view, setPage])

  const stats = useMemo(() => ({
    total: clients.length,
    active: clients.filter(c => (c.stage || 'active') === 'active').length,
    prospects: clients.filter(c => c.stage === 'prospect').length,
    vips: clients.filter(c => c.priority === 'vip').length,
    lifetime: clients.reduce((s, c) => s + getClientPaymentTotal(c), 0),
  }), [clients, payments])

  const openTasksFor = (clientId) => tasks.filter(t => t.clientId === clientId && t.status !== 'done').length

  const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  if (selected) {
    return (
      <div className="p-6">
        <ClientDetail
          client={selected} payments={payments} tasks={tasks}
          onBack={() => setSelected(null)}
          onEdit={setEditClient}
          onAddProject={() => setShowAddProject(true)}
          onEditProject={setEditProject}
          onDeleteProject={deleteProject}
          onInvoice={setInvoiceClient}
          onRefresh={refresh}
          onTaskChange={refresh}
        />
        {editClient && <ClientForm client={editClient} onSave={saveClient} onClose={() => setEditClient(null)} />}
        {showAddProject && <ProjectForm onSave={saveProject} onClose={() => setShowAddProject(false)} />}
        {editProject && <ProjectForm project={editProject} onSave={saveProject} onClose={() => setEditProject(null)} />}
        {invoiceClient && <InvoiceForm client={invoiceClient} onClose={() => setInvoiceClient(null)} />}
      </div>
    )
  }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon="👤"
        title="Clients"
        data-tooltip="Clients"
        subtitle={`${stats.total} total · ${stats.active} active · ${stats.prospects} prospect${stats.prospects !== 1 ? 's' : ''} · ${fmt(stats.lifetime)} lifetime`}
        actions={
          <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => setShowAdd(true)}>+ Add Client</button>
        }
        viewToggle={<ViewModeToggle value={view} onChange={setView} modes={['list', 'card']} />}
        controls={<ComponentSettings componentId="clients.list" title="Clients list settings" onApplied={(id, v) => { setView(v.view); setPageSize(v.pageSize) }} />}
      />

      <div className="command-toolbar flex gap-2 items-center flex-wrap mb-4">
        <input style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', flex: 1, minWidth: 200 }}
          placeholder="Search name, company, email, phone, tag..." value={search} onChange={e => setSearch(e.target.value)} />

        <ThemedSelect style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }}
          value={filterStage} onChange={e => setFilterStage(e.target.value)}>
          <option value="all">All Stages</option>
          {STAGE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }}
          value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All Priority</option>
          {PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </ThemedSelect>

        <ThemedSelect style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }}
          value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="updated">Sort: Recently Updated</option>
          <option value="name">Sort: Name</option>
          <option value="priority">Sort: Priority</option>
          <option value="lifetime">Sort: Lifetime Value</option>
          <option value="nextFollowUp">Sort: Next Follow-up</option>
        </ThemedSelect>
        <button style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', minWidth: 32 }}
          onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '↑' : '↓'}</button>
      </div>

      {loading ? <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">👤</div>
            <p style={{ color: 'var(--text-muted)' }}>{clients.length === 0 ? 'No clients yet. Add your first client to get started.' : 'No matching clients.'}</p>
          </div>
        ) : (
          <>
          {bulkSelected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 mb-2 rounded-lg" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
              <span className="text-sm font-semibold">{bulkSelected.size} selected</span>
              <button className="text-xs font-medium px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.2)' }} onClick={bulkDeleteClients}>Delete</button>
              <button className="text-xs ml-auto" onClick={() => setBulkSelected(new Set())}>Cancel</button>
            </div>
          )}
          <div className="flex items-center gap-2 mb-2 px-1">
            <input type="checkbox" checked={filtered.length > 0 && bulkSelected.size === filtered.length} onChange={toggleBulkAll} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Select all ({filtered.length})</span>
          </div>
          {view === 'card' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map(c => {
                const total = getClientPaymentTotal(c)
                const activeProjects = c.projects?.filter(p => p.status === 'active').length || 0
                const openTasks = openTasksFor(c.id)
                const stage = stageBadge(c.stage)
                const pr = priorityMeta(c.priority)
                const followUpOverdue = overdueFollowUp(c)
                return (
                  <div key={c.id} className="rounded-xl p-5 cursor-pointer group transition-all relative"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', outline: bulkSelected.has(c.id) ? '2px solid var(--accent)' : 'none' }}
                    onClick={() => setSelected(c)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>

                    {c.priority === 'vip' && (
                      <div className="absolute top-0 right-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-bl-lg rounded-tr-xl" style={{ background: 'var(--red)', color: 'white' }}>VIP</div>
                    )}

                    <div className="flex items-start gap-3 mb-3">
                      <input type="checkbox" className="mt-1" checked={bulkSelected.has(c.id)} onChange={e => toggleBulk(c.id, e)} onClick={e => e.stopPropagation()} />
                      <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                        {c.company && <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.company}</div>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span>
                      {c.priority && c.priority !== 'medium' && c.priority !== 'vip' && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pr.color }}>{pr.label}</span>}
                      {activeProjects > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>📁 {activeProjects}</span>}
                      {openTasks > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>✅ {openTasks}</span>}
                      {followUpOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>Follow-up due</span>}
                    </div>

                    <div className="text-xs mb-3 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                      {c.email && <div className="truncate">✉ {c.email}</div>}
                      {c.phone && <div><CallButton phone={c.phone} name={c.name} stopPropagation /></div>}
                      {!c.email && !c.phone && <span>No contact info</span>}
                    </div>

                    {(c.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {c.tags.slice(0, 4).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>#{t}</span>)}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <div>
                        <div className="text-sm font-mono font-bold" style={{ color: total > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{fmt(total)}</div>
                        <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Lifetime{c.lastContactedAt ? ` · contacted ${fmtRelative(c.lastContactedAt)}` : ''}</div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--peach)' }} onClick={e => { e.stopPropagation(); setInvoiceClient(c) }}>Invoice</button>
                        <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }} onClick={e => { e.stopPropagation(); deleteClient(c.id) }}>Delete</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Client</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Stage</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Contact</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Projects</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tasks</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Follow-up</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Lifetime</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(c => {
                  const total = getClientPaymentTotal(c)
                  const activeProjects = c.projects?.filter(p => p.status === 'active').length || 0
                  const openTasks = openTasksFor(c.id)
                  const stage = stageBadge(c.stage)
                  const pr = priorityMeta(c.priority)
                  const followUpOverdue = overdueFollowUp(c)
                  return (
                    <tr key={c.id} onClick={() => setSelected(c)} className="group" style={{ borderBottom: '1px solid var(--border)', background: bulkSelected.has(c.id) ? 'var(--accent-soft)' : '', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                      onMouseEnter={e => { if (!bulkSelected.has(c.id)) e.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseLeave={e => { if (!bulkSelected.has(c.id)) e.currentTarget.style.background = '' }}>
                      <td className="px-3 py-3"><input type="checkbox" checked={bulkSelected.has(c.id)} onChange={e => toggleBulk(c.id, e)} onClick={e => e.stopPropagation()} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initials(c.name)}</div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                              {c.name}
                              {c.priority === 'vip' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: 'white' }}>VIP</span>}
                              {c.priority && c.priority !== 'medium' && c.priority !== 'vip' && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: pr.color }}>{pr.label}</span>}
                            </div>
                            {c.company && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{c.company}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span></td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {c.email && <div className="truncate max-w-[200px]">{c.email}</div>}
                        {c.phone && <CallButton phone={c.phone} name={c.name} stopPropagation />}
                        {!c.email && !c.phone && '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {activeProjects > 0 ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>{activeProjects}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {openTasks > 0 ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{openTasks}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.nextFollowUpAt ? (
                          <span className="px-2 py-0.5 rounded-full" style={{ background: followUpOverdue ? 'var(--red-soft)' : 'var(--surface2)', color: followUpOverdue ? 'var(--red)' : 'var(--text-muted)' }}>
                            {new Date(c.nextFollowUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: total > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{fmt(total)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--peach)' }} onClick={e => { e.stopPropagation(); setInvoiceClient(c) }}>Invoice</button>
                          <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }} onClick={e => { e.stopPropagation(); deleteClient(c.id) }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="clients" />
          </>
        )}

      {showAdd && <ClientForm onSave={saveClient} onClose={() => setShowAdd(false)} />}
      {invoiceClient && <InvoiceForm client={invoiceClient} onClose={() => setInvoiceClient(null)} />}
    </div>
  )
}
