'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { Upload, ClipboardCheck } from 'lucide-react'
import { buildVendorSetupTask, VENDOR_SETUP_STEPS } from '@/lib/vendor-setup-protocol'

const CATEGORIES = [
  { id: 'dev-tools',    label: 'Dev Tools',          icon: 'CLI', color: 'var(--blue, #3b82f6)' },
  { id: 'design',       label: 'Design',             icon: 'ART', color: 'var(--purple, #a855f7)' },
  { id: 'email',        label: 'Email',              icon: '@', color: 'var(--accent)' },
  { id: 'database',     label: 'Database',           icon: 'DB', color: 'var(--green)' },
  { id: 'ai',           label: 'AI & LLMs',          icon: '🤖', color: 'var(--accent)'  },
  { id: 'hosting',      label: 'Hosting & Infra',    icon: '🌐', color: 'var(--green)'   },
  { id: 'telephony',    label: 'Telephony & Voice',  icon: '📞', color: 'var(--amber)'   },
  { id: 'productivity', label: 'Productivity',       icon: '🛠️', color: 'var(--purple, #a855f7)' },
  { id: 'domains',      label: 'Domains',            icon: '🔗', color: 'var(--accent)'  },
  { id: 'media',        label: 'Media & Streaming',  icon: '🎬', color: 'var(--red)'     },
  { id: 'finance',      label: 'Finance & Banking',  icon: '🏦', color: 'var(--green)'   },
  { id: 'other',        label: 'Other',              icon: '📦', color: 'var(--text-muted)' },
]

const FREQUENCIES = [
  { id: 'weekly',    label: 'Weekly',    perMonth: 52 / 12 },
  { id: 'monthly',   label: 'Monthly',   perMonth: 1 },
  { id: 'quarterly', label: 'Quarterly', perMonth: 1 / 3 },
  { id: 'yearly',    label: 'Yearly',    perMonth: 1 / 12 },
  { id: 'usage-based', label: 'Usage-based', perMonth: 1 },
  { id: 'one-time',  label: 'One-time',  perMonth: 0 },
]

const fmtUSD = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const daysUntil = iso => {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

const monthlyEquivalent = (sub) => {
  if (sub.frequency === 'usage-based' && sub.avgMonthlyAmount != null && sub.avgMonthlyAmount !== '') {
    return Number(sub.avgMonthlyAmount) || 0
  }
  const f = FREQUENCIES.find(f => f.id === sub.frequency) || FREQUENCIES[1]
  return (Number(sub.amount) || 0) * f.perMonth
}

const categoryOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]

export default function OverheadManager() {
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | sub object
  const [filter, setFilter] = useState('all') // 'all' | category id | 'inactive'
  const [view, setView] = useState('table') // 'cards' | 'table' — default is the list/table view
  const [toast, setToast] = useState(null)
  const [autoSources, setAutoSources] = useState([])
  const [autoLoading, setAutoLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [projects, setProjects] = useState([])
  const [accounts, setAccounts] = useState([])
  const [setupOpen, setSetupOpen] = useState(false)
  const importInputRef = useRef(null)

  const load = () => fetch('/api/subscriptions').then(r => r.json()).then(d => {
    setSubs(d.subscriptions || [])
    setLoading(false)
  })

  const loadAutoSources = () => {
    setAutoLoading(true)
    fetch('/api/overhead/sources').then(r => r.json()).then(d => {
      setAutoSources(d.sources || [])
      setAutoLoading(false)
    }).catch(() => setAutoLoading(false))
  }

  useEffect(() => {
    load(); loadAutoSources()
    fetch('/api/projects').then(r => r.json()).then(d => setProjects(d.projects || [])).catch(() => {})
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {})
  }, [])

  const flash = (msg, kind = 'success') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000) }

  const importCsv = async (file) => {
    if (!file) return
    setImporting(true)
    setImportSummary(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const result = await fetch('/api/subscriptions/import', {
        method: 'POST',
        body: form,
      }).then(r => r.json())
      if (!result.ok) {
        flash(result.error || 'Import failed', 'error')
        return
      }
      const summary = {
        created: result.created || 0,
        updated: result.updated || 0,
        skipped: result.skipped || 0,
        warnings: result.warnings || [],
        errors: result.errors || [],
      }
      setImportSummary(summary)
      flash(`Imported ${summary.created} new and updated ${summary.updated}`)
      load()
      window.dispatchEvent(new CustomEvent('fcc:finance-alerts-changed'))
    } catch (e) {
      flash(e.message || 'Import failed', 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const save = async (form) => {
    const isNew = !form.id
    const body = isNew
      ? { action: 'create', ...form }
      : { action: 'update', id: form.id, patch: form }
    const r = await fetch('/api/subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json())
    if (r.ok) { flash(isNew ? 'Subscription added' : 'Saved'); setEditing(null); load() }
    else flash(r.error || 'Save failed', 'error')
  }

  // Standard vendor-setup protocol: create the Overhead entry AND a linked checklist task in one go.
  const runVendorSetup = async (cfg) => {
    const link = cfg.link // { kind, id, name } | null
    const subBody = {
      action: 'create',
      vendor: cfg.vendor,
      productOrPlan: cfg.productOrPlan || '',
      category: cfg.category || 'other',
      amount: Number(cfg.amount) || 0,
      frequency: cfg.frequency || 'monthly',
      loginUrl: cfg.loginUrl || '',
      status: 'active',
      usedEverywhere: !link,
      links: link ? [{ ...link, billable: !!cfg.billable }] : [],
      notes: cfg.notes || '',
    }
    const subRes = await fetch('/api/subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subBody),
    }).then(r => r.json())
    if (!subRes.ok) { flash(subRes.error || 'Setup failed', 'error'); return }

    const linkedTo = {}
    if (link?.kind === 'account') linkedTo.accountId = link.id
    if (link?.kind === 'project') linkedTo.projectId = link.id
    const taskRes = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        task: {
          title: `Set up ${cfg.vendor}${link ? ` for ${link.name}` : ''}`,
          description: buildVendorSetupTask({ vendor: cfg.vendor, forName: link?.name, billable: cfg.billable }),
          status: 'todo',
          priority: cfg.billable ? 'high' : 'medium',
          linkedTo,
          tags: ['vendor-setup', ...(cfg.billable ? ['billable'] : [])],
        },
      }),
    }).then(r => r.json())

    setSetupOpen(false)
    load()
    flash(taskRes.ok ? 'Vendor added + setup checklist created' : 'Vendor added (task failed)', taskRes.ok ? 'success' : 'error')
  }

  const remove = async (id) => {
    if (!confirm('Delete this subscription?')) return
    const r = await fetch('/api/subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    }).then(r => r.json())
    if (r.ok) { flash('Deleted'); load() }
    else flash(r.error || 'Delete failed', 'error')
  }

  const markPaid = async (id) => {
    const r = await fetch('/api/subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_paid', id }),
    }).then(r => r.json())
    if (r.ok) { flash('Marked paid — next due advanced'); load() }
    else flash(r.error || 'Failed', 'error')
  }

  // Auto-sources: turn each successful provider response into a virtual subscription so
  // it appears alongside manual entries. Failed/missing-credential sources show separately.
  const autoSubs = useMemo(() => {
    return autoSources.filter(r => r.ok).map(r => ({
      id: 'auto_' + r.source,
      vendor: r.vendor || r.source,
      category: r.category || 'other',
      amount: Number(r.currentMonthCost) || 0,
      currency: r.currency || 'USD',
      frequency: r.frequency || 'monthly',
      nextDue: r.nextDue || null,
      loginUrl: r.loginUrl || '',
      notes: r.details?.length ? r.details.map(d => {
        const n = Number(d.amount)
        return Number.isFinite(n) && n !== 0 ? `${d.label}: $${n.toFixed(2)}` : d.label
      }).join(' · ') : '',
      active: true,
      autoSource: r.source,
      _readOnly: true,
    }))
  }, [autoSources])

  const failedSources = useMemo(() => autoSources.filter(r => !r.ok && !r.notImplemented), [autoSources])

  const active = useMemo(() => [...autoSubs, ...subs.filter(s => s.active !== false)], [subs, autoSubs])
  const visible = useMemo(() => {
    if (filter === 'all') return active
    if (filter === 'inactive') return subs.filter(s => s.active === false)
    return active.filter(s => s.category === filter)
  }, [subs, active, filter])

  const sorted = useMemo(() => [...visible].sort((a, b) => {
    const ad = daysUntil(a.nextDue)
    const bd = daysUntil(b.nextDue)
    if (ad === null && bd === null) return monthlyEquivalent(b) - monthlyEquivalent(a)
    if (ad === null) return 1
    if (bd === null) return -1
    return ad - bd
  }), [visible])

  // Stats
  const totalMonthly = useMemo(() => active.reduce((s, x) => s + monthlyEquivalent(x), 0), [active])
  const totalYearly = totalMonthly * 12
  const byCategory = useMemo(() => {
    const map = {}
    for (const s of active) {
      const m = monthlyEquivalent(s)
      map[s.category] = (map[s.category] || 0) + m
    }
    return map
  }, [active])

  // Upcoming 30 days
  const upcoming = useMemo(() => {
    const out = []
    for (const s of active) {
      const d = daysUntil(s.nextDue)
      if (d === null) continue
      if (d >= 0 && d <= 30) out.push({ ...s, daysAway: d })
    }
    return out.sort((a, b) => a.daysAway - b.daysAway)
  }, [active])

  const overdue = useMemo(() => active.filter(s => {
    const d = daysUntil(s.nextDue)
    return d !== null && d < 0
  }), [active])

  return (
    <div className="p-4 sm:p-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium" style={{
          background: toast.kind === 'error' ? 'var(--red)' : 'var(--green)',
          color: 'var(--accent-text)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>{toast.msg}</div>
      )}

      <PageHeader
        icon="💰"
        title="Overhead"
        subtitle="Your monthly nut at a glance — subscriptions, recurring bills, and upcoming charges"
        viewToggle={<ViewModeToggle value={view === 'cards' ? 'card' : 'list'} onChange={mode => setView(mode === 'card' ? 'cards' : 'table')} modes={['list', 'card']} />}
        actions={
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={e => importCsv(e.target.files?.[0])}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
              style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 40, border: '1px solid var(--border)' }}
              title="Import CSV"
            >
              <Upload size={15} /> {importing ? 'Importing...' : 'Import CSV'}
            </button>
            <button
              onClick={() => setSetupOpen(true)}
              className="px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
              style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 40, border: '1px solid var(--accent)' }}
              title="Set up a vendor account the standard way"
            >
              <ClipboardCheck size={15} /> Set up vendor
            </button>
          <button
            onClick={() => setEditing('new')}
            className="px-3 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40, border: 'none' }}
          >＋ New Subscription</button>
          </>
        }
      />

      {importSummary && (
        <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              CSV import: {importSummary.created} new, {importSummary.updated} updated, {importSummary.skipped} skipped
            </div>
            <button
              onClick={() => setImportSummary(null)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Dismiss
            </button>
          </div>
          {(importSummary.warnings.length > 0 || importSummary.errors.length > 0) && (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {importSummary.warnings.length > 0 && `${importSummary.warnings.length} row(s) used defaults for missing fields. `}
              {importSummary.errors.length > 0 && `${importSummary.errors.length} row(s) could not be imported.`}
            </div>
          )}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Monthly nut"   value={fmtUSD(totalMonthly)} sub={`${active.length} active subs`}                color="var(--accent)" />
        <StatCard label="Annual"        value={fmtUSD(totalYearly)}  sub="If nothing changes"                            color="var(--green)" />
        <StatCard label="Due in 30 days" value={fmtUSD(upcoming.reduce((s, x) => s + Number(x.amount || 0), 0))} sub={`${upcoming.length} charges coming`} color="var(--amber)" />
        <StatCard label="Overdue"       value={String(overdue.length)} sub={overdue.length === 0 ? 'All caught up' : 'Need attention'} color={overdue.length > 0 ? 'var(--red)' : 'var(--text-muted)'} />
      </div>

      {/* Category breakdown */}
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Monthly breakdown by category</div>
        {totalMonthly === 0 ? (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No subscriptions yet. Click "New Subscription" to add your first one.</div>
        ) : (
          <div className="space-y-2">
            {CATEGORIES.filter(c => byCategory[c.id]).sort((a, b) => byCategory[b.id] - byCategory[a.id]).map(c => {
              const amount = byCategory[c.id]
              const pct = (amount / totalMonthly) * 100
              return (
                <div key={c.id}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span>{c.icon} {c.label}</span>
                    <span style={{ color: 'var(--text)' }}>{fmtUSD(amount)} <span style={{ opacity: 0.6 }}>· {pct.toFixed(1)}%</span></span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: c.color, transition: 'width 300ms ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upcoming timeline */}
      {upcoming.length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>📅 Next 30 days</div>
          <div className="grid gap-2">
            {upcoming.map(s => {
              const c = categoryOf(s.category)
              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--surface2)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--surface)', border: `1px solid ${c.color}`, color: c.color }}>{c.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{s.vendor}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.label} · {s.frequency}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmtUSD(s.amount)}</div>
                    <div className="text-xs" style={{ color: s.daysAway <= 3 ? 'var(--red)' : s.daysAway <= 7 ? 'var(--amber)' : 'var(--text-muted)' }}>
                      {s.daysAway === 0 ? 'Today' : s.daysAway === 1 ? 'Tomorrow' : `In ${s.daysAway} days`}
                    </div>
                  </div>
                  <button onClick={() => markPaid(s.id)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>✓ Paid</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter + view */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <button onClick={() => setFilter('all')} className="text-xs px-3 py-1.5 rounded-full" style={pill(filter === 'all')}>All ({active.length})</button>
        {CATEGORIES.filter(c => active.some(s => s.category === c.id)).map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} className="text-xs px-3 py-1.5 rounded-full" style={pill(filter === c.id)}>{c.icon} {c.label}</button>
        ))}
        {subs.some(s => s.active === false) && (
          <button onClick={() => setFilter('inactive')} className="text-xs px-3 py-1.5 rounded-full" style={pill(filter === 'inactive')}>Inactive</button>
        )}
        <span style={{ flex: 1 }} />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-5xl mb-3">💰</div>
          <p style={{ color: 'var(--text-muted)' }}>{subs.length === 0 ? 'No subscriptions tracked yet. Click "New Subscription" to add one.' : 'No subscriptions in this filter.'}</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {sorted.map(s => <SubCard key={s.id} sub={s} onEdit={() => setEditing(s)} onDelete={() => remove(s.id)} onPaid={() => markPaid(s.id)} />)}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Vendor', 'Plan', 'Category', 'Amount', 'Frequency', 'Per Month', 'Next Due', 'Status', 'Method', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {sorted.map(s => {
                const c = categoryOf(s.category)
                const d = daysUntil(s.nextDue)
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--text)' }}>{s.vendor}{s.autoSource && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>auto</span>}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{s.productOrPlan || '-'}</td>
                    <td className="px-3 py-2 text-xs">{c.icon} {c.label}</td>
                    <td className="px-3 py-2 text-sm font-mono">{fmtUSD(s.amount)}</td>
                    <td className="px-3 py-2 text-xs">{s.frequency}</td>
                    <td className="px-3 py-2 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{fmtUSD(monthlyEquivalent(s))}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: d !== null && d < 0 ? 'var(--red)' : d !== null && d <= 7 ? 'var(--amber)' : 'var(--text-muted)' }}>
                      {fmtDate(s.nextDue)}{d !== null && (d < 0 ? ` (${-d}d overdue)` : d <= 30 ? ` (${d}d)` : '')}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: s.status === 'past-due' ? 'var(--red)' : 'var(--text-muted)' }}>{s.status || (s.active === false ? 'paused' : 'active')}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{s.paymentMethod || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      {!s._readOnly && (
                        <ItemActionsMenu
                          label={`Actions for ${s.vendor || s.name || 'subscription'}`}
                          actions={[
                            { label: 'Mark paid', onClick: () => markPaid(s.id) },
                            { label: 'Edit subscription', onClick: () => setEditing(s) },
                            { label: 'Delete subscription', tone: 'danger', onClick: () => remove(s.id) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Create modal */}
      {editing && <SubFormModal sub={editing === 'new' ? null : editing} projects={projects} accounts={accounts} onSave={save} onClose={() => setEditing(null)} />}

      {setupOpen && <VendorSetupModal projects={projects} accounts={accounts} onRun={runVendorSetup} onClose={() => setSetupOpen(false)} />}

      {/* Auto-source status: which providers are wired in, which need credentials, which haven't shipped yet */}
      <div className="rounded-xl p-4 mt-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Auto-pulled sources</div>
          <button onClick={loadAutoSources} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }} disabled={autoLoading}>
            {autoLoading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
        {autoSources.length === 0 && !autoLoading && (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No auto-sources loaded yet.</div>
        )}
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {autoSources.map(s => (
            <div key={s.source} className="px-3 py-2 rounded-lg flex items-center gap-2 text-xs" style={{ background: 'var(--surface2)', border: `1px solid ${s.ok ? 'var(--green)' : s.notImplemented ? 'var(--border)' : 'var(--amber)'}` }}>
              <span style={{ fontSize: 14 }}>{s.ok ? '✓' : s.notImplemented ? '⏳' : '⚠'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{s.vendor}</div>
                <div className="truncate" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  {s.ok ? `${fmtUSD(s.currentMonthCost)} this month` : s.notImplemented ? 'Not yet implemented' : (s.needsCredential ? 'Add credential to enable' : (s.error || 'Failed'))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {failedSources.length > 0 && (
          <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {failedSources.length} source(s) need attention. Check their credentials in your vault.
          </div>
        )}
      </div>
    </div>
  )
}

function pill(active) {
  return {
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  }
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function SubCard({ sub, onEdit, onDelete, onPaid }) {
  const c = categoryOf(sub.category)
  const d = daysUntil(sub.nextDue)
  const dueColor = d === null ? 'var(--text-muted)' : d < 0 ? 'var(--red)' : d <= 7 ? 'var(--amber)' : 'var(--text-muted)'
  const frequency = sub.frequency || 'monthly'
  const frequencyLabel = (FREQUENCIES.find(f => f.id === frequency)?.label || String(frequency)).toLowerCase().replace(/-/g, ' ')
  return (
    <div className="rounded-xl p-3.5 flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: 'var(--surface2)', border: `1px solid ${c.color}`, color: c.color }}>{c.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text)' }}>
            {sub.vendor || sub.name || 'Subscription'}
            {sub.autoSource && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>AUTO</span>}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub.productOrPlan || c.label}</div>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-bold font-mono" style={{ color: 'var(--text)' }}>{fmtUSD(sub.amount)}</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>/ {frequencyLabel.replace('ly', '')}</div>
      </div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {fmtUSD(monthlyEquivalent(sub))}/mo equivalent
      </div>
      <div className="text-xs" style={{ color: dueColor }}>
        Next: {fmtDate(sub.nextDue)}{d !== null && (d < 0 ? ` (${-d}d overdue)` : d === 0 ? ' (today)' : d <= 30 ? ` (in ${d}d)` : '')}
      </div>
      {(sub.paymentMethod || sub.billingType || sub.status) && (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {[sub.status || 'active', sub.billingType, sub.paymentMethod].filter(Boolean).join(' / ')}
        </div>
      )}
      {sub.usedEverywhere ? (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Used everywhere</span>
        </div>
      ) : (sub.links?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sub.links.map(l => (
            <span key={l.kind + l.id} className="text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: l.billable ? 'var(--green-soft)' : 'var(--surface2)', color: l.billable ? 'var(--green)' : 'var(--text-muted)', border: `1px solid ${l.billable ? 'var(--green)' : 'var(--border)'}` }}>
              {l.billable && '💵'}{l.name}
            </span>
          ))}
        </div>
      ))}
      {sub.notes && <div className="text-xs italic line-clamp-2" style={{ color: 'var(--text-muted)' }}>"{sub.notes}"</div>}
      {!sub._readOnly && <div className="flex gap-1 mt-auto pt-2 flex-wrap">
        <ItemActionsMenu
          label={`Actions for ${sub.vendor || sub.name || 'subscription'}`}
          actions={[
            { label: 'Mark paid', onClick: onPaid },
            { label: 'Edit subscription', onClick: onEdit },
            sub.loginUrl ? { label: 'Open vendor login', onClick: () => window.open(sub.loginUrl, '_blank', 'noopener,noreferrer') } : null,
            { label: 'Delete subscription', tone: 'danger', onClick: onDelete },
          ]}
        />
      </div>}
    </div>
  )
}

function SubFormModal({ sub, projects = [], accounts = [], onSave, onClose }) {
  const [form, setForm] = useState(sub || {
    vendor: '', productOrPlan: '', category: 'other', amount: '', currency: 'USD',
    frequency: 'monthly', billingType: 'fixed', billingDayOfMonth: '', lastChargeDate: '',
    nextDue: '', status: 'active', paymentMethod: '', businessEntity: '', projectOrProduct: '',
    minObservedAmount: '', maxObservedAmount: '', avgMonthlyAmount: '', last3Charges: '',
    loginUrl: '', notes: '', active: true, links: [], usedEverywhere: false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Multi-project tagging helpers. A link is { kind, id, name, billable }.
  const links = form.links || []
  const findLink = (kind, id) => links.find(l => l.kind === kind && l.id === id)
  const toggleLink = (kind, id, name) => {
    const exists = findLink(kind, id)
    set('links', exists ? links.filter(l => !(l.kind === kind && l.id === id)) : [...links, { kind, id, name, billable: false }])
  }
  const setBillable = (kind, id, billable) =>
    set('links', links.map(l => (l.kind === kind && l.id === id ? { ...l, billable } : l)))
  const submit = (e) => {
    e?.preventDefault()
    if (!form.vendor) return
    onSave({
      ...form,
      amount: Number(form.amount) || 0,
      billingDayOfMonth: form.billingDayOfMonth ? Number(form.billingDayOfMonth) : null,
      minObservedAmount: form.minObservedAmount === '' ? null : Number(form.minObservedAmount),
      maxObservedAmount: form.maxObservedAmount === '' ? null : Number(form.maxObservedAmount),
      avgMonthlyAmount: form.avgMonthlyAmount === '' ? null : Number(form.avgMonthlyAmount),
    })
  }
  const fieldStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, fontSize: 13.5, outline: 'none', width: '100%', minHeight: 40 }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg rounded-xl p-5 max-h-[92vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>{sub ? 'Edit subscription' : 'New subscription'}</h2>
        <div className="grid gap-3">
          <Field label="Vendor / Service"><input style={fieldStyle} value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Adobe Creative Cloud" required /></Field>
          <Field label="Product / Plan"><input style={fieldStyle} value={form.productOrPlan || ''} onChange={e => set('productOrPlan', e.target.value)} placeholder="e.g. Claude Pro" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><input type="number" step="0.01" min="0" style={fieldStyle} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" required /></Field>
            <Field label="Currency"><input style={fieldStyle} value={form.currency || 'USD'} onChange={e => set('currency', e.target.value.toUpperCase())} placeholder="USD" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <ThemedSelect style={fieldStyle} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </ThemedSelect>
            </Field>
            <Field label="Billing type">
              <ThemedSelect style={fieldStyle} value={form.billingType || 'fixed'} onChange={e => set('billingType', e.target.value)}>
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
                <option value="pay-as-you-go">Pay-as-you-go</option>
                <option value="prepaid-credit">Prepaid credit</option>
              </ThemedSelect>
            </Field>
          </div>
          <Field label="Category">
            <ThemedSelect style={fieldStyle} value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </ThemedSelect>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Billing day"><input type="number" min="1" max="31" style={fieldStyle} value={form.billingDayOfMonth || ''} onChange={e => set('billingDayOfMonth', e.target.value)} /></Field>
            <Field label="Last charge"><input type="date" style={fieldStyle} value={form.lastChargeDate || ''} onChange={e => set('lastChargeDate', e.target.value)} /></Field>
            <Field label="Next charge"><input type="date" style={fieldStyle} value={form.nextDue || ''} onChange={e => set('nextDue', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <ThemedSelect style={fieldStyle} value={form.status || (form.active === false ? 'paused' : 'active')} onChange={e => { set('status', e.target.value); set('active', !['canceled', 'paused'].includes(e.target.value)) }}>
                <option value="active">Active</option>
                <option value="past-due">Past due</option>
                <option value="canceled">Canceled</option>
                <option value="paused">Paused</option>
              </ThemedSelect>
            </Field>
            <Field label="Payment method"><input style={fieldStyle} value={form.paymentMethod || ''} onChange={e => set('paymentMethod', e.target.value)} placeholder="MC 6918 / PayPal / Link" /></Field>
          </div>
          <Field label="Business entity"><input style={fieldStyle} value={form.businessEntity || ''} onChange={e => set('businessEntity', e.target.value)} /></Field>

          {/* Multi-project tagging — which projects/clients use this vendor, and what's billable to them */}
          <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Used in which projects / clients?</div>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={form.usedEverywhere === true} onChange={e => set('usedEverywhere', e.target.checked)} style={{ width: 18, height: 18 }} />
              Used across <strong>everything</strong> (e.g. Cloudflare) — skip tagging each one
            </label>
            {!form.usedEverywhere && (
              <div className="grid gap-1.5 mt-1" style={{ maxHeight: 260, overflow: 'auto' }}>
                {projects.length === 0 && accounts.length === 0 && (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No projects or clients found yet.</div>
                )}
                {[
                  ...projects.map(p => ({ kind: 'project', id: p.id, name: p.name || p.id })),
                  ...accounts.map(a => ({ kind: 'account', id: a.id, name: a.name || a.id })),
                ].map(item => {
                  const link = findLink(item.kind, item.id)
                  return (
                    <div key={item.kind + item.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: link ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${link ? 'var(--accent)' : 'var(--border)'}` }}>
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-sm" style={{ color: 'var(--text)' }}>
                        <input type="checkbox" checked={!!link} onChange={() => toggleLink(item.kind, item.id, item.name)} style={{ width: 18, height: 18 }} />
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>{item.kind === 'project' ? 'PROJECT' : 'CLIENT'}</span>
                        <span className="truncate">{item.name}</span>
                      </label>
                      {link && (
                        <label className="flex items-center gap-1 text-xs shrink-0 cursor-pointer" style={{ color: link.billable ? 'var(--green)' : 'var(--text-muted)' }}>
                          <input type="checkbox" checked={!!link.billable} onChange={e => setBillable(item.kind, item.id, e.target.checked)} style={{ width: 16, height: 16 }} />
                          Billable
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Min observed"><input type="number" step="0.01" min="0" style={fieldStyle} value={form.minObservedAmount ?? ''} onChange={e => set('minObservedAmount', e.target.value)} /></Field>
            <Field label="Max observed"><input type="number" step="0.01" min="0" style={fieldStyle} value={form.maxObservedAmount ?? ''} onChange={e => set('maxObservedAmount', e.target.value)} /></Field>
            <Field label="Avg monthly"><input type="number" step="0.01" min="0" style={fieldStyle} value={form.avgMonthlyAmount ?? ''} onChange={e => set('avgMonthlyAmount', e.target.value)} /></Field>
          </div>
          <Field label="Login URL (optional)">
            <input type="url" style={fieldStyle} value={form.loginUrl} onChange={e => set('loginUrl', e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Notes (optional)">
            <textarea style={{ ...fieldStyle, minHeight: 60 }} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
          {sub && (
            <Field label="">
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={form.active !== false} onChange={e => set('active', e.target.checked)} />
                Active subscription
              </label>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 40 }}>Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', minHeight: 40 }}>{sub ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </div>
  )
}

function VendorSetupModal({ projects = [], accounts = [], onRun, onClose }) {
  const [cfg, setCfg] = useState({ vendor: '', productOrPlan: '', category: 'other', amount: '', frequency: 'monthly', loginUrl: '', target: '', billable: false, notes: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  const targets = [
    ...projects.map(p => ({ key: `project:${p.id}`, kind: 'project', id: p.id, name: p.name || p.id })),
    ...accounts.map(a => ({ key: `account:${a.id}`, kind: 'account', id: a.id, name: a.name || a.id })),
  ]
  const chosen = targets.find(t => t.key === cfg.target) || null
  const fieldStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, fontSize: 13.5, outline: 'none', width: '100%', minHeight: 40 }
  const submit = async (e) => {
    e?.preventDefault()
    if (!cfg.vendor || busy) return
    setBusy(true)
    await onRun({ ...cfg, link: chosen ? { kind: chosen.kind, id: chosen.id, name: chosen.name } : null })
    setBusy(false)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg rounded-xl p-5 max-h-[92vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text)' }}>Set up a vendor account</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Adds it to Overhead and creates a standard setup checklist task — same steps every time.</p>
        <div className="grid gap-3">
          <Field label="Vendor / Service"><input style={fieldStyle} value={cfg.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Cloudflare" required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan (optional)"><input style={fieldStyle} value={cfg.productOrPlan} onChange={e => set('productOrPlan', e.target.value)} placeholder="e.g. Pro" /></Field>
            <Field label="Category">
              <ThemedSelect style={fieldStyle} value={cfg.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </ThemedSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost (optional)"><input type="number" step="0.01" min="0" style={fieldStyle} value={cfg.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" /></Field>
            <Field label="Frequency">
              <ThemedSelect style={fieldStyle} value={cfg.frequency} onChange={e => set('frequency', e.target.value)}>
                {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </ThemedSelect>
            </Field>
          </div>
          <Field label="Who is this for?">
            <ThemedSelect style={fieldStyle} value={cfg.target} onChange={e => set('target', e.target.value)}>
              <option value="">Used everywhere (in-house, no specific client)</option>
              {projects.length > 0 && <optgroup label="Projects">{projects.map(p => <option key={p.id} value={`project:${p.id}`}>{p.name || p.id}</option>)}</optgroup>}
              {accounts.length > 0 && <optgroup label="Clients">{accounts.map(a => <option key={a.id} value={`account:${a.id}`}>{a.name || a.id}</option>)}</optgroup>}
            </ThemedSelect>
          </Field>
          {chosen && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: cfg.billable ? 'var(--green)' : 'var(--text)' }}>
              <input type="checkbox" checked={cfg.billable} onChange={e => set('billable', e.target.checked)} style={{ width: 18, height: 18 }} />
              💵 Billable to {chosen.name} — put it on their invoice
            </label>
          )}
          <Field label="Notes (optional)"><textarea style={{ ...fieldStyle, minHeight: 48 }} value={cfg.notes} onChange={e => set('notes', e.target.value)} placeholder="What's it for?" /></Field>
          <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>The task will include these steps:</div>
            <ol className="text-xs space-y-1" style={{ color: 'var(--text-muted)', listStyle: 'decimal', paddingLeft: 18 }}>
              {VENDOR_SETUP_STEPS.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 44 }}>Cancel</button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', minHeight: 44 }}>{busy ? 'Setting up…' : 'Create setup task'}</button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      {label && <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>}
      {children}
    </label>
  )
}
