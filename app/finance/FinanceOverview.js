'use client'
import { useState, useEffect } from 'react'

const fmtUSD = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const isPaidPayment = p => ['succeeded', 'received', 'paid'].includes(String(p?.status || '').toLowerCase())

function monthlyEquivalent(sub) {
  if (sub.frequency === 'usage-based' && sub.avgMonthlyAmount != null && sub.avgMonthlyAmount !== '') {
    return Number(sub.avgMonthlyAmount) || 0
  }
  const amount = Number(sub.amount) || 0
  if (sub.frequency === 'yearly') return amount / 12
  if (sub.frequency === 'quarterly') return amount / 3
  if (sub.frequency === 'weekly') return amount * 52 / 12
  if (sub.frequency === 'one-time') return 0
  return amount
}

// Notification state lives in localStorage so it survives reloads.
// `seen` clears the sidebar badge automatically when the user opens this tab.
// `dismissed` is the manual X button — hides the item from the Coming Due panel
// AND keeps the badge clear for it. "Restore" wipes the dismissed list.
const SEEN_KEY = 'fcc-finance-alerts-seen'
const DISMISSED_KEY = 'fcc-finance-alerts-dismissed'

function readKeys(storageKey) {
  try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
}
function writeKeys(storageKey, set) {
  try { localStorage.setItem(storageKey, JSON.stringify([...set])) } catch {}
  window.dispatchEvent(new CustomEvent('fcc:finance-alerts-changed'))
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export default function FinanceOverview({ onJump }) {
  const [loading, setLoading] = useState(true)
  const [overhead, setOverhead] = useState({ total: 0, sourcesTracked: 0, soon: [] })
  const [invoices, setInvoices] = useState({ unpaidCount: 0, outstanding: 0, overdue: [], dueSoon: [] })
  const [payments, setPayments] = useState({ recent30Total: 0, recent30Count: 0, latest: [] })
  const [dismissed, setDismissed] = useState(() => readKeys(DISMISSED_KEY))

  useEffect(() => {
    let cancel = false
    const load = async () => {
      setLoading(true)
      try {
        const [oh, subsData, inv, pay] = await Promise.all([
          fetch('/api/overhead/sources').then(r => r.json()).catch(() => null),
          fetch('/api/subscriptions').then(r => r.json()).catch(() => null),
          fetch('/api/invoices').then(r => r.json()).catch(() => null),
          fetch('/api/payments').then(r => r.json()).catch(() => null),
        ])
        if (cancel) return

        const ohSources = oh?.sources || []
        const manualSubs = (subsData?.subscriptions || [])
          .filter(s => s.active !== false)
          .map(s => ({
            ok: true,
            source: s.id,
            vendor: s.vendor,
            currentMonthCost: monthlyEquivalent(s),
            nextDue: s.nextDue,
            frequency: s.frequency,
            manual: true,
          }))
        const overheadItems = [...ohSources, ...manualSubs]
        const ohTotal = overheadItems.reduce((s, r) => s + (Number(r.currentMonthCost) || 0), 0)
        const ohSoon = overheadItems.filter(r => {
          if (!r.ok || !r.nextDue) return false
          const d = daysUntil(r.nextDue)
          return d !== null && d <= 7
        })
        setOverhead({ total: ohTotal, sourcesTracked: overheadItems.filter(s => s.ok).length, soon: ohSoon })

        const invList = inv?.invoices || []
        const unpaid = invList.filter(i => i.status !== 'paid')
        const outstanding = unpaid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
        const overdue = unpaid.filter(i => i.dueDate && daysUntil(i.dueDate) < 0)
        const dueSoon = unpaid.filter(i => i.dueDate && daysUntil(i.dueDate) >= 0 && daysUntil(i.dueDate) <= 7)
        setInvoices({ unpaidCount: unpaid.length, outstanding, overdue, dueSoon })

        const payList = pay?.payments || []
        const cutoff = Date.now() - 30 * 86400000
        const recent = payList.filter(p => isPaidPayment(p) && new Date(p.date).getTime() >= cutoff)
        const recentTotal = recent.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        const latest = [...payList].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)
        setPayments({ recent30Total: recentTotal, recent30Count: recent.length, latest })
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => { cancel = true }
  }, [])

  // Mark all current alerts as seen so the sidebar badge clears the moment Carl
  // opens this tab. (Items still appear in the panel below — only the badge clears.)
  useEffect(() => {
    if (loading) return
    const seen = readKeys(SEEN_KEY)
    let changed = false
    for (const a of [...invoices.overdue, ...invoices.dueSoon].map(i => 'inv-' + i.id)) {
      if (!seen.has(a)) { seen.add(a); changed = true }
    }
    for (const a of overhead.soon.map(r => 'oh-' + r.source)) {
      if (!seen.has(a)) { seen.add(a); changed = true }
    }
    if (changed) writeKeys(SEEN_KEY, seen)
  }, [loading, invoices.overdue, invoices.dueSoon, overhead.soon])

  const dismissAlert = (key) => {
    const next = new Set(dismissed)
    next.add(key)
    setDismissed(next)
    writeKeys(DISMISSED_KEY, next)
  }
  const restoreAll = () => {
    setDismissed(new Set())
    writeKeys(DISMISSED_KEY, new Set())
  }

  const alerts = [
    ...invoices.overdue.map(i => ({
      key: 'inv-' + i.id,
      severity: 'red',
      icon: '🧾',
      label: `${i.clientName || 'Client'} · ${i.number || 'Invoice'}`,
      detail: `${fmtUSD(i.amount)} · ${Math.abs(daysUntil(i.dueDate))} day${Math.abs(daysUntil(i.dueDate)) === 1 ? '' : 's'} overdue`,
      jump: 'invoices',
    })),
    ...invoices.dueSoon.map(i => ({
      key: 'inv-' + i.id,
      severity: 'amber',
      icon: '🧾',
      label: `${i.clientName || 'Client'} · ${i.number || 'Invoice'}`,
      detail: `${fmtUSD(i.amount)} · due in ${daysUntil(i.dueDate)} day${daysUntil(i.dueDate) === 1 ? '' : 's'}`,
      jump: 'invoices',
    })),
    ...overhead.soon.map(r => {
      const d = daysUntil(r.nextDue)
      return {
        key: 'oh-' + r.source,
        severity: d < 0 ? 'red' : 'amber',
        icon: '💸',
        label: r.vendor || r.source,
        detail: `${fmtUSD(r.currentMonthCost)} · ${d < 0 ? `renewed ${Math.abs(d)}d ago` : `renews in ${d}d`}`,
        jump: 'overhead',
      }
    }),
  ]

  const card = (onClick, title, value, sub, tint) => (
    <button
      onClick={onClick}
      className="text-left rounded-xl transition"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        minHeight: 96,
        padding: 14,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)' }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0, marginBottom: 6, fontWeight: 650 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 750, color: tint || 'var(--text)', lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>
    </button>
  )

  return (
    <div className="p-4 sm:p-5">
      {(() => {
        const visibleAlerts = alerts.filter(a => !dismissed.has(a.key))
        const hiddenCount = alerts.length - visibleAlerts.length
        if (visibleAlerts.length === 0 && hiddenCount === 0) return null
        return (
          <div className="mb-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 14 }}>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span style={{ fontSize: 22 }}>🔔</span>
                <h2 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 650, margin: 0 }}>Coming Due</h2>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {visibleAlerts.length === 0
                    ? 'all caught up'
                    : `${visibleAlerts.length} item${visibleAlerts.length === 1 ? '' : 's'} need attention`}
                </span>
              </div>
              {hiddenCount > 0 && (
                <button
                  onClick={restoreAll}
                  style={{ padding: '6px 10px', minHeight: 32, fontSize: 12.5, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 8, cursor: 'pointer' }}
                >
                  Restore {hiddenCount} dismissed
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {visibleAlerts.map(a => (
                <div
                  key={a.key}
                  className="w-full flex items-center justify-between rounded-lg transition"
                  style={{
                    padding: '4px 6px 4px 0',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderLeft: `4px solid ${a.severity === 'red' ? '#dc2626' : '#d97706'}`,
                    minHeight: 46,
                  }}
                >
                  <button
                    onClick={() => onJump(a.jump)}
                    className="flex-1 flex items-center justify-between text-left"
                    style={{ padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 18 }}>{a.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{a.detail}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>›</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissAlert(a.key) }}
                    aria-label="Dismiss this alert"
                    title="Dismiss this alert (hide from panel + clear from badge)"
                    style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'transparent', border: 'none',
                      color: 'var(--text-muted)', cursor: 'pointer',
                      fontSize: 18, lineHeight: 1, flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {visibleAlerts.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 4px' }}>
                  Nothing pending. {hiddenCount > 0 && 'Click "Restore" above to bring back dismissed items.'}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {card(
          () => onJump('overhead'),
          '💸 Overhead this month',
          loading ? '…' : fmtUSD(overhead.total),
          `${overhead.sourcesTracked} source${overhead.sourcesTracked === 1 ? '' : 's'} tracked${overhead.soon.length ? ` · ${overhead.soon.length} due soon` : ''}`,
          null,
        )}
        {card(
          () => onJump('invoices'),
          '🧾 Outstanding invoices',
          loading ? '…' : fmtUSD(invoices.outstanding),
          `${invoices.unpaidCount} unpaid${invoices.overdue.length ? ` · ${invoices.overdue.length} overdue` : ''}`,
          invoices.overdue.length > 0 ? '#dc2626' : null,
        )}
        {card(
          () => onJump('payments'),
          '💳 Payments received (30d)',
          loading ? '…' : fmtUSD(payments.recent30Total),
          `${payments.recent30Count} payment${payments.recent30Count === 1 ? '' : 's'}`,
          null,
        )}
      </div>

      {payments.latest.length > 0 && (
        <div className="mt-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 14 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 650, margin: 0 }}>Recent payments</h2>
            <button
              onClick={() => onJump('payments')}
              style={{ fontSize: 12.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
            >
              View all →
            </button>
          </div>
          <div>
            {payments.latest.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between"
                style={{
                  padding: '9px 0',
                  borderBottom: i === payments.latest.length - 1 ? 'none' : '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{p.clientName || 'Unknown'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    {p.description || p.type || 'Payment'} · {new Date(p.date).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)' }}>{fmtUSD(p.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
