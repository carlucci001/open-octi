'use client'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Info,
  Network,
  Pencil,
  PlayCircle,
  Plus,
  ShieldCheck,
  Shuffle,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react'
import ThemedSelect from '../components/ThemedSelect'
import FlowSteps, { FLOW_CAPABILITIES } from './FlowSteps'
import FlowRunPanel from './FlowRunPanel'
import FlowReassignPanel from './FlowReassignPanel'

const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }
const field = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', minHeight: 48 }
const muted = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }
const iconButton = { background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 44, minHeight: 44, padding: '0 11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

const emptyFlow = () => ({
  name: '',
  description: '',
  inputs: [{ id: 'client', label: 'Client or run context', required: false }],
  enabled: false,
  tags: [],
  entryAgentId: '',
  nodes: [],
  edges: [],
  steps: [],
  allowedHosts: [],
})

async function orchestrationRequest(body) {
  return fetch('/api/orchestrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(response => response.json())
}

export default function OrchestrationDesigner() {
  const [flows, setFlows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)
  const [busyIds, setBusyIds] = useState(new Set())
  const [activeRun, setActiveRun] = useState(null)
  const [runSetup, setRunSetup] = useState(null)
  const [reassigningId, setReassigningId] = useState(null)

  const load = async () => {
    try {
      const data = await fetch('/api/orchestrations', { cache: 'no-store' }).then(response => response.json())
      setFlows(data.orchestrations || [])
      setAgents(data.agents || [])
      setLoadError(data.error || '')
    } catch (error) {
      setLoadError(error.message || 'Could not load the flow library.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const flash = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }
  const markBusy = (id, busy) => setBusyIds(previous => {
    const next = new Set(previous)
    if (busy) next.add(id)
    else next.delete(id)
    return next
  })

  const persist = async flow => {
    const isNew = !flow.id
    const response = await orchestrationRequest(isNew
      ? { action: 'create', ...flow }
      : { action: 'update', id: flow.id, patch: flow })
    if (response.ok) {
      flash(isNew ? 'Flow created.' : 'Flow saved.')
      setEditing(null)
      await load()
    } else flash(response.error || 'Save failed.', 'error')
  }

  const remove = async flow => {
    if (!confirm(`Delete “${flow.name}”?`)) return
    const response = await orchestrationRequest({ action: 'delete', id: flow.id })
    if (response.ok) {
      flash('Flow deleted.')
      await load()
    } else flash(response.error || 'Delete failed.', 'error')
  }

  const validateFlow = async flow => {
    markBusy(flow.id, true)
    try {
      const response = await orchestrationRequest({ action: 'validate', id: flow.id, input: flow.description || flow.name })
      if (response.ok) {
        flash(response.validation?.summary || 'Flow validated.')
        await load()
      } else flash(response.error || 'Validation failed.', 'error')
    } finally {
      markBusy(flow.id, false)
    }
  }

  const cloneFlow = async flow => {
    markBusy(flow.id, true)
    try {
      const response = await orchestrationRequest({ action: 'clone', id: flow.id })
      if (response.ok) {
        flash(`Cloned as “${response.orchestration.name}”. It is disabled until you enable it.`)
        await load()
      } else flash(response.error || 'Clone failed.', 'error')
    } finally {
      markBusy(flow.id, false)
    }
  }

  const toggleEnabled = async flow => {
    markBusy(flow.id, true)
    try {
      const response = await orchestrationRequest({ action: 'update', id: flow.id, patch: { enabled: !flow.enabled } })
      if (response.ok) {
        flash(`${flow.name} ${response.orchestration.enabled ? 'enabled' : 'disabled'}.`)
        await load()
      } else flash(response.error || 'Status update failed.', 'error')
    } finally {
      markBusy(flow.id, false)
    }
  }

  const exportFlow = flow => {
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `flow-${flow.slug || flow.id}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const importFlow = async file => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Choose one flow JSON object.')
      const response = await orchestrationRequest({ action: 'import', flow: parsed })
      if (response.ok) {
        flash(`Imported “${response.orchestration.name}” as a disabled flow.`)
        await load()
      } else flash(response.error || 'Import failed.', 'error')
    } catch (error) {
      flash(`Import failed: ${error.message}`, 'error')
    }
  }

  const startRun = async () => {
    if (!runSetup?.flow) return
    markBusy(runSetup.flow.id, true)
    try {
      const response = await orchestrationRequest({ action: 'start', id: runSetup.flow.id, input: runSetup.input.trim() })
      if (response.ok && response.run) {
        setActiveRun(response.run)
        setRunSetup(null)
        await load()
      } else flash(response.error || 'Could not start the interview.', 'error')
    } finally {
      markBusy(runSetup.flow.id, false)
    }
  }

  if (editing) return <FlowEditor flow={editing} agents={agents} onChange={setEditing} onSave={persist} onCancel={() => setEditing(null)} />

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {toast && <Toast toast={toast} />}
      <header style={{ ...panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Network size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Orchestration designer</h2>
          </div>
          <p style={{ ...muted, margin: '6px 0 0' }}>Build operator-led interviews from the real agent roster. Gates run now; Phase 1 action nodes are recorded as deferred.</p>
          <p style={{ ...muted, margin: '8px 0 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span><strong>Run</strong> asks and records gate answers. It does not invoke agents, create tasks/documents, call APIs, or invoke MCPs. <strong>Validate</strong> only checks the saved design.</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ ...iconButton, minHeight: 48, gap: 7 }}>
            <Upload size={15} /> Import one JSON
            <input aria-label="Import one flow JSON" type="file" accept="application/json" style={{ display: 'none' }} onChange={event => { importFlow(event.target.files?.[0]); event.target.value = '' }} />
          </label>
          <button onClick={() => setEditing(emptyFlow())} style={{ ...iconButton, minHeight: 48, padding: '0 16px', gap: 7, fontWeight: 700 }}>
            <Plus size={17} /> New flow
          </button>
        </div>
      </header>

      <CapabilitiesPanel />

      {runSetup && <RunSetup flow={runSetup.flow} input={runSetup.input} onInput={input => setRunSetup({ ...runSetup, input })} onStart={startRun} onCancel={() => setRunSetup(null)} busy={busyIds.has(runSetup.flow.id)} />}
      {activeRun && <FlowRunPanel run={activeRun} onClose={() => { setActiveRun(null); load() }} />}

      {loadError && <div role="alert" style={{ ...panel, color: 'var(--red)' }}>{loadError}</div>}
      {loading ? (
        <div style={{ ...panel, textAlign: 'center', color: 'var(--text-muted)' }}>Loading flow library…</div>
      ) : flows.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center' }}>
          <Network size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
          <p style={muted}>No flows are saved. Create the first operator interview.</p>
        </div>
      ) : (
        <section aria-label="Flow library" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {flows.map(flow => (
            <FlowCard
              key={flow.id}
              flow={flow}
              agents={agents}
              busy={busyIds.has(flow.id)}
              reassigning={reassigningId === flow.id}
              onRun={() => { setActiveRun(null); setRunSetup({ flow, input: '' }) }}
              onValidate={() => validateFlow(flow)}
              onEdit={() => setEditing(JSON.parse(JSON.stringify(flow)))}
              onClone={() => cloneFlow(flow)}
              onExport={() => exportFlow(flow)}
              onDelete={() => remove(flow)}
              onToggle={() => toggleEnabled(flow)}
              onReassign={() => setReassigningId(reassigningId === flow.id ? null : flow.id)}
              onReassigned={async response => { flash(`Reassigned ${response.moved} node${response.moved === 1 ? '' : 's'}.`); setReassigningId(null); await load() }}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function CapabilitiesPanel() {
  return (
    <section style={panel} aria-labelledby="orchestration-capabilities-heading">
      <h3 id="orchestration-capabilities-heading" style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Capabilities</h3>
      <p style={{ ...muted, margin: '4px 0 12px' }}>The library shows what each saved flow can ask and what its action nodes would request.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {FLOW_CAPABILITIES.map(capability => (
          <div key={capability.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>{capability.label}</strong>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: capability.available ? 'var(--green)' : 'var(--amber)' }}>{capability.available ? 'RUNS NOW' : 'PHASE 1 STUB'}</span>
            </div>
            <div style={{ ...muted, marginTop: 4 }}>{capability.description}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FlowCard({ flow, agents, busy, reassigning, onRun, onValidate, onEdit, onClone, onExport, onDelete, onToggle, onReassign, onReassigned }) {
  const agentName = id => agents.find(agent => agent.id === id)?.name || id
  const summary = flow.whatThisFlowDoes?.text || flow.description || 'No generated summary is cached for this legacy flow yet.'
  const lastRun = flow.lastRunAt ? new Date(flow.lastRunAt).toLocaleString() : 'Never run'
  const assignedAgents = [...new Set([...(flow.nodes || []), ...(flow.steps || []).map(step => step.agentId)].filter(Boolean))]
  const validation = flow.latestValidation

  return (
    <article style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{flow.name}</h3>
          <div style={{ ...muted, marginTop: 3 }}>{flow.slug || 'legacy flow without slug'}</div>
        </div>
        <button aria-label={`${flow.enabled ? 'Disable' : 'Enable'} ${flow.name}`} title={`${flow.enabled ? 'Disable' : 'Enable'} flow`} disabled={busy} onClick={onToggle}
          style={{ ...iconButton, minWidth: 'auto', padding: '0 10px', color: flow.enabled ? 'var(--green)' : 'var(--text-muted)', fontSize: 11, fontWeight: 800 }}>
          {flow.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 11, marginTop: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>What this flow does</div>
        <p style={{ ...muted, color: 'var(--text)', margin: '5px 0 0' }}>{summary}</p>
      </div>

      <div style={{ ...muted, marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{flow.runCount || 0} run{flow.runCount === 1 ? '' : 's'}</span>
        <span>Last: {lastRun}</span>
        <span>{(flow.steps || []).length} nodes</span>
        <span>{assignedAgents.length} assigned agent{assignedAgents.length === 1 ? '' : 's'}</span>
      </div>
      {flow.clonedFrom && <div style={{ ...muted, marginTop: 5 }}>Cloned from {flow.clonedFrom}</div>}
      {(flow.tags || []).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          <Tags size={13} style={{ color: 'var(--text-muted)' }} />
          {flow.tags.map(tag => <span key={tag} style={{ ...muted, background: 'var(--surface2)', borderRadius: 999, padding: '2px 7px' }}>{tag}</span>)}
        </div>
      )}
      {assignedAgents.length > 0 && <div style={{ ...muted, marginTop: 8 }}>Assigned: {assignedAgents.map(agentName).join(', ')}</div>}

      {validation && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, color: validation.status === 'valid' ? 'var(--green)' : 'var(--amber)', fontSize: 12, fontWeight: 700 }}>
          {validation.status === 'valid' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {validation.summary}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
        {(flow.steps || []).length > 0 && <button aria-label={`Run ${flow.name}`} title="Run the operator interview" disabled={busy} onClick={onRun} style={{ ...iconButton, color: 'var(--green)' }}><PlayCircle size={17} /></button>}
        <button aria-label={`Validate ${flow.name}`} title="Validate without execution" disabled={busy} onClick={onValidate} style={iconButton}><ShieldCheck size={16} /></button>
        <button aria-label={`Edit ${flow.name}`} title="Edit flow" onClick={onEdit} style={iconButton}><Pencil size={15} /></button>
        <button aria-label={`Clone ${flow.name}`} title="Clone flow" disabled={busy} onClick={onClone} style={iconButton}><Copy size={15} /></button>
        <button aria-label={`Reassign agents in ${flow.name}`} title="Preview agent reassignment" onClick={onReassign} style={iconButton}><Shuffle size={15} /></button>
        <button aria-label={`Export ${flow.name}`} title="Export one flow JSON" onClick={onExport} style={iconButton}><Download size={15} /></button>
        <button aria-label={`Delete ${flow.name}`} title="Delete flow" onClick={onDelete} style={{ ...iconButton, color: 'var(--red)' }}><Trash2 size={16} /></button>
      </div>

      {reassigning && <FlowReassignPanel flow={flow} agents={agents} onClose={onReassign} onApplied={onReassigned} />}
    </article>
  )
}

function RunSetup({ flow, input, onInput, onStart, onCancel, busy }) {
  return (
    <section style={{ ...panel, borderColor: 'var(--accent)' }} aria-label={`Start ${flow.name}`}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Start interview · {flow.name}</h3>
      <p style={{ ...muted, margin: '5px 0 10px' }}>{flow.whatThisFlowDoes?.text || flow.description}</p>
      <label style={{ display: 'grid', gap: 5 }}>
        <span style={muted}>Client or run context</span>
        <input aria-label="Client or run context" autoFocus style={field} value={input} onChange={event => onInput(event.target.value)} placeholder="e.g. Acme Hardware" />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ ...iconButton, minHeight: 48, padding: '0 16px' }}>Cancel</button>
        <button onClick={onStart} disabled={busy} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, minHeight: 48, padding: '0 20px', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Starting…' : 'Start interview'}</button>
      </div>
    </section>
  )
}

function FlowEditor({ flow, agents, onChange, onSave, onCancel }) {
  const set = (key, value) => onChange({ ...flow, [key]: value })
  const nodes = flow.nodes || []
  const edges = flow.edges || []
  const inFlow = agents.filter(agent => nodes.includes(agent.id))
  const canSave = flow.name.trim() && ((flow.steps || []).length > 0 || (nodes.length > 0 && flow.entryAgentId))

  const toggleNode = id => {
    const next = nodes.includes(id) ? nodes.filter(nodeId => nodeId !== id) : [...nodes, id]
    const patch = { ...flow, nodes: next, edges: edges.filter(edge => next.includes(edge.from) && next.includes(edge.to)) }
    if (!next.includes(flow.entryAgentId)) patch.entryAgentId = next[0] || ''
    onChange(patch)
  }
  const addEdge = () => set('edges', [...edges, { from: inFlow[0]?.id || '', to: inFlow[1]?.id || inFlow[0]?.id || '', when: '' }])
  const setEdge = (index, key, value) => set('edges', edges.map((edge, edgeIndex) => edgeIndex === index ? { ...edge, [key]: value } : edge))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <button type="button" onClick={onCancel} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', justifySelf: 'start', padding: 0 }}>← Flows</button>
      <section style={{ ...panel, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{flow.id ? 'Edit flow' : 'New orchestration flow'}</h2>
        <label style={{ display: 'grid', gap: 4 }}><span style={muted}>Flow name</span><input aria-label="Flow name" style={field} value={flow.name} onChange={event => set('name', event.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={muted}>Description</span><textarea aria-label="Flow description" style={{ ...field, minHeight: 64 }} value={flow.description || ''} onChange={event => set('description', event.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={muted}>Tags (comma-separated)</span><input aria-label="Flow tags" style={field} value={(flow.tags || []).join(', ')} onChange={event => set('tags', event.target.value.split(',').map(value => value.trim()).filter(Boolean))} /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 48 }}><input type="checkbox" checked={Boolean(flow.enabled)} onChange={event => set('enabled', event.target.checked)} style={{ width: 18, height: 18 }} /><span style={{ fontSize: 14, color: 'var(--text)' }}>Enabled</span></label>
      </section>

      <section style={panel}><FlowSteps steps={flow.steps || []} agents={agents} onChange={steps => set('steps', steps)} /></section>

      <details style={panel}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Legacy agent handoff graph</summary>
        <p style={muted}>Kept for old flows. Gate/action interviews do not require this graph.</p>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {agents.map(agent => <label key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 48, padding: '8px 10px', background: nodes.includes(agent.id) ? 'var(--accent-soft)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}><input type="checkbox" checked={nodes.includes(agent.id)} onChange={() => toggleNode(agent.id)} /><span>{agent.emoji} {agent.name}</span></label>)}
        </div>
        {nodes.length > 0 && <label style={{ display: 'grid', gap: 4, marginTop: 10, maxWidth: 360 }}><span style={muted}>Entry agent</span><ThemedSelect aria-label="Entry agent" style={field} value={flow.entryAgentId || ''} onChange={event => set('entryAgentId', event.target.value)}><option value="">Choose…</option>{inFlow.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</ThemedSelect></label>}
        {nodes.length > 0 && <button type="button" onClick={addEdge} style={{ ...iconButton, marginTop: 10, gap: 6 }}><Plus size={14} /> Add handoff</button>}
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {edges.map((edge, index) => <div key={`${edge.from}-${edge.to}-${index}`} style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}><ThemedSelect aria-label={`Handoff ${index + 1} source`} style={{ ...field, width: 'auto' }} value={edge.from} onChange={event => setEdge(index, 'from', event.target.value)}>{inFlow.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</ThemedSelect><ArrowRight size={15} /><ThemedSelect aria-label={`Handoff ${index + 1} target`} style={{ ...field, width: 'auto' }} value={edge.to} onChange={event => setEdge(index, 'to', event.target.value)}>{inFlow.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</ThemedSelect><input aria-label={`Handoff ${index + 1} condition`} style={{ ...field, flex: 1, minWidth: 180 }} value={edge.when || ''} onChange={event => setEdge(index, 'when', event.target.value)} placeholder="when…" /><button aria-label={`Delete handoff ${index + 1}`} onClick={() => set('edges', edges.filter((_, edgeIndex) => edgeIndex !== index))} style={{ ...iconButton, color: 'var(--red)' }}><Trash2 size={15} /></button></div>)}
        </div>
      </details>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onCancel} style={{ ...iconButton, minHeight: 48, padding: '0 20px' }}>Cancel</button>
        <button onClick={() => onSave(flow)} disabled={!canSave} style={{ background: canSave ? 'var(--accent)' : 'var(--surface2)', color: canSave ? 'var(--accent-text)' : 'var(--text-muted)', border: 'none', borderRadius: 8, minHeight: 48, padding: '0 24px', fontWeight: 800, cursor: canSave ? 'pointer' : 'not-allowed' }}>{flow.id ? 'Save flow' : 'Create flow'}</button>
      </div>
    </div>
  )
}

function Toast({ toast }) {
  return <div role="status" aria-live="polite" style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, padding: '11px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'var(--accent-text)', background: toast.kind === 'error' ? 'var(--red)' : 'var(--green)', boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}>{toast.message}</div>
}
