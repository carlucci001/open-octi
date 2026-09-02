'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, Save } from 'lucide-react'

const GROUPS = [['agent', 'Agent'], ['client', 'Client'], ['product', 'Product']]

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value || 0))
}

function rangeFor(period) {
  const end = new Date()
  const start = new Date(end)
  if (period === 'month') start.setUTCDate(1)
  else start.setUTCDate(start.getUTCDate() - Number(period))
  start.setUTCHours(0, 0, 0, 0)
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function UsageAttribution() {
  const [groupBy, setGroupBy] = useState('agent')
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState(null)
  const [thresholds, setThresholds] = useState({ agentMonthlyUsd: {}, clientMonthlyUsd: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = rangeFor(period)
      const query = new URLSearchParams({ ...range, groupBy })
      const response = await fetch(`/api/usage?${query}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || body.ok === false) throw new Error(body.error || 'Usage attribution unavailable')
      setData(body)
      setThresholds({
        agentMonthlyUsd: body.settings?.agentMonthlyUsd || {},
        clientMonthlyUsd: body.settings?.clientMonthlyUsd || {},
      })
    } catch (cause) {
      setError(cause?.message || 'Usage attribution unavailable')
    } finally {
      setLoading(false)
    }
  }, [groupBy, period])

  useEffect(() => { void refresh() }, [refresh])

  const thresholdKey = groupBy === 'agent' ? 'agentMonthlyUsd' : groupBy === 'client' ? 'clientMonthlyUsd' : ''
  const rows = data?.groups || []
  const hasUnknown = useMemo(() => rows.some(row => row.unknown), [rows])

  const changeThreshold = (id, raw) => {
    const value = Math.max(0, Number(raw) || 0)
    setThresholds(current => ({ ...current, [thresholdKey]: { ...current[thresholdKey], [id]: value } }))
  }

  const saveThresholds = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(thresholds) })
      const body = await response.json()
      if (!response.ok || body.ok === false) throw new Error(body.error || 'Could not save thresholds')
      setThresholds({ agentMonthlyUsd: body.settings?.agentMonthlyUsd || {}, clientMonthlyUsd: body.settings?.clientMonthlyUsd || {} })
    } catch (cause) {
      setError(cause?.message || 'Could not save thresholds')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="Usage attribution" className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Attributed usage</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Estimated model and media cost by the agent, client, or product that caused it.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold" htmlFor="usage-period">Period</label>
          <select id="usage-period" aria-label="Attribution period" value={period} onChange={event => setPeriod(event.target.value)} className="min-h-10 rounded-lg px-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <option value="month">This month</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button type="button" onClick={refresh} aria-label="Refresh attribution" data-tooltip="Refresh attribution" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg" style={{ border: '1px solid var(--border)' }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div role="tablist" aria-label="Attribution grouping" className="mb-3 flex gap-2">
        {GROUPS.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={groupBy === value} onClick={() => setGroupBy(value)} className="min-h-10 rounded-lg px-4 text-sm font-bold" style={{ border: '1px solid var(--border)', background: groupBy === value ? 'var(--accent-soft)' : 'var(--surface)' }}>{label}</button>)}
      </div>

      {error && <div role="alert" className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ color: 'var(--red)', background: 'var(--red-soft)' }}>{error}</div>}
      {hasUnknown && <div className="mb-3 flex gap-2 rounded-lg px-3 py-2 text-xs" style={{ color: 'var(--amber)', background: 'var(--amber-soft)' }}><AlertTriangle size={15} /><span>Some events use models without a maintained price. Known cost remains visible and the total is marked incomplete.</span></div>}

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-left text-sm">
          <thead style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}><tr><th className="px-3 py-2">{GROUPS.find(item => item[0] === groupBy)?.[1]}</th><th className="px-3 py-2 text-right">Events</th><th className="px-3 py-2 text-right">Tokens</th><th className="px-3 py-2 text-right">Estimated cost</th>{thresholdKey && <th className="px-3 py-2 text-right">Monthly alert</th>}</tr></thead>
          <tbody>
            {loading && !rows.length && <tr><td colSpan={thresholdKey ? 5 : 4} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading attribution…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={thresholdKey ? 5 : 4} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No usage events in this period.</td></tr>}
            {rows.map(row => <tr key={row.key} style={{ borderTop: '1px solid var(--border)' }}><td className="px-3 py-3 font-bold">{row.key}</td><td className="px-3 py-3 text-right">{row.events}</td><td className="px-3 py-3 text-right">{Number(row.promptTokens || 0) + Number(row.completionTokens || 0)}</td><td className="px-3 py-3 text-right font-bold">{money(row.estCostUsd)}{row.unknown ? ' + unknown' : ''}</td>{thresholdKey && <td className="px-3 py-2 text-right"><label className="sr-only" htmlFor={`threshold-${groupBy}-${row.key}`}>Monthly alert for {row.key}</label><input id={`threshold-${groupBy}-${row.key}`} type="number" min="0" step="1" value={thresholds[thresholdKey]?.[row.key] || ''} onChange={event => changeThreshold(row.key, event.target.value)} placeholder="Off" className="min-h-9 w-24 rounded-lg px-2 text-right" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} /></td>}</tr>)}
          </tbody>
        </table>
      </div>

      {thresholdKey && <div className="mt-3 flex justify-end"><button type="button" onClick={saveThresholds} disabled={saving} className="flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold" style={{ color: 'var(--accent)', border: '1px solid var(--border)', background: 'var(--surface2)' }}><Save size={15} />{saving ? 'Saving…' : 'Save monthly alerts'}</button></div>}
    </section>
  )
}
