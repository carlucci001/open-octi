'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Edit3, FileText, Github, GitCommitHorizontal, RefreshCw, Rocket, Sparkles, Trash2 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ItemActionsMenu from '../../components/ItemActionsMenu'
import ViewModeToggle from '../../components/ViewModeToggle'

const VIEW_KEY = 'fcc:ship-desk-view'

function Badge({ children, tone = 'muted' }) {
  const colors = { green: ['var(--green-soft)', 'var(--green)'], amber: ['var(--orange-soft)', 'var(--orange)'], red: ['var(--red-soft)', 'var(--red)'], muted: ['var(--surface2)', 'var(--text-muted)'] }[tone] || ['var(--surface2)', 'var(--text-muted)']
  return <span className="inline-flex rounded-md px-2 py-1 text-xs font-semibold" style={{ background: colors[0], color: colors[1], border: '1px solid var(--border)' }}>{children}</span>
}

function healthTone(status) { return status === 'ok' ? 'green' : status === 'degraded' ? 'amber' : status === 'down' ? 'red' : 'muted' }
function releaseTone(status) { return status === 'live' ? 'green' : status === 'failed' ? 'red' : 'muted' }

function IconButton({ label, title = label, onClick, disabled, children }) {
  return <button type="button" aria-label={label} title={title} onClick={onClick} disabled={disabled} className="inline-flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-50" style={{ color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)' }}>{children}</button>
}

async function readJson(response, fallback) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || fallback)
  return body
}

function summaryText(result) {
  if (typeof result === 'string') return result.trim()
  if (result && typeof result === 'object') return String(result.text || result.summary || result.content || '').trim()
  return ''
}

function whatChanged(platform, release) {
  return release.annotation?.notes || release.notes || (release.id === platform.liveRelease?.id ? platform.summary?.summary : '') || 'No reported summary or operator annotation.'
}

export default function ShipDesk() {
  const [snapshot, setSnapshot] = useState({ platforms: [], pollIntervalMs: 60_000 })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [summaryBusy, setSummaryBusy] = useState('')
  const [view, setView] = useState('list')
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try { setSnapshot(await readJson(await fetch('/api/build/ship', { cache: 'no-store' }), 'Ship Desk could not load.')) }
    catch (loadError) { setError(loadError?.message || 'Ship Desk could not load.') }
    finally { setBusy(false) }
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    if (saved === 'list' || saved === 'card') setView(saved)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, snapshot.pollIntervalMs || 60_000)
    return () => clearInterval(timer)
  }, [load, snapshot.pollIntervalMs])

  const releases = useMemo(() => snapshot.platforms.flatMap(platform => (platform.releases || []).map(release => ({ platform, release }))), [snapshot.platforms])
  const changeView = next => { setView(next); window.localStorage.setItem(VIEW_KEY, next) }

  const summarize = async platform => {
    const release = platform.liveRelease
    if (!release || summaryBusy) return
    setSummaryBusy(platform.platformId)
    setError('')
    try {
      const context = [`Platform: ${platform.name}`, `Previous: ${platform.previousRelease?.version || 'unknown'} (${platform.previousRelease?.commit || 'unknown'})`, `Live: ${release.version} (${release.commit})`, 'Commit messages:', ...(platform.commitMessages?.length ? platform.commitMessages.map(message => `- ${message}`) : ['- No local commit subjects were available; summarize only the release metadata.'])].join('\n')
      const handoff = await readJson(await fetch('/api/agent/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', fromAgentId: 'ship-desk', task: 'Summarize what changed between these releases in no more than three concise bullets. Use only the supplied facts.', context, complexity: 'light', outputFormat: 'markdown', wait: 60 }) }), 'Orca could not summarize this release.')
      const text = summaryText(handoff.run?.result)
      if (handoff.run?.status !== 'done' || !text) throw new Error(handoff.run?.error || 'Orca did not return a completed summary.')
      const cached = await readJson(await fetch('/api/build/ship/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platformId: platform.platformId, releaseId: release.id, previousReleaseId: platform.previousRelease?.id || '', summary: text, runId: handoff.runId }) }), 'The summary could not be cached.')
      setSnapshot(current => ({ ...current, platforms: current.platforms.map(row => row.platformId === platform.platformId ? { ...row, summary: cached.summary } : row) }))
    } catch (summaryError) { setError(summaryError?.message || 'The release summary failed.') }
    finally { setSummaryBusy('') }
  }

  const saveAnnotation = async ({ platform, release, notes }) => {
    await readJson(await fetch('/api/build/ship/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-annotation', platformId: platform.platformId, releaseId: release.id, notes }) }), 'The release annotation could not be saved.')
    setEditing(null)
    await load()
  }

  const deleteAnnotation = async row => {
    if (!window.confirm('Delete this operator annotation? The immutable release record will remain unchanged.')) return
    try {
      await readJson(await fetch('/api/build/ship/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-annotation', platformId: row.platform.platformId, releaseId: row.release.id }) }), 'The release annotation could not be deleted.')
      await load()
    } catch (caught) { setError(caught.message || String(caught)) }
  }

  const actionsFor = row => {
    const { platform, release } = row
    return [
      { label: 'View release details', icon: FileText, onClick: () => setDetail(row) },
      { label: 'Copy commit', icon: Copy, onClick: () => navigator.clipboard?.writeText(release.commit) },
      platform.links?.gitea && { label: 'Open Gitea', icon: GitCommitHorizontal, href: platform.links.gitea, target: '_blank', rel: 'noopener noreferrer' },
      platform.links?.github && { label: 'Open GitHub', icon: Github, href: platform.links.github, target: '_blank', rel: 'noopener noreferrer' },
      release.id === platform.liveRelease?.id && { label: 'Summarize live changes', icon: Sparkles, disabled: summaryBusy === platform.platformId, onClick: () => summarize(platform) },
      { label: release.annotation ? 'Edit operator annotation' : 'Add operator annotation', icon: Edit3, onClick: () => setEditing(row) },
      release.annotation && { label: 'Delete operator annotation', icon: Trash2, tone: 'danger', onClick: () => deleteAnnotation(row) },
    ].filter(Boolean)
  }

  return (
    <div className="command-workspace min-h-full p-6 space-y-4" style={{ background: 'var(--base)', color: 'var(--text)' }}>
      <PageHeader icon={<Rocket size={20} />} title="Ship Desk" subtitle="Immutable deploy-reporter history with separate operator annotations and read-only rollback guidance." actions={<IconButton label="Refresh Ship Desk" onClick={load} disabled={busy}><RefreshCw size={17} className={busy ? 'animate-spin' : ''} /></IconButton>} viewToggle={<ViewModeToggle value={view} onChange={changeView} modes={['list', 'card']} />} />
      <div className="rounded-lg px-4 py-3 text-sm" style={{ color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>Release version, commit, status, deployer, and time are append-only telemetry and cannot be edited or deleted here. Operator annotations are separate CRUD records. The current feed exposes no TEST release type, so Ship Desk does not offer a misleading hide/delete action for release history.</div>
      {error ? <div role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ color: 'var(--red)', background: 'var(--red-soft)', border: '1px solid var(--border)' }}>{error}</div> : null}
      {!busy && releases.length === 0 ? <div className="rounded-lg p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>No registered platform declares release telemetry yet.</div> : null}
      {view === 'list' && releases.length > 0 ? <ReleaseList rows={releases} actionsFor={actionsFor} /> : null}
      {view === 'card' ? <PlatformCards platforms={snapshot.platforms} actionsFor={actionsFor} /> : null}
      {detail ? <ReleaseDetail row={detail} onClose={() => setDetail(null)} /> : null}
      {editing ? <AnnotationDialog row={editing} onClose={() => setEditing(null)} onSave={saveAnnotation} /> : null}
    </div>
  )
}

function ReleaseList({ rows, actionsFor }) {
  return <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }} data-testid="ship-desk-list-view"><table className="w-full min-w-[980px] table-fixed border-collapse"><thead style={{ background: 'var(--surface2)' }}><tr>{[['Platform','18%'],['Version','15%'],['Commit','15%'],['Status','10%'],['When','18%'],['What changed','auto'],['Actions','72px']].map(([label,width]) => <th key={label} className="px-3 py-2 text-left text-xs uppercase" style={{ color: 'var(--text-muted)', width, textAlign: label === 'Actions' ? 'center' : 'left' }}>{label}</th>)}</tr></thead><tbody>{rows.map(({ platform, release }) => <tr key={`${platform.platformId}:${release.id}`} className="h-[76px]" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}><td className="px-3 py-2"><div className="font-semibold truncate">{platform.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{platform.platformId}</div></td><td className="px-3 py-2 font-semibold truncate">{release.version}</td><td className="px-3 py-2"><code className="text-xs">{release.commit}</code></td><td className="px-3 py-2"><Badge tone={releaseTone(release.status)}>{release.status}</Badge></td><td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(release.deployedAt).toLocaleString()}<div>{release.deployer}</div></td><td className="px-3 py-2 text-sm"><div className="truncate" title={whatChanged(platform, release)}>{whatChanged(platform, release)}</div>{release.annotation ? <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>operator annotation</div> : null}</td><td className="w-[72px] px-3 py-2 text-center"><ItemActionsMenu label={`${platform.name} ${release.version} actions`} actions={actionsFor({ platform, release })} /></td></tr>)}</tbody></table></div>
}

function PlatformCards({ platforms, actionsFor }) {
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="ship-desk-card-view">{platforms.map(platform => <article key={platform.platformId} className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{platform.name}</h2><Badge tone={healthTone(platform.health?.status)}>{platform.health?.status || 'unknown'}</Badge></div><div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{platform.liveRelease ? <><strong style={{ color: 'var(--text)' }}>{platform.liveRelease.version}</strong> · <code>{platform.liveRelease.commit}</code></> : 'No live release reported'}</div></div>{platform.liveRelease ? <ItemActionsMenu label={`${platform.name} live release actions`} actions={actionsFor({ platform, release: platform.liveRelease })} /> : null}</div><section><div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>What changed</div><div className="rounded-lg p-3 text-sm whitespace-pre-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>{platform.summary?.summary || 'No cached Orca summary for this live release.'}</div></section><section><div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Last 20 releases</div><div className="space-y-2 max-h-72 overflow-auto">{platform.releases?.map(release => <div key={release.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><div className="min-w-0"><div className="font-semibold truncate">{release.version} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· {release.commit}</span></div><div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{whatChanged(platform, release)}</div></div><Badge tone={releaseTone(release.status)}>{release.status}</Badge><ItemActionsMenu label={`${platform.name} ${release.version} actions`} actions={actionsFor({ platform, release })} /></div>)}</div></section></article>)}</div>
}

function ReleaseDetail({ row, onClose }) {
  const { platform, release } = row
  return <div className="fixed inset-0 z-[99990] grid place-items-center p-4" style={{ background: 'rgba(2,6,23,.68)' }} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="release-detail-title" className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="flex items-start justify-between gap-3"><div><h2 id="release-detail-title" className="text-lg font-semibold">{platform.name} · {release.version}</h2><p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Immutable deploy-reporter facts and separate supporting context.</p></div><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface2)' }}>Close</button></div><dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"><Fact label="Commit" value={release.commit} /><Fact label="Status" value={release.status} /><Fact label="Deployer" value={release.deployer} /><Fact label="Deployed" value={new Date(release.deployedAt).toLocaleString()} /></dl><DetailBlock title="Reported notes" text={release.notes || 'No notes were supplied by the deploy reporter.'} /><DetailBlock title="Operator annotation" text={release.annotation?.notes || 'No operator annotation.'} />{release.id === platform.liveRelease?.id ? <DetailBlock title="Cached Orca summary" text={platform.summary?.summary || 'No cached summary.'} /> : null}<DetailBlock title="Read-only rollback guidance" text={platform.previousRelease ? `Previous release: ${platform.previousRelease.version} · ${platform.previousRelease.commit}\n${platform.rollback?.command || 'No exact command is registered.'}\n${platform.rollback?.releasePolicy || ''}` : 'No previous release is available.'} mono /></section></div>
}

function AnnotationDialog({ row, onClose, onSave }) {
  const [notes, setNotes] = useState(row.release.annotation?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  return <div className="fixed inset-0 z-[99990] grid place-items-center p-4" style={{ background: 'rgba(2,6,23,.68)' }} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><form role="dialog" aria-modal="true" aria-labelledby="annotation-title" className="w-full max-w-xl rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onSubmit={async event => { event.preventDefault(); setSaving(true); setError(''); try { await onSave({ ...row, notes }) } catch (caught) { setError(caught.message || String(caught)); setSaving(false) } }}><div><h2 id="annotation-title" className="text-lg font-semibold">{row.release.annotation ? 'Edit' : 'Add'} operator annotation</h2><p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{row.platform.name} · {row.release.version}. This note is stored separately from immutable release facts.</p></div><label className="block text-sm font-semibold">Annotation<textarea aria-label="Operator annotation" required maxLength={3000} value={notes} onChange={event => setNotes(event.target.value)} className="mt-2 w-full min-h-32 rounded-lg p-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>{error ? <div role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</div> : null}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface2)' }}>Cancel</button><button type="submit" disabled={saving || !notes.trim()} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-text)' }}>{saving ? 'Saving...' : 'Save annotation'}</button></div></form></div>
}

function Fact({ label, value }) { return <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><dt className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{label}</dt><dd className="mt-1 font-semibold break-all">{value}</dd></div> }
function DetailBlock({ title, text, mono }) { return <section><h3 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)' }}>{title}</h3><div className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${mono ? 'font-mono text-xs' : ''}`} style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>{text}</div></section> }
