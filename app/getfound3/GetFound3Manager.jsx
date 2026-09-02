'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Briefcase,
  ExternalLink,
  FileText,
  Presentation,
  RefreshCw,
  SearchCheck,
} from 'lucide-react'
import styles from './getfound3.module.css'

const STATUS_OPTIONS = [
  ['ready_for_outreach', 'Ready for outreach'],
  ['contacted', 'Client contacted'],
  ['demo_referred', 'Demo referred'],
  ['demo_scheduled', 'Demo scheduled'],
  ['remediation_opened', 'Remediation opened'],
  ['won', 'Remediation won'],
  ['closed', 'Closed'],
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS)

function scoreClass(score) {
  if (score === null || score === undefined) return styles.scoreUnknown
  if (score >= 80) return styles.scoreGood
  if (score >= 60) return styles.scoreWatch
  return styles.scoreNeedsWork
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-side="bottom"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Metric({ label, value, tone = '' }) {
  return (
    <article className={`${styles.metric} ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  )
}

export default function GetFound3Manager({ onNavigate }) {
  const [payload, setPayload] = useState({ reports: [], metrics: {} })
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [statusDraft, setStatusDraft] = useState('ready_for_outreach')
  const [noteDraft, setNoteDraft] = useState('')

  const load = async ({ keepSelection = true } = {}) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/getfound3', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'GetFound3 workspace could not be loaded.')
      setPayload(result)
      setSelectedId(current => {
        if (keepSelection && result.reports.some(item => item.reportId === current)) return current
        return result.reports[0]?.reportId || ''
      })
    } catch (loadError) {
      setError(loadError.message || 'GetFound3 workspace could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load({ keepSelection: false }) }, [])

  const reports = useMemo(() => (
    statusFilter === 'all'
      ? payload.reports
      : payload.reports.filter(item => item.status === statusFilter)
  ), [payload.reports, statusFilter])
  const selected = payload.reports.find(item => item.reportId === selectedId) || reports[0] || null

  useEffect(() => {
    if (!selected) return
    setStatusDraft(selected.status)
    setNoteDraft(selected.lastNote || '')
  }, [selected?.reportId, selected?.status, selected?.lastNote])

  const act = async (body, successMessage) => {
    if (!selected || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/getfound3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: selected.reportId, ...body }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'The GetFound3 record could not be updated.')
      setPayload({ reports: result.reports, metrics: result.metrics })
      setMessage(successMessage)
    } catch (actionError) {
      setError(actionError.message || 'The GetFound3 record could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>GetFound3 control surface</span>
          <h1>Visibility reports to remediation revenue</h1>
          <p>Review completed SEO, AEO, and GEO reports, guide client outreach, and convert measured findings into tracked work.</p>
        </div>
        <IconButton label="Refresh GetFound3 reports" onClick={() => load()} disabled={loading}>
          <RefreshCw size={17} className={loading ? styles.spinning : ''} />
        </IconButton>
      </header>

      <section className={styles.metrics} aria-label="GetFound3 performance">
        <Metric label="Completed reports" value={payload.metrics.totalReports || 0} />
        <Metric label="Ready for Cheryl" value={payload.metrics.readyForOutreach || 0} />
        <Metric label="Demo referrals" value={payload.metrics.demoReferrals || 0} />
        <Metric label="Remediation opportunities" value={payload.metrics.remediations || 0} />
        <Metric label="Won" value={payload.metrics.wins || 0} />
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {message && <div className={styles.success} role="status">{message}</div>}

      <div className={styles.toolbar}>
        <label>
          Follow-up status
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">All reports</option>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className={styles.toolbarActions}>
          <IconButton label="Open Documents" onClick={() => onNavigate?.('documents')}>
            <FileText size={17} />
          </IconButton>
          <IconButton label="Open Accounts" onClick={() => onNavigate?.('accounts')}>
            <SearchCheck size={17} />
          </IconButton>
          <IconButton label="Open Pipelines" onClick={() => onNavigate?.('pipelines')}>
            <Briefcase size={17} />
          </IconButton>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading the GetFound3 report workspace…</div>
      ) : !payload.reports.length ? (
        <div className={styles.empty}>
          <SearchCheck size={28} />
          <strong>No completed GetFound3 reports yet</strong>
          <span>Reports run from a client’s concierge portal will appear here automatically.</span>
        </div>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.reportList} aria-label="Completed reports">
            {reports.map(report => (
              <button
                key={report.reportId}
                type="button"
                className={`${styles.reportRow} ${selected?.reportId === report.reportId ? styles.reportRowActive : ''}`}
                onClick={() => setSelectedId(report.reportId)}
              >
                <span className={styles.rowTop}>
                  <strong>{report.accountName}</strong>
                  <time>{new Date(report.createdAt).toLocaleDateString()}</time>
                </span>
                <span className={styles.domain}>{report.url || report.title}</span>
                <span className={styles.rowBottom}>
                  <span>{STATUS_LABELS[report.status] || report.status}</span>
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
            {!reports.length && <div className={styles.filteredEmpty}>No reports match this status.</div>}
          </aside>

          {selected && (
            <section className={styles.detail} aria-label={`GetFound3 report for ${selected.accountName}`}>
              <div className={styles.detailHeading}>
                <div>
                  <span className={styles.status}>{STATUS_LABELS[selected.status] || selected.status}</span>
                  <h2>{selected.accountName}</h2>
                  <a href={selected.url} target="_blank" rel="noreferrer">{selected.url}<ExternalLink size={13} /></a>
                </div>
                <div className={styles.detailActions}>
                  {selected.reportUrl && (
                    <IconButton label="Open interactive GetFound3 report" onClick={() => window.open(selected.reportUrl, '_blank', 'noopener,noreferrer')}>
                      <ExternalLink size={17} />
                    </IconButton>
                  )}
                  <IconButton
                    label="Mark as demo referral"
                    onClick={() => act({ action: 'update_engagement', status: 'demo_referred', lastNote: noteDraft }, 'Demo referral recorded.')}
                    disabled={saving}
                  >
                    <Presentation size={17} />
                  </IconButton>
                  <IconButton
                    label={selected.opportunity ? 'Remediation opportunity already exists' : 'Create remediation opportunity'}
                    onClick={() => act({ action: 'create_remediation_opportunity', lastNote: noteDraft }, 'Remediation opportunity created in Pipelines.')}
                    disabled={saving || Boolean(selected.opportunity)}
                  >
                    <Briefcase size={17} />
                  </IconButton>
                </div>
              </div>

              <div className={styles.scores}>
                {['seo', 'aeo', 'geo'].map(discipline => (
                  <article key={discipline} className={scoreClass(selected.scores?.[discipline])}>
                    <span>{discipline.toUpperCase()}</span>
                    <strong>{selected.scores?.[discipline] ?? '—'}</strong>
                    <small>/ 100</small>
                  </article>
                ))}
              </div>

              <article className={styles.brief}>
                <span className={styles.sectionLabel}>Cheryl’s engagement brief</span>
                <h3>{selected.brief.scoreCallout}</h3>
                <p>{selected.brief.executiveSummary}</p>
                <blockquote>{selected.brief.opening}</blockquote>
                <h4>Ask the client</h4>
                <ol>{selected.brief.discoveryQuestions.map(question => <li key={question}>{question}</li>)}</ol>
                <div className={styles.handoff}><strong>Demo handoff</strong><span>{selected.brief.handoff}</span></div>
              </article>

              <article className={styles.actionPlan}>
                <span className={styles.sectionLabel}>Measured opportunities</span>
                {selected.actionPlan.length ? selected.actionPlan.map((item, index) => (
                  <div key={`${item.title}-${index}`} className={styles.finding}>
                    <span className={styles.priority}>{item.discipline || item.priority}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.why || item.impact}</p>
                    </div>
                  </div>
                )) : <p className={styles.muted}>Open the completed report in Documents for the full measured action plan.</p>}
              </article>

              <form
                className={styles.followUp}
                onSubmit={event => {
                  event.preventDefault()
                  act({ action: 'update_engagement', status: statusDraft, lastNote: noteDraft }, 'Follow-up status saved.')
                }}
              >
                <label>
                  Engagement status
                  <select value={statusDraft} onChange={event => setStatusDraft(event.target.value)}>
                    {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className={styles.noteField}>
                  Follow-up note
                  <textarea value={noteDraft} onChange={event => setNoteDraft(event.target.value)} rows={3} placeholder="What the client said, next step, and timing" />
                </label>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
              </form>

              {selected.opportunity && (
                <div className={styles.opportunity}>
                  <Briefcase size={18} />
                  <div><strong>{selected.opportunity.name}</strong><span>Tracked in Pipelines</span></div>
                  <IconButton label="Open Pipelines" onClick={() => onNavigate?.('pipelines')}><ArrowRight size={16} /></IconButton>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
