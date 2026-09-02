'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Edit3, Plus, Search, Trash2 } from 'lucide-react'
import ItemActionsMenu from '../components/ItemActionsMenu'
import ThemedSelect from '../components/ThemedSelect'
import ViewModeToggle from '../components/ViewModeToggle'

const VIEW_KEY = 'fcc:ai-lab-bench-view'

export default function BenchRegistry({ entries, catalogModels, selectedModels, onToggleModel, onSelectReadyPair, onSelectReadySlate, onClear, onCreate, onUpdate, onDelete }) {
  const [view, setView] = useState('list')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    if (saved === 'list' || saved === 'card') setView(saved)
  }, [])

  const changeView = next => {
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(entry => [entry.displayName, entry.modelId, entry.providerLabel, entry.tier, entry.bestFor, entry.benchNotes]
      .some(value => String(value || '').toLowerCase().includes(needle)))
  }, [entries, query])

  const remove = async entry => {
    const label = entry.custom ? 'delete this Bench profile' : 'hide this catalog route from the Bench'
    if (!window.confirm(`Are you sure you want to ${label}? The provider catalog and release history are not changed.`)) return
    setMessage('')
    try {
      await onDelete(entry)
      setMessage(entry.custom ? 'Bench profile deleted.' : 'Catalog route hidden from the Bench.')
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  const actionsFor = entry => [
    {
      label: selectedModels.includes(entry.modelId) ? 'Remove from comparison' : 'Add to comparison',
      icon: Check,
      disabled: !entry.enabled && !selectedModels.includes(entry.modelId),
      onClick: () => onToggleModel(entry.modelId),
    },
    { label: 'Edit Bench details', icon: Edit3, onClick: () => setEditing(entry) },
    { label: entry.custom ? 'Delete Bench profile' : 'Hide from Bench', icon: Trash2, tone: 'danger', onClick: () => remove(entry) },
  ]

  return (
    <section style={panelStyle} data-testid="bench-registry">
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Bench routes</h2>
          <p style={helperStyle}>Provider, route id, tier, context, and pricing stay catalog-controlled. Names, Bench notes, enabled state, and custom route profiles are managed here.</p>
        </div>
        <div style={headerActionsStyle}>
          <button type="button" style={addButtonStyle} onClick={() => setEditing({ custom: true, enabled: true })}>
            <Plus size={15} aria-hidden="true" /> Add profile
          </button>
          <ViewModeToggle value={view} onChange={changeView} modes={['list', 'card']} />
        </div>
      </div>

      <div style={toolbarStyle}>
        <Search size={15} aria-hidden="true" />
        <input aria-label="Filter Bench routes" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter name, provider, route, tier, or notes" style={searchInputStyle} />
        <span style={countStyle}>{filtered.length} entries</span>
      </div>

      <div style={selectionBarStyle}>
        <div style={selectionActionsStyle}>
          <button type="button" onClick={onSelectReadyPair} disabled={entries.filter(entry => entry.enabled).length < 2} style={secondaryButtonStyle}>Pick ready pair</button>
          <button type="button" onClick={onSelectReadySlate} disabled={entries.filter(entry => entry.enabled).length < 2} style={secondaryButtonStyle}>Pick ready slate</button>
          <button type="button" onClick={onClear} disabled={!selectedModels.length} style={secondaryButtonStyle}>Clear</button>
        </div>
        <span style={countStyle}>{selectedModels.length}/6 routes selected</span>
      </div>

      {message && <div role="status" style={messageStyle}>{message}</div>}
      {!filtered.length && <div style={emptyStyle}>No Bench entries match this filter.</div>}

      {view === 'list' && filtered.length > 0 && (
        <div style={tableWrapStyle} data-testid="bench-list-view">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={selectHeadStyle}>Use</th>
                <th style={headStyle}>Name / route</th>
                <th style={headStyle}>Provider</th>
                <th style={headStyle}>Tier</th>
                <th style={headStyle}>Status</th>
                <th style={notesHeadStyle}>Bench notes / fit</th>
                <th style={actionsHeadStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const selected = selectedModels.includes(entry.modelId)
                return (
                  <tr key={entry.id} style={rowStyle}>
                    <td style={selectCellStyle}>
                      <input type="checkbox" aria-label={`Use ${entry.displayName} in comparison`} checked={selected} disabled={!entry.enabled && !selected} onChange={() => onToggleModel(entry.modelId)} />
                    </td>
                    <td style={cellStyle}>
                      <strong style={nameStyle}>{entry.displayName}</strong>
                      <span style={monoStyle}>{entry.modelId}</span>
                    </td>
                    <td style={cellStyle}>{entry.providerLabel}</td>
                    <td style={cellStyle}>{entry.tier}</td>
                    <td style={cellStyle}><StatusPill enabled={entry.enabled} custom={entry.custom} /></td>
                    <td style={notesCellStyle}>{entry.benchNotes || entry.bestFor || 'No local note.'}</td>
                    <td style={actionsCellStyle}><ItemActionsMenu label={`${entry.displayName} actions`} actions={actionsFor(entry)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'card' && filtered.length > 0 && (
        <div style={cardGridStyle} data-testid="bench-card-view">
          {filtered.map(entry => {
            const selected = selectedModels.includes(entry.modelId)
            return (
              <article key={entry.id} style={cardStyle(selected)}>
                <div style={cardHeaderStyle}>
                  <label style={selectLabelStyle}>
                    <input type="checkbox" aria-label={`Use ${entry.displayName} in comparison`} checked={selected} disabled={!entry.enabled && !selected} onChange={() => onToggleModel(entry.modelId)} />
                    <span>Use in run</span>
                  </label>
                  <ItemActionsMenu label={`${entry.displayName} actions`} actions={actionsFor(entry)} />
                </div>
                <strong style={nameStyle}>{entry.displayName}</strong>
                <span style={monoStyle}>{entry.modelId}</span>
                <div style={cardMetaStyle}><span>{entry.providerLabel}</span><span>{entry.tier}</span><StatusPill enabled={entry.enabled} custom={entry.custom} /></div>
                <p style={cardNotesStyle}>{entry.benchNotes || entry.bestFor || 'No local note.'}</p>
              </article>
            )
          })}
        </div>
      )}

      {editing && (
        <BenchEntryDialog
          entry={editing}
          catalogModels={catalogModels}
          onClose={() => setEditing(null)}
          onSave={async values => {
            if (editing.id) await onUpdate({ ...editing, ...values })
            else await onCreate(values)
            setEditing(null)
            setMessage(editing.id ? 'Bench details updated.' : 'Bench profile created.')
          }}
        />
      )}
    </section>
  )
}

function BenchEntryDialog({ entry, catalogModels, onClose, onSave }) {
  const initialModelId = entry.modelId || catalogModels[0]?.id || ''
  const [modelId, setModelId] = useState(initialModelId)
  const [displayName, setDisplayName] = useState(entry.displayName || catalogModels.find(model => model.id === initialModelId)?.name || '')
  const [notes, setNotes] = useState(entry.benchNotes || '')
  const [enabled, setEnabled] = useState(entry.enabled !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ modelId, displayName, notes, enabled })
    } catch (caught) {
      setError(caught.message || String(caught))
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <form role="dialog" aria-modal="true" aria-labelledby="bench-entry-title" style={dialogStyle} onSubmit={submit}>
        <div>
          <h2 id="bench-entry-title" style={dialogTitleStyle}>{entry.id ? 'Edit Bench details' : 'Add Bench profile'}</h2>
          <p style={helperStyle}>The route and provider facts come from the immutable runtime catalog. This form manages the local Bench profile only.</p>
        </div>
        <label style={labelStyle}>Catalog route
          <ThemedSelect value={modelId} disabled={Boolean(entry.id)} onChange={event => {
            const next = event.target.value
            setModelId(next)
            setDisplayName(catalogModels.find(model => model.id === next)?.name || '')
          }} style={inputStyle}>
            {catalogModels.map(model => <option key={model.id} value={model.id}>{model.providerLabel}: {model.name}</option>)}
          </ThemedSelect>
        </label>
        <label style={labelStyle}>Bench name
          <input required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>Bench notes
          <textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
        </label>
        <label style={checkLabelStyle}><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enabled for comparisons</label>
        {error && <div role="alert" style={errorStyle}>{error}</div>}
        <div style={dialogActionsStyle}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
          <button type="submit" disabled={saving || !modelId || !displayName.trim()} style={addButtonStyle}>{saving ? 'Saving...' : 'Save Bench profile'}</button>
        </div>
      </form>
    </div>
  )
}

function StatusPill({ enabled, custom }) {
  return <span style={pillStyle(enabled)}>{enabled ? (custom ? 'custom · enabled' : 'catalog · enabled') : 'disabled'}</span>
}

const panelStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 18, minWidth: 0, boxShadow: '0 10px 28px rgba(0,0,0,0.10)' }
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }
const titleStyle = { margin: 0, fontSize: 16, fontWeight: 800 }
const helperStyle = { margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.45, maxWidth: 760 }
const headerActionsStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }
const addButtonStyle = { minHeight: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 8, padding: '8px 12px', border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 750, cursor: 'pointer' }
const secondaryButtonStyle = { ...addButtonStyle, borderColor: 'var(--border)', background: 'var(--surface2)', color: 'var(--text)' }
const toolbarStyle = { minHeight: 42, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', background: 'var(--surface2)', color: 'var(--text-muted)', marginBottom: 12 }
const searchInputStyle = { flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13 }
const countStyle = { fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }
const selectionBarStyle = { minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', border: '1px dashed var(--border)', borderRadius: 8, padding: 8, marginBottom: 12, background: 'var(--surface2)' }
const selectionActionsStyle = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }
const messageStyle = { border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, marginBottom: 10 }
const emptyStyle = { border: '1px dashed var(--border)', borderRadius: 8, padding: 24, color: 'var(--text-muted)', textAlign: 'center' }
const tableWrapStyle = { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }
const tableStyle = { width: '100%', minWidth: 880, borderCollapse: 'collapse', tableLayout: 'fixed' }
const headStyle = { padding: '9px 10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }
const selectHeadStyle = { ...headStyle, width: 54, textAlign: 'center' }
const notesHeadStyle = { ...headStyle, width: '25%' }
const actionsHeadStyle = { ...headStyle, width: 70, textAlign: 'center' }
const rowStyle = { height: 76, borderBottom: '1px solid var(--border)' }
const cellStyle = { padding: '9px 10px', fontSize: 12.5, verticalAlign: 'middle', overflow: 'hidden' }
const selectCellStyle = { ...cellStyle, textAlign: 'center' }
const notesCellStyle = { ...cellStyle, color: 'var(--text-muted)', lineHeight: 1.35, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
const actionsCellStyle = { ...cellStyle, textAlign: 'center', width: 70 }
const nameStyle = { display: 'block', fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const monoStyle = { display: 'block', marginTop: 4, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const cardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }
const cardStyle = selected => ({ display: 'grid', gap: 8, minHeight: 190, border: selected ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 8, padding: 12, background: selected ? 'color-mix(in srgb, var(--accent) 8%, var(--surface2))' : 'var(--surface2)' })
const cardHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const selectLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 750 }
const cardMetaStyle = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 12 }
const cardNotesStyle = { margin: 0, color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.45 }
const pillStyle = enabled => ({ display: 'inline-flex', padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border)', background: enabled ? 'color-mix(in srgb, var(--green, #10b981) 12%, var(--surface2))' : 'var(--surface2)', color: enabled ? 'var(--green, #10b981)' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' })
const overlayStyle = { position: 'fixed', inset: 0, zIndex: 99990, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(2, 6, 23, 0.68)' }
const dialogStyle = { width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 14, border: '1px solid var(--border)', borderRadius: 10, padding: 18, background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }
const dialogTitleStyle = { margin: 0, fontSize: 18, fontWeight: 850 }
const labelStyle = { display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 800 }
const inputStyle = { width: '100%', minHeight: 42, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '9px 11px', fontSize: 13, fontFamily: 'inherit' }
const checkLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 750 }
const errorStyle = { border: '1px solid var(--red)', borderRadius: 8, padding: '8px 10px', color: 'var(--red)', fontSize: 12.5 }
const dialogActionsStyle = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
