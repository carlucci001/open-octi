'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const label = status => String(status || 'not run').replaceAll('_', ' ')

export default function MonitoringSettings() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const response = await fetch('/api/platform-admin/v1/monitoring', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not load monitoring')
    setData(result)
  }, [])
  useEffect(() => { refresh().catch(error => setError(error.message)) }, [refresh])

  async function run() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/platform-admin/v1/monitoring', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.busy ? 'A check is already running. Refresh shortly.' : result.error || 'Check failed')
      await refresh()
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">Connection monitoring</h2>
        <p className="text-sm opacity-70">Application, DNS provider, and mailbox connection checks for this installation.</p>
      </div>
      <button type="button" onClick={run} disabled={busy} title="Run connection checks" aria-label="Run connection checks" className="p-2 rounded-lg border border-[var(--border)] disabled:opacity-50">
        <RefreshCw size={18} className={busy ? 'animate-spin' : ''} />
      </button>
    </div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {!data?.latest && <p className="text-sm opacity-70">No checks have run yet. Run a check to see connection status.</p>}
    {data?.latest && <>
      <p role="status">{label(data.latest.status)} · {new Date(data.latest.checkedAt).toLocaleString()} · Alerts: {label(data.latest.alert?.status)}</p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm text-left">
          <thead><tr><th className="p-3">Connection</th><th className="p-3">Status</th><th className="p-3">Details</th></tr></thead>
          <tbody>{data.latest.results.map(result => <tr key={result.id} className="border-t border-[var(--border)]">
            <td className="p-3">{result.name}{result.required && <span className="block text-xs opacity-60">Required</span>}</td>
            <td className="p-3 whitespace-nowrap">{label(result.status)}</td><td className="p-3">{result.summary}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <details><summary className="cursor-pointer text-sm">Recent checks ({data.history.length})</summary>
        <ul className="mt-2 space-y-1 text-sm opacity-80">{data.history.map((report, index) => <li key={`${report.checkedAt}-${index}`}>{new Date(report.checkedAt).toLocaleString()} · {label(report.status)}</li>)}</ul>
      </details>
    </>}
  </section>
}
