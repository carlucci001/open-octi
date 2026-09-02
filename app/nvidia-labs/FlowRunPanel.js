'use client'
import { useEffect, useRef, useState } from 'react'
import { X, CheckCircle2, AlertTriangle, Loader2, MessageCircleQuestion, PauseCircle } from 'lucide-react'

const panel = { background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10, padding: 18 }
const muted = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }
const field = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, fontSize: 13, outline: 'none', minHeight: 44 }

const EVENT_LABEL = {
  run_started: 'Started',
  gate_asked: 'Asked',
  gate_answered: 'Answered',
  action_deferred: 'Deferred',
  action_failed: 'Failed',
  harness_approval_required: 'Approval required',
  run_completed: 'Interview complete',
  run_failed: 'Run failed',
  run_cancelled: 'Cancelled',
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

function eventText(event) {
  if (event.type === 'gate_asked') return event.question
  if (event.type === 'gate_answered') {
    const capture = event.captured ? ` (${Object.entries(event.captured).map(([key, value]) => `${key}=${value}`).join(', ')})` : ''
    return `${event.question} → ${event.answer}${capture}`
  }
  return event.detail || ''
}

export default function FlowRunPanel({ run: initialRun, onClose }) {
  const [run, setRun] = useState(initialRun)
  const [captureValue, setCaptureValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  const active = run && !TERMINAL.has(run.status)

  const refresh = async () => {
    if (!run?.id) return
    try {
      const response = await fetch('/api/orchestrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', runId: run.id }),
      }).then(result => result.json())
      if (response.ok && response.run) setRun(response.run)
    } catch {}
  }

  useEffect(() => {
    setRun(initialRun)
    setCaptureValue('')
    setError('')
  }, [initialRun?.id])

  useEffect(() => {
    if (!active) {
      if (pollRef.current) clearInterval(pollRef.current)
      return undefined
    }
    pollRef.current = setInterval(refresh, 2500)
    return () => clearInterval(pollRef.current)
  }, [run?.id, active])

  const answer = async option => {
    if (option.capture?.field && !captureValue.trim()) {
      setError(option.capture.prompt || `${option.capture.field} is required for this answer`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/orchestrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          runId: run.id,
          gateId: run.currentGate?.gateId,
          choice: option.label,
          capturedValue: option.capture?.field ? captureValue.trim() : undefined,
        }),
      }).then(result => result.json())
      if (response.ok && response.run) {
        setRun(response.run)
        setCaptureValue('')
      } else setError(response.error || 'The answer could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    const response = await fetch('/api/orchestrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', runId: run.id }),
    }).then(result => result.json())
    if (response.ok && response.run) setRun(response.run)
    else setError(response.error || 'The run could not be cancelled.')
  }

  if (!run) return null
  const gate = run.status === 'awaiting_answer' ? run.currentGate : null
  const captureOption = gate?.options?.find(option => option.capture?.field)
  const statusLabel = run.state || run.status

  return (
    <section style={panel} aria-label={`Run ${run.flowName}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {active ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /> : run.status === 'completed' ? <CheckCircle2 size={16} style={{ color: 'var(--green)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--red)' }} />}
          Run: {run.flowName} <span style={{ ...muted, fontWeight: 500 }}>· {statusLabel.replace(/_/g, ' ')}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {active && <button onClick={cancel} style={{ ...field, cursor: 'pointer', color: 'var(--red)', fontWeight: 600 }}>Cancel run</button>}
          <button aria-label="Close run" onClick={onClose} style={{ ...field, cursor: 'pointer', width: 44, padding: 0 }}><X size={14} /></button>
        </div>
      </div>

      {run.flowSummary && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>What this flow does</div>
          <div style={{ ...muted, color: 'var(--text)', marginTop: 4 }}>{run.flowSummary}</div>
        </div>
      )}

      {run.status === 'awaiting_harness_approval' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--amber-soft)', border: '1px solid var(--amber)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <PauseCircle size={17} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <div style={muted}>The agent harness is waiting for operator approval. The engine has not approved it and cannot approve it for you.</div>
        </div>
      )}

      {gate && (
        <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            <MessageCircleQuestion size={18} style={{ color: 'var(--accent)' }} /> {gate.question}
          </div>
          {captureOption && (
            <label style={{ display: 'grid', gap: 5, marginBottom: 10 }}>
              <span style={muted}>{captureOption.capture.prompt || `Record ${captureOption.capture.field}`}</span>
              <input
                aria-label={captureOption.capture.prompt || `Record ${captureOption.capture.field}`}
                style={{ ...field, width: '100%' }}
                value={captureValue}
                onChange={event => setCaptureValue(event.target.value)}
                placeholder={captureOption.capture.prompt || `Enter ${captureOption.capture.field}`}
              />
            </label>
          )}
          {error && <div role="alert" style={{ ...muted, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {gate.options.map(option => (
              <button key={option.label} disabled={busy} onClick={() => answer(option)}
                style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, minHeight: 48, padding: '0 20px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                {option.label}{option.capture?.field ? ` (records ${option.capture.field})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div aria-live="polite" style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
        {(run.transcript || []).map((event, index) => (
          <div key={`${event.at || index}-${event.type}-${event.stepId || ''}`} style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'baseline' }}>
            <span style={{ flex: '0 0 auto', fontWeight: 700, color: event.type === 'run_failed' ? 'var(--red)' : event.type === 'run_completed' ? 'var(--green)' : event.type === 'action_deferred' ? 'var(--amber)' : event.type.startsWith('gate') ? 'var(--accent)' : 'var(--text)' }}>
              {EVENT_LABEL[event.type] || event.type}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{eventText(event)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
