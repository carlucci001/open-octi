'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellOff, Check, ClipboardList, Eye, EyeOff, ExternalLink, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import PageHeader from '../../components/PageHeader'

function IconButton({ label, title = label, onClick, disabled, tone = 'default', children }) {
  const color = tone === 'danger' ? 'var(--red)' : tone === 'success' ? 'var(--green)' : 'var(--text)'
  return <button type="button" aria-label={label} title={title} onClick={onClick} disabled={disabled} className="inline-flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-50" style={{ color, background: 'var(--surface2)', border: '1px solid var(--border)' }}>{children}</button>
}

function Badge({ children, tone = 'muted' }) {
  const colors = {
    error: ['var(--red-soft)', 'var(--red)'],
    warning: ['var(--orange-soft)', 'var(--orange)'],
    open: ['var(--red-soft)', 'var(--red)'],
    acknowledged: ['var(--orange-soft)', 'var(--orange)'],
    resolved: ['var(--green-soft)', 'var(--green)'],
    muted: ['var(--surface2)', 'var(--text-muted)'],
  }[tone] || ['var(--surface2)', 'var(--text-muted)']
  return <span className="inline-flex rounded-md px-2 py-1 text-xs font-semibold" style={{ background: colors[0], color: colors[1], border: '1px solid var(--border)' }}>{children}</span>
}

function Sparkline({ history = [], label }) {
  const values = history.slice(-12).map(row => Number(row?.count || 0))
  if (values.length < 2) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No trend yet</span>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const points = values.map((value, index) => `${Math.round((index / (values.length - 1)) * 88)},${Math.round(22 - ((value - min) / span) * 18)}`).join(' ')
  return <svg role="img" aria-label={label} width="90" height="26" viewBox="0 0 90 26"><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" /></svg>
}

async function readJson(response, fallback) {
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok === false) throw new Error(body?.error || fallback)
  return body
}

function resultText(result) {
  if (typeof result === 'string') return result.trim()
  return String(result?.text || result?.summary || result?.content || '').trim()
}

export default function IncidentInbox() {
  const [snapshot, setSnapshot] = useState({ incidents: [], platforms: [], pollIntervalMs: 60_000 })
  const [platformFilter, setPlatformFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [busy, setBusy] = useState(true)
  const [actionBusy, setActionBusy] = useState('')
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})

  const load = useCallback(async () => {
    setError('')
    try {
      setSnapshot(await readJson(await fetch('/api/ops/incidents', { cache: 'no-store' }), 'Incident Inbox could not load.'))
    } catch (loadError) {
      setError(loadError?.message || 'Incident Inbox could not load.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, snapshot.pollIntervalMs || 60_000)
    return () => clearInterval(timer)
  }, [load, snapshot.pollIntervalMs])

  const platforms = useMemo(() => {
    const names = new Map(snapshot.platforms.map(platform => [platform.platformId, platform.name]))
    snapshot.incidents.forEach(incident => names.set(incident.platformId, incident.platformName || names.get(incident.platformId) || incident.platformId))
    return [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [snapshot])

  const incidents = useMemo(() => snapshot.incidents.filter(incident => (
    (platformFilter === 'all' || incident.platformId === platformFilter)
    && (levelFilter === 'all' || incident.level === levelFilter)
  )), [snapshot.incidents, platformFilter, levelFilter])

  const act = async (incident, action, extra = {}) => {
    if (actionBusy) return
    setActionBusy(`${incident.id}:${action}`)
    setError('')
    try {
      const result = await readJson(await fetch('/api/ops/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId: incident.id, action, ...extra }),
      }), 'Incident action failed.')
      const updated = result.incident || (result.taskId ? { ...incident, taskId: result.taskId } : null)
      if (updated) setSnapshot(current => ({ ...current, incidents: current.incidents.map(row => row.id === incident.id ? { ...row, ...updated } : row) }))
    } catch (actionError) {
      setError(actionError?.message || 'Incident action failed.')
    } finally {
      setActionBusy('')
    }
  }

  const draftStatus = async (incident) => {
    if (actionBusy) return
    setActionBusy(`${incident.id}:draft`)
    setError('')
    try {
      const context = [`Platform: ${incident.platformName || incident.platformId}`, `Incident: ${incident.title}`, `Level: ${incident.level}`, `First observed: ${incident.firstSeen}`, `Last observed: ${incident.lastSeen}`, `Current status: ${incident.status}`].join('\n')
      const response = await readJson(await fetch('/api/agent/handoff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start', fromAgentId: 'incident-inbox',
          task: 'Draft a concise client-facing status note. Say Command Center only if the product name is needed. Do not mention fingerprints, routes, stack traces, monitoring tools, or unverified causes. Return the draft only; Carl will decide whether to post it.',
          context, complexity: 'light', outputFormat: 'text', wait: 60,
        }),
      }), 'Orca could not draft the status note.')
      const text = resultText(response.run?.result)
      if (response.run?.status !== 'done' || !text) throw new Error(response.run?.error || 'Orca did not return a completed draft.')
      setDrafts(current => ({ ...current, [incident.id]: text }))
    } catch (draftError) {
      setError(draftError?.message || 'Status note draft failed.')
    } finally {
      setActionBusy('')
    }
  }

  return (
    <div className="command-workspace min-h-full p-6 space-y-4" style={{ background: 'var(--base)', color: 'var(--text)' }}>
      <PageHeader icon={<ShieldAlert size={20} />} title="Incident Inbox" subtitle="Platform health and relayed errors, deduplicated into an operator-owned response queue."
        actions={<div className="flex items-center gap-2"><a href="/status" target="_blank" rel="noopener noreferrer" aria-label="Open public status page" title="Open public status page" className="inline-flex h-11 w-11 items-center justify-center rounded-lg" style={{ color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)' }}><ExternalLink size={17} /></a><IconButton label="Refresh Incident Inbox" onClick={load} disabled={busy}><RefreshCw size={17} className={busy ? 'animate-spin' : ''} /></IconButton></div>} />

      <div className="flex flex-wrap gap-3 rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <label className="text-sm">Platform <select aria-label="Filter incidents by platform" className="ml-2 min-h-11 rounded-lg px-3" value={platformFilter} onChange={event => setPlatformFilter(event.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="all">All platforms</option>{platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>
        <label className="text-sm">Level <select aria-label="Filter incidents by level" className="ml-2 min-h-11 rounded-lg px-3" value={levelFilter} onChange={event => setLevelFilter(event.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="all">All levels</option><option value="error">Error</option><option value="warning">Warning</option><option value="info">Info</option></select></label>
      </div>

      {error ? <div role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ color: 'var(--red)', background: 'var(--red-soft)', border: '1px solid var(--border)' }}>{error}</div> : null}
      {!busy && incidents.length === 0 ? <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>No incidents match these filters.</div> : null}
      <div className="space-y-3">
        {incidents.map(incident => (
          <article key={incident.id} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{incident.title}</h2><Badge tone={incident.level}>{incident.level}</Badge><Badge tone={incident.status}>{incident.status}</Badge>{incident.public ? <Badge>public</Badge> : null}</div><div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{incident.platformName || incident.platformId} · first {new Date(incident.firstSeen).toLocaleString()} · last {new Date(incident.lastSeen).toLocaleString()}</div></div>
              <div className="flex flex-wrap items-center gap-2">
                <IconButton label={`Create task for ${incident.title}`} title={incident.taskId ? `Task ${incident.taskId} already created` : 'Create Carl-owned Projects task'} disabled={Boolean(incident.taskId) || Boolean(actionBusy)} onClick={() => act(incident, 'create-task')}><ClipboardList size={17} /></IconButton>
                <IconButton label={`Acknowledge ${incident.title}`} disabled={Boolean(actionBusy) || incident.status === 'acknowledged'} onClick={() => act(incident, 'acknowledge')}><Check size={17} /></IconButton>
                <IconButton label={`Resolve ${incident.title}`} tone="success" disabled={Boolean(actionBusy) || incident.status === 'resolved'} onClick={() => act(incident, 'resolve')}><Check size={17} /></IconButton>
                <IconButton label={`Mute ${incident.title} for 7 days`} disabled={Boolean(actionBusy)} onClick={() => act(incident, 'mute')}><BellOff size={17} /></IconButton>
                <IconButton label={`${incident.public ? 'Remove' : 'Publish'} ${incident.title} ${incident.public ? 'from' : 'on'} status page`} disabled={Boolean(actionBusy)} onClick={() => act(incident, 'set-public', { public: !incident.public })}>{incident.public ? <EyeOff size={17} /> : <Eye size={17} />}</IconButton>
                <IconButton label={`Draft status note for ${incident.title}`} title="Draft client-facing status note with Orca" disabled={Boolean(actionBusy)} onClick={() => draftStatus(incident)}><Sparkles size={17} /></IconButton>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm"><strong>{incident.count} occurrence{incident.count === 1 ? '' : 's'}</strong><Sparkline history={incident.countHistory} label={`${incident.title} count trend`} />{incident.taskId ? <span style={{ color: 'var(--text-muted)' }}>Task {incident.taskId}</span> : null}</div>
            {drafts[incident.id] ? <section><div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Draft only — Carl posts it</div><textarea aria-label={`Status note draft for ${incident.title}`} readOnly rows={4} value={drafts[incident.id]} className="w-full rounded-lg p-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} /></section> : null}
          </article>
        ))}
      </div>
    </div>
  )
}
