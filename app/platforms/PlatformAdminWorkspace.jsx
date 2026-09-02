'use client'

// Management view for a connected platform's live Platform Admin API
// (handoff doc §5.2 / §9). Rendered inside PlatformsModule's detail view only
// when the platform is connected AND has a credential reference set (truthful
// interface rule — no button promises a surface the platform can't back up).
// Reads go through the server-side proxy at
// /api/platforms/[platformId]/resource; Phase 1 actions (suspend/reactivate,
// pause/resume/cancel subscription) go through the audited proxy at
// /api/platforms/[platformId]/action and render ONLY when the registration
// has `supportsActions` — same truthful-interface rule. Every action requires
// a typed reason in a confirm dialog. The API key never reaches this
// component.
import { Fragment, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Activity,
  BarChart3,
  Bug,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  RefreshCw,
  Rocket,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import styles from './platforms.module.css'

const PAGE_LIMIT = 25

const TAB_DEFINITIONS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'customers', label: 'Customers', icon: Users, capability: 'customers' },
  { id: 'subscriptions', label: 'Subscriptions', icon: Wallet, capability: 'subscriptions' },
  { id: 'health', label: 'Health', icon: Activity, capability: 'health' },
  { id: 'releases', label: 'Releases', icon: Rocket, capability: 'releases' },
  { id: 'errors', label: 'Errors', icon: Bug, capability: 'errors' },
  { id: 'usage', label: 'Usage', icon: BarChart3, capability: 'usage' },
  { id: 'revenue', label: 'Revenue', icon: CircleDollarSign, capability: 'revenue' },
]

function friendlyError(status, body) {
  const code = body?.error?.code || ''
  if (status === 401 || code === 'UNAUTHORIZED') {
    return 'Credential invalid — check the Command Vault entry for this platform.'
  }
  if (status === 503 || code === 'NOT_CONFIGURED') {
    return 'This platform has no admin key configured.'
  }
  return body?.error?.message || 'This platform data could not be loaded.'
}

async function fetchResource(platformId, resource, params = {}) {
  const search = new URLSearchParams({ resource, ...params })
  let response
  try {
    response = await fetch(`/api/platforms/${encodeURIComponent(platformId)}/resource?${search.toString()}`, { cache: 'no-store' })
  } catch {
    return { ok: false, status: 0, body: null, message: 'The platform request failed — check your connection and try again.' }
  }
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    return { ok: false, status: response.status, body, message: friendlyError(response.status, body) }
  }
  return { ok: true, status: response.status, body, message: '' }
}

const ACTION_LABELS = {
  suspend: 'Suspend customer',
  reactivate: 'Reactivate customer',
  pause_subscription: 'Pause subscription',
  resume_subscription: 'Resume subscription',
  cancel_subscription: 'Cancel at period end',
}

const DESTRUCTIVE_ACTIONS = new Set(['suspend', 'cancel_subscription'])

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function postPlatformAction(platformId, { id, action, reason, idempotencyKey }) {
  let response
  try {
    response = await fetch(`/api/platforms/${encodeURIComponent(platformId)}/action`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'customer_action', id, action, reason, idempotencyKey }),
    })
  } catch {
    return { ok: false, status: 0, body: null, message: 'The platform action could not be sent — check your connection and try again.' }
  }
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    return { ok: false, status: response.status, body, message: friendlyError(response.status, body) }
  }
  return { ok: true, status: response.status, body, message: '' }
}

// Every mutation funnels through this dialog: it names the action and its
// target, requires a typed reason (min 3 chars — same floor the server
// enforces), and holds ONE idempotency key for its lifetime, so retrying the
// same confirmed action after an error never double-fires on the platform.
export function PlatformActionConfirmDialog({ platformId, action, targetId, targetLabel, onDone, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [idempotencyKey] = useState(newIdempotencyKey)

  const label = ACTION_LABELS[action] || action
  const valid = reason.trim().length >= 3

  const submit = async (event) => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    const result = await postPlatformAction(platformId, { id: targetId, action, reason: reason.trim(), idempotencyKey })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onDone(`${label} — completed for ${targetLabel || targetId}.`)
  }

  return (
    <div className={styles.wsConfirmOverlay} role="dialog" aria-modal="true" aria-label={label}>
      <form className={styles.wsConfirmDialog} onSubmit={submit}>
        <strong>{label}</strong>
        <p className={styles.muted}>
          Target: {targetLabel || targetId}. This runs live on the platform and is audit-logged with your name and reason.
        </p>
        <label>
          Reason (required, min 3 characters)
          <textarea
            rows={2}
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder="Why this action is being taken"
            autoFocus
          />
        </label>
        {error && <div className={styles.error} role="alert"><AlertTriangle size={14} /> {error}</div>}
        <div className={styles.formActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className={DESTRUCTIVE_ACTIONS.has(action) ? styles.dangerButton : styles.primaryButton}
            disabled={!valid || busy}
          >
            {busy ? 'Working…' : label}
          </button>
        </div>
      </form>
    </div>
  )
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

function Metric({ label, value }) {
  return (
    <article className={styles.wsMetric}>
      <strong>{value ?? '—'}</strong>
      <span>{label}</span>
    </article>
  )
}

function OverviewTab({ platform, info, loading, error, supportsInfo }) {
  const counts = info?.data?.counts || {}
  const platformInfo = info?.data?.platform || {}
  return (
    <div className={styles.wsPanel}>
      {loading && <div className={styles.empty}>Loading platform overview…</div>}
      {!loading && !supportsInfo && (
        <div className={styles.empty}>This platform does not advertise the legacy overview feed. Use its declared tabs for live data.</div>
      )}
      {!loading && error && <div className={styles.error} role="alert"><AlertTriangle size={14} /> {error}</div>}
      {!loading && !error && (
        <>
          {supportsInfo && (
            <section className={styles.wsMetrics} aria-label="Platform counts">
              <Metric label="Tenants" value={counts.tenants} />
              <Metric label="Subscribed tenants" value={counts.subscribedTenants} />
              <Metric label="Open requests" value={counts.openRequests} />
              <Metric label="Verified requests" value={counts.verifiedRequests} />
              <Metric label="Credits outstanding" value={counts.creditsOutstanding} />
            </section>
          )}
          <dl className={styles.wsFacts}>
            <dt>Platform version</dt><dd>{platformInfo.version || platform.manifestVersion || '—'}</dd>
            <dt>Environment</dt><dd>{info?.data?.environment || platform.environment || '—'}</dd>
            <dt>Manifest version</dt><dd>{platform.manifestVersion || 'Not recorded'}</dd>
            <dt>Last connection check</dt>
            <dd>{platform.lastCheckAt ? new Date(platform.lastCheckAt).toLocaleString() : 'Never'}</dd>
            <dt>Platform reported time</dt><dd>{info?.data?.time ? new Date(info.data.time).toLocaleString() : '—'}</dd>
          </dl>
        </>
      )}
    </div>
  )
}

function CustomerDetail({ platformId, customerId, supportsActions, onClose }) {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [confirmAction, setConfirmAction] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: '', data: null })
    fetchResource(platformId, 'customer', { id: customerId }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setState({ loading: false, error: result.status === 404 ? 'This customer could not be found on the platform.' : result.message, data: null })
        return
      }
      setState({ loading: false, error: '', data: result.body?.data || null })
    })
    return () => { cancelled = true }
  }, [platformId, customerId, reloadKey])

  const suspended = Boolean(state.data?.suspended)

  return (
    <div className={styles.wsDetailPanel} role="dialog" aria-label="Customer detail">
      <div className={styles.wsDetailHeader}>
        <strong>Customer detail</strong>
        <IconButton label="Close customer detail" onClick={onClose}><X size={16} /></IconButton>
      </div>
      {notice && <div className={styles.success} role="status">{notice}</div>}
      {state.loading && <div className={styles.empty}>Loading customer…</div>}
      {!state.loading && state.error && <div className={styles.error} role="alert"><AlertTriangle size={14} /> {state.error}</div>}
      {!state.loading && !state.error && state.data && (
        <>
          <dl className={styles.wsFacts}>
            <dt>Name</dt><dd>{state.data.name || '—'}</dd>
            <dt>Status</dt><dd>{state.data.status || '—'}</dd>
            <dt>Plan</dt><dd>{state.data.plan || '—'}</dd>
            <dt>Created</dt><dd>{state.data.createdAt ? new Date(state.data.createdAt).toLocaleString() : '—'}</dd>
          </dl>
          <span className={styles.sectionLabelSmall}>Entitlements</span>
          <dl className={styles.wsFacts}>
            <dt>Sites</dt><dd>{state.data.entitlements?.sites ?? '—'}</dd>
            <dt>Monthly credits</dt><dd>{state.data.entitlements?.monthlyCredits ?? '—'}</dd>
            <dt>Priority</dt><dd>{state.data.entitlements?.priority ?? '—'}</dd>
            <dt>Dedicated agent</dt><dd>{state.data.entitlements?.dedicatedAgent ? 'Yes' : 'No'}</dd>
            <dt>Credit balance</dt><dd>{state.data.entitlements?.creditBalance ?? '—'}</dd>
            <dt>Credits used this cycle</dt><dd>{state.data.entitlements?.creditsUsedThisCycle ?? '—'}</dd>
          </dl>
          <span className={styles.sectionLabelSmall}>Activity</span>
          <dl className={styles.wsFacts}>
            <dt>Total requests</dt><dd>{state.data.activity?.totalRequests ?? '—'}</dd>
            <dt>Last activity</dt>
            <dd>{state.data.activity?.lastActivityAt ? new Date(state.data.activity.lastActivityAt).toLocaleString() : '—'}</dd>
            <dt>Credential count</dt><dd>{state.data.activity?.credentialCount ?? '—'}</dd>
          </dl>
          {state.data.activity?.requestCountsByStatus && (
            <div className={styles.wsChipRow}>
              {Object.entries(state.data.activity.requestCountsByStatus).map(([status, count]) => (
                <span key={status} className={styles.chip}>{status}: {count}</span>
              ))}
            </div>
          )}
          {supportsActions && (
            <>
              <span className={styles.sectionLabelSmall}>Actions</span>
              <div className={styles.wsActionRow}>
                <button
                  type="button"
                  className={suspended ? styles.primaryButton : styles.dangerButton}
                  onClick={() => { setNotice(''); setConfirmAction(suspended ? 'reactivate' : 'suspend') }}
                >
                  {suspended ? 'Reactivate customer' : 'Suspend customer'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {confirmAction && (
        <PlatformActionConfirmDialog
          platformId={platformId}
          action={confirmAction}
          targetId={customerId}
          targetLabel={state.data?.name || customerId}
          onClose={() => setConfirmAction('')}
          onDone={(message) => {
            setConfirmAction('')
            setNotice(message)
            setReloadKey(key => key + 1)
          }}
        />
      )}
    </div>
  )
}

function CustomersTab({ platformId, supportsActions }) {
  const [offset, setOffset] = useState(0)
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: '', data: null })
    fetchResource(platformId, 'customers', { limit: PAGE_LIMIT, offset }).then(result => {
      if (cancelled) return
      if (!result.ok) {
        setState({ loading: false, error: result.message, data: null })
        return
      }
      setState({ loading: false, error: '', data: result.body?.data || null })
    })
    return () => { cancelled = true }
  }, [platformId, offset])

  const customers = state.data?.customers || []
  const page = state.data?.page || {}

  return (
    <div className={styles.wsPanel}>
      {state.loading && <div className={styles.empty}>Loading customers…</div>}
      {!state.loading && state.error && <div className={styles.error} role="alert"><AlertTriangle size={14} /> {state.error}</div>}
      {!state.loading && !state.error && (
        <>
          <div className={styles.wsTableWrap}>
            <table className={styles.wsTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(customer => (
                  <tr
                    key={customer.id}
                    className={styles.wsTableRow}
                    onClick={() => setSelectedId(customer.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${customer.name || customer.id}`}
                    onKeyDown={event => { if (event.key === 'Enter') setSelectedId(customer.id) }}
                  >
                    <td>{customer.name || customer.id}</td>
                    <td><span className={styles.chip}>{customer.status || 'unknown'}</span></td>
                    <td>{customer.plan || '—'}</td>
                    <td>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {!customers.length && (
                  <tr><td colSpan={4} className={styles.wsTableEmpty}>No customers returned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.wsPager}>
            <span>
              {customers.length ? `Showing ${offset + 1}–${offset + customers.length}` : 'Showing 0'}
              {typeof page.total === 'number' ? ` of ${page.total}` : ''}
            </span>
            <div className={styles.rowActions}>
              <IconButton label="Previous page" onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))} disabled={offset <= 0}>
                <ChevronLeft size={16} />
              </IconButton>
              <IconButton
                label="Next page"
                onClick={() => setOffset(page.nextOffset ?? offset + PAGE_LIMIT)}
                disabled={page.nextOffset === null || page.nextOffset === undefined}
              >
                <ChevronRight size={16} />
              </IconButton>
            </div>
          </div>
        </>
      )}
      {selectedId && (
        <CustomerDetail
          platformId={platformId}
          customerId={selectedId}
          supportsActions={supportsActions}
          onClose={() => setSelectedId('')}
        />
      )}
    </div>
  )
}

function SubscriptionsTab({ platformId, supportsActions }) {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [confirm, setConfirm] = useState(null) // { action, targetId, targetLabel } | null
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: '', data: null })
    fetchResource(platformId, 'subscriptions').then(result => {
      if (cancelled) return
      if (!result.ok) {
        setState({ loading: false, error: result.message, data: null })
        return
      }
      setState({ loading: false, error: '', data: result.body?.data || null })
    })
    return () => { cancelled = true }
  }, [platformId, reloadKey])

  const counts = state.data?.counts || {}
  const subscriptions = state.data?.subscriptions || []

  // Subscription rows are keyed by the platform's customer/tenant id (the
  // actions endpoint is /customers/{id}/actions), so prefer an explicit
  // customerId when the platform sends one and fall back to the row id.
  const askConfirm = (subscription, action) => {
    setNotice('')
    setConfirm({
      action,
      targetId: subscription.customerId || subscription.id,
      targetLabel: `subscription ${subscription.id}${subscription.plan ? ` (${subscription.plan})` : ''}`,
    })
  }

  return (
    <div className={styles.wsPanel}>
      {notice && <div className={styles.success} role="status">{notice}</div>}
      {state.loading && <div className={styles.empty}>Loading subscriptions…</div>}
      {!state.loading && state.error && <div className={styles.error} role="alert"><AlertTriangle size={14} /> {state.error}</div>}
      {!state.loading && !state.error && (
        <>
          <div className={styles.wsChipRow}>
            {Object.entries(counts).map(([status, count]) => (
              <span key={status} className={styles.chip}>{status}: {count}</span>
            ))}
            {!Object.keys(counts).length && <span className={styles.muted}>No status counts reported.</span>}
          </div>
          <div className={styles.wsTableWrap}>
            <table className={styles.wsTable}>
              <thead>
                <tr>
                  <th>Subscription</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Created</th>
                  {supportsActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(subscription => (
                  <tr key={subscription.id}>
                    <td>{subscription.id}</td>
                    <td>{subscription.plan || '—'}</td>
                    <td><span className={styles.chip}>{subscription.status || 'unknown'}</span></td>
                    <td>{subscription.createdAt ? new Date(subscription.createdAt).toLocaleDateString() : '—'}</td>
                    {supportsActions && (
                      <td>
                        <div className={styles.wsActionRow}>
                          {subscription.status === 'paused' ? (
                            <button type="button" className={styles.secondaryButton} onClick={() => askConfirm(subscription, 'resume_subscription')}>
                              Resume
                            </button>
                          ) : (
                            <button type="button" className={styles.secondaryButton} onClick={() => askConfirm(subscription, 'pause_subscription')}>
                              Pause
                            </button>
                          )}
                          <button type="button" className={styles.dangerButton} onClick={() => askConfirm(subscription, 'cancel_subscription')}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!subscriptions.length && (
                  <tr><td colSpan={supportsActions ? 5 : 4} className={styles.wsTableEmpty}>No subscriptions returned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirm && (
        <PlatformActionConfirmDialog
          platformId={platformId}
          action={confirm.action}
          targetId={confirm.targetId}
          targetLabel={confirm.targetLabel}
          onClose={() => setConfirm(null)}
          onDone={(message) => {
            setConfirm(null)
            setNotice(message)
            setReloadKey(key => key + 1)
          }}
        />
      )}
    </div>
  )
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return typeof value === 'number' ? value.toLocaleString() : String(value)
}

function CockpitResourceTab({ platformId, resource, reloadKey }) {
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: '', data: null })
    const params = resource === 'releases' ? { limit: '20' } : resource === 'errors' ? { limit: '50' } : {}
    fetchResource(platformId, resource, params).then(result => {
      if (cancelled) return
      setState(result.ok
        ? { loading: false, error: '', data: result.body?.data }
        : { loading: false, error: result.message, data: null })
    })
    return () => { cancelled = true }
  }, [platformId, resource, reloadKey])

  if (state.loading) return <div className={styles.wsPanel}><div className={styles.empty}>Loading {resource}…</div></div>
  if (state.error) return <div className={styles.wsPanel}><div className={styles.error} role="alert"><AlertTriangle size={14} /> {state.error}</div></div>

  const data = state.data
  if (resource === 'health') {
    return (
      <div className={styles.wsPanel}>
        <section className={styles.wsMetrics} aria-label="Platform health">
          <Metric label="Status" value={data?.status || 'unknown'} />
          <Metric label="Version" value={data?.version} />
          <Metric label="Reported" value={data?.ts ? new Date(data.ts).toLocaleString() : '—'} />
        </section>
        <dl className={styles.wsFacts}>
          {(data?.checks || []).map(check => (
            <Fragment key={check.name}>
              <dt>{check.name}</dt><dd>{check.ok ? 'OK' : 'Unavailable'} · {check.detail}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    )
  }

  if (resource === 'releases' || resource === 'errors') {
    const rows = Array.isArray(data) ? data : []
    return (
      <div className={styles.wsPanel}>
        {!rows.length && <div className={styles.empty}>No {resource} reported.</div>}
        {!!rows.length && (
          <div className={styles.wsTableWrap}>
            <table className={styles.wsTable}>
              <thead><tr>{resource === 'releases'
                ? <><th>Version</th><th>Commit</th><th>Status</th><th>Deployed</th></>
                : <><th>Level</th><th>Message</th><th>Count</th><th>Last seen</th></>}</tr></thead>
              <tbody>{rows.map(row => resource === 'releases' ? (
                <tr key={row.id}><td>{row.version}</td><td>{row.commit}</td><td>{row.status}</td><td>{new Date(row.deployedAt).toLocaleString()}</td></tr>
              ) : (
                <tr key={row.fingerprint}><td>{row.level}</td><td>{row.message}</td><td>{row.count}</td><td>{new Date(row.lastSeen).toLocaleString()}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (!data || Object.keys(data).length === 0) {
    return <div className={styles.wsPanel}><div className={styles.empty}>This platform reported no {resource} data.</div></div>
  }

  const metrics = resource === 'usage'
    ? [['Active users', data.activeUsers], ['New users', data.newUsers], ...(data.events || []).map(event => [event.name, event.count])]
    : [['MRR', `${data.currency || 'USD'} ${displayValue(data.mrr)}`], ['New MRR', displayValue(data.newMrr)], ['Churned MRR', displayValue(data.churnedMrr)], ['Failed payments', data.failedPayments], ['Trials started', data.trials?.started], ['Trials converted', data.trials?.converted]]
  return <div className={styles.wsPanel}><section className={styles.wsMetrics}>{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</section></div>
}

export default function PlatformAdminWorkspace({ platform }) {
  const [tab, setTab] = useState('overview')
  const [info, setInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [infoError, setInfoError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const capabilities = Array.isArray(platform.capabilities)
    ? platform.capabilities
    : ['customers', 'subscriptions', ...(platform.supportsActions ? ['actions'] : [])]
  const supportsInfo = capabilities.includes('customers') || capabilities.includes('subscriptions')
  const tabs = TAB_DEFINITIONS.filter(item => !item.capability || capabilities.includes(item.capability))

  useEffect(() => {
    if (!tabs.some(item => item.id === tab)) setTab('overview')
  }, [tab, tabs])

  useEffect(() => {
    if (!supportsInfo) return undefined
    let cancelled = false
    setInfoLoading(true)
    setInfoError('')
    fetchResource(platform.platformId, 'info').then(result => {
      if (cancelled) return
      if (!result.ok) {
        setInfoError(result.message)
        setInfo(null)
      } else {
        setInfo(result.body)
      }
      setInfoLoading(false)
    })
    return () => { cancelled = true }
  }, [platform.platformId, refreshKey, supportsInfo])

  return (
    <div className={styles.wsRoot}>
      <div className={styles.wsTabBar}>
        <div className={styles.wsTabs} role="tablist" aria-label="Platform admin sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`${styles.wsTab} ${tab === id ? styles.wsTabActive : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <IconButton label="Refresh platform data" onClick={() => setRefreshKey(k => k + 1)}>
          <RefreshCw size={15} className={infoLoading && tab === 'overview' ? styles.spinning : ''} />
        </IconButton>
      </div>

      {tab === 'overview' && (
        <OverviewTab
          platform={platform}
          info={supportsInfo ? info : null}
          loading={supportsInfo && infoLoading}
          error={supportsInfo ? infoError : ''}
          supportsInfo={supportsInfo}
        />
      )}
      {tab === 'customers' && <CustomersTab key={refreshKey} platformId={platform.platformId} supportsActions={Boolean(platform.supportsActions)} />}
      {tab === 'subscriptions' && <SubscriptionsTab key={refreshKey} platformId={platform.platformId} supportsActions={Boolean(platform.supportsActions)} />}
      {['health', 'releases', 'errors', 'usage', 'revenue'].includes(tab) && (
        <CockpitResourceTab platformId={platform.platformId} resource={tab} reloadKey={refreshKey} />
      )}
    </div>
  )
}
