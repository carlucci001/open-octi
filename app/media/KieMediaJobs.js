'use client'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'

const LABELS = {
  submitting: 'Submitting', waiting: 'Queued', queuing: 'Queued', generating: 'Creating',
  saving: 'Saving to Media', completed: 'Saved to Media', failed: 'Generation failed',
  submission_uncertain: 'Submission needs a check', save_failed: 'Save needs a retry', needs_attention: 'Still processing',
}
const ACTIVE = new Set(['submitting','waiting','queuing','generating','saving'])

export default function KieMediaJobs({ onCompleted, endpoint = '/api/media/kie', label = 'Kie creations', hint = 'Ask Sasha to use Kie for an image, video or audio clip.' }) {
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(null)
  const callback = useRef(onCompleted)
  const previous = useRef(null)
  callback.current = onCompleted

  useEffect(() => {
    let mounted = true
    let timer
    const refresh = async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
        const data = await response.json()
        if (!response.ok || !data.ok) throw new Error('unavailable')
        if (!mounted) return
        const next = data.jobs || []
        if (previous.current && next.some(job => job.status === 'completed' && previous.current.get(job.id) !== 'completed')) callback.current?.()
        previous.current = new Map(next.map(job => [job.id, job.status]))
        setJobs(next)
        setError('')
      } catch {
        if (mounted) setError('Creation status is unavailable. Your existing jobs have not been resubmitted.')
      } finally {
        if (mounted) timer = setTimeout(refresh, 5000)
      }
    }
    refresh()
    return () => { mounted = false; clearTimeout(timer) }
  }, [endpoint])

  const checkJob = async id => {
    setChecking(id)
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', id }), signal: AbortSignal.timeout(120000),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error('unavailable')
      setJobs(current => current.map(job => job.id === id ? data.job : job))
      if (data.job.status === 'completed') callback.current?.()
      setError('')
    } catch {
      setError('This job could not be checked. No new generation was submitted.')
    } finally { setChecking(null) }
  }

  return (
    <section aria-label={label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{label}</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{hint}</span>
      </div>
      {error && <p role="alert" style={{ fontSize: 12, color: 'var(--red)', marginBottom: 0 }}>{error}</p>}
      {!jobs.length && !error && <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 0 }}>Your creations and their progress will appear here.</p>}
      <ul aria-live="polite" style={{ listStyle: 'none', padding: 0, margin: jobs.length ? '10px 0 0' : 0 }}>
        {jobs.slice(0,8).map(job => (
          <li key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            {ACTIVE.has(job.status) && <Loader2 size={16} aria-hidden="true" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{job.title}</div>
              <div style={{ fontSize: 12, color: job.status === 'completed' ? 'var(--green)' : 'var(--text-muted)' }}>
                {LABELS[job.status] || 'Checking progress'} · {job.mediaType} · {job.model}
              </div>
              {job.lastError && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{job.lastError}</p>}
            </div>
            {job.items?.map((item, index) => (
              <a key={item.id} href={item.url} target="_blank" rel="noreferrer" title={`Open ${item.title || 'saved media'}`} aria-label={`Open ${job.title}${job.items.length > 1 ? ` ${index + 1}` : ''}`} style={iconStyle}><ExternalLink size={16} /></a>
            ))}
            {(job.taskId || endpoint === '/api/media/veo') && !['completed','failed','submission_uncertain'].includes(job.status) && (
              <button type="button" title="Check existing job" aria-label={`Check ${job.title}`} disabled={checking === job.id} onClick={() => checkJob(job.id)} style={iconStyle}>
                {checking === job.id ? <Loader2 size={16} /> : <RefreshCw size={16} />}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const iconStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }
