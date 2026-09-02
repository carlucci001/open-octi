'use client'

import { useEffect, useMemo, useState } from 'react'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cloud,
  CreditCard,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { Paginator, usePagination } from '../components/Paginator'

const CATALOG_CONFIRMATION = 'UPDATE STRIPE CATALOG'
const MIGRATION_CONFIRMATION = 'MIGRATE WITHOUT PRORATION'
const LEASE_CONFIRMATION = 'UPDATE CLIENT SUBSCRIPTION'
const CHECKOUT_CONFIRMATION = 'CREATE BILLING SETUP'
const CANCEL_CONFIRMATION = 'CANCEL AT RENEWAL'
const UNDO_CANCEL_CONFIRMATION = 'KEEP SUBSCRIPTION ACTIVE'

const buttonStyle = {
  minHeight: 44,
  borderRadius: 8,
  padding: '9px 14px',
  fontSize: 14,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
}

const fieldStyle = {
  minHeight: 44,
  width: '100%',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 14,
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
}

function requestId(prefix) {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function count(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)
}

function shortHash(value) {
  const hash = String(value || '')
  return hash ? `${hash.slice(0, 12)}${hash.length > 12 ? '…' : ''}` : 'Not synced'
}

function when(value) {
  if (!value) return 'No completed sync yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

function Stat({ label, value, tone = 'neutral' }) {
  const colors = {
    create: '#22c55e',
    update: '#f59e0b',
    error: '#ef4444',
    neutral: 'var(--text)',
  }
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: colors[tone] }}>{count(value)}</div>
    </div>
  )
}

function OperationIcon({ action }) {
  if (action === 'create') return <Plus size={15} aria-hidden="true" />
  if (action === 'update') return <Pencil size={15} aria-hidden="true" />
  if (action === 'conflict') return <AlertTriangle size={15} aria-hidden="true" />
  return <Minus size={15} aria-hidden="true" />
}

function CatalogPlan({ plan }) {
  const operations = plan?.operations || []
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Create" value={plan?.summary?.create} tone="create" />
        <Stat label="Update" value={plan?.summary?.update} tone="update" />
        <Stat label="Unchanged" value={plan?.summary?.unchanged} />
        <Stat label="Conflicts" value={plan?.summary?.conflicts} tone="error" />
        <Stat label="Errors" value={plan?.summary?.errors} tone="error" />
      </div>

      {operations.length > 0 ? (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Change</th>
                <th className="px-4 py-3 text-left font-semibold">Catalog key</th>
                <th className="px-4 py-3 text-left font-semibold">Resource</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((operation, index) => (
                <tr key={`${operation.catalogKey}-${operation.resource}-${operation.lookupKey}-${index}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-semibold capitalize">
                      <OperationIcon action={operation.action} /> {operation.action || 'none'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{operation.catalogKey || '—'}</td>
                  <td className="px-4 py-3 capitalize">{operation.resource || '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{operation.reason || 'No change required'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Stripe already matches the backend billing catalog.
        </div>
      )}

      {(plan?.errors || []).length > 0 && (
        <div className="rounded-xl p-4" role="alert" style={{ background: 'color-mix(in srgb, #ef4444 10%, var(--surface))', border: '1px solid #ef4444' }}>
          <div className="font-semibold">Resolve these catalog errors before updating Stripe</div>
          <ul className="mt-2 grid gap-1 text-sm list-disc pl-5">
            {plan.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function ClientSubscriptionActions({ client, onPreview, loadingLeaseId, onPreviewCancellation, cancellationLoadingLeaseId }) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPreview(client.leaseId)}
        disabled={Boolean(loadingLeaseId)}
        aria-label={`Preview Stripe billing for ${client.accountName}`}
        title="Preview this client's Stripe billing changes"
        className="inline-flex items-center justify-center rounded-lg"
        style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: loadingLeaseId ? 'wait' : 'pointer', opacity: loadingLeaseId && loadingLeaseId !== client.leaseId ? 0.55 : 1 }}
      >
        <RefreshCw size={16} className={loadingLeaseId === client.leaseId ? 'animate-spin' : ''} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onPreviewCancellation(client.leaseId)}
        disabled={!client.hasStripeSubscription || Boolean(cancellationLoadingLeaseId)}
        aria-label={`Preview renewal status for ${client.accountName}`}
        title={client.hasStripeSubscription ? 'Preview cancellation-at-renewal status' : 'Stripe subscription setup is required first'}
        className="inline-flex items-center justify-center rounded-lg"
        style={{ width: 40, height: 40, background: 'var(--surface2)', color: client.cancelAtPeriodEnd ? '#f59e0b' : 'var(--text)', border: '1px solid var(--border)', opacity: client.hasStripeSubscription ? 1 : 0.45 }}
      >
        <Clock3 size={16} className={cancellationLoadingLeaseId === client.leaseId ? 'animate-spin' : ''} aria-hidden="true" />
      </button>
    </div>
  )
}

function ClientSubscriptions({
  clients,
  onPreview,
  loadingLeaseId,
  preview,
  confirmation,
  onConfirmation,
  customerConsent,
  onCustomerConsent,
  onUpdate,
  onCreateSetup,
  applying,
  onPreviewCancellation,
  cancellationLoadingLeaseId,
  view,
  onViewChange,
}) {
  const [query, setQuery] = useState('')
  const [stripeFilter, setStripeFilter] = useState('all')
  const [billingFilter, setBillingFilter] = useState('all')
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (clients || []).filter(client => {
      const haystack = [client.accountName, client.tierName, client.stripeSubscriptionStatus, client.billingStatus].join(' ').toLowerCase()
      const stripeMatch = stripeFilter === 'all'
        || (stripeFilter === 'connected' && client.hasStripeSubscription)
        || (stripeFilter === 'setup-required' && !client.hasStripeSubscription)
        || (stripeFilter === 'canceling' && client.cancelAtPeriodEnd)
      const billingMatch = billingFilter === 'all' || String(client.billingStatus || 'unknown') === billingFilter
      return (!needle || haystack.includes(needle)) && stripeMatch && billingMatch
    })
  }, [billingFilter, clients, query, stripeFilter])
  const billingStatuses = useMemo(() => [...new Set((clients || []).map(client => String(client.billingStatus || 'unknown')))].sort(), [clients])
  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 6)
  useEffect(() => { setPage(1) }, [billingFilter, query, stripeFilter, view, setPage])

  if (!Array.isArray(clients) || clients.length === 0) return null
  return (
    <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div>
        <h2 className="text-lg font-bold">Client subscriptions</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Active Command Center leases and their locally verified Stripe billing state. Customer contact details and Stripe identifiers are not displayed.
        </p>
      </div>
      <div className="command-toolbar grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_190px_190px] gap-3 items-end">
        <label className="grid gap-1 text-sm font-semibold">Search
          <span className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search client or plan" aria-label="Search client subscriptions" style={{ ...fieldStyle, paddingLeft: 38 }} /></span>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Stripe status
          <select value={stripeFilter} onChange={event => setStripeFilter(event.target.value)} style={fieldStyle} aria-label="Filter client subscriptions by Stripe status"><option value="all">All Stripe states</option><option value="connected">Connected</option><option value="setup-required">Setup required</option><option value="canceling">Cancels at renewal</option></select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Billing status
          <select value={billingFilter} onChange={event => setBillingFilter(event.target.value)} style={fieldStyle} aria-label="Filter client subscriptions by billing status"><option value="all">All billing states</option>{billingStatuses.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
        </label>
      </div>
      <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{filtered.length} of {clients.length} client subscriptions</div>

      {filtered.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>No client subscriptions match the current search and filters.</div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map(client => (
            <article key={client.leaseId} className="rounded-xl p-4 grid gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{client.accountName}</h3><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{client.tierName}</p></div><ClientSubscriptionActions client={client} onPreview={onPreview} loadingLeaseId={loadingLeaseId} onPreviewCancellation={onPreviewCancellation} cancellationLoadingLeaseId={cancellationLoadingLeaseId} /></div>
              <div className="grid grid-cols-2 gap-2 text-sm"><div><span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Stripe</span><strong className="capitalize">{String(client.stripeSubscriptionStatus || 'not connected').replaceAll('_', ' ')}</strong></div><div><span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Billing</span><strong className="capitalize">{String(client.billingStatus || 'unknown').replaceAll('_', ' ')}</strong></div></div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{client.cancelAtPeriodEnd ? 'Cancels at renewal' : client.currentPeriodEnd ? `Period ends ${when(client.currentPeriodEnd)}` : 'No verified period end'}</div>
            </article>
          ))}
        </div>
      ) : <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Plan</th>
              <th className="px-4 py-3 text-left font-semibold">Stripe status</th>
              <th className="px-4 py-3 text-left font-semibold">Billing status</th>
              <th className="px-4 py-3 text-left font-semibold">Period ends</th>
              <th className="px-4 py-3 text-left font-semibold">Verified</th>
              <th className="px-4 py-3 text-right font-semibold">Review</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(client => (
              <tr key={client.leaseId} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-semibold">{client.accountName}</td>
                <td className="px-4 py-3">{client.tierName}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 capitalize">
                    {client.hasStripeSubscription
                      ? <CheckCircle2 size={15} style={{ color: '#22c55e' }} aria-hidden="true" />
                      : <AlertTriangle size={15} style={{ color: '#f59e0b' }} aria-hidden="true" />}
                    {String(client.stripeSubscriptionStatus || 'not connected').replaceAll('_', ' ')}
                  </span>
                  {client.cancelAtPeriodEnd && <div className="mt-1 text-xs font-semibold" style={{ color: '#f59e0b' }}>Cancels at renewal</div>}
                </td>
                <td className="px-4 py-3 capitalize">{String(client.billingStatus || 'unknown').replaceAll('_', ' ')}</td>
                <td className="px-4 py-3">{client.currentPeriodEnd ? when(client.currentPeriodEnd) : '—'}</td>
                <td className="px-4 py-3">{client.verifiedAt ? when(client.verifiedAt) : 'Not verified'}</td>
                <td className="px-4 py-3 text-right">
                  <ClientSubscriptionActions client={client} onPreview={onPreview} loadingLeaseId={loadingLeaseId} onPreviewCancellation={onPreviewCancellation} cancellationLoadingLeaseId={cancellationLoadingLeaseId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {filtered.length > 0 && <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} pageSizes={[6, 12, 24, 48]} label="subscriptions" />}

      {preview && (
        <div className="rounded-xl p-4 sm:p-5 grid gap-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Reviewed client</div>
              <div className="mt-1 text-base font-bold">{preview.lease?.accountName || 'Client subscription'} · {preview.lease?.tierName || 'Plan'}</div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Reviewed monthly total</div>
              <div className="mt-1 text-lg font-bold">{money(preview.plan?.monthlyAmountCents)} / month</div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Add" value={preview.plan?.summary?.add} tone="create" />
            <Stat label="Replace" value={preview.plan?.summary?.replace} tone="update" />
            <Stat label="Remove" value={preview.plan?.summary?.remove} tone="error" />
            <Stat label="Current" value={preview.plan?.summary?.current} />
          </div>

          {(preview.plan?.errors || []).length > 0 && (
            <div role="alert" className="rounded-lg p-3 text-sm" style={{ border: '1px solid #ef4444' }}>
              {preview.plan.errors.join(' ')}
            </div>
          )}

          {preview.canApply && (
            <div className="grid gap-3">
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                The new recurring total takes effect on the next invoice. Stripe creates no prorated charge or immediate invoice.
              </div>
              <label className="grid gap-1 text-sm font-semibold" htmlFor="client-subscription-confirmation">
                Type {LEASE_CONFIRMATION}
                <input
                  id="client-subscription-confirmation"
                  value={confirmation}
                  onChange={event => onConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                  style={fieldStyle}
                />
              </label>
              <div>
                <button
                  type="button"
                  onClick={onUpdate}
                  disabled={applying || confirmation !== LEASE_CONFIRMATION}
                  style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: applying || confirmation !== LEASE_CONFIRMATION ? 0.5 : 1 }}
                >
                  <Upload size={16} aria-hidden="true" /> {applying ? 'Updating…' : 'Update client in Stripe'}
                </button>
              </div>
            </div>
          )}

          {preview.canCreateCheckout && (
            <div className="grid gap-3">
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                This client has no Stripe subscription. Preparing billing opens Stripe's secure embedded Checkout here; it does not charge anyone automatically.
              </div>
              <label className="flex items-start gap-3 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={customerConsent}
                  onChange={event => onCustomerConsent(event.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2 }}
                />
                I confirm the customer requested or approved this billing setup.
              </label>
              <label className="grid gap-1 text-sm font-semibold" htmlFor="client-checkout-confirmation">
                Type {CHECKOUT_CONFIRMATION}
                <input
                  id="client-checkout-confirmation"
                  value={confirmation}
                  onChange={event => onConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                  style={fieldStyle}
                />
              </label>
              <div>
                <button
                  type="button"
                  onClick={onCreateSetup}
                  disabled={applying || !customerConsent || confirmation !== CHECKOUT_CONFIRMATION}
                  style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: applying || !customerConsent || confirmation !== CHECKOUT_CONFIRMATION ? 0.5 : 1 }}
                >
                  <CreditCard size={16} aria-hidden="true" /> {applying ? 'Preparing…' : 'Create billing setup'}
                </button>
              </div>
            </div>
          )}

          {!preview.canApply && !preview.canCreateCheckout && preview.plan?.ok && (
            <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#22c55e' }}>
              <CheckCircle2 size={16} aria-hidden="true" /> This client's Stripe subscription already matches the backend lease.
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function StripeCatalogSyncPanel({ onToast, mode = 'all', view = 'grid', onViewChange }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [migration, setMigration] = useState(null)
  const [migrationLoading, setMigrationLoading] = useState(false)
  const [migrationApplying, setMigrationApplying] = useState(false)
  const [migrationConfirmation, setMigrationConfirmation] = useState('')
  const [clientPreview, setClientPreview] = useState(null)
  const [clientLoadingLeaseId, setClientLoadingLeaseId] = useState('')
  const [clientApplying, setClientApplying] = useState(false)
  const [clientConfirmation, setClientConfirmation] = useState('')
  const [customerConsent, setCustomerConsent] = useState(false)
  const [checkout, setCheckout] = useState(null)
  const [cancellationPreviewState, setCancellationPreviewState] = useState(null)
  const [cancellationLoadingLeaseId, setCancellationLoadingLeaseId] = useState('')
  const [cancellationApplying, setCancellationApplying] = useState(false)
  const [cancellationConfirmation, setCancellationConfirmation] = useState('')

  const canApply = Boolean(
    preview?.canApply
    && preview?.previewToken
    && confirmation === CATALOG_CONFIRMATION
    && !applying,
  )
  const syncStatus = preview?.pendingChanges ? 'Pending Stripe changes' : 'Stripe matches backend'
  const statusColor = preview?.pendingChanges ? '#f59e0b' : '#22c55e'

  const migrationCounts = useMemo(() => ({
    subscriptions: migration?.summary?.subscriptions || 0,
    items: migration?.summary?.items || migration?.summary?.migrate || 0,
    unchanged: migration?.summary?.unchanged || 0,
    errors: migration?.summary?.errors || 0,
  }), [migration])
  const checkoutStripe = useMemo(
    () => checkout?.publishableKey ? loadStripe(checkout.publishableKey) : null,
    [checkout?.publishableKey],
  )

  useEffect(() => {
    if (mode === 'clients') previewCatalog()
  }, [mode])

  async function previewCatalog({ preserveMessage = false } = {}) {
    setLoading(true)
    setError('')
    if (!preserveMessage) setMessage('')
    setConfirmation('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Stripe preview failed.')
      setPreview(data)
    } catch (previewError) {
      setError(previewError.message || 'Stripe preview failed.')
    } finally {
      setLoading(false)
    }
  }

  async function applyCatalog() {
    if (!canApply) return
    setApplying(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          previewToken: preview.previewToken,
          confirmation,
          requestId: requestId('stripe-catalog'),
          existingSubscriptions: { mode: 'none' },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Stripe catalog was not updated.')
      const nextMessage = data.idempotent ? 'Stripe catalog update was already completed.' : 'Stripe catalog updated from the backend.'
      setMessage(nextMessage)
      onToast?.(nextMessage)
      setConfirmation('')
      await previewCatalog({ preserveMessage: true })
    } catch (applyError) {
      setError(applyError.message || 'Stripe catalog was not updated.')
    } finally {
      setApplying(false)
    }
  }

  async function previewMigration() {
    setMigrationLoading(true)
    setError('')
    setMessage('')
    setMigrationConfirmation('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview-existing-subscriptions',
          existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Subscription migration preview failed.')
      setMigration(data)
    } catch (migrationError) {
      setError(migrationError.message || 'Subscription migration preview failed.')
    } finally {
      setMigrationLoading(false)
    }
  }

  async function applyMigration() {
    const ready = migration?.canApply
      && migration?.previewToken
      && migrationConfirmation === MIGRATION_CONFIRMATION
    if (!ready) return
    setMigrationApplying(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'migrate-existing-subscriptions',
          previewToken: migration.previewToken,
          confirmation: migrationConfirmation,
          requestId: requestId('stripe-migration'),
          existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Existing subscriptions were not migrated.')
      const nextMessage = data.idempotent ? 'Subscription migration was already completed.' : 'Stripe items were updated immediately without a prorated charge.'
      setMessage(nextMessage)
      onToast?.(nextMessage)
      setMigrationConfirmation('')
      setMigration(null)
    } catch (migrationError) {
      setError(migrationError.message || 'Existing subscriptions were not migrated.')
    } finally {
      setMigrationApplying(false)
    }
  }

  async function previewClient(leaseId, { preserveMessage = false } = {}) {
    setClientLoadingLeaseId(leaseId)
    setError('')
    if (!preserveMessage) setMessage('')
    setClientConfirmation('')
    setCustomerConsent(false)
    setCheckout(null)
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview-client-subscription', leaseId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Client subscription preview failed.')
      setClientPreview(data)
    } catch (clientError) {
      setError(clientError.message || 'Client subscription preview failed.')
    } finally {
      setClientLoadingLeaseId('')
    }
  }

  async function updateClientSubscription() {
    if (!clientPreview?.lease?.leaseId || clientConfirmation !== LEASE_CONFIRMATION) return
    setClientApplying(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-client-subscription',
          leaseId: clientPreview.lease.leaseId,
          previewToken: clientPreview.previewToken,
          confirmation: clientConfirmation,
          requestId: requestId('stripe-client'),
          existingSubscriptions: { mode: 'immediate_no_proration', prorationBehavior: 'none' },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Client subscription was not updated.')
      const nextMessage = data.idempotent ? 'Client subscription update was already completed.' : 'Client Stripe items updated immediately without a prorated charge.'
      setMessage(nextMessage)
      onToast?.(nextMessage)
      await previewClient(clientPreview.lease.leaseId, { preserveMessage: true })
    } catch (clientError) {
      setError(clientError.message || 'Client subscription was not updated.')
    } finally {
      setClientApplying(false)
    }
  }

  async function createClientBillingSetup() {
    if (!clientPreview?.lease?.leaseId
      || !customerConsent
      || clientConfirmation !== CHECKOUT_CONFIRMATION) return
    setClientApplying(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-client-billing-setup',
          leaseId: clientPreview.lease.leaseId,
          previewToken: clientPreview.previewToken,
          confirmation: clientConfirmation,
          customerConsent: true,
          requestId: requestId('stripe-checkout'),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok || !data.checkout?.clientSecret || !data.checkout?.publishableKey) {
        throw new Error(data.error || 'Client billing setup was not created.')
      }
      setCheckout({ ...data.checkout, accountName: clientPreview.lease.accountName })
      setClientConfirmation('')
      setCustomerConsent(false)
      const nextMessage = 'Secure client billing setup is ready below. No charge has been made.'
      setMessage(nextMessage)
      onToast?.(nextMessage)
    } catch (clientError) {
      setError(clientError.message || 'Client billing setup was not created.')
    } finally {
      setClientApplying(false)
    }
  }

  async function previewClientCancellation(leaseId, { preserveMessage = false } = {}) {
    setCancellationLoadingLeaseId(leaseId)
    setError('')
    if (!preserveMessage) setMessage('')
    setCancellationConfirmation('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview-client-cancellation', leaseId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Renewal status could not be previewed.')
      setCancellationPreviewState(data)
    } catch (cancellationError) {
      setError(cancellationError.message || 'Renewal status could not be previewed.')
    } finally {
      setCancellationLoadingLeaseId('')
    }
  }

  async function applyCancellationSetting() {
    const cancellation = cancellationPreviewState?.cancellation
    const leaseId = cancellationPreviewState?.lease?.leaseId
    const undo = cancellation?.canUndo === true
    const required = undo ? UNDO_CANCEL_CONFIRMATION : CANCEL_CONFIRMATION
    if (!leaseId || cancellationConfirmation !== required) return
    setCancellationApplying(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/stripe-catalog-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: undo ? 'undo-client-cancellation' : 'cancel-client-at-renewal',
          leaseId,
          previewToken: cancellationPreviewState.previewToken,
          confirmation: cancellationConfirmation,
          requestId: requestId(undo ? 'keep-subscription' : 'cancel-renewal'),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'The renewal setting was not changed.')
      const nextMessage = undo
        ? 'Scheduled cancellation removed. The subscription remains active.'
        : 'Cancellation scheduled for the end of the current billing period.'
      setMessage(nextMessage)
      onToast?.(nextMessage)
      await previewClientCancellation(leaseId, { preserveMessage: true })
      await previewCatalog({ preserveMessage: true })
    } catch (cancellationError) {
      setError(cancellationError.message || 'The renewal setting was not changed.')
    } finally {
      setCancellationApplying(false)
    }
  }

  return (
    <div className="grid gap-5">
      {mode === 'clients' && loading && !preview && (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Loading verified client subscriptions…</div>
      )}
      {mode !== 'clients' && (
        <section className="rounded-2xl p-5 sm:p-6 grid gap-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="inline-flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              <Cloud size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Stripe catalog control</h2>
              <p className="mt-1 text-sm max-w-3xl" style={{ color: 'var(--text-muted)' }}>
                The Command Center billing catalog is authoritative. Preview the exact drift before creating or replacing Stripe Products and Prices.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => previewCatalog()}
            disabled={loading || applying}
            title="Compare the backend billing catalog with Stripe"
            style={{ ...buttonStyle, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: loading ? 0.65 : 1 }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Checking…' : 'Preview Stripe changes'}
          </button>
        </div>

        {preview && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</div>
                <div className="mt-2 inline-flex items-center gap-2 font-semibold" style={{ color: statusColor }}>
                  {preview.pendingChanges ? <Clock3 size={16} /> : <CheckCircle2 size={16} />}{syncStatus}
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Backend hash</div>
                <div className="mt-2 font-mono text-sm" title={preview.plan?.catalogHash}>{shortHash(preview.plan?.catalogHash)}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Last successful sync</div>
                <div className="mt-2 text-sm font-semibold">{when(preview.lastSync?.completedAt)}</div>
                {preview.lastSync?.catalogHash && <div className="mt-1 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{shortHash(preview.lastSync.catalogHash)}</div>}
              </div>
            </div>

            <CatalogPlan plan={preview.plan} />

            {preview.canApply && preview.pendingChanges && (
              <div className="rounded-xl p-4 sm:p-5 grid gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="flex items-start gap-2">
                  <ShieldCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-hidden="true" />
                  <div>
                    <div className="font-semibold">Owner confirmation required</div>
                    <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                      This updates catalog objects only. Existing customer subscriptions remain unchanged.
                    </div>
                  </div>
                </div>
                <label className="grid gap-1 text-sm font-semibold" htmlFor="stripe-catalog-confirmation">
                  Type {CATALOG_CONFIRMATION}
                  <input
                    id="stripe-catalog-confirmation"
                    value={confirmation}
                    onChange={event => setConfirmation(event.target.value)}
                    autoComplete="off"
                    spellCheck="false"
                    style={fieldStyle}
                  />
                </label>
                <div>
                  <button
                    type="button"
                    onClick={applyCatalog}
                    disabled={!canApply}
                    title="Apply the reviewed backend catalog changes to Stripe"
                    style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: canApply ? 1 : 0.5 }}
                  >
                    <Upload size={16} aria-hidden="true" /> {applying ? 'Updating…' : 'Update Stripe'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </section>
      )}

      {mode !== 'sync' && (
        <ClientSubscriptions
          clients={preview?.clients || []}
          onPreview={previewClient}
          loadingLeaseId={clientLoadingLeaseId}
          preview={clientPreview}
          confirmation={clientConfirmation}
          onConfirmation={setClientConfirmation}
          customerConsent={customerConsent}
          onCustomerConsent={setCustomerConsent}
          onUpdate={updateClientSubscription}
          onCreateSetup={createClientBillingSetup}
          applying={clientApplying}
          onPreviewCancellation={previewClientCancellation}
          cancellationLoadingLeaseId={cancellationLoadingLeaseId}
          view={view}
          onViewChange={onViewChange}
        />
      )}

      {mode !== 'sync' && cancellationPreviewState && (
        <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-3">
            <div className="inline-flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, flexShrink: 0, background: 'var(--surface2)', color: '#f59e0b', border: '1px solid var(--border)' }}>
              <Clock3 size={20} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Renewal control · {cancellationPreviewState.lease?.accountName || 'Client'}</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {cancellationPreviewState.cancellation?.canUndo
                  ? `Cancellation is scheduled for ${when(cancellationPreviewState.cancellation.currentPeriodEnd)}. Service remains active until then.`
                  : `The subscription is active through ${when(cancellationPreviewState.cancellation?.currentPeriodEnd)}.`}
              </p>
            </div>
          </div>

          <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            This control never cancels immediately, creates no prorated invoice, and issues no automatic refund. It only changes Stripe's end-of-period renewal setting after a fresh preview and typed confirmation.
          </div>

          {(cancellationPreviewState.cancellation?.canSchedule || cancellationPreviewState.cancellation?.canUndo) && (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-semibold" htmlFor="client-cancellation-confirmation">
                Type {cancellationPreviewState.cancellation.canUndo ? UNDO_CANCEL_CONFIRMATION : CANCEL_CONFIRMATION}
                <input
                  id="client-cancellation-confirmation"
                  value={cancellationConfirmation}
                  onChange={event => setCancellationConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                  style={fieldStyle}
                />
              </label>
              <div>
                <button
                  type="button"
                  onClick={applyCancellationSetting}
                  disabled={cancellationApplying || cancellationConfirmation !== (cancellationPreviewState.cancellation.canUndo ? UNDO_CANCEL_CONFIRMATION : CANCEL_CONFIRMATION)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{
                    minHeight: 44,
                    background: cancellationPreviewState.cancellation.canUndo ? 'var(--accent)' : '#b45309',
                    color: '#fff',
                    border: `1px solid ${cancellationPreviewState.cancellation.canUndo ? 'var(--accent)' : '#b45309'}`,
                    opacity: cancellationApplying || cancellationConfirmation !== (cancellationPreviewState.cancellation.canUndo ? UNDO_CANCEL_CONFIRMATION : CANCEL_CONFIRMATION) ? 0.5 : 1,
                  }}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  {cancellationApplying
                    ? 'Updating…'
                    : cancellationPreviewState.cancellation.canUndo ? 'Keep subscription active' : 'Cancel at renewal'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {mode !== 'sync' && checkout && checkoutStripe && (
        <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Secure billing setup · {checkout.accountName || 'Client'}</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                Stripe Checkout is embedded inside the Command Center. The reviewed subscription is {money(checkout.monthlyAmountCents)} per month and is not created until Checkout is completed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCheckout(null)}
              aria-label="Close client billing setup"
              title="Close billing setup"
              className="inline-flex items-center justify-center rounded-lg"
              style={{ width: 40, height: 40, flexShrink: 0, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ minHeight: 520, background: '#fff', border: '1px solid var(--border)' }}>
            <EmbeddedCheckoutProvider stripe={checkoutStripe} options={{ clientSecret: checkout.clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        </section>
      )}

      {mode !== 'clients' && (
        <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Existing subscriptions</h2>
            <p className="mt-1 text-sm max-w-3xl" style={{ color: 'var(--text-muted)' }}>
              Subscription migration is always separate from catalog updates. Confirming it changes Stripe subscription items immediately, preserves quantity, and creates no prorated charge.
            </p>
          </div>
          <button
            type="button"
            onClick={previewMigration}
            disabled={migrationLoading || migrationApplying}
            title="Preview existing subscriptions eligible for an immediate no-proration item update"
            style={{ ...buttonStyle, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: migrationLoading ? 0.65 : 1 }}
          >
            <RefreshCw size={16} className={migrationLoading ? 'animate-spin' : ''} aria-hidden="true" />
            {migrationLoading ? 'Checking…' : 'Preview subscription migration'}
          </button>
        </div>

        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <Clock3 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-hidden="true" />
          <div>
            <div className="font-semibold">Immediate item update · no proration</div>
            <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Stripe item assignments change when confirmed. The next regular invoice reflects them; this action does not schedule a future change.
            </div>
          </div>
        </div>

        {migration && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Subscriptions" value={migrationCounts.subscriptions} />
              <Stat label="Items to migrate" value={migrationCounts.items} tone="update" />
              <Stat label="Unchanged" value={migrationCounts.unchanged} />
              <Stat label="Errors" value={migrationCounts.errors} tone="error" />
            </div>
            {migration.canApply && (
              <div className="rounded-xl p-4 sm:p-5 grid gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <label className="grid gap-1 text-sm font-semibold" htmlFor="stripe-migration-confirmation">
                  Type {MIGRATION_CONFIRMATION}
                  <input
                    id="stripe-migration-confirmation"
                    value={migrationConfirmation}
                    onChange={event => setMigrationConfirmation(event.target.value)}
                    autoComplete="off"
                    spellCheck="false"
                    style={fieldStyle}
                  />
                </label>
                <div>
                  <button
                    type="button"
                    onClick={applyMigration}
                    disabled={migrationApplying || migrationConfirmation !== MIGRATION_CONFIRMATION}
                    title="Migrate the reviewed active and trialing subscription items without proration"
                    style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: migrationApplying || migrationConfirmation !== MIGRATION_CONFIRMATION ? 0.5 : 1 }}
                  >
                    <ShieldCheck size={16} aria-hidden="true" /> {migrationApplying ? 'Migrating…' : 'Update without proration'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </section>
      )}

      {error && <div role="alert" className="rounded-xl p-4 text-sm font-semibold" style={{ background: 'color-mix(in srgb, #ef4444 10%, var(--surface))', border: '1px solid #ef4444' }}>{error}</div>}
      {message && <div role="status" className="rounded-xl p-4 text-sm font-semibold" style={{ background: 'color-mix(in srgb, #22c55e 10%, var(--surface))', border: '1px solid #22c55e' }}>{message}</div>}
    </div>
  )
}
