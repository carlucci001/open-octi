'use client'
import ThemedSelect from '../components/ThemedSelect'
import CustomFieldsPanel from '../components/CustomFieldsPanel'
import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import BoardWorkbench from '../components/BoardWorkbench'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import ViewModeToggle from '../components/ViewModeToggle'
import OpenOctiEmptyState from '../components/OpenOctiEmptyState'
import { isOpenOcti } from '@/lib/edition'

function api(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }

const fmtUSD = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const oppIdleChip = (o, cfg = {}) => {
  if (cfg.showIdleChips === false) return null
  const warnDays = Number(cfg.idleWarnDays) > 0 ? Number(cfg.idleWarnDays) : 7
  const hotDays = Number(cfg.idleHotDays) > 0 ? Number(cfg.idleHotDays) : 14
  const last = o.stageChangedAt || o.updatedAt || o.createdAt
  const d = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : 0
  const hot = d >= hotDays
  if (!hot && d < warnDays) return null
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" title={`No movement in ${d} days`} style={{ background: hot ? 'rgba(239,68,68,.12)' : 'var(--amber-soft)', color: hot ? '#ef4444' : 'var(--amber)', border: `1px solid ${hot ? '#ef4444' : 'var(--amber)'}` }}>Idle {d}d</span>
}

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

// -------- The person behind the deal --------
// /api/opportunities attaches contactName/Title/Phone/Email (the linked
// Contact, else the account's primary contact). Rows show name + phone so a
// deal can be worked without leaving the board; the phone is a real tel:
// link that does not open the editor.
const stopRowClick = e => e.stopPropagation()
const ContactLine = ({ o, size = 11 }) => {
  if (!o.contactName && !o.contactPhone) return null
  return (
    <div className="flex items-center gap-1.5 min-w-0" style={{ fontSize: size, color: 'var(--text-muted)' }}>
      {o.contactName && <span className="truncate" style={{ color: 'var(--text)' }}>{o.contactName}</span>}
      {o.contactPhone && <a href={`tel:${o.contactPhone}`} onClick={stopRowClick} className="hover:underline shrink-0" style={{ color: 'var(--accent)' }}>{o.contactPhone}</a>}
    </div>
  )
}

// Hand the Contacts/Accounts tab a search term so "Open" lands on the record.
const openWithSearch = (onNavigate, tab, term) => {
  try { sessionStorage.setItem(`fcc.${tab}.prefillSearch`, term || '') } catch {}
  onNavigate?.(tab)
}

function OpportunityContactCard({ o, onNavigate, onClose }) {
  const hasContact = Boolean(o.contactName || o.contactPhone || o.contactEmail)
  const go = (tab, term) => { onClose?.(); openWithSearch(onNavigate, tab, term) }
  return (
    <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {hasContact ? (
            <>
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{o.contactName || '(no name)'}{o.contactTitle ? <span className="font-normal" style={{ color: 'var(--text-muted)' }}> · {o.contactTitle}</span> : null}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                {o.contactPhone ? <a href={`tel:${o.contactPhone}`} className="hover:underline" style={{ color: 'var(--accent)' }}>📞 {o.contactPhone}</a> : <span style={{ color: 'var(--text-muted)' }}>No phone on file</span>}
                {o.contactEmail ? <a href={`mailto:${o.contactEmail}`} className="hover:underline" style={{ color: 'var(--accent)' }}>📧 {o.contactEmail}</a> : <span style={{ color: 'var(--text-muted)' }}>No email on file</span>}
              </div>
            </>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No contact on this deal yet — add one under the account.</div>
          )}
          <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{o.accountName || 'No account'}</div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {hasContact && <button type="button" className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => go('contacts', o.contactName || o.contactEmail)}>Open contact</button>}
          {o.accountId && <button type="button" className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => go('accounts', o.accountName)}>Open account</button>}
        </div>
      </div>
    </div>
  )
}

// -------- Weighted forecast strip (per pipeline) --------
function ForecastStrip({ stats }) {
  if (!stats) return null
  const Stat = ({ label, value, sub, color }) => (
    <div className="flex-1 min-w-[130px] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-base font-mono font-bold leading-tight" style={{ color: color || 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
  const totalWeighted = stats.stageBreakdown.reduce((s, x) => s + x.weighted, 0)
  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-stretch divide-x" style={{ borderColor: 'var(--border)' }}>
        <Stat label="Open pipeline" value={fmtUSD(stats.openValue)} sub={`${stats.open} open deal${stats.open === 1 ? '' : 's'}`} />
        <Stat label="Weighted forecast" value={fmtUSD(stats.weightedValue)} sub="value × probability" color="var(--accent)" />
        <Stat label="Closing this month" value={fmtUSD(stats.monthWeighted)} sub={`${fmtUSD(stats.monthValue)} unweighted`} />
        <Stat label="Won" value={fmtUSD(stats.wonValue)} sub={`${stats.wonCount} deal${stats.wonCount === 1 ? '' : 's'}`} color="var(--green)" />
        <Stat label="Win rate" value={stats.wonCount + stats.lostCount > 0 ? `${Math.round(stats.wonCount / (stats.wonCount + stats.lostCount) * 100)}%` : '—'} sub={stats.lostCount > 0 ? `${stats.lostCount} lost` : 'no closed deals'} color={stats.lostCount > stats.wonCount ? 'var(--red)' : 'var(--green)'} />
      </div>
      {totalWeighted > 0 && (
        <div className="px-3 pb-3">
          <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
            {stats.stageBreakdown.filter(s => s.weighted > 0).map(s => (
              <div key={s.id} title={`${s.label}: ${fmtUSD(s.weighted)} weighted`} style={{ width: `${(s.weighted / totalWeighted) * 100}%`, background: s.color, minWidth: 4 }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {stats.stageBreakdown.filter(s => s.weighted > 0).map(s => (
              <span key={s.id} className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />{s.label} {fmtUSD(s.weighted)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -------- Win/loss reason capture on close --------
const WON_REASONS = ['Best price', 'Relationship', 'Product fit', 'Speed to respond', 'Referral', 'Other']
const LOST_REASONS = ['Price too high', 'Chose competitor', 'No budget', 'Ghosted / no response', 'Bad timing', 'Not a fit', 'Other']

function CloseReasonModal({ opp, stage, onConfirm, onCancel }) {
  const won = stage.terminal === 'won'
  const reasons = won ? WON_REASONS : LOST_REASONS
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  return (
    <Modal title={won ? `Mark as Won 🎉 — ${opp.name}` : `Mark as Lost — ${opp.name}`} onClose={onCancel}>
      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Why did this deal {won ? 'close' : 'fall through'}? This feeds your win/loss reporting.</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {reasons.map(r => (
          <button key={r} type="button" onClick={() => setReason(r)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: reason === r ? (won ? 'var(--green)' : 'var(--red)') : 'var(--surface2)',
              color: reason === r ? 'white' : 'var(--text)',
              border: `1px solid ${reason === r ? (won ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
            }}>{r}</button>
        ))}
      </div>
      <Field label="Note (optional)">
        <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} placeholder={won ? 'What sealed it?' : 'What would have changed the outcome?'} />
      </Field>
      <div className="flex gap-2 mt-2">
        <button className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" disabled={!reason}
          style={{ background: won ? 'var(--green)' : 'var(--red)', color: 'white' }}
          onClick={() => onConfirm({ closeOutcome: won ? 'won' : 'lost', closeReason: reason, closeNote: note.trim(), closedAt: new Date().toISOString() })}>
          Confirm {won ? 'Won' : 'Lost'}
        </button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto`} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          X
        </button>
        <h2 className="text-lg font-semibold mb-4 pr-10" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>{children}</div>
}

// Sentinel for pipelines owned by the agency itself rather than a client.
const INHOUSE_OWNER = 'inhouse'
const ownerLabel = (id, accounts) => {
  if (!id || id === INHOUSE_OWNER) return '🏢 In-house'
  const a = accounts?.find?.(x => x.id === id)
  return a ? a.name : '(unknown owner)'
}

// -------- Pipeline manager modal (create/edit/delete pipelines + stages) --------
function PipelineManagerModal({ pipelines, accounts = [], onSaved, onClose }) {
  const [mode, setMode] = useState('list') // list | editing
  const [editing, setEditing] = useState(null) // null = new
  const [msg, setMsg] = useState('')
  const [selectedPipelineIds, setSelectedPipelineIds] = useState(new Set())
  const [bulkDeletingPipelines, setBulkDeletingPipelines] = useState(false)

  const startNew = () => {
    setEditing({
      id: '',
      name: '',
      description: '',
      color: '#89b4fa',
      ownerAccountId: INHOUSE_OWNER,
      stages: [
        { id: 'new', label: 'New', color: '#6c7086', probability: 5 },
        { id: 'working', label: 'Working', color: '#89b4fa', probability: 40 },
        { id: 'won', label: 'Won', color: '#a6e3a1', probability: 100, terminal: 'won' },
        { id: 'lost', label: 'Lost', color: '#f38ba8', probability: 0, terminal: 'lost' },
      ],
    })
    setMode('editing')
  }

  const startEdit = (p) => { setEditing({ ...p, stages: p.stages.map(s => ({ ...s })) }); setMode('editing') }

  const save = async () => {
    const isNew = !pipelines.some(p => p.id === editing.id)
    const action = isNew ? 'add' : 'update'
    const r = await fetch('/api/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, pipeline: editing }) }).then(r => r.json())
    if (r.error) { setMsg('⚠ ' + r.error); return }
    setMsg(''); onSaved(); setMode('list'); setEditing(null)
  }

  const del = async (pid) => {
    if (!confirm(`Delete pipeline "${pid}"? Opportunities already in it will block the delete.`)) return
    const r = await fetch('/api/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: pid }) }).then(r => r.json())
    if (r.error) { alert('Cannot delete: ' + r.error); return }
    setSelectedPipelineIds(prev => {
      const next = new Set(prev)
      next.delete(pid)
      return next
    })
    onSaved()
  }

  const togglePipelineSelected = (id, event) => {
    event?.stopPropagation?.()
    setSelectedPipelineIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllPipelines = () => {
    setSelectedPipelineIds(prev => prev.size === pipelines.length ? new Set() : new Set(pipelines.map(p => p.id)))
  }

  const bulkDeletePipelines = async () => {
    const ids = Array.from(selectedPipelineIds)
    if (!ids.length || !confirm(`Delete ${ids.length} selected pipeline${ids.length === 1 ? '' : 's'}? Opportunities already in them will block the delete.`)) return
    setBulkDeletingPipelines(true)
    try {
      const r = await fetch('/api/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_delete', ids }) }).then(r => r.json())
      if (r.error) { alert('Cannot delete: ' + r.error); return }
      setSelectedPipelineIds(new Set())
      onSaved()
    } finally {
      setBulkDeletingPipelines(false)
    }
  }

  const updateStage = (i, patch) => setEditing(e => ({ ...e, stages: e.stages.map((s, idx) => idx === i ? { ...s, ...patch } : s) }))
  const addStage = () => setEditing(e => ({ ...e, stages: [...e.stages, { id: 'stage_' + (e.stages.length + 1), label: 'New Stage', color: '#89b4fa', probability: 25 }] }))
  const removeStage = (i) => setEditing(e => ({ ...e, stages: e.stages.filter((_, idx) => idx !== i) }))
  const moveStage = (i, dir) => {
    setEditing(e => {
      const s = [...e.stages]; const j = i + dir
      if (j < 0 || j >= s.length) return e
      ;[s[i], s[j]] = [s[j], s[i]]
      return { ...e, stages: s }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="relative w-full max-w-2xl rounded-xl p-6 animate-fade-in max-h-[90vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>X</button>
        <div className="flex items-center justify-between mb-4 pr-10">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {mode === 'list' ? 'Manage Pipelines' : (editing?.id && pipelines.some(p => p.id === editing.id) ? `Edit: ${editing.name}` : 'New Pipeline')}
          </h2>
          <div className="flex gap-2">
            {mode === 'editing' && <button onClick={() => { setMode('list'); setEditing(null); setMsg('') }} className="px-3 py-1 rounded-lg text-xs" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>← Back</button>}
          </div>
        </div>

        {msg && <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{msg}</div>}

        {mode === 'list' ? (
          <div>
            <button onClick={startNew} className="w-full mb-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>+ Create new pipeline</button>
            {pipelines.length > 0 && (
              <div className="rounded-lg p-3 mb-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={selectedPipelineIds.size === pipelines.length && pipelines.length > 0} onChange={toggleAllPipelines} style={{ width: 20, height: 20 }} />
                  {selectedPipelineIds.size === 0 ? 'Select all' : `${selectedPipelineIds.size} selected`}
                </label>
                {selectedPipelineIds.size > 0 && (
                  <>
                    <button type="button" onClick={() => setSelectedPipelineIds(new Set())} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
                    <button type="button" onClick={bulkDeletePipelines} disabled={bulkDeletingPipelines} className="ml-auto px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: bulkDeletingPipelines ? 0.6 : 1 }}>
                      {bulkDeletingPipelines ? 'Deleting...' : `Delete ${selectedPipelineIds.size}`}
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="space-y-2">
              {pipelines.map(p => {
                const isInhouse = !p.ownerAccountId || p.ownerAccountId === INHOUSE_OWNER
                const isSelected = selectedPipelineIds.has(p.id)
                return (
                <div key={p.id} className="rounded-lg p-3 flex items-center gap-3" style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface2)', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}` }}>
                  <input type="checkbox" aria-label={`Select ${p.name}`} checked={isSelected} onChange={e => togglePipelineSelected(p.id, e)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                      {p.name}
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: isInhouse ? 'var(--accent-soft, rgba(59,125,216,0.15))' : 'var(--surface)', color: isInhouse ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {ownerLabel(p.ownerAccountId, accounts)}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.stages.length} stages · id: <span className="font-mono">{p.id}</span></div>
                  </div>
                  <button onClick={() => startEdit(p)} className="text-xs px-3 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)' }}>Edit</button>
                  <button onClick={() => del(p.id)} className="text-xs px-3 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--red)', border: '1px solid var(--border)' }}>Delete</button>
                </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div>
            <Field label="Pipeline name *">
              <input style={inp} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Podcast Sponsorships" autoFocus />
            </Field>
            <Field label="Owner">
              <ThemedSelect style={inp} value={editing.ownerAccountId || INHOUSE_OWNER} onChange={e => setEditing({ ...editing, ownerAccountId: e.target.value })}>
                <option value={INHOUSE_OWNER}>🏢 In-house (Farrington Development)</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </ThemedSelect>
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Description">
                <input style={inp} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="What this pipeline is for" />
              </Field>
              <Field label="Color">
                <input type="color" style={{ ...inp, padding: 2, height: 38 }} value={editing.color} onChange={e => setEditing({ ...editing, color: e.target.value })} />
              </Field>
            </div>

            <div className="mt-3 mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Stages</label>
              <button onClick={addStage} className="text-xs px-3 py-1 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>+ Add stage</button>
            </div>

            <div className="space-y-2 mb-4">
              {editing.stages.map((s, i) => (
                <div key={i} className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <input type="color" style={{ width: 28, height: 28, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }} value={s.color || '#89b4fa'} onChange={e => updateStage(i, { color: e.target.value })} />
                  <input style={{ ...inp, padding: '4px 8px', fontSize: 12 }} value={s.label} onChange={e => updateStage(i, { label: e.target.value, id: s.id || e.target.value.toLowerCase().replace(/\W+/g, '_') })} placeholder="Stage label" />
                  <input type="number" min="0" max="100" style={{ ...inp, width: 70, padding: '4px 8px', fontSize: 12 }} value={s.probability ?? 0} onChange={e => updateStage(i, { probability: Number(e.target.value) })} placeholder="%" />
                  <ThemedSelect style={{ ...inp, width: 100, padding: '4px 8px', fontSize: 11 }} value={s.terminal || ''} onChange={e => updateStage(i, { terminal: e.target.value || undefined })}>
                    <option value="">Open</option>
                    <option value="won">Won (✓)</option>
                    <option value="lost">Lost (✗)</option>
                  </ThemedSelect>
                  <div className="flex">
                    <button onClick={() => moveStage(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: i === 0 ? 'default' : 'pointer' }}>↑</button>
                    <button onClick={() => moveStage(i, 1)} disabled={i === editing.stages.length - 1} className="px-1 disabled:opacity-30" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: i === editing.stages.length - 1 ? 'default' : 'pointer' }}>↓</button>
                  </div>
                  <button onClick={() => removeStage(i)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--red)' }}>×</button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={save} disabled={!editing.name.trim() || editing.stages.length === 0} className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--green)', color: 'var(--accent-text)' }}>Save Pipeline</button>
              <button onClick={() => { setMode('list'); setEditing(null) }} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function OpportunityForm({ opportunity, accounts, pipelines, currentPipeline, onSave, onClose, onDelete, onNavigate }) {
  const [f, setF] = useState(opportunity || {
    name: '', accountId: '', pipelineId: currentPipeline?.id || '', stageId: currentPipeline?.stages?.[0]?.id || '',
    value: '', probability: '', expectedClose: '', notes: '',
    leadRequirementsPrompt: '',
    leadGeneration: { enabled: false, dailyLeadTarget: '', geography: '', industries: '', sourceTypes: '', providerPreference: 'auto', scheduleMode: 'manual', scheduleTime: '09:00', scheduleDays: 'weekdays' },
  })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const ulg = (k, v) => setF(p => ({ ...p, leadGeneration: { ...(p.leadGeneration || {}), [k]: v } }))
  // Lead generation is opt-in per opportunity. It used to render on every
  // deal, putting a green Run Now that spends money on Apify/Perplexity
  // right beside Save on opportunities that have nothing to do with leads.
  const leadGenOn = Boolean(f.leadGeneration?.enabled)
  const toggleLeadGen = (on) => setF(p => ({ ...p, leadGeneration: { ...(p.leadGeneration || {}), enabled: on } }))
  const pipeline = pipelines.find(p => p.id === f.pipelineId)
  const stages = pipeline?.stages || []
  return (
    <Modal title={opportunity?.id ? 'Edit Opportunity' : 'New Opportunity'} onClose={onClose} wide>
      {opportunity?.id && <OpportunityContactCard o={opportunity} onNavigate={onNavigate} onClose={onClose} />}
      <Field label="Opportunity Name *"><input style={inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="e.g. ACME Sponsorship Deal" autoFocus /></Field>
      <Field label="Account *">
        <ThemedSelect style={inp} value={f.accountId} onChange={e => u('accountId', e.target.value)}>
          <option value="">— Select account —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </ThemedSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pipeline">
          <ThemedSelect style={inp} value={f.pipelineId} onChange={e => { u('pipelineId', e.target.value); const p = pipelines.find(x => x.id === e.target.value); u('stageId', p?.stages?.[0]?.id || '') }}>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Stage">
          <ThemedSelect style={inp} value={f.stageId} onChange={e => u('stageId', e.target.value)}>
            {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </ThemedSelect>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Value ($)"><input type="number" style={inp} value={f.value} onChange={e => u('value', e.target.value)} placeholder="0" /></Field>
        <Field label="Probability (%)"><input type="number" style={inp} value={f.probability} onChange={e => u('probability', e.target.value)} placeholder="0-100" /></Field>
        <Field label="Expected Close"><input type="date" style={inp} value={f.expectedClose || ''} onChange={e => u('expectedClose', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={e => u('notes', e.target.value)} /></Field>
      <CustomFieldsPanel fields={opportunity?.customFields} compact />
      <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: leadGenOn ? 'var(--text)' : 'var(--text-muted)' }}>
        <input type="checkbox" checked={leadGenOn} onChange={e => toggleLeadGen(e.target.checked)} style={{ width: 18, height: 18 }} />
        This opportunity generates leads
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— sourcing criteria and schedule</span>
      </label>
      {leadGenOn && (<>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Leads per day"><input type="number" min="0" style={inp} value={f.leadGeneration?.dailyLeadTarget || ''} onChange={e => ulg('dailyLeadTarget', e.target.value)} placeholder="0" /></Field>
        <Field label="Lead provider">
          <ThemedSelect style={inp} value={f.leadGeneration?.providerPreference || 'auto'} onChange={e => ulg('providerPreference', e.target.value)}>
            <option value="auto">Auto</option>
            <option value="apify">Apify</option>
            <option value="perplexity">Perplexity</option>
            <option value="google">Google</option>
            <option value="manual">Manual</option>
          </ThemedSelect>
        </Field>
        <Field label="Geography"><input style={inp} value={f.leadGeneration?.geography || ''} onChange={e => ulg('geography', e.target.value)} placeholder="City, ST" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Industries / lead types"><input style={inp} value={f.leadGeneration?.industries || ''} onChange={e => ulg('industries', e.target.value)} placeholder="restaurants, hotels, tourism offices" /></Field>
        <Field label="Source types"><input style={inp} value={f.leadGeneration?.sourceTypes || ''} onChange={e => ulg('sourceTypes', e.target.value)} placeholder="Google Maps, directories, websites" /></Field>
      </div>
      <Field label="Natural language requirements">
        <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={f.leadRequirementsPrompt || ''} onChange={e => u('leadRequirementsPrompt', e.target.value)} placeholder="Describe the leads you want, how to qualify them, and what research should be collected." />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Schedule">
          <ThemedSelect style={inp} value={f.leadGeneration?.scheduleMode || 'manual'} onChange={e => ulg('scheduleMode', e.target.value)}>
            <option value="manual">Manual / run now</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="paused">Paused</option>
          </ThemedSelect>
        </Field>
        <Field label="Run time"><input type="time" style={inp} value={f.leadGeneration?.scheduleTime || '09:00'} onChange={e => ulg('scheduleTime', e.target.value)} /></Field>
        <Field label="Days">
          <ThemedSelect style={inp} value={f.leadGeneration?.scheduleDays || 'weekdays'} onChange={e => ulg('scheduleDays', e.target.value)}>
            <option value="weekdays">Weekdays</option>
            <option value="everyday">Every day</option>
            <option value="monday">Mondays</option>
          </ThemedSelect>
        </Field>
      </div>
      {f.leadRequirements?.requirements?.summary && (
        <div className="text-xs rounded-lg p-3 mb-3" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          <strong style={{ color: 'var(--text)' }}>Generated:</strong> {f.leadRequirements.requirements.summary}
        </div>
      )}
      </>)}
      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => f.name.trim() && f.accountId && onSave(f)}>Save</button>
        {opportunity?.id && leadGenOn && (
          <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)' }}
            onClick={() => { if (confirm('Run a lead sweep now for this opportunity? This calls your lead provider and costs money.')) onSave({ ...f, runLeadGenerationNow: true }) }}>
            Run lead sweep now
          </button>
        )}
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
        {onDelete && <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={onDelete}>Delete</button>}
      </div>
    </Modal>
  )
}

function opportunityAccountType(o) {
  return o.accountType || 'prospect'
}

function isProspectOpportunity(o) {
  return Boolean(o?.accountId) && opportunityAccountType(o) === 'prospect'
}

function Column({ stage, stages, opps, onDrop, onEdit, selectedIds, onToggleSelected, onPromote, idleCfg }) {
  const [over, setOver] = useState(false)
  const value = opps.reduce((s, o) => s + (Number(o.value) || 0), 0)
  const isTerminal = stage.terminal === 'won' || stage.terminal === 'lost'
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, stage.id) }}
      className="board-column rounded-xl p-3"
      style={{ background: over ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid var(--border)', transition: 'background var(--transition-fast)' }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: stage.color }}>{stage.label}</span>
        </div>
        <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {opps.length} · {fmtUSD(value)}
        </div>
      </div>
      <div className="space-y-2 min-h-[100px]">
        {opps.map(o => {
          const isSelected = selectedIds?.has(o.id)
          return (
          <div key={o.id}
            draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', o.id)}
            onClick={() => onEdit(o)}
            className="rounded-lg p-3 cursor-grab active:cursor-grabbing"
            style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface2)', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}` }}>
            <div className="flex items-start gap-2 mb-1">
              <input
                type="checkbox"
                aria-label={`Select ${o.name}`}
                checked={Boolean(isSelected)}
                onClick={e => e.stopPropagation()}
                onChange={e => onToggleSelected(o.id, e)}
                style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
              />
              <div className="min-w-0 flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{o.name}</div>
            </div>
            <ContactLine o={o} />
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[11px] min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{o.accountName}</div>{!stage.terminal && oppIdleChip(o, idleCfg)}
              {stage.terminal && o.closeReason && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" title={o.closeNote || o.closeReason} style={{ background: stage.terminal === 'won' ? 'var(--green-soft)' : 'var(--red-soft)', color: stage.terminal === 'won' ? 'var(--green)' : 'var(--red)', border: `1px solid ${stage.terminal === 'won' ? 'var(--green)' : 'var(--red)'}` }}>{stage.terminal === 'won' ? '✓' : '✗'} {o.closeReason}</span>
              )}
              {isProspectOpportunity(o) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Prospect</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-bold" style={{ color: 'var(--green)' }}>{fmtUSD(o.value)}</span>
              {o.probability > 0 && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{o.probability}%</span>}
            </div>
            {isProspectOpportunity(o) && (
              <button
                type="button"
                className="w-full mt-2 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}
                onClick={e => onPromote(o, e)}
              >
                Promote to Client Account
              </button>
            )}
            <ThemedSelect
              className="board-card-move mt-2"
              value=""
              aria-label={`Move ${o.name} to another stage`}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => {
                e.stopPropagation()
                if (e.target.value) onDrop(o.id, e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Move...</option>
              {(stages || []).filter(s => s.id !== stage.id).map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </ThemedSelect>
            {o.expectedClose && <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Close: {new Date(o.expectedClose).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
            {o.leadGeneration?.dailyLeadTarget > 0 && <div className="text-[10px] mt-1" style={{ color: 'var(--accent)' }}>Lead gen: {o.leadGeneration.dailyLeadTarget}/day</div>}
            {o.leadRequirements?.requirements?.summary && <div className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{o.leadRequirements.requirements.summary}</div>}
          </div>
          )
        })}
        {isTerminal && stage.terminal === 'won' && opps.length > 0 && (
          <div className="text-[10px] text-center pt-2" style={{ color: 'var(--green)' }}>🎉 Ready to spawn projects</div>
        )}
      </div>
    </div>
  )
}

export default function PipelinesManager({ onNavigate }) {
  const [pipelines, setPipelines] = useState([])
  const [accounts, setAccounts] = useState([])
  // Component configuration layer: board display defaults (pipelines.board).
  const boardPrefs = useComponentSettings('pipelines.board')
  const boardCfg = boardPrefs.values || {}
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [activePipelineId, setActivePipelineId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [managingPipelines, setManagingPipelines] = useState(false)
  const [view, setView] = useState('list')
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  // Owner filter: 'all' | 'inhouse' | accountId
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all'
    try { return sessionStorage.getItem('fcc.pipelines.ownerFilter') || 'all' } catch { return 'all' }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { sessionStorage.setItem('fcc.pipelines.ownerFilter', ownerFilter) } catch {}
  }, [ownerFilter])

  const refresh = useCallback(async () => {
    const safeGet = async (url) => {
      try {
        const r = await fetch(url)
        if (!r.ok) { console.warn(`[Pipelines] ${url} → ${r.status}`); return {} }
        return await r.json()
      } catch (err) {
        console.warn(`[Pipelines] ${url} failed:`, err.message)
        return {}
      }
    }
    const [pl, ac, op] = await Promise.all([
      safeGet('/api/pipelines'),
      safeGet('/api/accounts'),
      safeGet('/api/opportunities'),
    ])
    setPipelines(pl.pipelines || [])
    setAccounts(ac.accounts || [])
    setOpportunities(op.opportunities || [])
    if (!activePipelineId && (pl.pipelines || []).length) setActivePipelineId(pl.pipelines[0].id)
    setLoading(false)
  }, [activePipelineId])
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  const activePipeline = useMemo(() => pipelines.find(p => p.id === activePipelineId), [pipelines, activePipelineId])

  const oppsInPipeline = useMemo(() => opportunities.filter(o => o.pipelineId === activePipelineId), [opportunities, activePipelineId])
  const visibleOpportunityIds = useMemo(() => oppsInPipeline.map(o => o.id), [oppsInPipeline])

  useEffect(() => { setBulkSelected(new Set()) }, [activePipelineId, view])

  const toggleBulk = (id, event) => {
    event?.stopPropagation?.()
    setBulkSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleBulkAll = () => {
    setBulkSelected(prev => prev.size === visibleOpportunityIds.length ? new Set() : new Set(visibleOpportunityIds))
  }

  const bulkDelete = async () => {
    const ids = Array.from(bulkSelected)
    if (!ids.length || !confirm(`Delete ${ids.length} selected opportunit${ids.length === 1 ? 'y' : 'ies'}?`)) return
    setBulkDeleting(true)
    try {
      await api('/api/opportunities', { action: 'bulk_delete', ids })
      setBulkSelected(new Set())
      await refresh()
    } finally {
      setBulkDeleting(false)
    }
  }

  // Have-Doreen-call-stale-leads flow
  const [reactivating, setReactivating] = useState(null)
  const startReactivate = async () => {
    setReactivating({ loading: true })
    try {
      const r = await fetch('/api/concierge/bulk-dispatch-stale')
      const j = await r.json()
      setReactivating({ loading: false, candidates: j.candidates || [], note: j.note || '' })
    } catch (e) {
      setReactivating({ loading: false, error: e.message })
    }
  }
  const confirmReactivate = async () => {
    setReactivating(s => ({ ...s, firing: true }))
    try {
      const r = await fetch('/api/concierge/bulk-dispatch-stale?execute=1', { method: 'POST' })
      const j = await r.json()
      setReactivating({ loading: false, results: j.results || [], dispatched: j.dispatched, failed: j.failed, done: true })
    } catch (e) {
      setReactivating(s => ({ ...s, firing: false, error: e.message }))
    }
  }

  const save = async (form) => {
    const action = form.id ? 'update' : 'add'
    const leadGeneration = {
      ...(form.leadGeneration || {}),
      dailyLeadTarget: Number(form.leadGeneration?.dailyLeadTarget) || 0,
      enabled: Boolean(
        form.leadRequirementsPrompt?.trim() ||
        form.runLeadGenerationNow ||
        Number(form.leadGeneration?.dailyLeadTarget) ||
        form.leadGeneration?.geography ||
        form.leadGeneration?.industries ||
        form.leadGeneration?.sourceTypes ||
        (form.leadGeneration?.scheduleMode && form.leadGeneration.scheduleMode !== 'manual')
      ),
    }
    const result = await api('/api/opportunities', { action, opportunity: { ...form, leadGeneration, value: Number(form.value) || 0, probability: Number(form.probability) || 0 } })
    if (result.opportunity?.id && (form.leadRequirementsPrompt?.trim() || leadGeneration.enabled)) {
      await api('/api/opportunities/requirements', {
        opportunityId: result.opportunity.id,
        runResearch: Boolean(form.runLeadGenerationNow),
        instructions: form.leadRequirementsPrompt || form.notes || '',
      })
    }
    setEditing(null); setAdding(false)
    await refresh()
    // Form-driven close: capture the win/loss reason too
    if (form.id) {
      const prevPipeline = pipelines.find(x => x.id === editing?.pipelineId)
      const prevStage = prevPipeline?.stages?.find(s => s.id === editing?.stageId)
      const newPipeline = pipelines.find(x => x.id === form.pipelineId)
      const newStage = newPipeline?.stages?.find(s => s.id === form.stageId)
      if (newStage?.terminal && !prevStage?.terminal) {
        setClosingDeal({ opp: result.opportunity || form, stage: newStage, reasonOnly: true })
      }
    }
  }

  const promoteToClient = async (opp, event) => {
    event?.stopPropagation?.()
    if (!opp?.accountId) return
    const ok = confirm(`Promote ${opp.accountName || 'this prospect'} to a client account? Use this only when they have become a real client through a signed agreement, payment, or onboarding decision.`)
    if (!ok) return
    const result = await api('/api/accounts', {
      action: 'promote_to_client',
      accountId: opp.accountId,
      opportunityId: opp.id,
      note: `Promoted from opportunity: ${opp.name}`,
    })
    if (result.error) {
      alert(result.error)
      return
    }
    await refresh()
  }

  const promoteAccountForOpportunity = async (opp) => {
    if (!opp?.accountId) return false
    const result = await api('/api/accounts', {
      action: 'promote_to_client',
      accountId: opp.accountId,
      opportunityId: opp.id,
      note: `Promoted when opportunity moved to won: ${opp.name}`,
    })
    if (result.error) {
      alert(result.error)
      return false
    }
    return true
  }

  // Deal being closed -> win/loss reason modal ({ opp, stage, reasonOnly? })
  const [closingDeal, setClosingDeal] = useState(null)

  const finalizeStageMove = async (opp, stage, closeFields = {}) => {
    const patch = { id: opp.id, stageId: stage.id, probability: stage?.probability ?? opp.probability, ...closeFields }
    // Re-opening a previously closed deal clears its close fields
    if (!stage?.terminal && opp.closeOutcome) Object.assign(patch, { closeOutcome: null, closeReason: null, closeNote: null, closedAt: null })
    await api('/api/opportunities', { action: 'update', opportunity: patch })
    await refresh()
    if (stage?.terminal === 'won') {
      if (isProspectOpportunity(opp) && confirm(`${opp.name} moved to ${stage.label}. Promote ${opp.accountName || 'this prospect'} to a client account now?`)) {
        await promoteAccountForOpportunity(opp)
        await refresh()
      }
      if (confirm(`${opp.name} moved to ${stage.label}. Create a Project for this deal?`)) {
        await api('/api/projects', {
          action: 'add',
          project: {
            name: opp.name,
            accountId: opp.accountId,
            opportunityId: opp.id,
            budget: opp.value,
            description: opp.notes,
            status: 'active',
          },
        })
        alert('Project created. Check Projects tab.')
      }
    }
  }

  const moveStage = async (oppId, stageId) => {
    const opp = opportunities.find(o => o.id === oppId)
    if (!opp) return
    const stage = activePipeline?.stages.find(s => s.id === stageId)
    if (!stage) return
    // Closing the deal? Capture the win/loss reason first.
    if ((stage.terminal === 'won' || stage.terminal === 'lost') && opp.stageId !== stage.id) {
      setClosingDeal({ opp, stage })
      return
    }
    await finalizeStageMove(opp, stage)
  }

  const del = async () => {
    if (!editing?.id || !confirm('Delete this opportunity?')) return
    await api('/api/opportunities', { action: 'delete', id: editing.id })
    setEditing(null)
    await refresh()
  }

  const pipelineStats = useMemo(() => {
    const stageOf = (o) => activePipeline?.stages.find(s => s.id === o.stageId)
    const open = oppsInPipeline.filter(o => !stageOf(o)?.terminal)
    const openValue = open.reduce((s, o) => s + (Number(o.value) || 0), 0)
    const weightedValue = open.reduce((s, o) => s + (Number(o.value) || 0) * (Number(o.probability) || 0) / 100, 0)
    const won = oppsInPipeline.filter(o => stageOf(o)?.terminal === 'won')
    const lost = oppsInPipeline.filter(o => stageOf(o)?.terminal === 'lost')
    const wonValue = won.reduce((s, o) => s + (Number(o.value) || 0), 0)
    // Deals expected to close this calendar month (open only)
    const now = new Date()
    const inMonth = open.filter(o => {
      if (!o.expectedClose) return false
      const d = new Date(o.expectedClose)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    const monthValue = inMonth.reduce((s, o) => s + (Number(o.value) || 0), 0)
    const monthWeighted = inMonth.reduce((s, o) => s + (Number(o.value) || 0) * (Number(o.probability) || 0) / 100, 0)
    // Per open stage weighted contribution (for the forecast bar)
    const stageBreakdown = (activePipeline?.stages || []).filter(s => !s.terminal).map(s => ({
      id: s.id, label: s.label, color: s.color || 'var(--accent)',
      weighted: open.filter(o => o.stageId === s.id).reduce((sum, o) => sum + (Number(o.value) || 0) * (Number(o.probability) || 0) / 100, 0),
    }))
    return { count: oppsInPipeline.length, open: open.length, openValue, weightedValue, wonCount: won.length, wonValue, lostCount: lost.length, monthValue, monthWeighted, stageBreakdown }
  }, [oppsInPipeline, activePipeline])

  if (loading) {
    return (
      <div className="command-workspace p-6">
        <PageHeader icon="🎯" title="Pipelines" subtitle="Loading..." />
      </div>
    )
  }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon="🎯"
        title="Pipelines"
        subtitle={activePipeline ? `${activePipeline.name} · ${pipelineStats.open} open · ${pipelineStats.wonCount} won` : ''}
        viewToggle={<ViewModeToggle value={view} onChange={setView} modes={['list', 'card', 'kanban']} />}
        controls={<ComponentSettings componentId="pipelines.board" title="Pipelines board settings" onApplied={(id, v) => boardPrefs.apply(v)} />}
        actions={
          <div className="flex gap-2 items-center">
            <button className="px-3 py-2 rounded-lg text-sm" data-tooltip="Have Doreen call back leads in the discovery stage that have been quiet 7+ days"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onClick={startReactivate}>
              📞 Reactivate Stale
            </button>
            <button className="px-3 py-2 rounded-lg text-sm" data-tooltip="Create / edit / delete pipelines and stages"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onClick={() => setManagingPipelines(true)}>
              ⚙ Manage Pipelines
            </button>
            <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => setAdding(true)} disabled={accounts.length === 0}>+ New Opportunity</button>
          </div>
        }
      />

      {/* One compliant control row: owner filter + pipeline selector.
          Replaces an instruction banner that explained the CRM to its own
          operator, and a raw flex-wrap of one button per pipeline that grew a
          new row for every pipeline added. */}
      {(() => {
        const ownersInUse = new Set(pipelines.map(p => p.ownerAccountId || INHOUSE_OWNER))
        const ownerOptions = [
          { id: 'all', label: 'All owners' },
          ...(ownersInUse.has(INHOUSE_OWNER) ? [{ id: INHOUSE_OWNER, label: 'In-house' }] : []),
          ...accounts.filter(a => ownersInUse.has(a.id)).map(a => ({ id: a.id, label: a.name })),
        ]
        const visiblePipelines = pipelines.filter(p => ownerFilter === 'all'
          ? true
          : (p.ownerAccountId || INHOUSE_OWNER) === ownerFilter)
        return (
          <div className="command-toolbar flex flex-wrap items-center gap-3 mb-4">
            {ownerOptions.length > 2 && (
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Owner
                <ThemedSelect aria-label="Filter pipelines by owner" value={ownerFilter}
                  onChange={e => setOwnerFilter(e.target.value)} style={{ minWidth: 180 }}>
                  {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </ThemedSelect>
              </label>
            )}
            <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Pipeline
              <ThemedSelect aria-label="Select pipeline" value={activePipelineId || ''}
                onChange={e => setActivePipelineId(e.target.value)} style={{ minWidth: 280 }}>
                {visiblePipelines.length === 0 && <option value="">No pipelines</option>}
                {visiblePipelines.map(p => (
                  <option key={p.id} value={p.id}>
                    {`${p.name} (${opportunities.filter(o => o.pipelineId === p.id).length})`}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          </div>
        )
      })()}


      {activePipeline && boardCfg.showForecastStrip !== false && <ForecastStrip stats={pipelineStats} />}


      {activePipeline && oppsInPipeline.length > 0 && (
        <div className="rounded-xl p-3 mb-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={bulkSelected.size === visibleOpportunityIds.length && visibleOpportunityIds.length > 0} onChange={toggleBulkAll} style={{ width: 20, height: 20 }} />
            {bulkSelected.size === 0 ? 'Select all' : `${bulkSelected.size} selected`}
          </label>
          {bulkSelected.size > 0 && (
            <>
              <button type="button" onClick={() => setBulkSelected(new Set())} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
              <button type="button" onClick={bulkDelete} disabled={bulkDeleting} className="ml-auto px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: bulkDeleting ? 0.6 : 1 }}>
                {bulkDeleting ? 'Deleting...' : `Delete ${bulkSelected.size}`}
              </button>
            </>
          )}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏢</div>
          <p style={{ color: 'var(--text-muted)' }}>Add an Account first, then create Opportunities here.</p>
        </div>
      ) : !activePipeline ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>No pipelines configured.</div>
      ) : view === 'list' ? (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {oppsInPipeline.length === 0 ? (
            isOpenOcti() ? <OpenOctiEmptyState objectType="opportunities" title="Move deals through your pipeline" description="Import opportunities to see value and progress across every stage." /> : <div className="p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No opportunities in this pipeline yet.</div>
          ) : oppsInPipeline.map((o, i) => {
            const stage = activePipeline.stages.find(s => s.id === o.stageId)
            const isSelected = bulkSelected.has(o.id)
            return (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(o)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(o) } }}
                className="w-full grid gap-3 items-center px-4 py-3 text-left"
                style={{ gridTemplateColumns: '28px minmax(0,1.5fr) minmax(110px,.5fr) minmax(110px,.5fr) minmax(120px,.5fr)', background: isSelected ? 'var(--accent-soft)' : 'transparent', borderBottom: i < oppsInPipeline.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  aria-label={`Select ${o.name}`}
                  checked={isSelected}
                  onClick={e => e.stopPropagation()}
                  onChange={e => toggleBulk(o.id, e)}
                  style={{ width: 20, height: 20 }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{o.name}</div>
                  <ContactLine o={o} />
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{o.accountName || 'No account'}</div>
                    {isProspectOpportunity(o) && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Prospect</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 min-w-0"><span className="text-xs font-medium" style={{ color: stage?.color || 'var(--text-muted)' }}>{stage?.label || o.stageId || 'Stage'}</span>{stage?.terminal && o.closeReason && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold truncate" title={o.closeNote || o.closeReason} style={{ background: stage.terminal === 'won' ? 'var(--green-soft)' : 'var(--red-soft)', color: stage.terminal === 'won' ? 'var(--green)' : 'var(--red)' }}>{o.closeReason}</span>}</div>
                <span className="text-sm font-mono font-bold" style={{ color: 'var(--green)' }}>{fmtUSD(o.value)}</span>
                <div className="flex items-center gap-2 justify-end">
                  {isProspectOpportunity(o) && (
                    <button type="button" onClick={e => promoteToClient(o, e)} className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>Promote</button>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{o.expectedClose ? new Date(o.expectedClose).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No close date'}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {oppsInPipeline.length === 0 ? (
            isOpenOcti() ? <OpenOctiEmptyState objectType="opportunities" title="Move deals through your pipeline" description="Import opportunities to see value and progress across every stage." /> : <div className="rounded-lg p-6 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>No opportunities in this pipeline yet.</div>
          ) : oppsInPipeline.map(o => {
            const stage = activePipeline.stages.find(s => s.id === o.stageId)
            const isSelected = bulkSelected.has(o.id)
            return (
              <div key={o.id} onClick={() => setEditing(o)} className="rounded-lg p-4 cursor-pointer" style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}` }}>
                <div className="flex items-start justify-between gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${o.name}`}
                    checked={isSelected}
                    onClick={e => e.stopPropagation()}
                    onChange={e => toggleBulk(o.id, e)}
                    style={{ width: 20, height: 20, flexShrink: 0 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{o.name}</div>
                    <ContactLine o={o} size={12} />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{o.accountName || 'No account'}</div>
                      {isProspectOpportunity(o) && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Prospect</span>}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium" style={{ background: 'var(--surface2)', color: stage?.color || 'var(--text-muted)' }}>{stage?.label || o.stageId || 'Stage'}</span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-lg font-mono font-bold" style={{ color: 'var(--green)' }}>{fmtUSD(o.value)}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{o.probability ? `${o.probability}% probability` : 'No probability set'}</div>
                  </div>
                  <div className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                    {isProspectOpportunity(o) && (
                      <button type="button" onClick={e => promoteToClient(o, e)} className="mb-2 px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>Promote to Client</button>
                    )}
                    <div>{o.expectedClose ? new Date(o.expectedClose).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No close date'}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <BoardWorkbench label={`${activePipeline.name} pipeline board`}>
          {activePipeline.stages.map(stage => (
            <Column key={stage.id} stage={stage}
              idleCfg={boardCfg}
              stages={activePipeline.stages}
              opps={oppsInPipeline.filter(o => o.stageId === stage.id)}
              onDrop={moveStage}
              onEdit={setEditing}
              selectedIds={bulkSelected}
              onToggleSelected={toggleBulk}
              onPromote={promoteToClient} />
          ))}
        </BoardWorkbench>
      )}

      {managingPipelines && (
        <PipelineManagerModal
          pipelines={pipelines}
          accounts={accounts}
          onSaved={refresh}
          onClose={() => setManagingPipelines(false)}
        />
      )}

      {adding && <OpportunityForm accounts={accounts} pipelines={pipelines} currentPipeline={activePipeline} onSave={save} onClose={() => setAdding(false)} />}
      {editing && (
        <OpportunityForm opportunity={editing} accounts={accounts} pipelines={pipelines} currentPipeline={activePipeline} onSave={save} onClose={() => setEditing(null)} onDelete={del} onNavigate={onNavigate} />
      )}

      {closingDeal && (
        <CloseReasonModal
          opp={closingDeal.opp}
          stage={closingDeal.stage}
          onCancel={() => setClosingDeal(null)}
          onConfirm={async (fields) => {
            const { opp, stage, reasonOnly } = closingDeal
            setClosingDeal(null)
            if (reasonOnly) {
              await api('/api/opportunities', { action: 'update', opportunity: { id: opp.id, ...fields } })
              await refresh()
            } else {
              await finalizeStageMove(opp, stage, fields)
            }
          }}
        />
      )}

      {reactivating && (
        <Modal title="Reactivate stale leads — Doreen will call them" onClose={() => setReactivating(null)} wide>
          {reactivating.loading && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Scanning…</div>}
          {reactivating.error && <div style={{ padding: 12, color: 'var(--red, #ef4444)' }}>⚠️ {reactivating.error}</div>}

          {!reactivating.loading && !reactivating.done && reactivating.candidates && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {reactivating.note || `${reactivating.candidates.length} stale lead(s) ready.`}
                {reactivating.candidates.length > 0 && ' Doreen will call them spaced 30 seconds apart.'}
              </p>
              {reactivating.candidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 320, overflowY: 'auto' }}>
                  {reactivating.candidates.map((c, i) => (
                    <div key={i} style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || '(no name)'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>📞 {c.phone} · {c.ageDays}d idle</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>"{c.reason}"</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setReactivating(null)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
                {reactivating.candidates.length > 0 && (
                  <button onClick={confirmReactivate} disabled={reactivating.firing}
                    style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: reactivating.firing ? 'var(--surface2)' : 'var(--accent)', color: 'var(--accent-text)', fontWeight: 600, cursor: reactivating.firing ? 'default' : 'pointer' }}>
                    {reactivating.firing ? 'Calling…' : `Have Doreen call all ${reactivating.candidates.length}`}
                  </button>
                )}
              </div>
            </>
          )}

          {reactivating.done && (
            <div>
              <div style={{ padding: 12, background: 'var(--green-soft, #dcfce7)', color: 'var(--green-dark, #064e3b)', borderRadius: 8, marginBottom: 12 }}>
                ✅ Dispatched {reactivating.dispatched} call{reactivating.dispatched === 1 ? '' : 's'}
                {reactivating.failed ? ` · ${reactivating.failed} failed` : ''}
              </div>
              <button onClick={() => { setReactivating(null); refresh() }} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontWeight: 600, cursor: 'pointer' }}>Done</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
