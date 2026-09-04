'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const dollars = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function CampaignSignalsPanel({ initialLocation = '' }) {
  const initialState = String(initialLocation || '').toUpperCase().match(/\b[A-Z]{2}\b/)?.[0] || ''
  const [state, setState] = useState(initialState)
  const [district, setDistrict] = useState('')
  const [data, setData] = useState({ rows: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ limit: '50' })
      if (state) query.set('state', state)
      if (district) query.set('district', district)
      const response = await fetch(`/api/lead-signals/campaigns?${query}`)
      const body = await response.json()
      if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`)
      setData(body)
    } catch (cause) {
      setError(cause.message || 'Could not load campaign signals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section data-testid="campaign-signals-panel" className="rounded-lg p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div><div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Top 50 campaigns by cash on hand</div><div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>National 2026 FEC aggregate totals. Filter by state and district; party never affects outreach copy.</div></div>
        <div className="flex gap-2 items-end">
          <label className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>STATE<input aria-label="Campaign state filter" value={state} onChange={event => setState(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="US" className="block mt-1 rounded-lg px-2 py-2 text-xs w-16" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>
          <label className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>DISTRICT<input aria-label="Campaign district filter" value={district} onChange={event => setDistrict(event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="All" className="block mt-1 rounded-lg px-2 py-2 text-xs w-16" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>
          <button type="button" aria-label="Refresh campaign leaderboard" data-tooltip="Refresh campaign leaderboard" onClick={load} disabled={loading} className="rounded-lg p-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent)' }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg p-3 text-xs" style={{ color: 'var(--red)', background: 'var(--red-soft)' }}>{error}</div>}
      {!error && <div className="overflow-auto max-h-[420px]"><table className="w-full text-xs"><thead><tr style={{ color: 'var(--text-muted)' }}><th className="text-left p-2">Campaign committee</th><th className="text-left p-2">State / office</th><th className="text-left p-2">Reachability</th><th className="text-right p-2">Cash on hand</th></tr></thead><tbody>{(data.rows || []).map(row => <tr key={`${row.sourceId}-${row.externalId}`} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}><td className="p-2"><div className="font-semibold">{row.entity?.name}</div><div style={{ color: 'var(--text-muted)' }}>{row.people?.find(person => person.title === 'Candidate')?.name || row.attrs?.candidateId}</div></td><td className="p-2">{row.entity?.address?.state || 'US'} · {row.attrs?.office}{row.attrs?.district ? `-${row.attrs.district}` : ''}</td><td className="p-2">{row.entity?.email || row.entity?.phone || 'Mail only'}</td><td className="p-2 text-right font-semibold" style={{ color: 'var(--green)' }}>{dollars(row.attrs?.cashOnHand)}</td></tr>)}</tbody></table>{!loading && !(data.rows || []).length && <div className="p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>No campaign totals matched this filter.</div>}</div>}
    </section>
  )
}

