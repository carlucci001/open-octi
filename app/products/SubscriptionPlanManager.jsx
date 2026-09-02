'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, Pencil, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import ThemedSelect from '../components/ThemedSelect'
import { Paginator, usePagination } from '../components/Paginator'

const FIELD = {
  width: '100%',
  minHeight: 44,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  fontSize: 14,
}

function requestId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0))
}

function number(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

function blankPlan() {
  return { id: '', name: '', tagline: '', monthlyFee: 0, includedCredits: 0, color: '#3b82f6', capabilities: '', notes: '' }
}

function blankAddon() {
  return { id: '', group: 'tools', name: '', monthlyFee: 0, description: '' }
}

function planDraft(plan) {
  return {
    id: plan.id,
    name: plan.name,
    tagline: plan.tagline || '',
    monthlyFee: Number(plan.monthlyFee || 0),
    includedCredits: Number(plan.creditAllowance?.includedCredits || 0),
    color: plan.color || '#3b82f6',
    capabilities: (plan.capabilities || []).join('\n'),
    notes: plan.notes || '',
  }
}

function Field({ label, children }) {
  return <label className="grid gap-1 text-sm font-semibold">{label}{children}</label>
}

function IconAction({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center rounded-lg"
      style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      {children}
    </button>
  )
}

export default function SubscriptionPlanManager({ view = 'grid', onViewChange, onToast, onStripeReview }) {
  const [data, setData] = useState({ plans: [], addons: [], catalogHash: '' })
  const [surface, setSurface] = useState('plans')
  const [plan, setPlan] = useState(null)
  const [addon, setAddon] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingStripe, setPendingStripe] = useState(false)
  const [query, setQuery] = useState('')
  const [primaryFilter, setPrimaryFilter] = useState('all')
  const [secondaryFilter, setSecondaryFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (surface === 'plans') {
      return (data.plans || []).filter(item => {
        const monthlyFee = Number(item.monthlyFee || 0)
        const credits = Number(item.creditAllowance?.includedCredits || 0)
        const haystack = [item.id, item.name, item.tagline, item.notes, ...(item.capabilities || [])].join(' ').toLowerCase()
        const priceMatch = primaryFilter === 'all'
          || (primaryFilter === 'under-500' && monthlyFee < 500)
          || (primaryFilter === '500-999' && monthlyFee >= 500 && monthlyFee < 1000)
          || (primaryFilter === '1000-plus' && monthlyFee >= 1000)
        const creditMatch = secondaryFilter === 'all'
          || (secondaryFilter === 'included' && credits > 0)
          || (secondaryFilter === 'none' && credits === 0)
        return (!needle || haystack.includes(needle)) && priceMatch && creditMatch
      })
    }
    return (data.addons || []).filter(item => {
      const monthlyFee = Number(item.monthlyFee || 0)
      const haystack = [item.id, item.group, item.name, item.description].join(' ').toLowerCase()
      const groupMatch = primaryFilter === 'all' || item.group === primaryFilter
      const priceMatch = secondaryFilter === 'all'
        || (secondaryFilter === 'paid' && monthlyFee > 0)
        || (secondaryFilter === 'adjustment' && monthlyFee < 0)
        || (secondaryFilter === 'zero' && monthlyFee === 0)
      return (!needle || haystack.includes(needle)) && groupMatch && priceMatch
    })
  }, [data.addons, data.plans, primaryFilter, query, secondaryFilter, surface])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filteredItems, 6)
  const groupedAddons = useMemo(() => Object.groupBy
    ? Object.groupBy(paginated, item => item.group)
    : paginated.reduce((groups, item) => ({ ...groups, [item.group]: [...(groups[item.group] || []), item] }), {}), [paginated])

  useEffect(() => {
    setPrimaryFilter('all')
    setSecondaryFilter('all')
    setPage(1)
    setSelectedIds(new Set())
  }, [surface, setPage])

  useEffect(() => { setPage(1); setSelectedIds(new Set()) }, [primaryFilter, query, secondaryFilter, view, setPage])

  const itemKey = item => surface === 'plans' ? item.id : `${item.group}:${item.id}`
  const pageKeys = paginated.map(itemKey)
  const allPageSelected = pageKeys.length > 0 && pageKeys.every(key => selectedIds.has(key))

  function toggleSelected(key) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function runBulkAction(action) {
    if (!selectedIds.size) return
    if (action === 'bulk-delete' && !window.confirm(`Delete ${selectedIds.size} selected ${surface === 'plans' ? 'plans' : 'add-ons'}?`)) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/subscription-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, itemType: surface === 'plans' ? 'plan' : 'addon', ids: [...selectedIds], requestId: requestId(action) }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Bulk action failed.')
      setData(result)
      setSelectedIds(new Set())
      setPendingStripe(result.stripeSyncRequired === true)
      onToast?.(`${result.affected || 0} ${surface === 'plans' ? 'plans' : 'add-ons'} ${action === 'bulk-delete' ? 'deleted' : 'duplicated'}. Stripe review required.`)
    } catch (bulkError) {
      setError(bulkError.message || 'Bulk action failed.')
    } finally {
      setSaving(false)
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/subscription-plans', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Subscription plans could not be loaded.')
      setData(result)
    } catch (loadError) {
      setError(loadError.message || 'Subscription plans could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function reviewStripe() {
    onStripeReview?.()
    if (!onStripeReview) window.dispatchEvent(new CustomEvent('fcc:products-section', { detail: 'stripe' }))
  }

  async function savePlan() {
    if (!plan?.name?.trim()) return setError('Plan name is required.')
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/subscription-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert-plan', plan, requestId: requestId('subscription-plan') }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Subscription plan was not saved.')
      setData(result)
      setPlan(null)
      setPendingStripe(result.stripeSyncRequired === true)
      const message = `${result.saved?.item?.name || 'Subscription plan'} saved. Stripe review required.`
      onToast?.(message)
    } catch (saveError) {
      setError(saveError.message || 'Subscription plan was not saved.')
    } finally {
      setSaving(false)
    }
  }

  async function saveAddon() {
    if (!addon?.name?.trim()) return setError('Add-on name is required.')
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/subscription-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert-addon', addon, requestId: requestId('subscription-addon') }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Subscription add-on was not saved.')
      setData(result)
      setAddon(null)
      setPendingStripe(result.stripeSyncRequired === true)
      const message = `${result.saved?.item?.name || 'Subscription add-on'} saved. Stripe review required.`
      onToast?.(message)
    } catch (saveError) {
      setError(saveError.message || 'Subscription add-on was not saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="rounded-xl p-6" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Loading subscription plans…</div>

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Subscription plans</h2>
            <p className="mt-1 text-sm max-w-3xl" style={{ color: 'var(--text-muted)' }}>
              These monthly plans and add-ons are the Command Center billing source of truth. Saving changes never charges a client and never updates Stripe automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconAction label="Refresh subscription plans" onClick={load}><RefreshCw size={16} /></IconAction>
            <button
              type="button"
              onClick={() => surface === 'plans' ? setPlan(blankPlan()) : setAddon(blankAddon())}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)' }}
            >
              <Plus size={16} /> {surface === 'plans' ? 'New plan' : 'New add-on'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl max-w-md" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {[
            ['plans', 'Monthly plans'],
            ['addons', 'Add-on catalog'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSurface(id)}
              className="rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ minHeight: 40, background: surface === id ? 'var(--accent)' : 'transparent', color: surface === id ? 'var(--accent-text)' : 'var(--text-muted)', border: 'none' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="command-toolbar grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_190px_190px] gap-3 items-end">
          <label className="grid gap-1 text-sm font-semibold">
            Search
            <span className="relative block">
              <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={surface === 'plans' ? 'Search plans, capabilities, or ID' : 'Search add-ons, descriptions, or ID'}
                aria-label={surface === 'plans' ? 'Search subscription plans' : 'Search subscription add-ons'}
                style={{ ...FIELD, paddingLeft: 38 }}
              />
            </span>
          </label>
          <Field label={surface === 'plans' ? 'Price filter' : 'Add-on group'}>
            <ThemedSelect value={primaryFilter} onChange={event => setPrimaryFilter(event.target.value)} style={FIELD} aria-label={surface === 'plans' ? 'Filter plans by monthly price' : 'Filter add-ons by group'}>
              {surface === 'plans' ? <>
                <option value="all">All prices</option><option value="under-500">Under $500</option><option value="500-999">$500–$999</option><option value="1000-plus">$1,000+</option>
              </> : <>
                <option value="all">All groups</option><option value="tools">Tools</option><option value="specialties">Specialties</option><option value="premiumModels">Premium models</option>
              </>}
            </ThemedSelect>
          </Field>
          <Field label={surface === 'plans' ? 'Credit allowance' : 'Billing treatment'}>
            <ThemedSelect value={secondaryFilter} onChange={event => setSecondaryFilter(event.target.value)} style={FIELD} aria-label={surface === 'plans' ? 'Filter plans by credit allowance' : 'Filter add-ons by billing treatment'}>
              {surface === 'plans' ? <>
                <option value="all">All allowances</option><option value="included">Credits included</option><option value="none">No included credits</option>
              </> : <>
                <option value="all">All billing types</option><option value="paid">Paid add-ons</option><option value="adjustment">Billing adjustments</option><option value="zero">No monthly charge</option>
              </>}
            </ThemedSelect>
          </Field>
        </div>

        <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          {filteredItems.length} of {surface === 'plans' ? data.plans?.length || 0 : data.addons?.length || 0} {surface === 'plans' ? 'plans' : 'add-ons'}
        </div>

        {filteredItems.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={allPageSelected} onChange={() => setSelectedIds(current => { const next = new Set(current); pageKeys.forEach(key => allPageSelected ? next.delete(key) : next.add(key)); return next })} style={{ width: 18, height: 18 }} />
              Select page
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{selectedIds.size} selected</span>
              <IconAction label="Duplicate selected" onClick={() => runBulkAction('bulk-copy')}><Copy size={16} /></IconAction>
              <IconAction label="Delete selected" onClick={() => runBulkAction('bulk-delete')}><Trash2 size={16} /></IconAction>
            </div>
          </div>
        )}

        {pendingStripe && (
          <div className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" role="status" style={{ background: 'color-mix(in srgb, #f59e0b 10%, var(--surface))', border: '1px solid #f59e0b' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <div><strong>Stripe review pending.</strong> Preview the backend drift before updating Stripe.</div>
            </div>
            <button type="button" onClick={reviewStripe} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <ShieldCheck size={15} /> Review Stripe changes
            </button>
          </div>
        )}

        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Backend catalog: {data.catalogHash ? `${data.catalogHash.slice(0, 12)}…` : 'hash unavailable'}</div>
      </section>

      {filteredItems.length === 0 ? (
        <section className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          No {surface === 'plans' ? 'subscription plans' : 'add-ons'} match the current search and filters.
        </section>
      ) : surface === 'plans' && view === 'grid' ? (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map(item => (
            <article key={item.id} className="rounded-2xl p-5 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${item.color || 'var(--accent)'}` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selectedIds.has(itemKey(item))} onChange={() => toggleSelected(itemKey(item))} aria-label={`Select ${item.name}`} style={{ width: 18, height: 18, marginTop: 2 }} />
                  <div>
                  <h3 className="font-bold">{item.name}</h3>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{item.tagline || 'Monthly managed service plan'}</p>
                  </div>
                </div>
                <IconAction label={`Edit ${item.name}`} onClick={() => setPlan(planDraft(item))}><Pencil size={15} /></IconAction>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: 'var(--surface2)' }}><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Monthly</div><div className="mt-1 font-bold">{money(item.monthlyFee)}</div></div>
                <div className="rounded-xl p-3" style={{ background: 'var(--surface2)' }}><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Included credits</div><div className="mt-1 font-bold">{number(item.creditAllowance?.includedCredits)}</div></div>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{(item.capabilities || []).length} listed capabilities · paid-period allowance</div>
            </article>
          ))}
        </section>
      ) : surface === 'plans' ? (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="hidden md:grid grid-cols-[28px_minmax(180px,1.4fr)_140px_150px_120px_48px] gap-3 px-4 py-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>
            <span className="sr-only">Select</span><span>Plan</span><span>Monthly</span><span>Included credits</span><span>Capabilities</span><span className="sr-only">Actions</span>
          </div>
          {paginated.map(item => (
            <article key={item.id} className="grid grid-cols-1 md:grid-cols-[28px_minmax(180px,1.4fr)_140px_150px_120px_48px] gap-3 items-center px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" checked={selectedIds.has(itemKey(item))} onChange={() => toggleSelected(itemKey(item))} aria-label={`Select ${item.name}`} style={{ width: 18, height: 18 }} />
              <div><div className="font-semibold">{item.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.id} · {item.tagline || 'Monthly managed service plan'}</div></div>
              <div className="font-semibold">{money(item.monthlyFee)}</div>
              <div>{number(item.creditAllowance?.includedCredits)}</div>
              <div>{(item.capabilities || []).length}</div>
              <IconAction label={`Edit ${item.name}`} onClick={() => setPlan(planDraft(item))}><Pencil size={15} /></IconAction>
            </article>
          ))}
        </section>
      ) : view === 'grid' ? (
        <section className="grid gap-5">
          {Object.entries(groupedAddons).map(([group, entries]) => (
            <div key={group} className="rounded-2xl p-5 grid gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="font-bold capitalize">{group === 'premiumModels' ? 'Premium models' : group}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {entries.map(item => (
                  <article key={`${group}-${item.id}`} className="rounded-xl p-4 flex items-start justify-between gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start gap-3"><input type="checkbox" checked={selectedIds.has(itemKey(item))} onChange={() => toggleSelected(itemKey(item))} aria-label={`Select ${item.name}`} style={{ width: 18, height: 18, marginTop: 2 }} /><div><div className="font-semibold">{item.name}</div><div className="mt-1 text-sm" style={{ color: item.monthlyFee < 0 ? '#22c55e' : 'var(--text-muted)' }}>{item.monthlyFee < 0 ? '' : '+'}{money(item.monthlyFee)} / month</div></div></div>
                    <IconAction label={`Edit ${item.name}`} onClick={() => setAddon({ ...item })}><Pencil size={15} /></IconAction>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="hidden md:grid grid-cols-[28px_minmax(180px,1.5fr)_150px_160px_48px] gap-3 px-4 py-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>
            <span className="sr-only">Select</span><span>Add-on</span><span>Group</span><span>Monthly</span><span className="sr-only">Actions</span>
          </div>
          {paginated.map(item => (
            <article key={`${item.group}-${item.id}`} className="grid grid-cols-1 md:grid-cols-[28px_minmax(180px,1.5fr)_150px_160px_48px] gap-3 items-center px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <input type="checkbox" checked={selectedIds.has(itemKey(item))} onChange={() => toggleSelected(itemKey(item))} aria-label={`Select ${item.name}`} style={{ width: 18, height: 18 }} />
              <div><div className="font-semibold">{item.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.id} · {item.description || 'Subscription add-on'}</div></div>
              <div className="capitalize">{item.group === 'premiumModels' ? 'Premium models' : item.group}</div>
              <div style={{ color: item.monthlyFee < 0 ? '#22c55e' : 'var(--text)' }}>{item.monthlyFee < 0 ? '' : '+'}{money(item.monthlyFee)}</div>
              <IconAction label={`Edit ${item.name}`} onClick={() => setAddon({ ...item })}><Pencil size={15} /></IconAction>
            </article>
          ))}
        </section>
      )}

      {filteredItems.length > 0 && (
        <Paginator total={filteredItems.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} pageSizes={[6, 12, 24, 48]} label={surface === 'plans' ? 'plans' : 'add-ons'} />
      )}

      {plan && (
        <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{plan.id ? `Edit ${plan.name}` : 'Create subscription plan'}</h3><IconAction label="Close plan editor" onClick={() => setPlan(null)}><X size={16} /></IconAction></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Plan ID"><input value={plan.id} disabled={Boolean(data.plans?.some(item => item.id === plan.id))} onChange={event => setPlan(current => ({ ...current, id: event.target.value }))} style={{ ...FIELD, opacity: data.plans?.some(item => item.id === plan.id) ? 0.65 : 1 }} /></Field>
            <Field label="Plan name"><input value={plan.name} onChange={event => setPlan(current => ({ ...current, name: event.target.value }))} style={FIELD} /></Field>
            <Field label="Monthly price"><input type="number" min="0" step="0.01" value={plan.monthlyFee} onChange={event => setPlan(current => ({ ...current, monthlyFee: event.target.value }))} style={FIELD} /></Field>
            <Field label="Included credits per paid period"><input type="number" min="0" step="1" value={plan.includedCredits} onChange={event => setPlan(current => ({ ...current, includedCredits: event.target.value }))} style={FIELD} /></Field>
            <Field label="Accent color"><input type="color" value={plan.color} onChange={event => setPlan(current => ({ ...current, color: event.target.value }))} style={{ ...FIELD, padding: 6 }} /></Field>
            <Field label="Short description"><input value={plan.tagline} onChange={event => setPlan(current => ({ ...current, tagline: event.target.value }))} style={FIELD} /></Field>
          </div>
          <Field label="Capabilities (one per line)"><textarea rows={6} value={plan.capabilities} onChange={event => setPlan(current => ({ ...current, capabilities: event.target.value }))} style={{ ...FIELD, resize: 'vertical' }} /></Field>
          <Field label="Owner notes"><textarea rows={3} value={plan.notes} onChange={event => setPlan(current => ({ ...current, notes: event.target.value }))} style={{ ...FIELD, resize: 'vertical' }} /></Field>
          <div><button type="button" onClick={savePlan} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: saving ? 0.6 : 1 }}><Save size={16} /> {saving ? 'Saving…' : 'Save plan'}</button></div>
        </section>
      )}

      {addon && (
        <section className="rounded-2xl p-5 sm:p-6 grid gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{addon.id ? `Edit ${addon.name}` : 'Create subscription add-on'}</h3><IconAction label="Close add-on editor" onClick={() => setAddon(null)}><X size={16} /></IconAction></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Add-on ID"><input value={addon.id} disabled={Boolean(data.addons?.some(item => item.id === addon.id && item.group === addon.group))} onChange={event => setAddon(current => ({ ...current, id: event.target.value }))} style={FIELD} /></Field>
            <Field label="Add-on name"><input value={addon.name} onChange={event => setAddon(current => ({ ...current, name: event.target.value }))} style={FIELD} /></Field>
            <Field label="Group"><ThemedSelect value={addon.group} onChange={event => setAddon(current => ({ ...current, group: event.target.value }))} style={FIELD} aria-label="Add-on group"><option value="tools">Tools</option><option value="specialties">Specialties</option><option value="premiumModels">Premium models</option></ThemedSelect></Field>
            <Field label="Monthly price"><input type="number" step="0.01" value={addon.monthlyFee} onChange={event => setAddon(current => ({ ...current, monthlyFee: event.target.value }))} style={FIELD} /></Field>
          </div>
          <Field label="Description"><textarea rows={3} value={addon.description} onChange={event => setAddon(current => ({ ...current, description: event.target.value }))} style={{ ...FIELD, resize: 'vertical' }} /></Field>
          {Number(addon.monthlyFee) < 0 && <div className="rounded-xl p-3 text-sm flex items-start gap-2" style={{ border: '1px solid #f59e0b' }}><AlertTriangle size={17} style={{ color: '#f59e0b' }} /> Negative add-ons are billing adjustments and require manual lease review before use.</div>}
          <div><button type="button" onClick={saveAddon} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: saving ? 0.6 : 1 }}><Save size={16} /> {saving ? 'Saving…' : 'Save add-on'}</button></div>
        </section>
      )}

      {error && <div role="alert" className="rounded-xl p-4 text-sm font-semibold" style={{ border: '1px solid #ef4444' }}>{error}</div>}
    </div>
  )
}
