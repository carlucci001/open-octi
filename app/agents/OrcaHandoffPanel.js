'use client'
// Orca handoff panel — shows who handed what to Orca, which model answered,
// and the per-agent switch that allows/blocks handoffs. Lives on the Agents page.
import { useCallback, useEffect, useState } from 'react'
import { isOpenOcti } from '@/lib/edition'
import { OpenOctiConfigurationLinks } from '../components/OpenOctiConfigurationNotice'

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtDur(ms) {
  if (!ms && ms !== 0) return ''
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export default function OrcaHandoffPanel({ agents = [] }) {
  const [data, setData] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/agent/handoff?limit=25', { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'failed')
      setData(j)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (agentId, enabled) => {
    setBusy(true)
    try {
      const r = await fetch('/api/agent/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_agent_enabled', agentId, enabled }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'failed')
      setData(d => ({ ...d, settings: j.settings }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const setMode = async mode => {
    setBusy(true)
    try {
      const r = await fetch('/api/agent/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_mode', mode }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'failed')
      setData(d => ({ ...d, settings: j.settings }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const mode = data?.settings?.mode || 'per-agent'
  const enabled = new Set(data?.settings?.enabledAgents || [])
  const roster = agents.filter(a => a && a.id && a.id !== 'orca')
  const runs = data?.runs || []
  const nameOf = id => roster.find(a => a.id === id)?.name || id
  const dayAgo = Date.now() - 24 * 3600 * 1000
  const today = runs.filter(r => new Date(r.createdAt).getTime() > dayAgo)
  const paidToday = today.filter(r => r.tier && r.tier !== 'free').length
  const failedToday = today.filter(r => r.status === 'failed').length
  const summary = data
    ? (today.length === 0 ? 'no handoffs in the last 24h' : `${today.length} handoff${today.length === 1 ? '' : 's'} last 24h · ${paidToday === 0 ? 'all free' : `${paidToday} paid`}${failedToday ? ` · ${failedToday} failed` : ''}`)
    : 'loading…'
  const modeLabel = mode === 'all' ? 'everyone' : mode === 'off' ? 'OFF' : 'per agent'

  const muted = { fontSize: 12, color: 'var(--text-muted)' }
  const pill = on => ({
    fontSize: 11, padding: '3px 9px', borderRadius: 999, cursor: busy ? 'wait' : 'pointer', border: '1px solid ' + (on ? 'var(--accent, #3b82f6)' : 'var(--border)'),
    background: on ? 'var(--accent-soft, #dbeafe)' : 'var(--surface2, #f8fafc)', color: on ? 'var(--accent, #2563eb)' : 'var(--text-muted)', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, background: 'var(--surface, transparent)', overflow: 'hidden' }} data-testid="orca-handoff-panel">
      <button
        type="button"
        onClick={() => { setExpanded(o => !o); if (!expanded) load() }}
        aria-expanded={expanded}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          minHeight: 48, padding: '0 20px', background: 'transparent', border: 'none',
          cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16 }}>🐋 Orca handoffs</strong>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{summary} · switch: {modeLabel}</span>
        </span>
        <span style={{ fontSize: 18, color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
      </button>

      {expanded && (
      <div style={{ padding: '0 20px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={muted}>
          Work other agents handed to Orca, and which model actually answered. Free tier first; paid fallback is {data?.paidFallback ? 'ON' : 'off'}.
        </div>
        <button type="button" onClick={load} style={{ fontSize: 12 }}>Refresh</button>
      </div>

      {error && <div style={{ color: 'var(--danger, #b91c1c)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      {data && !data.orcaConfigured && (
        <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 8, border: '1px solid var(--amber, #f59e0b)', background: 'var(--amber-soft, #fffbeb)', fontSize: 12 }}>
          Not configured — {isOpenOcti()
            ? <OpenOctiConfigurationLinks needs={['ORCAROUTER_API_KEY']} prefix="open settings for" />
            : <>add <code>ORCAROUTER_API_KEY</code> to enable OrcaRouter handoffs.</>}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...muted, fontWeight: 600 }}>Master switch:</span>
        {[['all', 'Everyone uses Orca'], ['per-agent', 'Per agent'], ['off', 'Off — nobody']].map(([m, label]) => (
          <button key={m} type="button" disabled={busy} onClick={() => setMode(m)} style={pill(mode === m)} data-testid={`orca-mode-${m}`}>{label}</button>
        ))}
        <span style={muted}>
          {mode === 'all' ? 'Every agent may hand work to Orca (the per-agent list is ignored).' : mode === 'off' ? 'Handoffs are blocked; agents do all work themselves.' : 'Only the agents switched on below may hand off.'}
        </span>
      </div>

      <div style={{ marginTop: 12, opacity: mode === 'per-agent' ? 1 : 0.5 }}>
        <div style={{ ...muted, marginBottom: 6 }}>Per-agent switches{mode !== 'per-agent' ? ' (inactive while the master switch is not "Per agent")' : ''}:</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {roster.map(a => {
            const on = enabled.has(a.id)
            return (
              <button key={a.id} type="button" disabled={busy} onClick={() => toggle(a.id, !on)} style={pill(on)} title={on ? 'Allowed — click to switch off' : 'Off — click to allow'}>
                {a.name || a.id} · {on ? 'on' : 'off'}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        {runs.length === 0 ? (
          <div style={muted}>No handoffs yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 6px' }}>When</th>
                <th style={{ padding: '4px 6px' }}>From</th>
                <th style={{ padding: '4px 6px' }}>Task</th>
                <th style={{ padding: '4px 6px' }}>Tier</th>
                <th style={{ padding: '4px 6px' }}>Model that answered</th>
                <th style={{ padding: '4px 6px' }}>Status</th>
                <th style={{ padding: '4px 6px' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{fmtWhen(r.createdAt)}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{nameOf(r.fromAgentId)}</td>
                  <td style={{ padding: '6px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open === r.id ? 'normal' : 'nowrap' }}>{r.task}</td>
                  <td style={{ padding: '6px' }}>{r.tier || '—'}{r.downgraded ? ' ↓' : ''}</td>
                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.resolvedModel || '—'}</td>
                  <td style={{ padding: '6px', color: r.status === 'failed' ? 'var(--danger, #b91c1c)' : undefined }}>{r.status}</td>
                  <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{fmtDur(r.latencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {open && (() => {
          const r = runs.find(x => x.id === open)
          if (!r) return null
          return (
            <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2, #f8fafc)', whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 320, overflow: 'auto' }}>
              {r.error ? `Error: ${r.error}\n\n` : ''}{r.result || '(no output)'}
            </div>
          )
        })()}
      </div>
      </div>
      )}
    </div>
  )
}
