'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function OpenOctiSampleSettings() {
  const [status, setStatus] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  useEffect(() => { fetch('/api/openocti/sample-data', { cache: 'no-store' }).then(response => response.json()).then(setStatus).catch(reason => setError(reason.message)) }, [])
  const toggle = async () => {
    setBusy(true); setError('')
    try { const response = await fetch('/api/openocti/sample-data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !status?.enabled }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Update failed'); setStatus(data) } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="flex items-center justify-between gap-5"><div><h2 className="text-lg font-semibold">Sample data</h2><p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Explore realistic contacts, accounts, pipelines, projects, tasks, and calendar entries. Turning this off removes only records marked as samples.</p></div><button type="button" role="switch" aria-checked={status?.enabled === true} disabled={!status || busy} onClick={toggle} className="rounded-full px-5 font-bold" style={{ minWidth: 92, minHeight: 48, color: '#fff', background: status?.enabled ? '#159b70' : '#687386' }}>{busy ? 'Saving…' : status?.enabled ? 'ON' : 'OFF'}</button></div>{status && <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{status.count} sample records installed. Your own records are never changed.</p>}{error && <p role="alert" className="mt-3" style={{ color: 'var(--red)' }}>{error}</p>}<Link href="/" className="inline-block mt-5 font-semibold" style={{ color: 'var(--accent)' }}>Back to dashboard</Link></div>
}
