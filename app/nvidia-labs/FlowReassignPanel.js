'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import ThemedSelect from '../components/ThemedSelect'

const field = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, fontSize: 13, outline: 'none', minHeight: 48 }
const muted = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }

function assignedAgentIds(flow) {
  return [...new Set([
    flow.entryAgentId,
    ...(flow.nodes || []),
    ...(flow.edges || []).flatMap(edge => [edge.from, edge.to]),
    ...(flow.steps || []).map(step => step.agentId),
  ].filter(Boolean))]
}

export default function FlowReassignPanel({ flow, agents, onClose, onApplied }) {
  const assigned = useMemo(() => assignedAgentIds(flow), [flow])
  const [fromAgentId, setFromAgentId] = useState(assigned[0] || '')
  const [toAgentId, setToAgentId] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const agentName = id => agents.find(agent => agent.id === id)?.name || id

  const call = async action => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/orchestrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: flow.id, fromAgentId, toAgentId }),
      }).then(result => result.json())
      if (!response.ok) {
        setPreview(response.validation ? { ...response, ok: false } : null)
        setError(response.error || 'Reassignment validation failed.')
        return
      }
      if (action === 'reassign_preview') setPreview(response)
      else onApplied(response)
    } catch (caught) {
      setError(caught.message || 'Reassignment validation failed.')
    } finally {
      setBusy(false)
    }
  }

  const changeSelection = setter => event => {
    setter(event.target.value)
    setPreview(null)
    setError('')
  }

  return (
    <section aria-label={`Reassign agents in ${flow.name}`} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Reassign every matching node</div>
          <div style={muted}>Preview checks the target roster and its harness config again. It never edits openclaw.json.</div>
        </div>
        <button type="button" aria-label="Close reassignment" onClick={onClose} style={{ ...field, width: 48, padding: 0, cursor: 'pointer' }}><X size={15} /></button>
      </div>

      {assigned.length === 0 ? (
        <div style={muted}>This flow has no assigned agent nodes.</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 180px' }}>
            <span style={muted}>Reassign from</span>
            <ThemedSelect aria-label="Reassign from" style={{ ...field, width: '100%' }} value={fromAgentId} onChange={changeSelection(setFromAgentId)}>
              {assigned.map(id => <option key={id} value={id}>{agentName(id)}</option>)}
            </ThemedSelect>
          </label>
          <ArrowRight size={16} style={{ color: 'var(--text-muted)', marginTop: 20 }} />
          <label style={{ display: 'grid', gap: 4, flex: '1 1 180px' }}>
            <span style={muted}>Reassign to</span>
            <ThemedSelect aria-label="Reassign to" style={{ ...field, width: '100%' }} value={toAgentId} onChange={changeSelection(setToAgentId)}>
              <option value="">Choose target agent…</option>
              {agents.filter(agent => agent.id !== fromAgentId).map(agent => <option key={agent.id} value={agent.id}>{agent.emoji} {agent.name}</option>)}
            </ThemedSelect>
          </label>
          <button type="button" onClick={() => call('reassign_preview')} disabled={!fromAgentId || !toAgentId || busy}
            style={{ ...field, alignSelf: 'end', cursor: !fromAgentId || !toAgentId || busy ? 'not-allowed' : 'pointer', fontWeight: 700, color: 'var(--accent)' }}>
            Preview reassignment
          </button>
        </div>
      )}

      {error && <div role="alert" style={{ ...muted, color: 'var(--red)' }}>{error}</div>}
      {preview && (
        <div style={{ background: 'var(--surface2)', border: `1px solid ${preview.validation?.errors?.length ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: preview.validation?.errors?.length ? 'var(--red)' : 'var(--green)', fontSize: 13, fontWeight: 800 }}>
            {preview.validation?.errors?.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {preview.moved} node assignment{preview.moved === 1 ? '' : 's'} would change
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...muted }}>
            <ShieldCheck size={14} /> Harness checked: {preview.validation?.harness?.checkedAgentId || toAgentId}
            {preview.validation?.harness?.configFound === false ? ' · config not found' : ' · config read'}
          </div>
          {(preview.validation?.warnings || []).map(warning => <div key={warning} style={{ ...muted, color: 'var(--amber)' }}>Warning: {warning}</div>)}
          {(preview.validation?.errors || []).map(item => <div key={item} style={{ ...muted, color: 'var(--red)' }}>Error: {item}</div>)}
          {!preview.validation?.errors?.length && (
            <button type="button" onClick={() => call('reassign')} disabled={busy}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, minHeight: 48, padding: '0 18px', width: 'fit-content', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
              Apply reassignment
            </button>
          )}
        </div>
      )}
    </section>
  )
}
