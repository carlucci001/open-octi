'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Database, ExternalLink, Play, RefreshCw, Search } from 'lucide-react'

const statusColor = {
  proven: 'var(--green)',
  rejected: 'var(--red)',
  'needs-key': 'var(--amber)',
  'excluded-from-build': 'var(--text-muted)',
  candidate: 'var(--accent)',
  probing: 'var(--amber)',
  running: 'var(--amber)',
  failed: 'var(--red)',
}

function percent(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`
}

function addressLine(row) {
  const address = row?.entity?.address || {}
  return [address.line1, address.city, address.state, address.zip].filter(Boolean).join(', ')
}

export default function LeadSourcesPanel({ query, onRefresh, initialZip = '' }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [zip, setZip] = useState('28801')
  const [showAllDiscovered, setShowAllDiscovered] = useState(false)
  const [jobs, setJobs] = useState({})
  const [discovering, setDiscovering] = useState(false)
  const [discovery, setDiscovery] = useState(null)
  const [results, setResults] = useState({})
  const hydratedZip = useRef(false)
  const pollTimers = useRef(new Map())
  const pollingActive = useRef(true)
  const refreshRef = useRef(onRefresh)
  const sources = query.data || []
  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => {
    pollingActive.current = true
    return () => {
      pollingActive.current = false
      for (const timer of pollTimers.current.values()) clearTimeout(timer)
      pollTimers.current.clear()
    }
  }, [])
  useEffect(() => {
    if (!hydratedZip.current && /^\d{5}$/.test(String(initialZip || ''))) {
      setZip(String(initialZip))
      hydratedZip.current = true
    }
  }, [initialZip])
  useEffect(() => {
    for (const source of sources) {
      const job = source.proving?.job
      if (job?.status === 'running') startPolling(source.id, job.id)
    }
  }, [sources])
  const filtered = useMemo(() => sources.filter(source => {
    const text = `${source.name} ${source.id} ${(source.triggers || []).join(' ')} ${(source.verticals || []).join(' ')}`.toLowerCase()
    const matchesArea = !source.discovered || showAllDiscovered || source.discovery?.zip === zip
    const jobStatus = jobs[source.id]?.status
    const sourceStatus = jobStatus === 'running' || jobStatus === 'failed' ? jobStatus : source.proving?.status
    return matchesArea && (!search || text.includes(search.toLowerCase())) && (status === 'all' || sourceStatus === status)
  }), [jobs, sources, search, showAllDiscovered, status, zip])
  const hiddenDiscoveredCount = sources.filter(source => source.discovered && source.discovery?.zip !== zip).length

  async function prove(source) {
    setResults(current => ({ ...current, [source.id]: null }))
    try {
      const provingJurisdiction = source.level === 'state' && source.coverage?.[0]
        ? { state: source.coverage[0] }
        : { zip }
      const response = await fetch('/api/lead-signals/prove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id, jurisdiction: provingJurisdiction, limit: source.platform === 'bulk-file' ? 50 : 25, index: false }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.job?.id) throw new Error(payload.error || `Proving request failed (${response.status})`)
      setJobs(current => ({ ...current, [source.id]: payload.job }))
      startPolling(source.id, payload.job.id)
      await refreshRef.current?.()
    } catch (error) {
      setResults(current => ({ ...current, [source.id]: { ok: false, error: error.message } }))
    }
  }

  function startPolling(sourceId, jobId) {
    if (!jobId || pollTimers.current.has(jobId)) return
    const poll = async () => {
      if (!pollingActive.current) return
      try {
        const response = await fetch(`/api/lead-signals/prove/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!pollingActive.current) return
        if (!response.ok || !payload.job) throw new Error(payload.error || `Could not read proving job (${response.status})`)
        const job = payload.job
        setJobs(current => ({ ...current, [sourceId]: job }))
        if (job.status === 'running') {
          pollTimers.current.set(jobId, setTimeout(poll, 500))
          return
        }
        pollTimers.current.delete(jobId)
        setResults(current => ({
          ...current,
          [sourceId]: job.status === 'completed'
            ? { ok: true, validation: job.validation }
            : { ok: false, error: job.error || 'Proving failed' },
        }))
        await refreshRef.current?.()
      } catch (error) {
        pollTimers.current.delete(jobId)
        setResults(current => ({ ...current, [sourceId]: { ok: false, error: error.message } }))
      }
    }
    pollTimers.current.set(jobId, setTimeout(poll, 0))
  }

  async function discover() {
    setDiscovering(true)
    setDiscovery(null)
    try {
      const response = await fetch(`/api/lead-signals/discover?zip=${zip}`)
      const payload = await response.json()
      setDiscovery(payload)
      if (payload.ok) {
        await fetch('/api/lead-run-presets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remember-source-zip', zip }),
        })
        await onRefresh?.()
      }
    } catch (error) { setDiscovery({ ok: false, error: error.message }) }
    finally { setDiscovering(false) }
  }

  let lastGroup = ''
  return (
    <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text)' }}><Database size={17} /> Public-record sources</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Federal APIs work nationwide. Discovered county APIs appear under Your area and must pass proving before a sweep can use them.</div>
        </div>
        <button type="button" title="Refresh source registry" aria-label="Refresh source registry" onClick={() => onRefresh?.()} className="h-9 w-9 rounded-lg inline-flex items-center justify-center" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <RefreshCw size={16} className={query.refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_120px_110px] gap-2 mb-2">
        <label className="relative"><Search size={15} className="absolute left-3 top-3" style={{ color: 'var(--text-muted)' }} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search sources or triggers" className="w-full rounded-lg py-2 pl-9 pr-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>
        <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}><option value="all">All statuses</option><option value="running">Proving</option><option value="proven">Proven</option><option value="failed">Failed</option><option value="candidate">Candidate</option><option value="needs-key">Needs key</option><option value="excluded-from-build">Excluded</option></select>
        <input value={zip} onChange={event => setZip(event.target.value.replace(/\D/g, '').slice(0, 5))} aria-label="Proving ZIP" placeholder="ZIP" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <button type="button" onClick={discover} disabled={discovering || zip.length !== 5} className="rounded-lg px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-2" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)' }}><Search size={14} />{discovering ? 'Finding…' : 'Discover'}</button>
      </div>
      {discovery && <div className="text-xs mb-4" style={{ color: discovery.ok ? 'var(--green)' : 'var(--red)' }}>{discovery.ok ? `${discovery.candidates.length} candidate API source${discovery.candidates.length === 1 ? '' : 's'} found for ${discovery.jurisdiction.county} County, ${discovery.jurisdiction.state}.` : discovery.error}</div>}
      {hiddenDiscoveredCount > 0 && <button type="button" onClick={() => setShowAllDiscovered(value => !value)} className="mb-3 rounded-md px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{showAllDiscovered ? `Show only ${zip} discovered` : `Show all discovered (${hiddenDiscoveredCount} hidden)`}</button>}
      {query.error && <div className="text-sm" style={{ color: 'var(--red)' }}>Could not load source registry.</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead><tr style={{ color: 'var(--text-muted)' }}><th className="text-left p-2">Source</th><th className="text-left p-2">Trigger</th><th className="text-left p-2">Tier</th><th className="text-left p-2">Status</th><th className="text-left p-2">Score</th><th className="text-right p-2">Action</th></tr></thead>
          <tbody>{filtered.map(source => {
            const showGroup = source.group !== lastGroup
            lastGroup = source.group
            const excluded = source.proving?.status === 'excluded-from-build'
            const needsKey = source.proving?.status === 'needs-key'
            const job = jobs[source.id] || source.proving?.job
            const isProving = job?.status === 'running'
            const displayStatus = isProving ? 'running' : job?.status === 'failed' ? 'failed' : source.proving?.status
            const progress = job?.progress || {}
            const result = results[source.id]
            return [
              showGroup && <tr key={`${source.group}-heading`}><td colSpan={6} className="pt-4 pb-2 px-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{source.group}</td></tr>,
              <tr key={source.id} style={{ opacity: excluded ? 0.55 : 1 }}>
                <td className="p-2 align-top" style={{ borderTop: '1px solid var(--border)' }}><div className="font-semibold" style={{ color: 'var(--text)' }}>{source.name}{source.discovered && <span className="ml-2 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>discovered</span>}</div><div style={{ color: 'var(--text-muted)' }}>{source.level} · {source.coverage?.join(', ')}</div>{source.excludedReason && <div className="mt-1" style={{ color: 'var(--text-muted)' }}>{source.excludedReason}</div>}{result && <div className="mt-1" style={{ color: result.ok ? 'var(--green)' : 'var(--red)' }}>{result.ok ? `${result.validation.status} · ${result.validation.score}/100 · ${result.validation.scorecard.sampleSize} rows` : result.error}</div>}{result?.ok && <div className="mt-1 space-y-1" style={{ color: 'var(--text-muted)' }}><div>Fields: {Object.entries(result.validation.fieldMapPreview?.mapped || {}).map(([target, field]) => `${target}→${Array.isArray(field) ? field.join('|') : field}`).join(', ') || 'none'}</div><div>Coverage: mail address {percent(result.validation.fieldMapPreview?.ratios?.mailAddress)} · geo precision {percent(result.validation.fieldMapPreview?.ratios?.geoPrecision)}</div>{result.validation.sample?.slice(0, 3).map(row => <div key={row.externalId} className="rounded px-2 py-1" style={{ background: 'var(--surface2)' }}>{row.entity?.name || 'Unnamed record'} · {addressLine(row) || 'No mailing address'}</div>)}</div>}</td>
                <td className="p-2 align-top" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>{source.triggers?.join(', ')}</td>
                <td className="p-2 align-top" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>{source.tier}</td>
                <td className="p-2 align-top" style={{ borderTop: '1px solid var(--border)', color: statusColor[displayStatus] || 'var(--text-muted)' }}>{isProving ? `proving… ${Number(progress.completed) || 0}/${Math.max(1, Number(progress.total) || 1)}` : displayStatus}</td>
                <td className="p-2 align-top" style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>{source.proving?.score ?? '—'}</td>
                <td className="p-2 align-top text-right" style={{ borderTop: '1px solid var(--border)' }}>{needsKey ? <a href={source.settingsLink} title="Open Models & Keys settings" aria-label={`Configure ${source.name}`} className="h-8 w-8 rounded-md inline-flex items-center justify-center" style={{ border: '1px solid var(--border)', color: 'var(--amber)' }}><ExternalLink size={14} /></a> : <button type="button" title={excluded ? source.excludedReason : `Prove ${source.name}`} aria-label={`Prove ${source.name}`} disabled={excluded || isProving || zip.length !== 5} onClick={() => prove(source)} className="h-8 w-8 rounded-md inline-flex items-center justify-center" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: excluded ? 'var(--text-muted)' : 'var(--accent)', cursor: excluded ? 'not-allowed' : 'pointer' }}>{isProving ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}</button>}</td>
              </tr>,
            ]
          })}</tbody>
        </table>
      </div>
    </section>
  )
}
