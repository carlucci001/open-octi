'use client'
import { useState, useEffect } from 'react'
import ViewModeToggle from '../components/ViewModeToggle'

const CAT_COLORS = { 'AI Providers': 'var(--accent)', 'Payment Processing': 'var(--green)', 'Hosting & Domains': 'var(--peach)', Database: 'var(--purple)', Cloud: 'var(--teal)', Other: 'var(--text-muted)' }
const STATUS_STYLES = {
  active: { bg: 'rgba(166,227,161,0.15)', color: 'var(--green)', label: 'Active' },
  error: { bg: 'rgba(243,139,168,0.15)', color: 'var(--red)', label: 'Error' },
  no_api: { bg: 'rgba(127,132,156,0.15)', color: 'var(--text-muted)', label: 'No Usage API' },
  no_key: { bg: 'rgba(249,226,175,0.15)', color: 'var(--amber)', label: 'No Key' },
}

function fmt$(v) { if (v == null) return '—'; return '$' + Number(v).toFixed(2) }
function fmtPct(v) { if (v == null) return ''; return v + '%' }
function fmtDate(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

function UsageBar({ used, limit, label, warn }) {
  if (!limit) return null
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const c = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--green)'
  return (
    <div className="mt-2">
      {label && <div className="flex justify-between text-[10px] mb-1"><span style={{ color: 'var(--text-muted)' }}>{label}</span><span style={{ color: c }}>{pct}%</span></div>}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: pct + '%', background: c }} />
      </div>
    </div>
  )
}

function ProviderCard({ r }) {
  const ss = STATUS_STYLES[r.status] || STATUS_STYLES.no_api
  const cc = CAT_COLORS[r.category] || CAT_COLORS.Other

  return (
    <div className="rounded-xl p-5 transition-all" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.name}</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.category}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${cc}18`, color: cc }}>{r.provider}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: ss.bg, color: ss.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ss.color }} />{ss.label}
          </span>
        </div>
      </div>

      {/* Error */}
      {r.error && <div className="text-xs p-2 rounded-lg mb-3" style={{ background: 'rgba(243,139,168,0.1)', color: 'var(--red)' }}>{r.error}</div>}

      {/* Plan */}
      {r.plan && <div className="text-xs mb-2"><span style={{ color: 'var(--text-muted)' }}>Plan: </span><span className="font-semibold" style={{ color: 'var(--text)' }}>{r.plan}</span></div>}

      {/* Cost breakdown (OpenAI, etc.) */}
      {(r.usage?.costToday != null || r.usage?.cost7d != null || r.usage?.cost30d != null) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--surface2)' }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Today</div>
            <div className="text-sm font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt$(r.usage.costToday)}</div>
          </div>
          <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--surface2)' }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>7 Days</div>
            <div className="text-sm font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt$(r.usage.cost7d)}</div>
          </div>
          <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--surface2)' }}>
            <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>30 Days</div>
            <div className="text-sm font-bold font-mono" style={{ color: 'var(--accent)' }}>{fmt$(r.usage.cost30d)}</div>
          </div>
        </div>
      )}

      {/* ElevenLabs character usage */}
      {r.usage?.charactersUsed != null && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-muted)' }}>Characters</span>
            <span style={{ color: 'var(--text)' }}>{r.usage.charactersUsed.toLocaleString()} / {r.usage.characterLimit?.toLocaleString() || '∞'}</span>
          </div>
          <UsageBar used={r.usage.charactersUsed} limit={r.usage.characterLimit} />
          {r.limits?.nextReset && <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Resets {fmtDate(r.limits.nextReset)}</div>}
          {r.billing?.nextInvoice != null && <div className="text-xs mt-2"><span style={{ color: 'var(--text-muted)' }}>Next invoice: </span><span className="font-mono font-semibold" style={{ color: 'var(--amber)' }}>{fmt$(r.billing.nextInvoice)}</span></div>}
        </div>
      )}

      {/* OpenRouter credits */}
      {r.usage?.creditsRemaining != null && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-muted)' }}>Credits</span>
            <span className="font-mono" style={{ color: r.usage.creditsRemaining < 1 ? 'var(--red)' : 'var(--green)' }}>{fmt$(r.usage.creditsRemaining)} remaining</span>
          </div>
          {r.usage.totalSpent != null && <div className="text-xs"><span style={{ color: 'var(--text-muted)' }}>Total spent: </span><span className="font-mono" style={{ color: 'var(--text)' }}>{fmt$(r.usage.totalSpent)}</span></div>}
          {r.limits?.creditLimit != null && <UsageBar used={r.usage.totalSpent || 0} limit={r.limits.creditLimit} label="Credit usage" />}
        </div>
      )}

      {/* Stripe balance */}
      {r.usage?.available && (
        <div>
          {r.usage.available.map((a, i) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Available ({a.currency?.toUpperCase()})</span>
              <span className="font-mono font-bold" style={{ color: 'var(--green)' }}>{fmt$(a.amount)}</span>
            </div>
          ))}
          {r.usage.pending?.map((p, i) => (
            <div key={i} className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Pending ({p.currency?.toUpperCase()})</span>
              <span className="font-mono" style={{ color: 'var(--amber)' }}>{fmt$(p.amount)}</span>
            </div>
          ))}
          {r.usage.recentCharges?.length > 0 && (
            <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="text-[10px] uppercase mb-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Recent Charges</div>
              {r.usage.recentCharges.map((ch, i) => (
                <div key={i} className="flex justify-between text-xs mb-1">
                  <span style={{ color: 'var(--text)' }}>{ch.description || 'Charge'}</span>
                  <span className="font-mono" style={{ color: ch.status === 'succeeded' ? 'var(--green)' : 'var(--amber)' }}>{fmt$(ch.amount)} {ch.currency?.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GoDaddy domains */}
      {r.usage?.totalDomains != null && (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--surface2)' }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Total</div>
              <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{r.usage.totalDomains}</div>
            </div>
            <div className="rounded-lg p-2.5 text-center" style={{ background: 'var(--surface2)' }}>
              <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Active</div>
              <div className="text-lg font-bold" style={{ color: 'var(--green)' }}>{r.usage.activeDomains}</div>
            </div>
          </div>
          {r.usage.expiringSoon?.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: 'rgba(243,139,168,0.08)', border: '1px solid rgba(243,139,168,0.2)' }}>
              <div className="text-[10px] uppercase mb-1.5 font-semibold" style={{ color: 'var(--red)' }}>Expiring in 30 days</div>
              {r.usage.expiringSoon.map((d, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="font-mono" style={{ color: 'var(--text)' }}>{d.domain}</span>
                  <span style={{ color: 'var(--red)' }}>{fmtDate(d.expires)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OpenAI / Anthropic limits */}
      {r.limits?.hardLimit != null && (
        <div className="mt-2">
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Hard limit</span>
            <span className="font-mono" style={{ color: 'var(--text)' }}>{fmt$(r.limits.hardLimit)}</span>
          </div>
          {r.usage?.cost30d != null && r.limits.hardLimit && <UsageBar used={r.usage.cost30d} limit={r.limits.hardLimit} label="Monthly spend vs limit" />}
        </div>
      )}

      {/* Generic info / notes */}
      {r.info && !r.error && <div className="text-xs mt-2" style={{ color: 'var(--text)' }}>{r.info}</div>}
      {r.note && <div className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>{r.note}</div>}
    </div>
  )
}

function UsageSummary({ r }) {
  if (r.usage?.costToday != null || r.usage?.cost7d != null || r.usage?.cost30d != null) return <span className="font-mono">{fmt$(r.usage.cost30d)} <span style={{ color: 'var(--text-muted)' }}>/30d</span></span>
  if (r.usage?.creditsRemaining != null) return <span className="font-mono" style={{ color: r.usage.creditsRemaining < 5 ? 'var(--red)' : 'var(--green)' }}>{fmt$(r.usage.creditsRemaining)} left</span>
  if (r.usage?.charactersUsed != null) return <span className="font-mono">{fmtPct(r.usage.percentUsed)} used</span>
  if (r.usage?.available) return <span className="font-mono" style={{ color: 'var(--green)' }}>{fmt$(r.usage.available[0]?.amount)}</span>
  if (r.usage?.totalDomains != null) return <span>{r.usage.activeDomains} active</span>
  return <span style={{ color: 'var(--text-muted)' }}>—</span>
}

export default function UsageDashboard({ creds, onAdd, onEdit, onDelete, onTest, testing, onRefresh }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState(null)
  const [view, setView] = useState('list')
  const [expanded, setExpanded] = useState(null)

  const fetchUsage = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/credentials/usage', { method: 'POST' }).then(r => r.json())
      setData(r.results || [])
      setLastFetch(r.fetchedAt)
    } catch { setData([]) }
    setLoading(false)
  }

  useEffect(() => { fetchUsage() }, [])

  // Merge usage data with creds for CRUD
  const merged = (creds || []).map(c => {
    const u = (data || []).find(d => d.id === c.id) || {}
    return { ...c, ...u, credRecord: c }
  })

  // Group by category
  const groups = {}
  for (const r of merged) {
    const cat = r.category || 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(r)
  }

  // Summary stats
  const active = merged.filter(r => r.status === 'active').length
  const errors = merged.filter(r => r.status === 'error').length
  const totalCost30d = merged.reduce((s, r) => s + (r.usage?.cost30d || 0), 0)
  const lowCredits = merged.filter(r => r.usage?.creditsRemaining != null && r.usage.creditsRemaining < 5)
  const highUsage = merged.filter(r => r.usage?.percentUsed != null && r.usage.percentUsed >= 80)
  const expiringDomains = merged.reduce((s, r) => s + (r.usage?.expiringSoon?.length || 0), 0)

  return (
    <div>
      {/* Sub-header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Real-time status across {merged.length} services
            {lastFetch && <span> · Updated {new Date(lastFetch).toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <ViewModeToggle value={view} onChange={setView} modes={['card', 'list']} />
          <button onClick={fetchUsage} disabled={loading} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', opacity: loading ? 0.6 : 1 }}>{loading ? '⟳ Fetching...' : '⟳ Refresh Usage'}</button>
          <button onClick={onAdd} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>+ Add Credential</button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Active Services</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--green)' }}>{active}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>30-Day Spend</div>
          <div className="text-2xl font-bold font-mono" style={{ color: 'var(--accent)' }}>{fmt$(totalCost30d)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${errors > 0 ? 'var(--red)' : 'var(--border)'}` }}>
          <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Errors</div>
          <div className="text-2xl font-bold" style={{ color: errors > 0 ? 'var(--red)' : 'var(--green)' }}>{errors}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${(lowCredits.length + highUsage.length + expiringDomains) > 0 ? 'var(--amber)' : 'var(--border)'}` }}>
          <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Alerts</div>
          <div className="text-2xl font-bold" style={{ color: (lowCredits.length + highUsage.length + expiringDomains) > 0 ? 'var(--amber)' : 'var(--green)' }}>{lowCredits.length + highUsage.length + expiringDomains}</div>
        </div>
      </div>

      {/* Alerts */}
      {(lowCredits.length > 0 || highUsage.length > 0) && (
        <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(249,226,175,0.08)', border: '1px solid rgba(249,226,175,0.25)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--amber)' }}>⚠ Attention Required</div>
          {lowCredits.map(r => <div key={r.id} className="text-xs mb-1" style={{ color: 'var(--text)' }}><strong>{r.name}</strong> — {fmt$(r.usage.creditsRemaining)} credits remaining</div>)}
          {highUsage.map(r => <div key={r.id} className="text-xs mb-1" style={{ color: 'var(--text)' }}><strong>{r.name}</strong> — {r.usage.percentUsed}% of limit used</div>)}
        </div>
      )}

      {/* Loading */}
      {loading && !data && <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Fetching usage data from all providers...</div>}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Service</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Category</th>
                <th className="text-center px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Plan</th>
                <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Usage / Balance</th>
                <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {merged.map(r => {
                const ss = STATUS_STYLES[r.status] || STATUS_STYLES.no_api
                const cc = CAT_COLORS[r.category] || CAT_COLORS.Other
                const isExp = expanded === r.id
                return (
                  <tr key={r.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td className="px-4 py-3">
                      <button className="text-left" onClick={() => setExpanded(isExp ? null : r.id)}>
                        <div className="font-semibold" style={{ color: 'var(--text)' }}>{r.name}</div>
                        {r.description && <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.description}</div>}
                      </button>
                    </td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${cc}18`, color: cc }}>{r.category}</span></td>
                    <td className="px-4 py-3 text-center"><span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: ss.bg, color: ss.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: ss.color }} />{ss.label}</span></td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text)' }}>{r.plan || '—'}</td>
                    <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text)' }}><UsageSummary r={r} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button disabled={testing?.[r.id]} onClick={() => onTest(r.id)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--green)', opacity: testing?.[r.id] ? 0.5 : 1 }}>{testing?.[r.id] ? '...' : 'Test'}</button>
                        <button onClick={() => onEdit(r.credRecord)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>Edit</button>
                        <button onClick={() => onDelete(r.id)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CARD VIEW ── */}
      {view === 'card' && Object.entries(groups).map(([cat, items]) => (
        <div key={cat} className="mb-6">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: CAT_COLORS[cat] || 'var(--text-muted)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[cat] || 'var(--text-muted)' }} />
            {cat}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map(r => (
              <div key={r.id}>
                <ProviderCard r={r} />
                <div className="flex gap-1 mt-2 justify-end">
                  <button disabled={testing?.[r.id]} onClick={() => onTest(r.id)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--green)', opacity: testing?.[r.id] ? 0.5 : 1 }}>{testing?.[r.id] ? 'Testing...' : 'Test'}</button>
                  <button onClick={() => onEdit(r.credRecord)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>Edit</button>
                  <button onClick={() => onDelete(r.id)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
